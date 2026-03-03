#!/usr/bin/env node
/**
 * capture.mjs — Batch-optimized Playwright capture runner for bringing-screens-to-figma
 *
 * Two-phase approach with a single handshake file:
 *   Phase 1 (parallel):   Open and navigate all browser tabs — no captureId required
 *   Handshake:            Poll for capture-tokens.json (written by Codex or the active agent during or after Phase 1)
 *   Phase 2 (sequential): Read tokens, call captureForDesign(), write capture-map.json
 *
 * Codex starts this script in the background, then immediately calls generate_figma_design
 * for each view sequentially and writes capture-tokens.json. Phase 1 and MCP calls run
 * in parallel — no signal file needed.
 *
 * Loads app-specific view config from capture-views.mjs in the current working directory.
 * Resolves playwright from the project's node_modules (CWD), not the skill directory.
 *
 * Usage (run from your project directory):
 *   node /path/to/skill/scripts/capture.mjs --batch view1 view2 view3 [fileKey] [--port 5173]
 *
 * Handshake file (written by Codex or the active agent, read by this script):
 *   capture-tokens.json — provides captureId + endpoint per view; auto-deleted after Phase 2
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

// Resolve Playwright from the project directory so the skill doesn't need its own install.
function loadPlaywright() {
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  if (!existsSync(packageJsonPath)) {
    console.error('✗ package.json not found in current directory.');
    console.error(`  Expected: ${packageJsonPath}`);
    process.exit(1);
  }

  const projectRequire = createRequire(packageJsonPath);
  try {
    return projectRequire('playwright');
  } catch (error) {
    console.error('✗ Playwright package is not installed in this project.');
    console.error('  Install from the project root:');
    console.error('    npm install -D playwright');
    console.error('    npx playwright install chromium');
    console.error(`  CWD: ${process.cwd()}`);
    console.error(`  Original error: ${error.message}`);
    process.exit(1);
  }
}

const { chromium } = loadPlaywright();

const CAPTURE_JS_URL = 'https://mcp.figma.com/mcp/html-to-design/capture.js';
const TOKENS_FILE = resolve(process.cwd(), 'capture-tokens.json');
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 120000;

/**
 * Create simple HTML content for label tabs.
 * Converts 'label-notebooks' → 'Notebooks' with clean typography on a light background.
 */
function createSimpleLabelHTML(viewName) {
  const labelName = viewName.replace('label-', '').replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
  const path = '/' + viewName.replace('label-', '');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${labelName}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #F3F4F6;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .label { text-align: center; }
    h1 { font-size: 48px; font-weight: 700; color: #1F2937; margin: 0 0 8px; }
    p { font-size: 18px; color: #6B7280; margin: 0; font-family: 'SF Mono', 'Fira Code', monospace; }
  </style>
</head>
<body>
  <div class="label">
    <h1>${labelName}</h1>
    <p>${path}</p>
  </div>
</body>
</html>`;
}

// Load app-specific views from the project directory
const viewsPath = resolve(process.cwd(), 'capture-views.mjs');
if (!existsSync(viewsPath)) {
  console.error('✗ capture-views.mjs not found in current directory.');
  console.error('  Create it from the template in SKILL.md (State-Driven SPA section).');
  console.error(`  Expected: ${viewsPath}`);
  process.exit(1);
}

const { VIEW_NAMES, VIEWS } = await import(pathToFileURL(viewsPath).href);

// Parse command line arguments
const args = process.argv.slice(2);
let viewNames = [];
let fileKeyArg = null;
let port = Number(process.env.CAPTURE_PORT || process.env.PORT || 5173);

if (args[0] === '--batch') {
  const batchArgs = args.slice(1);

  // Optional override: --port 3000
  const portFlagIndex = batchArgs.indexOf('--port');
  if (portFlagIndex !== -1) {
    const portValue = Number(batchArgs[portFlagIndex + 1]);
    if (!Number.isFinite(portValue) || portValue <= 0) {
      console.error('Invalid --port value. Example: --port 5173');
      process.exit(1);
    }
    port = portValue;
    batchArgs.splice(portFlagIndex, 2);
  }

  // Last arg is fileKey if it doesn't match any known view and isn't a label
  const lastArg = batchArgs[batchArgs.length - 1];
  if (lastArg && !lastArg.startsWith('label-') && !(lastArg in VIEWS)) {
    fileKeyArg = lastArg;
    viewNames = batchArgs.slice(0, -1);
  } else {
    viewNames = batchArgs;
  }
} else {
  console.error('Usage: node capture.mjs --batch view1 view2 view3 [fileKey] [--port 5173]');
  console.error('Views:', Object.keys(VIEWS).join(', '));
  process.exit(1);
}

if (viewNames.length === 0) {
  console.error('No views specified.');
  process.exit(1);
}

const hasLabelViews = viewNames.some(viewName => viewName.startsWith('label-'));
if (!hasLabelViews) {
  console.warn('⚠ No label-* views were provided in --batch.');
  console.warn('  Section divider tabs will not be captured in Figma.');
  console.warn('  Add label keys (for example: label-overview) into the batch order to enable section grouping.');
}

// Validate all views exist in capture-views.mjs
for (const viewName of viewNames) {
  if (viewName.startsWith('label-')) continue;
  if (!(viewName in VIEWS)) {
    console.error(`Unknown view: "${viewName}". Available: ${Object.keys(VIEWS).join(', ')}`);
    process.exit(1);
  }
}

// Remove stale tokens file from any previous run
try { if (existsSync(TOKENS_FILE)) unlinkSync(TOKENS_FILE); } catch (_) {}

console.log(`Starting batch capture for ${viewNames.length} view(s)...`);
console.log(`Using app URL: http://localhost:${port}/`);

const captureResults = [];
let browser;
try {
  browser = await chromium.launch({ headless: false });
} catch (error) {
  console.error('✗ Failed to launch Playwright Chromium.');
  if (String(error.message).includes('Executable doesn\'t exist')) {
    console.error('  Chromium is not installed yet. Run: npx playwright install chromium');
  }
  console.error(`  Original error: ${error.message}`);
  process.exit(1);
}
const context = await browser.newContext();
const contexts = [];

try {
  /**
   * Phase 1: Parallel Preparation
   * Navigate all views simultaneously. Injects capture.js after navigation —
   * no captureId is needed at this stage.
   */
  console.log('Phase 1: Preparing all views in parallel...');

  await Promise.all(viewNames.map(async (viewName) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    // Set up response interceptor now — will fire during Phase 2 after captureForDesign()
    let claimUrl = null;
    let resolveSubmit, rejectSubmit;
    const submitResponsePromise = new Promise((res, rej) => {
      resolveSubmit = res;
      rejectSubmit = rej;
    });

    page.on('response', async (response) => {
      if (response.url().includes('/capture/') && response.url().includes('/submit')) {
        try {
          const json = JSON.parse(await response.text());
          if (json.claimUrl) claimUrl = json.claimUrl;
          resolveSubmit();
        } catch (_) {}
      }
    });

    if (viewName.startsWith('label-')) {
      // Label tab: static HTML page showing a section title
      await page.setContent(createSimpleLabelHTML(viewName));
    } else {
      // App tab: navigate to localhost and run view-specific navigation
      await page.goto(`http://localhost:${port}/`);
      await page.waitForLoadState('networkidle');

      const navigate = VIEWS[viewName];
      if (navigate) {
        await navigate(page);
      }
    }

    // Inject Figma capture SDK — provides window.figma.captureForDesign
    await page.addScriptTag({ url: CAPTURE_JS_URL });

    // Wait for SDK to initialize
    await page.waitForFunction(
      () => typeof window.figma !== 'undefined' && typeof window.figma.captureForDesign === 'function',
      { timeout: 15000 }
    );

    const friendlyName = VIEW_NAMES[viewName] || viewName;
    contexts.push({ viewName, friendlyName, page, getClaimUrl: () => claimUrl, submitResponsePromise, rejectSubmit });

    console.log(`  ✓ Prepared: ${friendlyName}`);
  }));

  // Restore original order (Promise.all may complete out of order)
  contexts.sort((a, b) => viewNames.indexOf(a.viewName) - viewNames.indexOf(b.viewName));

  /**
   * Poll for capture-tokens.json written by Codex or the active agent
   * (The agent writes tokens immediately after starting this script in background)
   */
  console.log('\nPhase 1 complete — waiting for capture-tokens.json...');
  console.log(`  Expected format: { "${viewNames[0]}": { "captureId": "...", "endpoint": "..." }, ... }`);
  console.log(`  Polling: ${TOKENS_FILE}`);
  console.log(`  (checks every ${POLL_INTERVAL_MS / 1000}s, timeout: ${POLL_TIMEOUT_MS / 1000}s)`);

  // Poll for capture-tokens.json
  let tokens = null;
  const pollStart = Date.now();

  while (!tokens) {
    if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
      console.error(`\n✗ Timeout: capture-tokens.json not written within ${POLL_TIMEOUT_MS / 1000}s`);
      process.exit(1);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    if (existsSync(TOKENS_FILE)) {
      try {
        const parsed = JSON.parse(readFileSync(TOKENS_FILE, 'utf8'));
        const allReady = viewNames.every(v => parsed[v]?.captureId && parsed[v]?.endpoint);
        if (allReady) {
          tokens = parsed;
          console.log('\n  ✓ capture-tokens.json received — proceeding to Phase 2');
        }
      } catch (_) {}
    }
  }

  /**
   * Phase 2: Sequential Capture
   * Execute captureForDesign() for each prepared view using the provided tokens.
   */
  console.log('\nPhase 2: Capturing views sequentially...');

  for (const { viewName, friendlyName, page, getClaimUrl, submitResponsePromise, rejectSubmit } of contexts) {
    const { captureId, endpoint } = tokens[viewName];
    const endpointWithName = `${endpoint}?frameName=${encodeURIComponent(friendlyName)}`;

    const timeout = setTimeout(
      () => rejectSubmit(new Error(`Submit timeout for ${friendlyName}`)),
      30000
    );

    console.log(`  Capturing: ${friendlyName}...`);

    await page.evaluate(({ cId, ep }) => {
      window.figma.captureForDesign({ captureId: cId, endpoint: ep, selector: 'body' });
    }, { cId: captureId, ep: endpointWithName });

    try {
      await submitResponsePromise;
      clearTimeout(timeout);
      await page.waitForTimeout(500);
    } catch (error) {
      clearTimeout(timeout);
      console.warn(`  ⚠ Submit warning for ${friendlyName}: ${error.message}`);
    }

    const finalClaimUrl = getClaimUrl();
    let nodeId = null;
    let fileKey = fileKeyArg || null;

    if (finalClaimUrl) {
      try {
        const url = new URL(finalClaimUrl);
        const parts = url.pathname.split('/');
        const designIdx = parts.indexOf('design');
        if (designIdx !== -1 && !fileKey) fileKey = parts[designIdx + 1];
        nodeId = url.searchParams.get('node-id');
      } catch (_) {}
    }

    captureResults.push({ viewName, friendlyName, nodeId, fileKey, claimUrl: finalClaimUrl });
    console.log(`    ✓ ${friendlyName}: nodeId=${nodeId ?? '(not returned)'}`);

    await page.close();
  }

  console.log(`\nPhase 2 complete: ${captureResults.length} views captured`);

} finally {
  await context.close();
  await browser.close();

  // Clean up tokens file
  try { if (existsSync(TOKENS_FILE)) unlinkSync(TOKENS_FILE); } catch (_) {}
}

/**
 * Update capture-map.json with all results
 */
const mapPath = resolve(process.cwd(), 'capture-map.json');
let map = {
  fileKey: null,
  figmaUrl: null,
  capturedAt: new Date().toISOString(),
  routes: [],
};

if (existsSync(mapPath)) {
  try { map = JSON.parse(readFileSync(mapPath, 'utf8')); } catch (_) {}
}

const resolvedFileKey = captureResults[0]?.fileKey;
if (resolvedFileKey) {
  map.fileKey = resolvedFileKey;
  map.figmaUrl = `https://www.figma.com/design/${resolvedFileKey}`;
}
map.capturedAt = new Date().toISOString();

const capturedViewNames = new Set(captureResults.map(r => r.viewName));
map.routes = (map.routes || []).filter(r => !capturedViewNames.has(r.viewName));

for (const result of captureResults) {
  map.routes.push({ name: result.friendlyName, viewName: result.viewName, nodeId: result.nodeId });
}

writeFileSync(mapPath, JSON.stringify(map, null, 2));

console.log('\n✅ Batch capture complete!');
console.log(`   📁 Updated capture-map.json (${map.routes.length} total route(s))`);
console.log(`   🔗 Figma file: ${map.figmaUrl || '(fileKey not available)'}`);
console.log('\n📊 Capture Summary:');
captureResults.forEach(result => {
  console.log(`   • ${result.friendlyName} → nodeId: ${result.nodeId || '(not returned)'}`);
});
