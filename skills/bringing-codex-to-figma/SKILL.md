---
name: bringing-codex-to-figma
description: Route/view capture orchestration skill for moving local or deployed web app screens into Figma using generate_figma_design + CDP scripts. Use for discovery, prepare/capture coordination, and post-capture grouping; rely on figma-use for generic Figma write rules.
license: MIT
metadata:
  author: JooHyung Park <dusskapark@gmail.com>
  version: "1.3.0"
---

# bringing-codex-to-figma

Automate route/view discovery, browser preparation, capture triggering, upload polling,
and post-capture grouping in Figma.

`{SKILL_DIR}` means this skill's installation directory.

## Non-negotiable rules

1. Ask and confirm pre-flight answers before discovery.
2. Show discovered routes/views + groups and get explicit confirmation before Step 2.
3. Follow the project's documented startup process first (`README`, docs, scripts).
4. Default to foreground interactive runs. Do not force background (`nohup`, trailing `&`) unless the user asks.
5. Do not kill ports/processes preemptively. Inspect first, then ask before termination.
6. For local bind/sandbox failures, request elevated execution once. If still blocked, ask the user to run the server manually.
7. In Codex, use plain chat confirmations. Do not rely on Claude-only directives.

## Prerequisites

- Playwright available in target project: `npm install playwright`.
- Figma MCP server reachable.
- Before any Figma write step (including any `use_figma` usage), load `$figma-use` first and follow its generic write/validation/recovery rules.

## Skill boundary (important)

- This skill owns **capture orchestration**: route/view discovery, runtime/browser prep, capture execution, upload monitoring, and grouping workflow coordination.
- This skill does **not** redefine generic Figma Plugin API write rules.
- For any Figma write behavior (validation, recovery, safety constraints), load and follow `$figma-use` first.

## Dry-run mode

If user says `--dry-run`, `validation run`, `test only`, or `do not open a real browser`:

- Append `--dry-run` to all `capture.mjs` commands.
- Skip `generate_figma_design`, `execute-cdp.mjs`, browser readiness, and cleanup.
- End after route/view plan + generated `.capture-session.json` validation.

## Parallel contract

Parallel execution is required.

- Prefer sub-agents where available.
- If not available, emulate with host parallel tool calls.
- Keep these pairs parallel:
  - RoutePlanner + RuntimeOperator
  - CaptureIdProducer overlap with stable `--prepare`
  - CaptureExecutor + UploadMonitor

## Workflow

### Step 0: Pre-flight (hard gate)

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

Do not continue to Step 1 until both answers are explicit.

### Step 1: Discovery (parallel)

Dispatch RoutePlanner and RuntimeOperator together.

#### RoutePlanner

Discover all navigable URL routes or SPA state views.

Use [references/route-detection.md](references/route-detection.md).

Rules:
- Detect URL routes first.
- For SPA state views, use `capture-views.mjs`; create it only when needed.
- Replace dynamic params with concrete sample values.
- Build `groups` and `expectedFrameCounts`.
- LOCAL (`localhost`, `127.x`, `0.0.0.0`, `*.local`): ensure served HTML has `capture.js`; add if missing.
- EXTERNAL: do not patch host. `capture.mjs --prepare` injects `capture.js` into prepared tabs; only fail if that injection fails.

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

#### RuntimeOperator

Use [references/dev-server-detection.md](references/dev-server-detection.md).

1. Dev server
- Check reachability: `curl -s -o /dev/null -w "%{http_code}" --max-time 3 <appUrl>`
- If reachable, verify it is the correct project.
- If not reachable, start server using project-documented command (README/docs/scripts) first.
- Poll until reachable or return `serverStatus: "failed"`.

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

### Step 1.5: Plan confirmation (hard gate)

Before Step 2, always show:
- ordered routes/views
- groups
- expectedFrameCounts

Ask exactly:
`Do these routes/views and section groups look correct?`

If user requests changes, update plan and ask again.

### Step 2: Prepare + capture IDs

#### Step 2a: Run `--prepare`

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

#### Step 2b: CaptureIdProducer (parallel with stable prepare)

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

### Step 3: Capture and upload monitoring (parallel)

#### CaptureExecutor (sequential fire)

Use [references/cdp-architecture.md](references/cdp-architecture.md).

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/execute-cdp.mjs <viewName> <captureId> <endpoint>
```

Fire left-to-right exactly once per prepared tab.

#### UploadMonitor (parallel poll)

Poll all pending IDs with `generate_figma_design` until complete.

For each completed capture:
1. Read `node-id` if present.
2. Convert `123-456` -> `123:456`.
3. Close only that tab:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/execute-cdp.mjs <viewName> --close-only
```

Backoff for repeated `processing` states: `5s -> 10s -> 20s`.

Return:

```json
{
  "/": "123:456",
  "/dashboard": "123:789"
}
```

Missing `node-id` is allowed; do not fail solely for that.

### Step 4: Browser cleanup

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

### Step 5: Group sections in Figma

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
