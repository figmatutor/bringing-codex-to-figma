---
name: bringing-codex-to-figma
description: Route/view capture orchestration skill for moving local or deployed web app screens into Figma using generate_figma_design + CDP scripts. Use for discovery, prepare/capture coordination, and post-capture grouping; rely on figma-use for generic Figma write rules.
license: MIT
metadata:
  author: JooHyung Park <dusskapark@gmail.com>
  version: "1.4.0"
---

# bringing-codex-to-figma

Automate route/view discovery, browser preparation, capture triggering, completion
confirmation, immediate tab cleanup, and post-capture grouping in Figma.

`{SKILL_DIR}` means this skill's installation directory.

## Non-negotiable rules

1. Ask and confirm pre-flight answers before discovery.
2. Show discovered routes/views + groups and get explicit confirmation before Step 5.
3. Follow the project's documented startup process first (`README`, docs, scripts).
4. Default to foreground interactive runs. Do not force background (`nohup`, trailing `&`) unless the user asks.
5. Do not kill ports/processes preemptively. Inspect first, then ask before termination.
6. For local bind/sandbox failures, request elevated execution once. If still blocked, ask the user to run the server manually.
7. When available, use dedicated user-input tools to ask detailed confirmation questions; otherwise use plain chat confirmations.

## Prerequisites

- Playwright available in target project: `npm install playwright`.
- Figma MCP server reachable.
- Before any `use_figma`-based Figma write step, load `$figma-use` first and follow its generic Plugin API write, validation, and recovery rules.

## Skill boundary (important)

- This skill owns **capture orchestration**: route/view discovery, runtime/browser prep, capture execution, completion confirmation, immediate tab cleanup, and grouping workflow coordination.
- This skill does **not** redefine generic Figma Plugin API write rules.
- For any `use_figma`-based Plugin API write behavior (validation, recovery, safety constraints), load and follow `$figma-use` first.

## Dry-run mode

If user says `--dry-run`, `validation run`, `test only`, or `do not open a real browser`:

- Append `--dry-run` to all `capture.mjs` commands.
- Skip `generate_figma_design`, `execute-cdp.mjs`, browser readiness, and cleanup.
- End after route/view plan + generated `.capture-session.json` validation.

## Workflow

### Step 1: Confirm target and viewport

Ask exactly two questions unless already provided:

1. Figma target
- `New Figma file (Recommended)`
- `Existing file URL`

2. Viewport
- `Desktop 1440x900 (Recommended)`
- `Desktop 1280x800`
- `Tablet 768x1024`
- `Mobile 375x812`

Normalization:
- Existing URL -> parse `fileKey` and optional `nodeId`.
- Viewport -> normalize to `WxH`.

Do not continue until both answers are explicit.

### Step 2: Discover routes or views

Discover all navigable URL routes or SPA state views first.

Use [references/route-detection.md](references/route-detection.md).

Rules:
- Detect URL routes first.
- For SPA state views, use `capture-views.mjs`; create it only when needed.
- Replace dynamic params with concrete sample values.
- Build `groups` and `expectedFrameCounts`.
- LOCAL (`localhost`, `127.x`, `0.0.0.0`, `*.local`): ensure served HTML has `capture.js`; add if missing.
- EXTERNAL: do not patch host. `capture.mjs --prepare` injects `capture.js` into prepared tabs; only fail if that injection fails.
- Do not start browser or server work from this step unless discovery is impossible without a live app.
- Do not mix this step with browser startup or capture execution.

Return:

```json
{
  "routes": ["/", "/blog"],
  "groups": [{ "name": "main", "views": ["/", "/blog"] }],
  "expectedFrameCounts": { "/": 1, "/blog": 1 },
  "captureJsAdded": false,
  "viewsFile": "./capture-views.mjs"
}
```

### Step 3: Start the app and browser

Use [references/dev-server-detection.md](references/dev-server-detection.md).

1. Dev server
- Check reachability: `curl -s -o /dev/null -w "%{http_code}" --max-time 3 <appUrl>`
- If reachable, verify it is the correct project.
- If not reachable, start server using project-documented command (README/docs/scripts) first.
- Poll until reachable or return `serverStatus: "failed"`.
- Run this after discovery is complete.
- Do not continue until the app is reachable.

2. Browser (non-dry-run)

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/capture.mjs --start-browser \
  --app-url <appUrl> \
  --viewport <WxH>
```

Wait for `<projectDir>/.capture-browser.json`, then read `cdpPort`.

Return:

```json
{
  "serverStatus": "already-running",
  "appUrl": "http://localhost:3000",
  "cdpPort": 9222
}
```

### Step 4: Confirm the capture plan

Before continuing, always show:
- ordered routes/views
- groups
- expectedFrameCounts

Ask exactly:
`Do these routes/views and section groups look correct?`

If user requests changes, update plan and ask again.

### Step 5: Prepare tabs

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/capture.mjs --prepare \
  --routes "/,/about,/dashboard" \
  --app-url <url> \
  --viewport <WxH> \
  [--views-file ./capture-views.mjs]
```

For SPA mode, pass view keys (not URL paths) and include `--views-file`.

Before each prepare attempt:
1. Close stale targets from previous `.capture-session.json` if present.
2. Close tabs matching planned `viewName` titles.
3. Ensure one tab per planned view.

Recoveries:
- CDP connectivity error:
  1. Remove `.capture-browser.json`
  2. Restart `--start-browser`
  3. Wait for `.capture-browser.json`
  4. Re-run `--prepare`
- Other prepare error:
  1. Close attempt-opened tabs
  2. Retry once
  3. On second failure, report blocking view/route

### Step 6: Generate capture IDs

- Existing file: one capture ID per prepared view with `outputMode: "existingFile"`.
- New file: first call with `outputMode: "newFile"`, share claim URL, wait for claim,
  then generate remaining IDs against claimed file.

Return:

```json
[
  { "viewName": "/", "captureId": "...", "endpoint": "..." }
]
```

After prepare + capture IDs complete, confirm tabs are visually ready.

### Step 7: Capture each view and close its tab

Use [references/cdp-architecture.md](references/cdp-architecture.md).

For each prepared view, run this exact sequence:

1. Fire the capture:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/execute-cdp.mjs <viewName> <captureId> <endpoint>
```

2. Wait for completion of only that `captureId` with repeated `generate_figma_design({ captureId })` checks until complete.
3. Read `node-id` if present.
4. Convert `123-456` -> `123:456`.
5. Close only that tab:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/execute-cdp.mjs <viewName> --close-only
```

Rules:
- Process one prepared view at a time.
- Do not fire the next view until the current view is confirmed complete.
- Do not keep multiple outstanding capture IDs alive at once.
- Close the tab as soon as the current capture is confirmed complete.

Backoff for repeated `processing` states: `5s -> 10s -> 20s`.

Return:

```json
{
  "/": "123:456",
  "/dashboard": "123:789"
}
```

Missing `node-id` is allowed; do not fail solely for that.

### Step 8: Clean up the browser

Close only the `--start-browser` helper process recorded in `.capture-browser.json`.
Avoid broad port-kill patterns.

```bash
BROWSER_JSON="<projectDir>/.capture-browser.json"
PID="$(node -e "const fs=require('fs');const p=process.argv[1];if(!fs.existsSync(p))process.exit(0);const j=JSON.parse(fs.readFileSync(p,'utf8'));if(Number.isInteger(j.startBrowserPid))process.stdout.write(String(j.startBrowserPid));" "$BROWSER_JSON")"

if [ -n "$PID" ] && ps -p "$PID" -o command= | grep -q "capture.mjs --start-browser"; then
  kill "$PID"
fi
```

If PID shutdown is unavailable, ask the user to close browser manually.

### Step 9: Group captured frames in Figma

`$figma-use` must already be loaded before this step. Use `use_figma` only after applying figma-use write/validation/recovery rules.

Input model:

```json
{
  "views": [{ "viewName": "/", "group": "main", "expectedFrameCount": 1 }],
  "groups": [{ "name": "main", "views": ["/"] }],
  "nodeIdMap": { "/": "123:456" }
}
```

Rules:
1. Assign with `nodeIdMap` first.
2. For unresolved views, map by capture order + `expectedFrameCount`.
3. Create/reuse group containers (prefer Section, fallback Frame).
4. Rename moved frames to `viewName` (dedupe suffix if needed).
5. If mismatched, do partial grouping and move leftovers to `Unassigned`.
6. Emit warnings for expected vs observed counts.
7. Resize containers to fit children (Sections via explicit bounds + `resizeWithoutConstraints`).

## References

- [references/route-detection.md](references/route-detection.md)
- [references/dev-server-detection.md](references/dev-server-detection.md)
- [references/cdp-architecture.md](references/cdp-architecture.md)
- [references/generate-figma-design-workflow.md](references/generate-figma-design-workflow.md)
- [references/spa-capture.md](references/spa-capture.md)
