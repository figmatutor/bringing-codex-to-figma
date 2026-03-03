---
name: sending-codex-to-figma-sample
description: Sample skill for Codex to capture multiple app routes/states and send them to Figma design frames via the Figma MCP HTML-to-Design capture flow. Use when the user wants full-app batch capture, auto route discovery, section grouping, and node mapping output.
compatibility:
  - "Playwright (`playwright` package in the target project; recommended: `npm install -D playwright`)"
  - "Figma Dev Mode MCP configured for Codex (`codex mcp add figma --transport streamable-http https://mcp.figma.com/mcp`)"
---

# Sending Codex To Figma Sample

Capture many app screens and push them into Figma as ordered frames.
Discovers routes automatically, opens browser tabs in parallel, and captures each screen sequentially.

## Scope

- Discover routes or state-based views from source code.
- Generate `capture-views.mjs` with stable `viewKey -> viewName` mapping.
- Prepare browser tabs in parallel and capture sequentially to Figma.
- Produce `capture-map.json` with `viewName -> nodeId` mapping.

## Codex-specific execution model

- Ask concise plain-text questions in chat when required inputs are missing.
- Use plain chat questions and Codex tools only; avoid non-Codex directive syntax.
- Use Codex terminal orchestration:
  - `exec_command` for long-running tasks
  - `write_stdin` for non-blocking polling of running sessions
- Keep generated files in the target project root:
  - `capture-views.mjs`
  - `capture-tokens.json`
  - `capture-map.json`

## Compatibility and dependencies

### Playwright

Install in the target project:

```bash
npm install -D playwright
npx playwright install
```

### Figma Dev Mode MCP for Codex

Register and verify MCP server:

```bash
codex mcp add figma --url https://mcp.figma.com/mcp
codex mcp login figma
codex mcp list
```

Token-based config alternative (`~/.codex/config.toml`):

```toml
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
bearer_token_env_var = "FIGMA_OAUTH_TOKEN"
```

## Step 0: Pre-flight questions (required)

Before scanning files or starting capture, confirm these inputs.
Use direct chat prompts with one short question at a time.

### 0.1 Figma target

Ask:

```text
Should the capture output go to a new Figma file, or be appended to an existing file URL?
```

If existing file is selected, ask:

```text
Please paste the Figma file URL to append to.
```

### 0.2 Viewport preset

Ask:

```text
Which viewport should be used for the full capture? (default: 1440x900)
Options: 1440x900 / 1280x800 / 768x1024 / 375x812
```

### 0.3 Authentication strategy

Ask:

```text
Are any pages login-protected? If yes, choose whether to skip them or proceed after manual login.
```

Store answers in run context as:
`figma_target_mode`, `figma_file_url`, `viewport`, `auth_mode`.

## Step 1: Route/view discovery

Detect in this priority order. Stop at first strong signal.

| Priority | Framework | Detection method |
|---|---|---|
| 1 | Next.js App Router | `app/**/page.tsx` glob; map to URL; ignore route groups `(group)` and segments starting `_` |
| 2 | Next.js Pages Router | `pages/**/*.tsx`; ignore `api/`, `_app`, `_document`, `_error` |
| 3 | React/TanStack Router | Parse route definitions in `src/router/`, `routes.tsx`, `App.tsx` |
| 4 | Vue Router | Parse `routes` entries in `src/router/index.ts` or `index.js` |
| 5 | Generic fallback | Search for `<Route path=`, `createBrowserRouter`, `to="/` patterns |
| 6 | State-driven SPA | Infer view states from `useState` or tab/view switch handlers |

### Dynamic route resolution

For routes like `/user/[id]` or `/post/:slug`:

- Auto-substitute obvious representative values (`1`, `example`) where safe.
- If ambiguous, ask before capture:

```text
Please provide a concrete example value for dynamic route /user/[id]. Example: 1 or me
```

### Route confirmation checkpoint

After detection, present numbered routes and ask for explicit confirmation:

```text
Found N routes. Proceed with this list?
1. / -> http://localhost:{PORT}/
2. /login -> http://localhost:{PORT}/login
...
If you want to add or remove routes, include that now.
```

Do not continue until route list is confirmed.

## Step 1.4: Build capture sequence with label tabs

Create an ordered `capture_sequence` list before token collection.
This list is the source of truth for:

- MCP token pre-collection order
- `--batch` arguments
- `capture-tokens.json` keys

Default behavior (required):

- Include at least one `label-*` entry unless the user explicitly asks to disable labels.
- Insert a `label-*` view before each logical section.
- Keep all app views after the section label in the intended capture order.

Section grouping heuristics:

- URL-routed apps: group by first path segment (`/` becomes `Overview`).
- State-driven apps: group by feature prefix in view keys (`notebook-*`, `pipeline-*`, etc.).
- If only one section exists, still prepend one label (for example `label-overview`).

Before capture, show the final ordered sequence and ask for confirmation:

```text
Proposed capture sequence (labels + views):
1. label-overview
2. dashboard-home
3. dashboard-kpis
4. label-settings
5. settings-profile
Proceed with this order?
```

## Step 1.5: Generate `capture-views.mjs`

Create `capture-views.mjs` in the target project root using `references/capture-views-spec.md`.

Required exports:

- `VIEW_NAMES`: `viewKey -> frame display name`
- `VIEWS`: `viewKey -> async (page) => ...` or `null`

Rules:

- URL-routed app: set `VIEWS[key] = null`.
- State-driven app: include deterministic Playwright navigation steps.
- `label-*` views are auto-generated by the capture script; do not define them in `VIEWS`.

Ensure `.gitignore` contains:

- `capture-views.mjs`
- `capture-map.json`
- `capture-tokens.json`

## Step 2: Dev server check

1. Read `package.json` and resolve preferred start command from `scripts.dev` or `scripts.start`.
2. Check liveness:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:{PORT}
```

3. If not `200`, start server and poll until ready.
4. If startup fails, surface exact logs and ask user whether to continue with a subset or stop.

## Step 3: Batch capture via file handshake

### 3.0 Flow summary

- Pre-collect one capture token per entry in `capture_sequence` (including `label-*`).
- Run `scripts/capture.mjs` in background.
- Wait for `Phase 1 complete` signal.
- Write `capture-tokens.json` immediately.
- Let script finish sequential capture and read `capture-map.json`.

### 3.1 Pre-collect capture tokens

Call a Figma HTML-to-Design initialization tool once per `capture_sequence` entry (for example `generate_figma_design`) and collect:

- `captureId`
- `endpoint`

Build in-memory payload keyed by exact view key:

```json
{
  "label-notebooks": { "captureId": "...", "endpoint": "..." },
  "notebook-list": { "captureId": "...", "endpoint": "..." }
}
```

Keep calls sequential to avoid token/result mixing.
If `label-*` keys are missing, section tabs cannot appear in Figma.

### 3.2 Start capture runner (background)

Run from target project root using the exact `capture_sequence` order:

```bash
node /absolute/path/to/scripts/capture.mjs --batch \
  label-notebooks notebook-list simple-editor \
  label-pipelines pipeline-listing pipeline-details
```

The script opens tabs in headful Chromium and prepares states in parallel.

### 3.3 Poll Phase 1 completion (non-blocking)

Poll runner output every 3-5 seconds via `write_stdin` with empty input until this line appears:

```text
Phase 1 complete — waiting for capture-tokens.json...
```

Critical:

- Do not wait for full process completion before writing tokens.
- Write `capture-tokens.json` as soon as the signal appears.

### 3.4 Write `capture-tokens.json`

Write JSON to project root with all requested keys.
Keys must exactly match the `--batch` view names.

After file write, script enters Phase 2 and executes `captureForDesign()` sequentially.

### 3.5 Finalize and summarize

- Continue polling until process exits.
- Read `capture-map.json`.
- Report `figmaUrl`, captured route count, and per-view node IDs.

Expected `capture-map.json` shape:

```json
{
  "fileKey": "ABCxyz123",
  "figmaUrl": "https://www.figma.com/design/ABCxyz123/MyApp",
  "capturedAt": "YYYY-MM-DDTHH:mm:ssZ",
  "routes": [
    { "name": "Notebooks", "viewName": "label-notebooks", "nodeId": "123-455" },
    { "name": "Notebook List", "viewName": "notebook-list", "nodeId": "123-456" }
  ]
}
```

## Step 4: Section grouping via label frames

Use `label-*` entries to create visual section dividers in Figma.
Treat this as default behavior; skip only if the user explicitly requests no labels.
The script auto-generates label tabs as simple HTML pages.

How it works:

- Parallel prep: app tabs + label tabs are created together.
- Sequential capture: label/app tabs are captured in the exact requested order.
- No project-side DOM injection is required for labels.

Example sequence:

```text
Parallel Preparation:
Label(Notebooks) -> App(notebook-list) -> App(simple-editor) -> Label(Pipelines) -> App(pipeline-listing)

Sequential Capture:
Label -> App -> App -> Label -> App
```

## Failure handling

- `Unknown view` in runner
  - Regenerate `capture-views.mjs`; ensure every non-label key exists in `VIEWS`.
- Timeout waiting for `capture-tokens.json`
  - Ensure Phase 1 signal was reached; rewrite JSON with exact keys.
- No label tabs in output
  - Verify `capture_sequence` includes `label-*` keys and that those keys exist in `capture-tokens.json`.
- MCP auth error
  - Re-run `codex mcp login figma`, then retry token pre-collection.
- Protected route redirected to login
  - Switch to manual login mode and rerun capture subset.

## Output format

Return in this order:

1. `Capture summary`
2. `Captured views` (friendly name, view key, node id)
3. `Skipped/failed views` (reason + retry instruction)
4. `Generated files` (`capture-views.mjs`, `capture-tokens.json`, `capture-map.json`)
5. `Next actions`

## Constraints

| Constraint | Detail |
|---|---|
| Runtime | Codex with Figma MCP configured |
| Capture order | `captureForDesign()` runs sequentially per view |
| State-driven SPA | Use Playwright navigation code, not manual ad-hoc clicks during capture |
| Dynamic routes | Must resolve to concrete URLs before capture |
| Auth-required pages | Need pre-authenticated browser session or explicit skip strategy |
| Handshake file | `capture-tokens.json` is temporary and should be ignored in git |
