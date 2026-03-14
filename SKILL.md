---
name: bringing-codex-to-figma
description: |
  Automatically captures and exports app routes or state-driven views to Figma,
  grouping the resulting frames with label screens. Use when the user wants to
  capture an entire app to Figma, document every route, handle auth-required
  flows, or batch-capture a multi-screen SPA. Requires the Figma MCP server.
license: MIT
metadata:
  author: JooHyung Park <dusskapark@gmail.com>
  version: "1.0.0"
compatibility: |
  - Playwright: `npm install playwright` (project-local install is recommended)
  - Figma MCP: configure the `figma` MCP server for Codex before use
---

# bringing-codex-to-figma

Automates `generate_figma_design` plus raw CDP capture across all app routes,
then groups the imported frames with label screens for clean Figma organization.

> Use this skill explicitly as `$bringing-codex-to-figma`.

> **`{SKILL_DIR}`** is the installed skill directory. Resolve script and reference
> paths relative to it.

## Workflow

Follow this workflow in order. Keep `SKILL.md` lean and read the linked references
only when that detail is needed.

### Step 0: Pre-flight

Ask exactly two concise questions before doing any capture work:

1. Where should the captured frames go: a new Figma file, or an existing file URL?
2. What viewport should be used for every capture? Default to `1440x900`.

Record both answers. Do not ask a third pre-flight question unless the user
introduces a blocker that cannot be discovered from the repo.

### Step 1: Discovery in parallel

Do these two tracks in parallel:

- Route/view discovery:
  Scan the project to enumerate every navigable route or state-driven SPA view.
  Plan any `label-*` divider screens before capture.
  Read [references/route-detection.md](references/route-detection.md)
  for framework-specific detection rules.
- Dev server and browser setup:
  Detect whether the correct app server is already reachable. If not, start it in
  the background and wait until it is reachable. Then run:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/capture.mjs --start-browser \
  --app-url <appUrl> \
  --viewport <WxH> &
```

Read [references/dev-server-detection.md](references/dev-server-detection.md)
for detection order, custom-domain failures, and port-conflict handling.

Additional rules:

- LOCAL apps (`localhost`, `127.x`, `0.0.0.0`, `*.local`):
  verify `capture.js` is already present in the app HTML. If missing, add:

```html
<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
```

- EXTERNAL apps:
  the deployed app must already include `capture.js`; do not try to patch the
  remote host. If missing, stop and tell the user.

When both tracks finish:

- If the server failed to start, ask the user to start it manually and continue once reachable.
- If you added `capture.js` to a local app that was already running, restart the app server first.
- Show the discovered route/view list and get confirmation before capture starts.

### Step 2: Preparation plus capture-id generation

Start tab preparation and capture-id generation so they overlap.

Run `--prepare` directly from the target project:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/capture.mjs --prepare \
  --routes "/,/about,/dashboard" \
  --labels "label-main:Main|/,label-admin:Admin|/dashboard" \
  --app-url <url> \
  --viewport <WxH> \
  [--views-file ./capture-views.mjs]
```

For state-driven SPAs, add `--views-file ./capture-views.mjs` and pass VIEWS keys,
not URL paths, in `--routes`.
Read [references/spa-capture.md](references/spa-capture.md)
when there is no URL router.

While `--prepare` is running or immediately after it starts, generate capture IDs
for every prepared view using `generate_figma_design`.

- Existing Figma file: generate one capture ID per view with `outputMode: "existingFile"`.
- New Figma file: create the file once with `outputMode: "newFile"`, share the claim URL,
  wait for the user to claim it, then generate the remaining IDs against that file.

If `--prepare` fails with a CDP connectivity error, delete `.capture-browser.json`,
restart `--start-browser`, wait for the handoff file to reappear, and rerun `--prepare`.

Before Step 3, confirm that all tabs are open and visually ready.

### Step 3: Fire sequentially, poll in parallel

Keep frame ordering deterministic:

- Fire `captureForDesign` left to right, one tab at a time, using:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/execute-cdp.mjs <viewName> <captureId> <endpoint>
```

- Poll every outstanding `captureId` in parallel with `generate_figma_design(captureId)`.
- When a capture completes, extract the returned `node-id`, convert `123-456` to `123:456`,
  then close only that tab:

```bash
cd <projectDir> && node {SKILL_DIR}/scripts/execute-cdp.mjs <viewName> --close-only
```

Read [references/cdp-architecture.md](references/cdp-architecture.md)
for the raw CDP rationale, polling model, and fallback if `execute-cdp.mjs` fails.

Return the final mapping as `{ "<viewName>": "<nodeId>" }`.

### Step 4: Browser cleanup

After all captures complete, close the CDP browser:

```bash
kill $(lsof -t -i :<cdpPort>) 2>/dev/null || fuser -k <cdpPort>/tcp 2>/dev/null || true
```

### Step 5: Section grouping

`label-*` views create full-screen divider captures. No extra grouping tool is needed.

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

- Keep generated `capture-views.mjs` in the target project, not in the skill repo.
- Do not duplicate long procedural content from the reference files into this document.
- For git commits in downstream repos, prefer the user's GitHub `noreply` email;
  do not assume a Codex- or OpenAI-specific `noreply` address exists.
