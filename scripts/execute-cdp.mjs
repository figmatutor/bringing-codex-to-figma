#!/usr/bin/env node
/**
 * execute-cdp.mjs — Execute captureForDesign in a prepared tab.
 *
 * Uses raw CDP to avoid Playwright session conflicts between capture.mjs and
 * the follow-up execution process.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const rawArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const closeOnly = flags.includes('--close-only');

const [viewName, captureId, figmaEndpoint] = rawArgs;

if (!viewName) {
  console.error('Usage: node execute-cdp.mjs <viewName> <captureId> <figmaEndpoint>');
  console.error('       node execute-cdp.mjs <viewName> --close-only');
  process.exit(1);
}
if (!closeOnly && (!captureId || !figmaEndpoint)) {
  console.error('Usage: node execute-cdp.mjs <viewName> <captureId> <figmaEndpoint>');
  process.exit(1);
}

const sessionPath = resolve(process.cwd(), '.capture-session.json');
let session;
try {
  session = JSON.parse(readFileSync(sessionPath, 'utf8'));
} catch (_) {
  console.error('✗ .capture-session.json not found. Run capture.mjs --prepare first.');
  process.exit(1);
}
const { cdpPort } = session;

let targets;
try {
  const res = await fetch(`http://localhost:${cdpPort}/json`);
  targets = await res.json();
} catch (e) {
  console.error(`✗ Could not reach CDP on port ${cdpPort}: ${e.message}`);
  console.error('  Is capture.mjs --prepare or --start-browser still running?');
  process.exit(1);
}

const sessionTab = session.tabs?.find((t) => t.viewName === viewName);
let target;
if (sessionTab?.targetId) {
  target = targets.find((t) => t.id === sessionTab.targetId);
}
if (!target) {
  target = targets.find((t) => t.title === viewName && t.type === 'page');
}

if (!target) {
  const available = targets
    .filter((t) => t.type === 'page')
    .map((t) => `"${t.title}" (${t.url})`)
    .join(', ');
  console.error(`✗ Tab "${viewName}" not found by targetId or title.`);
  console.error(`  Available: ${available}`);
  process.exit(1);
}

console.log(`[cdp] Found tab: "${viewName}" (${target.id})`);

async function cdpSession(wsUrl, commands) {
  return new Promise((resolveResult, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let msgId = 1;
    const results = [];

    ws.addEventListener('open', async () => {
      for (const cmd of commands) {
        const id = msgId++;
        pending.set(id, null);
        ws.send(JSON.stringify({ id, ...cmd }));
      }
    });

    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id && pending.has(msg.id)) {
        pending.delete(msg.id);
        results.push(msg);
        if (pending.size === 0) {
          ws.close();
        }
      }
    });

    ws.addEventListener('close', () => resolveResult(results));
    ws.addEventListener('error', (e) => reject(new Error(String(e.message || e))));
  });
}

if (!closeOnly) {
  const expression =
    `window.figma.captureForDesign(` +
    `{ captureId: ${JSON.stringify(captureId)}, endpoint: ${JSON.stringify(figmaEndpoint)}, selector: 'body' }` +
    `)`;

  const commands = [{ method: 'Runtime.evaluate', params: { expression, awaitPromise: false } }];

  let results;
  try {
    results = await cdpSession(target.webSocketDebuggerUrl, commands);
  } catch (e) {
    console.error(`✗ CDP WebSocket error: ${e.message}`);
    process.exit(1);
  }

  const evalResult = results[0];
  if (evalResult?.error) {
    console.error('✗ Runtime.evaluate error:', JSON.stringify(evalResult.error));
    process.exit(1);
  }

  if (evalResult?.result?.result?.subtype === 'error') {
    console.error('✗ captureForDesign threw:', evalResult.result.result.description);
    process.exit(1);
  }

  console.log(`[cdp] captureForDesign triggered for "${viewName}"`);
}

if (closeOnly) {
  try {
    const res = await fetch(`http://localhost:${cdpPort}/json/close/${target.id}`);
    const body = await res.text();
    console.log(`[cdp] Tab "${viewName}" closed (${body.trim()}).`);
  } catch (e) {
    console.warn(`[cdp] Warning: could not close tab: ${e.message}`);
  }
}

console.log('[cdp] Done.');
