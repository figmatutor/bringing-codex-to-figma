# CDP Architecture — Why Raw WebSocket Instead of Playwright

## The Problem: Session Ownership Conflict

`capture.mjs --prepare` launches a Chromium browser via Playwright and keeps it alive.
When a second process tries to connect to the same browser using `connectOverCDP`:

```js
const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
const page = browser.contexts()[0].pages()[0];
await page.evaluate(() => window.figma.captureForDesign(...));
```

This hangs indefinitely. Playwright's `connectOverCDP` creates a new CDP session and
attempts to take ownership of the existing pages. The original `capture.mjs` process
already holds the session, so evaluation calls do not complete reliably.

## The Solution: Raw CDP WebSocket

`execute-cdp.mjs` bypasses Playwright entirely and speaks CDP directly:

1. `fetch http://localhost:{cdpPort}/json` to list tabs and `webSocketDebuggerUrl`
2. Open a raw WebSocket to that target
3. Send `Runtime.evaluate` with `awaitPromise: false`
4. Wait for the matching CDP response
5. Close the socket

This avoids Playwright session ownership and works with the browser launched by
`capture.mjs`.

## Why `awaitPromise: false`

`captureForDesign()` has two completion signals:

| Signal | Meaning | Detectable by |
|---|---|---|
| MCP server confirms receipt | Upload reached Figma | `generate_figma_design` polling |
| Figma app acknowledges | Desktop plugin processed the frame | `captureForDesign()` Promise resolve |

In the MCP workflow the desktop plugin acknowledgement is not the relevant signal.
Waiting for the returned Promise can hang even though the upload succeeds. The correct
pattern is:

- fire with `awaitPromise: false`
- poll `generate_figma_design(captureId)` until it returns `completed`
- close the tab only after completion is confirmed

## Port Discovery

`capture.mjs --prepare` writes `.capture-session.json` in the project directory:

```json
{ "cdpPort": 9222, "tabs": [...] }
```

`execute-cdp.mjs` reads that file from `cwd`. Always run it from the target project,
not from the skill repo.

## Fire Order and Poll Strategy

- Fire sequentially so frame ordering in Figma matches the intended left-to-right order.
- Poll all outstanding capture IDs in parallel to minimize total wait time.
- Close each tab only after its capture ID returns `completed`.

## Tab Identity: Why `targetId` Instead of `document.title`

SPAs and app frameworks can reset `document.title` after hydration. To avoid fragile
tab lookup, `capture.mjs --prepare` records the CDP `targetId` for each tab in
`.capture-session.json` and `execute-cdp.mjs` matches by `targetId` first.

## Stale Tab Cleanup

If `--prepare` is run multiple times against the same browser session, old tabs can
accumulate. `capture.mjs` reads the previous `.capture-session.json` and closes any
stale `targetId`s before opening fresh tabs.

## Fallback: `execute-cdp.mjs` Exits Non-Zero

If raw CDP firing fails for a tab, pass the tab metadata directly to the tool layer
and execute `window.figma.captureForDesign(...)` in the already-open tab using the
available browser tooling, then continue polling the same `captureId`.
