---
name: bringing-screens-to-figma
description: Captures multiple app routes and sends them to Figma as design frames. Discovers routes automatically, opens browser tabs in parallel, and captures each screen sequentially. Use when you want to capture an entire app. Requires Figma MCP (Claude Code + Remote MCP only).
license: MIT
metadata:
  author: JooHyung Park <jude.park@grabtaxi.com>
  version: "0.2.0"
compatibility: 
  - Playwright (`npm install -g playwright`)
  - Figma DevMode MCP (`/plugin install figma@claude-plugin-directory`)
---

# bringing-screens-to-figma

Captures multiple app routes and sends them to Figma as design frames.
Discovers routes automatically, opens browser tabs in parallel, and captures each screen sequentially.

> **Claude Code + Remote Figma MCP only.**
> For single captures, use the MCP `generate_figma_design` tool directly.

---

## Step 0: Pre-flight Questions

Before scanning any files or checking the dev server, use `AskUserQuestion` to collect
the information needed to execute the full capture without interruption.

### Figma file target

```yaml
AskUserQuestion:
  question: "Where should the captured frames go?"
  header: "Figma target"
  options:
    - label: "New Figma file (Recommended)"
      description: "Creates a fresh file — safe, no risk of overwriting existing work."
    - label: "Existing Figma file"
      description: "Appends frames to a file you already have. You'll need to paste the URL."
```

If the user picks "Existing Figma file", follow up:

```yaml
AskUserQuestion:
  question: "Paste the Figma file URL to append to."
  header: "Figma URL"
```

### Viewport / device size

```yaml
AskUserQuestion:
  question: "What viewport size should be used for all captures?"
  header: "Viewport"
  options:
    - label: "Desktop — 1440 × 900 (Recommended)"
      description: "Standard desktop breakpoint, good for most web apps."
    - label: "Desktop — 1280 × 800"
      description: "Slightly smaller desktop."
    - label: "Tablet — 768 × 1024"
      description: "iPad-sized viewport."
    - label: "Mobile — 375 × 812"
      description: "iPhone-sized viewport."
```

### Authentication

```yaml
AskUserQuestion:
  question: "Are any routes behind a login wall?"
  header: "Auth"
  options:
    - label: "No — all routes are public (Recommended)"
      description: "Capture proceeds immediately."
    - label: "Yes — some routes require login"
      description: "You'll be asked how to handle those routes."
```

If yes:

```yaml
AskUserQuestion:
  question: "How should auth-required routes be handled?"
  header: "Auth strategy"
  options:
    - label: "Skip auth-required routes"
      description: "Only capture public pages."
    - label: "I'll log in manually before capture starts"
      description: "Keep a browser open, log in first, then confirm to proceed."
```

Record all answers before proceeding.

---

## Step 1: Route Discovery

Attempt the following strategies in priority order. Stop at the first successful detection.

| Priority | Framework | Detection Method |
|---|---|---|
| 1 | Next.js App Router | Glob `app/**/page.tsx`; convert file paths to URL segments; exclude `(group)/` segments and paths starting with `_` |
| 2 | Next.js Pages Router | Glob `pages/**/*.tsx`; exclude `api/`, `_app`, `_document`, `_error` |
| 3 | React Router / TanStack Router | Parse `path=` values from `src/router/`, `routes.tsx`, or `App.tsx` |
| 4 | Vue Router | Parse `routes` array from `src/router/index.ts` or `src/router/index.js` |
| 5 | Generic fallback | Search codebase for `<Route path=`, `createBrowserRouter([{path:`, `to="/` patterns |
| 6 | **State-Driven SPA** | No URL router found → inspect root component for `useState`-based tab/view switching; enumerate distinct UI states as views |

**Dynamic routes** (e.g. `/user/[id]`, `/post/:slug`):
- Auto-substitute with a representative URL (e.g. `/user/1`, `/post/example`)
- If the substitution is non-obvious (no clear representative value), ask before proceeding:

```yaml
AskUserQuestion:
  question: "The route /user/[id] needs a concrete example ID. What value should be used?"
  header: "Dynamic route"
  options:
    - label: "1  →  /user/1"
      description: "Use '1' as the placeholder ID."
    - label: "me  →  /user/me"
      description: "Use 'me' — works if the app treats it as the current user."
```

After detection, present the full list and confirm using `AskUserQuestion`:

```yaml
AskUserQuestion:
  question: |
    Found N routes. Does this list look right?

      1. /              → http://localhost:{PORT}/
      2. /login         → http://localhost:{PORT}/login
      3. /dashboard     → http://localhost:{PORT}/dashboard
      4. /settings      → http://localhost:{PORT}/settings
      5. /user/[id]     → http://localhost:{PORT}/user/1  (substituted)

    Proceed, or let me know which routes to add / remove.
  header: "Routes"
  options:
    - label: "Looks good — proceed (Recommended)"
      description: "Capture all listed routes."
    - label: "Remove some routes"
      description: "Tell me which ones to skip."
    - label: "Add routes"
      description: "Provide additional paths to include."
```

Once routes are confirmed, **auto-generate `capture-views.mjs`** in the project directory:

- For **URL-routed apps** (Next.js, React Router, Vue Router): each route gets `null` navigation — Playwright navigates by URL automatically.
- For **state-driven SPAs**: generate Playwright navigation logic based on the UI states found during route discovery.
- Add `capture-views.mjs` and `capture-map.json` to `.gitignore` if not already present.

See [references/capture-views-spec.md](references/capture-views-spec.md) for full specification.

---

## Step 2: Dev Server Check

1. Read `package.json` → inspect `scripts.dev` and `scripts.start` to determine the
   start command and expected port (default: `3000`).
2. Verify the server is responding:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:{PORT}
   ```
3. If not active, start it and wait for a `200` response before proceeding.

---

## Step 3: Batch Capture via File-Based Handshake

### Overview

The capture script uses a **single handshake file** (`capture-tokens.json`):

1. **Pre-collect:** Claude calls `generate_figma_design` once per view to obtain all captureIds upfront
2. **Phase 1 (parallel):** Script opens all browser tabs and navigates each to its correct app state
3. **Handshake:** Claude detects "Phase 1 complete" in stdout and immediately writes `capture-tokens.json`
4. **Phase 2 (sequential):** Script reads `capture-tokens.json`, calls `captureForDesign()`, writes `capture-map.json`

Pre-collecting captureIds before starting the script eliminates the race between MCP call latency
and the 120-second handshake timeout.

### Step 3.1: Pre-Collect captureIds for All Views

Before starting the capture script, call `generate_figma_design` **sequentially** for each view
(including label views) to obtain all captureIds upfront:

```text
Call once per view — do not poll or wait for completion.
Parse captureId and endpoint from each MCP response.
```

Build the full `capture-tokens.json` payload in memory:

```json
{
  "label-notebooks": { "captureId": "...", "endpoint": "..." },
  "notebook-list":   { "captureId": "...", "endpoint": "..." }
}
```

### Step 3.2: Start the Capture Script in Background

Execute the script in the background:

```bash
node /path/to/skill/scripts/capture.mjs --batch \
  label-notebooks notebook-list simple-editor \
  label-pipelines pipeline-listing pipeline-details \
  [fileKey]
```

The script opens all browser tabs and navigates each to its correct app state in parallel.
Browser windows will appear on screen (headful mode).

### Step 3.3: Wait for Phase 1 to Complete

Poll the background task using **`block=false`** every 3–5 seconds until this line appears:

```text
Phase 1 complete — waiting for capture-tokens.json...
```

**Critical:** Use `block=false` (non-blocking), NOT `block=true`. With `block=true` the tool
waits for full task completion and will not return until its timeout fires — causing a long
unnecessary delay between Phase 1 completing and `capture-tokens.json` being written.

Polling pattern:
1. Call `TaskOutput(task_id, block=false)`
2. Check output for `"Phase 1 complete"`
3. If not found, wait 3–5 seconds and repeat
4. Once found, proceed immediately to Step 3.4

### Step 3.4: Write capture-tokens.json

**Immediately** write `capture-tokens.json` to the project directory with all pre-collected tokens:

```json
{
  "label-notebooks": { "captureId": "...", "endpoint": "..." },
  "notebook-list":   { "captureId": "...", "endpoint": "..." }
}
```

The script detects this file and immediately executes Phase 2: `captureForDesign()` for each view
sequentially, then writes `capture-map.json` and exits.

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

---

## Step 4: Section Grouping via Label Frames

The preferred approach is **label frames** — the skill automatically creates simple text-only browser tabs that act as visual section dividers between groups of app views.
No complex project configuration, DOM injection, or post-processing tools required.

### How it works

The skill uses **parallel browser tab preparation**: during the batch preparation phase, both app tabs and label tabs are created simultaneously. Label tabs are simple HTML pages containing only section titles, while app tabs navigate to your actual application.

During sequential capture, the skill captures label tabs and app tabs in the desired order, creating visual section separation in the final Figma file.

### Automatic Label Generation

**Projects only implement app navigation** — the skill handles label generation automatically:

- When the capture sequence includes entries starting with `label-`, the skill creates simple text-only browser tabs
- No project code needed for labels — they're generated entirely by the skill
- Label tabs show clean typography on a light background for visual separation

### `capture-views.mjs` reference

Auto-generated by the skill in Step 1. Loaded at runtime by `capture.mjs` via dynamic import from `process.cwd()`.

**Required exports:**
- `VIEW_NAMES`: Maps viewKey → display name for Figma frame naming
- `VIEWS`: Maps viewKey → navigation function (or `null` for URL-routed views)

For full specification with examples, see [references/capture-views-spec.md](references/capture-views-spec.md).

After writing the file, add to `.gitignore`:

```bash
echo "capture-views.mjs" >> .gitignore
echo "capture-map.json" >> .gitignore
echo "capture-tokens.json" >> .gitignore
```

### Capture order

The skill automatically interleaves label frames before each section during batch capture:

**Example Capture Sequence:**
```text
Parallel Preparation (Browser Tabs):
├── Label Tab: "Notebooks" (skill-generated simple HTML)
├── App Tab: notebook-listing (localhost:3000 → project's VIEWS logic)
├── App Tab: simple-editor (localhost:3000 → project's VIEWS logic)
├── Label Tab: "Pipelines" (skill-generated simple HTML)
├── App Tab: pipeline-listing (localhost:3000 → project's VIEWS logic)
└── App Tab: pipeline-flow (localhost:3000 → project's VIEWS logic)

Sequential Capture Order:
Label → App → App → Label → App → App
```

Each view uses a fresh `captureId` (one per `generate_figma_design` execution), and the skill handles both label tab creation and app tab navigation automatically.

---

## Constraints

| Constraint | Detail |
|---|---|
| Runtime environment | Claude Code + Remote Figma MCP only; `generate_figma_design` is not available in Cursor |
| State-driven SPAs | Use Playwright CLI to navigate + execute `captureForDesign()` — never manual nav or app code patches |
| Section grouping | Label frames — interleave `label-{group}` views in capture order; no extra tooling needed |
| Dynamic routes | `/user/[id]` form requires a representative concrete URL (auto-substituted or user-provided) |
| Authenticated pages | Pages behind login require a pre-authenticated browser session before capture begins |
| Capture order | `generate_figma_design` executions must be sequential; parallel is not supported |
| Handshake file | `capture-tokens.json` is auto-deleted after capture; add to `.gitignore` |

---

## Comparison with Related Skills

| Aspect | `implement-design` | `bringing-screens-to-figma` |
|---|---|---|
| Direction | Figma → Code | App UI → Figma |
| Core MCP tool | `get_design_context` | `generate_figma_design` (loop) |
| Input | Figma URL / selected node | App route list |
| Iteration unit | Single node | One execution per route |
| Output | Code files | Figma file + route-grouped Sections |
