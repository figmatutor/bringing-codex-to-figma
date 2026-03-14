#!/usr/bin/env node
/**
 * capture.mjs — Browser preparation for bringing-codex-to-figma
 *
 * Two modes:
 *
 * --start-browser
 *   Opens a headful Playwright browser, handles auth, then keeps the browser
 *   alive and writes .capture-browser.json with the CDP port. Step 2's
 *   --prepare connects to this browser automatically.
 *
 * --prepare
 *   If .capture-browser.json exists: connects to that browser, opens all route
 *   and label tabs, then exits. Otherwise launches a fresh browser, handles
 *   auth inline, and keeps the browser open.
 *
 * --dry-run
 *   With --start-browser: prints what would happen, then exits.
 *   With --prepare: prints the tab plan, writes a dry-run
 *   .capture-session.json, then exits without opening a browser.
 *
 * Parameters:
 *   --routes     Comma-separated URL paths or VIEWS keys
 *   --labels     Comma-separated label specs: "name:Title|/path"
 *   --app-url    Base app URL
 *   --viewport   WxH viewport size
 *   --views-file Optional capture-views.mjs path for SPAs
 *
 * Outputs:
 *   .capture-browser.json
 *   .capture-session.json
 */

import { createRequire } from 'module';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import net from 'net';

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      result[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result[arg.slice(2)] = next;
        i++;
      } else {
        result[arg.slice(2)] = true;
      }
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));

if (!args.prepare && !args['start-browser']) {
  console.error(
    'Usage:\n' +
    '  node capture.mjs --start-browser --app-url <url> [--viewport WxH] [--dry-run]\n' +
    '  node capture.mjs --prepare \\\n' +
    '    --routes "/,/about" \\\n' +
    '    --labels "label-main:Main|/,label-admin:Admin|/dashboard" \\\n' +
    '    --app-url <url> [--viewport WxH] [--views-file path] [--dry-run]'
  );
  process.exit(1);
}

const isDryRun = !!args['dry-run'];

function loadChromium() {
  try {
    const req = createRequire(resolve(process.cwd(), 'package.json'));
    return req('playwright').chromium;
  } catch (_) {}
  try {
    const req = createRequire(import.meta.url);
    return req('playwright').chromium;
  } catch (_) {
    console.error('✗ playwright not found. Run: npm install playwright');
    process.exit(1);
  }
}

function findFreePort(startPort) {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => findFreePort(startPort + 1).then(resolvePort, reject));
    server.listen(startPort, () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function labelHtml(title) {
  return `
    <div style="position:fixed;inset:0;z-index:99999;background:#F3F4F6;
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="text-align:center">
        <h1 style="font-size:52px;font-weight:700;color:#111827;margin:0 0 14px;">${title}</h1>
      </div>
    </div>`;
}

if (args['start-browser']) {
  const sbAppUrl = (args['app-url'] || 'http://localhost:3000').replace(/\/$/, '');
  const sbAppOrigin = new URL(sbAppUrl).origin;
  const [sbW, sbH] = (args.viewport || '1440x900').split('x').map(Number);

  if (isDryRun) {
    console.log('[dry-run] --start-browser');
    console.log(`[dry-run]   app-url:  ${sbAppUrl}`);
    console.log(`[dry-run]   viewport: ${sbW}x${sbH}`);
    console.log('[dry-run]   Would start a headful Chromium browser on an auto-assigned CDP port.');
    console.log('[dry-run]   Would write .capture-browser.json with { cdpPort }.');
    process.exit(0);
  }

  const chromium = loadChromium();
  const cdpPort = await findFreePort(9222);

  console.log(`[start-browser] app: ${sbAppUrl}`);
  console.log(`[start-browser] starting browser on CDP port ${cdpPort}...`);

  const browser = await chromium.launch({
    headless: false,
    args: [`--remote-debugging-port=${cdpPort}`],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const authPage = await context.newPage();
  await authPage.setViewportSize({ width: sbW, height: sbH });
  console.log(`[start-browser] Navigating to ${sbAppUrl} — log in if prompted (up to 2 min)...`);
  await authPage.goto(sbAppUrl, { waitUntil: 'domcontentloaded' });

  if (!authPage.url().startsWith(sbAppOrigin)) {
    try {
      await authPage.waitForURL((url) => url.startsWith(sbAppOrigin), { timeout: 120_000 });
      console.log('[start-browser] Back on app — session established.');
    } catch (_) {
      console.warn('[start-browser] Timeout waiting for app root — continuing anyway.');
    }
  } else {
    console.log('[start-browser] Already on app (no SSO redirect).');
  }

  const browserJsonPath = resolve(process.cwd(), '.capture-browser.json');
  writeFileSync(browserJsonPath, JSON.stringify({ cdpPort }, null, 2));

  console.log('');
  console.log('✓ Browser ready — authenticated');
  console.log(`✓ CDP port: ${cdpPort}`);
  console.log('✓ .capture-browser.json written');
  console.log('');
  console.log('Waiting for capture.mjs --prepare to open route tabs...');
  console.log('Press Ctrl+C when all captures are done.');

  process.on('SIGINT', async () => {
    console.log('\n[start-browser] Closing browser...');
    await browser.close();
    process.exit(0);
  });

  await new Promise(() => {});
}

const appUrl = (args['app-url'] || 'http://localhost:3000').replace(/\/$/, '');
const appOrigin = new URL(appUrl).origin;
const hostname = new URL(appUrl).hostname;
const isLocal = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.local)$/.test(hostname);
const [width, height] = (args.viewport || '1440x900').split('x').map(Number);

const routePaths = (args.routes || '/')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

const labelMap = new Map();
if (args.labels) {
  for (const entry of args.labels.split(',')) {
    const pipeIdx = entry.indexOf('|');
    const colonIdx = entry.indexOf(':');
    if (colonIdx !== -1 && pipeIdx !== -1) {
      const name = entry.slice(0, colonIdx).trim();
      const title = entry.slice(colonIdx + 1, pipeIdx).trim();
      const path = entry.slice(pipeIdx + 1).trim() || '/';
      labelMap.set(name, { name, title, path });
    }
  }
}

const allViews = [];
for (const routePath of routePaths) {
  const routeUrl = routePath.startsWith('/') ? `${appUrl}${routePath}` : appUrl;

  for (const [lname, label] of labelMap) {
    if (label.path === routePath && !allViews.find((v) => v.name === lname)) {
      allViews.push({
        type: 'label',
        name: lname,
        title: label.title,
        url: routeUrl,
      });
    }
  }

  allViews.push({ type: 'route', name: routePath, url: routeUrl });
}

if (allViews.length === 0) {
  console.error('No views to prepare. Check --routes / --labels.');
  process.exit(1);
}

if (isDryRun) {
  const labelCount = allViews.filter((v) => v.type === 'label').length;
  const routeCount = allViews.filter((v) => v.type === 'route').length;

  console.log('[dry-run] --prepare');
  console.log(`[dry-run]   mode:     ${isLocal ? 'LOCAL' : 'EXTERNAL'}`);
  console.log(`[dry-run]   app-url:  ${appUrl}`);
  console.log(`[dry-run]   viewport: ${width}x${height}`);
  console.log(`[dry-run]   tabs:     ${allViews.length} total (${labelCount} labels, ${routeCount} routes)`);
  console.log('');
  console.log('[dry-run] Tab plan:');
  for (const view of allViews) {
    const prefix = view.type === 'label' ? '[label]' : '[route]';
    console.log(`  ${prefix} ${view.name} → ${view.url}`);
  }

  const dryRunSession = {
    dryRun: true,
    cdpPort: null,
    appUrl,
    isLocal,
    viewport: { width, height },
    tabs: allViews.map((view, i) => ({
      index: i,
      viewName: view.name,
      type: view.type,
      url: view.url,
      title: view.type === 'label' ? view.title : view.name,
      targetId: null,
    })),
  };

  const sessionPath = resolve(process.cwd(), '.capture-session.json');
  writeFileSync(sessionPath, JSON.stringify(dryRunSession, null, 2));
  console.log('');
  console.log('✓ .capture-session.json written (dry-run)');
  process.exit(0);
}

let viewsNavigate = {};
if (args['views-file']) {
  const viewsPath = resolve(process.cwd(), args['views-file']);
  if (existsSync(viewsPath)) {
    const { VIEWS } = await import(pathToFileURL(viewsPath).href);
    viewsNavigate = VIEWS || {};
    console.log(`[views] Loaded navigate functions: ${Object.keys(viewsNavigate).join(', ')}`);
  } else {
    console.warn(`[views] --views-file not found: ${viewsPath}`);
  }
}

const browserJsonPath = resolve(process.cwd(), '.capture-browser.json');
const hasHandover = existsSync(browserJsonPath);

let browser;
let context;
let cdpPort;

if (hasHandover) {
  ({ cdpPort } = JSON.parse(readFileSync(browserJsonPath, 'utf-8')));
  console.log(`[prepare] mode: ${isLocal ? 'LOCAL' : 'EXTERNAL'}`);
  console.log(`[prepare] app:  ${appUrl}`);
  console.log(`[prepare] tabs: ${allViews.map((v) => v.name).join(', ')}`);
  console.log(`[prepare] connecting to browser on CDP port ${cdpPort}...`);
  const chromium = loadChromium();
  browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
  const contexts = browser.contexts();
  const authCtx = contexts.find((ctx) => ctx.pages().length > 0);
  context = authCtx ?? contexts[0] ?? await browser.newContext({ ignoreHTTPSErrors: true });
  console.log('[auth] Reusing authenticated session from --start-browser.');
} else {
  cdpPort = await findFreePort(9222);
  console.log(`[prepare] mode: ${isLocal ? 'LOCAL' : 'EXTERNAL'}`);
  console.log(`[prepare] app:  ${appUrl}`);
  console.log(`[prepare] tabs: ${allViews.map((v) => v.name).join(', ')}`);
  console.log(`[prepare] starting browser on CDP port ${cdpPort}...`);
  const chromium = loadChromium();
  browser = await chromium.launch({
    headless: false,
    args: [`--remote-debugging-port=${cdpPort}`],
  });
  context = await browser.newContext({ ignoreHTTPSErrors: true });
}

if (hasHandover) {
  const prevSessionFile = resolve(process.cwd(), '.capture-session.json');
  if (existsSync(prevSessionFile)) {
    try {
      const prev = JSON.parse(readFileSync(prevSessionFile, 'utf-8'));
      const staleIds = (prev.tabs || []).map((t) => t.targetId).filter(Boolean);
      if (staleIds.length > 0) {
        console.log(`[prepare] Closing ${staleIds.length} stale tab(s) from previous session...`);
        await Promise.all(staleIds.map((id) =>
          fetch(`http://localhost:${cdpPort}/json/close/${id}`).catch(() => {})
        ));
      }
    } catch (_) {}
  }
}

if (!isLocal) {
  await context.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    await route.fulfill({ response, headers });
  });
}

if (!hasHandover) {
  const authPage = await context.newPage();
  await authPage.setViewportSize({ width, height });
  console.log(`[auth] Navigating to ${appUrl} — log in if prompted (up to 2 min)...`);
  await authPage.goto(appUrl, { waitUntil: 'domcontentloaded' });

  if (!authPage.url().startsWith(appOrigin)) {
    try {
      await authPage.waitForURL((url) => url.startsWith(appOrigin), { timeout: 120_000 });
      console.log('[auth] Back on app — session established.');
    } catch (_) {
      console.warn('[auth] Timeout waiting for app root — continuing anyway.');
    }
  } else {
    console.log('[auth] Already on app (no SSO redirect).');
  }
  await authPage.close();
}

console.log(`[prepare] Opening ${allViews.length} tabs...`);

const pages = await Promise.all(allViews.map(async (view) => {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(view.url, { waitUntil: isLocal ? 'domcontentloaded' : 'load' });
  if (!isLocal) {
    try {
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    } catch (_) {}
  }

  if (view.type === 'label') {
    await page.evaluate((html) => {
      document.body.insertAdjacentHTML('beforeend', html);
    }, labelHtml(view.title));
  } else if (viewsNavigate[view.name]) {
    await viewsNavigate[view.name](page);
  }

  const tabName = view.type === 'label' ? view.title : view.name;
  await page.evaluate((name) => { document.title = name; }, tabName);

  let targetId = null;
  try {
    const res = await fetch(`http://localhost:${cdpPort}/json`);
    const cdpTargets = await res.json();
    const match = cdpTargets.find((t) => t.type === 'page' && t.title === tabName);
    if (match) targetId = match.id;
  } catch (_) {}

  await page.evaluate((name) => {
    try {
      Object.defineProperty(document, 'title', {
        get: () => name,
        set: () => {},
        configurable: true,
      });
    } catch (_) {}
  }, tabName);

  return { view, page, targetId };
}));

console.log(`[prepare] ${pages.length} tabs opened.`);

if (!isLocal) {
  console.log('[prepare] Fetching capture.js for EXTERNAL inject...');
  let captureJs;
  try {
    const r = await context.request.get(
      'https://mcp.figma.com/mcp/html-to-design/capture.js'
    );
    captureJs = await r.text();
  } catch (e) {
    console.error('✗ Failed to fetch capture.js:', e.message);
    await browser.close();
    process.exit(1);
  }

  for (const { view, page } of pages) {
    await page.evaluate((script) => {
      const el = document.createElement('script');
      el.textContent = script;
      document.head.appendChild(el);
    }, captureJs);
    await page.waitForTimeout(300);
    console.log(`[inject] capture.js → ${view.name}`);
  }
  console.log('[prepare] capture.js injected into all tabs.');
} else {
  console.log('[prepare] LOCAL — capture.js already in index.html, skipping inject.');
}

const sessionData = {
  cdpPort,
  appUrl,
  isLocal,
  viewport: { width, height },
  tabs: pages.map(({ view, targetId }, i) => ({
    index: i,
    viewName: view.name,
    type: view.type,
    url: view.url,
    title: view.type === 'label' ? view.title : view.name,
    targetId: targetId ?? null,
  })),
};

const sessionPath = resolve(process.cwd(), '.capture-session.json');
writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));

console.log('');
console.log(`✓ ${pages.length} tabs ready`);
console.log(`✓ CDP port: ${cdpPort}`);
console.log('✓ .capture-session.json written');
console.log('');
console.log('Next: use execute-cdp.mjs to fire captureForDesign in each tab.');

if (hasHandover) {
  console.log('Browser kept alive by --start-browser process.');
  process.exit(0);
}

process.on('SIGINT', async () => {
  console.log('\n[prepare] Closing browser...');
  await browser.close();
  process.exit(0);
});

await new Promise(() => {});
