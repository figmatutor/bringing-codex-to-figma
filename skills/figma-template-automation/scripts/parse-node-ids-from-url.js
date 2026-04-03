#!/usr/bin/env node

/**
 * Figma URL Parser for Template Automation
 * Extract and validate fileKey, nodeId, fileName from Figma URLs.
 *
 * For Mode B (template creation), nodeId is REQUIRED — each URL must point
 * to a specific node (tokens node vs components node) within the same file.
 */

/**
 * Parse and validate Figma URL
 * @param {string} figmaUrl - The Figma URL to parse
 * @param {Object} options
 * @param {boolean} options.requireNodeId - Throw if no node-id param is found
 * @returns {Object} Parsed URL data with validation
 */
function parseNodeIdsFromUrl(figmaUrl, { requireNodeId = false } = {}) {
  // Input validation
  if (!figmaUrl || typeof figmaUrl !== 'string') {
    throw new Error('Invalid input: URL must be a non-empty string');
  }

  let url;
  try {
    url = new URL(figmaUrl.trim());
  } catch (error) {
    throw new Error('Invalid URL format');
  }

  // Validate Figma domain
  if (!url.hostname.includes('figma.com')) {
    throw new Error('Invalid Figma URL: must be from figma.com');
  }

  // Parse path components
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Validate URL structure — accept both /file/ and /design/ paths
  const validPathTypes = ['file', 'design'];
  if (pathParts.length < 2 || !validPathTypes.includes(pathParts[0])) {
    throw new Error('Invalid Figma URL: must be a file or design URL (e.g., /file/fileKey/... or /design/fileKey/...)');
  }

  const fileKey = pathParts[1];
  const fileName = pathParts[2] || '';

  // node-id in URLs uses "-" as separator (e.g. "2004-2187"), but Figma API
  // uses ":" (e.g. "2004:2187"). Normalise to colon form for consistency.
  const rawNodeId = url.searchParams.get('node-id');
  const nodeId = rawNodeId ? rawNodeId.replace(/-/g, ':') : null;

  // Validate fileKey format
  if (!fileKey || fileKey.length < 10) {
    throw new Error('Invalid Figma URL: fileKey appears to be invalid');
  }

  // Enforce nodeId when required (Mode B URLs must target a specific node)
  if (requireNodeId && !nodeId) {
    throw new Error(
      'This URL is missing a node-id parameter.\n' +
      'Mode B requires URLs that point to a specific node (add ?node-id=XXXX:YYYY to the URL).'
    );
  }

  // Decode filename for display
  const decodedFileName = fileName ? decodeURIComponent(fileName.replace(/-/g, ' ')) : 'Untitled';

  return {
    fileKey,
    fileName: decodedFileName,
    nodeId,
    originalUrl: figmaUrl,
    isValid: true
  };
}

/**
 * Validate a single Figma URL (dry-run wrapper).
 * @param {string} figmaUrl
 * @param {Object} options - passed through to parseNodeIdsFromUrl
 * @returns {Object} Validation result with success/error info
 */
function validateFigmaUrl(figmaUrl, options = {}) {
  try {
    const parsed = parseNodeIdsFromUrl(figmaUrl, options);
    return {
      success: true,
      data: parsed,
      message: `Valid Figma file: "${parsed.fileName}" (${parsed.fileKey})`
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      message: error.message,
      suggestion: 'Please provide a valid Figma URL with a node-id param, e.g.:\n  https://www.figma.com/design/abc123/My-Design?node-id=1234:5678'
    };
  }
}

/**
 * Validate a pair of URLs for Mode B (tokens + components).
 * Rules:
 *  1. Both must be valid Figma URLs with a node-id.
 *  2. Both must share the same fileKey (same Figma file).
 *  3. The two nodeIds must be DIFFERENT (they point to distinct nodes).
 *
 * @param {string} tokensUrl
 * @param {string} componentsUrl
 * @returns {Object} { success, tokensData, componentsData, message }
 */
function validateModeBUrls(tokensUrl, componentsUrl) {
  const tokensResult = validateFigmaUrl(tokensUrl, { requireNodeId: true });
  if (!tokensResult.success) {
    return { success: false, message: `Tokens URL invalid: ${tokensResult.message}` };
  }

  const componentsResult = validateFigmaUrl(componentsUrl, { requireNodeId: true });
  if (!componentsResult.success) {
    return { success: false, message: `Components URL invalid: ${componentsResult.message}` };
  }

  const t = tokensResult.data;
  const c = componentsResult.data;

  if (t.fileKey !== c.fileKey) {
    return {
      success: false,
      message:
        `Both URLs must point to the same Figma file.\n` +
        `  Tokens file key:    ${t.fileKey}\n` +
        `  Components file key: ${c.fileKey}`
    };
  }

  if (t.nodeId === c.nodeId) {
    return {
      success: false,
      message:
        `Both URLs point to the same node (${t.nodeId}).\n` +
        `Mode B requires two DIFFERENT nodes: one for tokens/styles and one for components.`
    };
  }

  return {
    success: true,
    tokensData: t,
    componentsData: c,
    message:
      `Valid Mode B pair:\n` +
      `  File: "${t.fileName}" (${t.fileKey})\n` +
      `  Tokens node:     ${t.nodeId}\n` +
      `  Components node: ${c.nodeId}`
  };
}

/**
 * CLI usage
 *
 * Single URL:
 *   node parse-node-ids-from-url.js "<url>"
 *   node parse-node-ids-from-url.js --require-node-id "<url>"
 *
 * Mode B pair:
 *   node parse-node-ids-from-url.js --mode-b "<tokens-url>" "<components-url>"
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage:');
    console.error('  node parse-node-ids-from-url.js "<figma-url>"');
    console.error('  node parse-node-ids-from-url.js --require-node-id "<figma-url>"');
    console.error('  node parse-node-ids-from-url.js --mode-b "<tokens-url>" "<components-url>"');
    process.exit(1);
  }

  // Mode B: validate a tokens+components URL pair
  if (args[0] === '--mode-b') {
    if (args.length < 3) {
      console.error('--mode-b requires two URLs: <tokens-url> <components-url>');
      process.exit(1);
    }
    const result = validateModeBUrls(args[1], args[2]);
    if (result.success) {
      console.log('✅', result.message);
    } else {
      console.log('❌', result.message);
      process.exit(1);
    }
    return;
  }

  // Single URL (with optional --require-node-id flag)
  const requireNodeId = args[0] === '--require-node-id';
  const figmaUrl = requireNodeId ? args[1] : args[0];

  if (!figmaUrl) {
    console.error('Please provide a Figma URL.');
    process.exit(1);
  }

  const result = validateFigmaUrl(figmaUrl, { requireNodeId });

  if (result.success) {
    console.log('✅', result.message);
    console.log('   File Key:', result.data.fileKey);
    console.log('   File Name:', result.data.fileName);
    if (result.data.nodeId) {
      console.log('   Node ID:', result.data.nodeId);
    } else {
      console.log('   Node ID: (none — full file)');
    }
  } else {
    console.log('❌', result.message);
    if (result.suggestion) {
      console.log('💡', result.suggestion);
    }
    process.exit(1);
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseNodeIdsFromUrl,
    validateFigmaUrl
  };
}

// Run CLI if called directly
if (require.main === module) {
  main();
}