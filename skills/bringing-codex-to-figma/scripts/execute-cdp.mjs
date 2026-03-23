#!/usr/bin/env node
/**
 * execute-cdp.mjs — Execute captureForDesign in a prepared tab.
 *
 * Use raw CDP directly to avoid Playwright session conflicts between
 * capture.mjs and the follow-up execution process.
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

async function cdpSession(wsUrl, commands, timeoutMs = 15_000) {
  return new Promise((resolveResult, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Set();
    let msgId = 1;
    const results = [];
    let settled = false;
    let timeoutHandle = null;

    function finishOk(value) {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolveResult(value);
    }

    function finishErr(error) {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    }

    ws.addEventListener('open', () => {
      if (!Array.isArray(commands) || commands.length === 0) {
        ws.close();
        return;
      }

      for (const cmd of commands) {
        const id = msgId++;
        pending.add(id);
        ws.send(JSON.stringify({ id, ...cmd }));
      }

      timeoutHandle = setTimeout(() => {
        const unresolved = [...pending].join(', ');
        ws.close();
        finishErr(
          new Error(
            `CDP response timeout after ${timeoutMs}ms` +
            (unresolved ? ` (pending ids: ${unresolved})` : '')
          )
        );
      }, timeoutMs);
    });

    ws.addEventListener('message', (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch (error) {
        finishErr(new Error(`Invalid CDP JSON message: ${error.message}`));
        return;
      }

      if (msg.id && pending.has(msg.id)) {
        pending.delete(msg.id);
        results.push(msg);
        if (pending.size === 0) {
          ws.close();
          finishOk(results);
        }
      }
    });

    ws.addEventListener('close', () => {
      if (settled) return;
      if (pending.size > 0) {
        const unresolved = [...pending].join(', ');
        finishErr(new Error(`CDP socket closed before all responses arrived (pending ids: ${unresolved})`));
        return;
      }
      finishOk(results);
    });

    ws.addEventListener('error', (e) => {
      finishErr(new Error(String(e.message || e)));
    });
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
  if (!evalResult) {
    console.error('✗ Runtime.evaluate did not return a response.');
    process.exit(1);
  }

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
