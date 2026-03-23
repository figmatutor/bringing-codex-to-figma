---
name: bringing-codex-to-figma
description: |
  Automatically captures and exports app routes or state-driven views to Figma,
  using host-supported pre-flight input and parallel RoutePlanner,
  RuntimeOperator, CaptureIdProducer, CaptureExecutor, and UploadMonitor
  workstreams. Use when the user
  wants to capture an entire app to Figma, document every route, handle
  auth-required flows, or batch-capture a multi-screen SPA. Requires the
  Figma MCP server.
license: MIT
metadata:
  author: JooHyung Park <dusskapark@gmail.com>
  version: "1.2.0"
---

# bringing-codex-to-figma

Automates `generate_figma_design` plus raw CDP capture across app routes/views,
then groups imported frames into section containers in Figma.

> Use this skill explicitly as `$bringing-codex-to-figma`.

> **`{SKILL_DIR}`** is the installed skill directory. Resolve script and reference
> paths relative to it.

> Parallel work is mandatory in this skill. Use sub-agents in runtimes that
> support them (for example Codex, Cursor, and Claude Code). If sub-agents are
> unavailable in the active runtime, emulate the same split with the host
> runtime's parallel tool runner. Do not collapse RoutePlanner/RuntimeOperator,
> CaptureIdProducer/prepare overlap, or CaptureExecutor/UploadMonitor into one
> serialized flow unless a blocker forces it.

Prerequisites:

- Playwright should be installed in the target project with `npm install playwright`.
- The Figma MCP server must be configured and reachable from the host runtime.
- `figma-use` skill must be loaded before any `use_figma` call in Step 5.

## Mode switch: dry-run

If the user explicitly says `--dry-run`, "validation run", "test only", or
"do not open a real browser":

- Append `--dry-run` to every `capture.mjs` command.
- Skip `generate_figma_design`, `execute-cdp.mjs`, browser readiness checks,
  and live-browser cleanup.
- Finish after validating the route/view plan and the generated
  `.capture-session.json`.

## Parallel Execution Contract

- If the user explicitly asks for delegation, sub-agents, or parallel agent
  execution in this turn, use sub-agents for RoutePlanner/RuntimeOperator and
  CaptureExecutor/UploadMonitor splits.
- Otherwise, do not force sub-agent spawning. Emulate the same split using the
  runtime's parallel tool runner.
- Never block the workflow waiting for sub-agent support. Parallel execution is
  required, but the mechanism is runtime-dependent.

## Workflow

### Step 0: Structured pre-flight

Use the host platform's structured choice UI for pre-flight input when available
(Codex, Cursor, or equivalent). If structured choices are unavailable, ask the
same questions in concise plain text.

Runtime mapping:
- Use the runtime's interactive question tool when available (for example
  `AskUserQuestion` or equivalent).
- If structured question tools are unavailable, ask concise plain-text
  questions and wait for an explicit answer.
- Do not hard-code one runtime's question primitive as mandatory.

If the user already supplied one or both answers, do not ask for them again.
Ask exactly two questions total:

**Question 1 - Figma target**
- Prompt: `Where should the captured frames go?`
- Choices:
  - `New Figma file (Recommended)` — Creates a fresh file and avoids collisions.
  - `Existing file URL` — Paste a Figma design file URL to append captures there.

**Question 2 - Viewport**
- Prompt: `What viewport size should be used for all captures?`
- Choices:
  - `Desktop - 1440x900 (Recommended)` — Best default for app capture.
  - `Desktop - 1280x800` — Smaller desktop viewport.
  - `Tablet - 768x1024` — Portrait tablet capture.
  - `Mobile - 375x812` — Typical phone viewport.

Record both answers before doing any discovery or browser work.
Hard gate: do not proceed to Step 1 until both answers are explicitly confirmed.
Do not silently assume a viewport when it was not provided.
Do not ask a third pre-flight question unless the user introduces a blocker that
cannot be discovered from the repo.

Normalization rules:

- New file -> use `outputMode: "newFile"`.
- Existing file URL -> parse `fileKey` and optional `nodeId` from the URL.
- Custom viewport text from the user -> normalize to `WxH` before continuing.

### Step 1: Parallel discovery

> Dispatch RoutePlanner and RuntimeOperator in one turn. Do not wait for one before starting
> the other.

### Sub-Agent: RoutePlanner - Route and view discovery

Scan the project to enumerate every navigable route or state-driven SPA view.
Build a grouping plan for post-capture section containers.

Read [references/route-detection.md](references/route-detection.md)
for framework-specific detection rules.

Rules:

- Detect URL-routed apps first.
- For state-driven SPAs, look for an existing `capture-views.mjs`. If none
  exists, generate one in the target project only when required.
- Substitute dynamic routes with concrete sample values before capture.
- Build `groups` plus `expectedFrameCounts` for each discovered route/view.
- For LOCAL apps (`localhost`, `127.x`, `0.0.0.0`, `*.local`), verify that
  `capture.js` is already present in the served HTML. If it is missing, add:

```html
<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
```

- For EXTERNAL apps, the deployed HTML must already include `capture.js`.
  Do not try to patch the remote host. If it is missing, stop and tell the user.

Return only:

```json
{
  "routes": ["...", "..."],
  "groups": [
    { "name": "main", "views": ["/", "/pricing"] }
  ],
  "expectedFrameCounts": {
    "/": 1,
    "/pricing": 1
  },
  "captureJsAdded": false,
  "viewsFile": "./capture-views.mjs"
}
```

### Sub-Agent: RuntimeOperator - Dev server and browser

Read [references/dev-server-detection.md](references/dev-server-detection.md)
for detection order, custom-domain failures, and port-conflict handling.

Step 1 - Dev server

Check whether the target app is already reachable:

```bash
curl -s -o /dev/null -w "%{http_code}" --max-time 3 <appUrl>
```

- Reachable -> verify that the reachable server belongs to the correct project.
- Wrong project on that port -> terminate the wrong process, then start the
  correct app server.
- Not reachable -> detect the right start command, launch it in the background,
  and poll until reachable.
- If the app still is not reachable after the retry window -> return
  `serverStatus: "failed"`.

Step 2 - Browser

If not in dry-run mode, start the browser from the target project:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/capture.mjs --start-browser \
  --app-url <appUrl> \
  --viewport <WxH> &
```

Poll for `<projectDir>/.capture-browser.json` and read the `cdpPort` once it
appears. Do not kill the started process during capture flow.

Return only:

```json
{
  "serverStatus": "already-running",
  "appUrl": "http://localhost:3000",
  "cdpPort": 9222
}
```

### After both sub-agents complete

- If RuntimeOperator returned `serverStatus: "failed"`, ask the user to start the
  server manually, then continue only once it is reachable.
- If RoutePlanner added `capture.js` and RuntimeOperator found an already-running local app,
  restart the app server before moving on.
- Show discovered routes/views plus grouping plan and confirm before capture starts.

Hard gate: do not proceed to Step 2 until the user confirms the route/view
plan and section grouping.

Confirmation prompt:
- `Do these routes/views and section groups look correct?`
- Choices:
  - `Looks good (Recommended)` — Continue to preparation.
  - `I want changes` — Pause and adjust the capture plan.

### Step 2: Preparation plus capture-id generation

> Run `--prepare` directly, then dispatch CaptureIdProducer immediately in parallel when
> the prepare attempt is stable. If `--prepare` fails in the current attempt,
> recover prepare first, then regenerate capture IDs.

### Step 2a - Run `--prepare` directly

Always run `--prepare` from the target project:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/capture.mjs --prepare \
  --routes "/,/about,/dashboard" \
  --app-url <url> \
  --viewport <WxH> \
  [--views-file ./capture-views.mjs]
```

For state-driven SPAs, add `--views-file ./capture-views.mjs` and pass VIEWS
keys, not URL paths, in `--routes`.

Before every `--prepare` run:

1. Close stale tabs from the previous session using stored target IDs.
2. Close any currently open tabs whose title matches planned `viewName`s.
3. Ensure only one tab per planned view remains after cleanup.

Read [references/spa-capture.md](references/spa-capture.md)
when there is no URL router.

If `--prepare` fails with a CDP connectivity error:

1. Delete `.capture-browser.json`.
2. Restart `capture.mjs --start-browser`.
3. Wait for `.capture-browser.json` to reappear.
4. Re-run `--prepare`.

If `--prepare` fails for any other reason after opening tabs:

1. Close tabs opened in the failed attempt (by target ID or title match).
2. Re-run `--prepare` once.
3. If it fails again, report the blocker to the user with the failing route/view.

### Step 2b - Sub-Agent: CaptureIdProducer - Capture-id generation

Dispatch CaptureIdProducer while `--prepare` is running only when the current attempt is
healthy. If prepare has failed in this attempt, rerun prepare first and then
generate new capture IDs.

- Existing Figma file -> generate one capture ID per prepared view with
  `outputMode: "existingFile"`.
- New Figma file -> call once with `outputMode: "newFile"`, share the returned
  claim URL, wait for the user to claim it, then generate the remaining capture
  IDs against that file.

Return only:

```json
[
  { "viewName": "/", "captureId": "...", "endpoint": "..." }
]
```

After `--prepare` and CaptureIdProducer both complete, confirm that all views are open and
visually ready before firing captures.

### Step 3: Capture - fire and poll in parallel

> Dispatch CaptureExecutor and UploadMonitor in one turn. CaptureExecutor fires
> sequentially inside its own workstream. UploadMonitor polls all outstanding
> uploads in parallel.

### Sub-Agent: CaptureExecutor - Sequential fire

Fire `captureForDesign` left to right, exactly once per prepared tab.
This order controls left-to-right frame order in Figma.

Read [references/cdp-architecture.md](references/cdp-architecture.md)
for the raw CDP rationale and why `awaitPromise: false` is required.

Always run from the target project:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/execute-cdp.mjs <viewName> <captureId> <endpoint>
```

Return only after every prepared view has been fired.

### Sub-Agent: UploadMonitor - Parallel poll and close

Poll every outstanding `captureId` in parallel with `generate_figma_design`.

Loop:

1. Poll every pending capture ID in the same turn.
2. For each completed capture, read the returned `node-id` (if present).
3. Convert `123-456` to `123:456`.
4. Close only that tab:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/execute-cdp.mjs <viewName> --close-only
```

5. Continue until nothing is pending.

Backoff rule:
- If a capture ID remains `processing` across repeated polls, increase delay
  between rounds (for example 5s -> 10s -> 20s).
- Completion order may differ from trigger order. This is normal.

Return only:

```json
{
  "/": "123:456",
  "/dashboard": "123:789"
}
```

`node-id` can be missing in some direct `capture.mjs` flows. Do not fail on
missing values.

### Step 4: Browser cleanup

After all captures complete, close only the `--start-browser` helper process
recorded in `.capture-browser.json`. Avoid broad port-kill patterns.

```bash
BROWSER_JSON="<projectDir>/.capture-browser.json"
PID="$(node -e "const fs=require('fs');const p=process.argv[1];if(!fs.existsSync(p))process.exit(0);const j=JSON.parse(fs.readFileSync(p,'utf8'));if(Number.isInteger(j.startBrowserPid))process.stdout.write(String(j.startBrowserPid));" "$BROWSER_JSON")"

if [ -n "$PID" ] && ps -p "$PID" -o command= | grep -q "capture.mjs --start-browser"; then
  kill "$PID"
fi
```

If PID-based shutdown is not available, ask the user to close the browser
manually instead of killing by port.

### Step 5: Section grouping in Figma

Use `use_figma` to group captured frames under section containers.
`nodeId` mappings are optional.

Input model:

```json
{
  "views": [
    { "viewName": "/", "group": "main", "expectedFrameCount": 1 }
  ],
  "groups": [
    { "name": "main", "views": ["/"] }
  ],
  "nodeIdMap": {
    "/": "123:456"
  }
}
```

Rules:

1. Build target frame assignments using `nodeIdMap` first.
2. For unresolved views, match frames by left-to-right capture order and
   `expectedFrameCount`.
3. Create or reuse group containers (Section preferred, Frame fallback).
4. Rename each moved frame to `viewName` (dedupe with suffix if needed).
5. On mismatch, do partial grouping and move leftovers to `Unassigned`.
6. Always emit warnings with expected vs observed counts.
7. After moving frames into each group container, resize the container to fit
   contents. In current MCP runtimes, Section exposes
   `resizeWithoutConstraints(width, height)` (not `resizeToFitContents()`), so
   compute child bounds and resize explicitly.

Resize pattern:

```js
for (const container of groupContainers) {
  if (container.type === 'SECTION') {
    const children = container.children;
    if (children.length === 0) continue;

    const pad = 24;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const child of children) {
      minX = Math.min(minX, child.x);
      minY = Math.min(minY, child.y);
      maxX = Math.max(maxX, child.x + child.width);
      maxY = Math.max(maxY, child.y + child.height);
    }

    // Normalize children so the section has visible padding.
    const dx = minX < pad ? pad - minX : 0;
    const dy = minY < pad ? pad - minY : 0;
    if (dx !== 0 || dy !== 0) {
      for (const child of children) {
        child.x += dx;
        child.y += dy;
      }
      maxX += dx;
      maxY += dy;
    }

    container.resizeWithoutConstraints(maxX + pad, maxY + pad);
  } else if (container.type === 'FRAME') {
    container.layoutMode = container.layoutMode === 'NONE' ? 'VERTICAL' : container.layoutMode;
    container.layoutSizingHorizontal = 'HUG';
    container.layoutSizingVertical = 'HUG';
  }
}
```

## References

- Route detection:
  [references/route-detection.md](references/route-detection.md)
- Dev server startup and failure handling:
  [references/dev-server-detection.md](references/dev-server-detection.md)
- Raw CDP capture model:
  [references/cdp-architecture.md](references/cdp-architecture.md)
- `generate_figma_design` behavior:
  [references/generate-figma-design-workflow.md](references/generate-figma-design-workflow.md)
- SPA capture and `capture-views.mjs` shape:
  [references/spa-capture.md](references/spa-capture.md)

## Notes

- For explicit user choices, prefer host-native structured choice UI. If it is
  unavailable, use concise plain-text questions with the same options.
- Use the runtime's available question flow for target selection, viewport
  selection, and capture-plan confirmation. If unavailable, ask plain-text
  questions and wait for an explicit answer before proceeding.
- Keep generated `capture-views.mjs` in the target project, not in the skill
  repo.
- Do not duplicate long procedural content from the reference files into this
  document.
- For git commits in downstream repos, prefer the user's GitHub `noreply`
  email; do not assume any vendor-specific `noreply` address exists.
