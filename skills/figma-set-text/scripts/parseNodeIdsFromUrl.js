// parseNodeIdsFromUrl.js - Figma URL parsing utility
// Extract fileKey and nodeId from various Figma URL formats

/**
 * Extract fileKey and nodeId from a Figma URL.
 *
 * Supported URL formats:
 * - https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}
 * - https://www.figma.com/file/{fileKey}/{fileName}?node-id={nodeId}
 * - https://www.figma.com/board/{fileKey}/{fileName}?node-id={nodeId} (FigJam)
 * - https://www.figma.com/design/{fileKey}/branch/{branchKey}/{fileName}?node-id={nodeId}
 *
 * @param {string} figmaUrl - Figma URL to parse
 * @returns {Object} - Parsed result object
 */
function parseNodeIdsFromUrl(figmaUrl) {
  try {
    const url = new URL(figmaUrl);

    // Verify that the URL belongs to the Figma domain.
    if (!url.hostname.includes('figma.com')) {
      throw new Error('Invalid Figma URL: not a figma.com URL');
    }

    const pathParts = url.pathname.split('/').filter(part => part.length > 0);

    if (pathParts.length < 3) {
      throw new Error('Invalid Figma URL: insufficient path components');
    }

    let fileType = pathParts[0]; // 'design', 'file', 'board'
    let fileKey = pathParts[1];
    let fileName = pathParts[2];
    let branchKey = null;

    // Handle branch URLs: /design/{fileKey}/branch/{branchKey}/{fileName}
    if (pathParts.length >= 5 && pathParts[2] === 'branch') {
      branchKey = pathParts[3];
      fileName = pathParts[4];
      // For branch URLs, use branchKey as fileKey.
      fileKey = branchKey;
    }

    // Extract node-id from the query parameters.
    const nodeIdParam = url.searchParams.get('node-id');
    let primaryNodeId = null;

    if (nodeIdParam) {
      // Normalize node-id formats: "0-1" -> "0:1", "1%3A2" -> "1:2"
      primaryNodeId = nodeIdParam
        .replace(/-/g, ':')           // Convert hyphens to colons.
        .replace(/%3A/gi, ':')       // Decode URL-encoded colons.
        .replace(/%2D/gi, '-');      // Decode URL-encoded hyphens when present.
    }

    // Collect additional metadata.
    const viewParams = {
      p: url.searchParams.get('p'),           // View mode
      t: url.searchParams.get('t'),           // Token
      viewport: url.searchParams.get('viewport'), // Viewport information
      mode: url.searchParams.get('mode'),     // Mode, for example dev mode
    };

    // File-type descriptions.
    const fileTypeInfo = {
      design: 'Figma Design File',
      file: 'Figma Design File (Legacy URL)',
      board: 'FigJam Board',
    };

    const result = {
      success: true,
      fileKey: fileKey,
      fileName: decodeURIComponent(fileName),
      primaryNodeId: primaryNodeId,
      fileType: fileType,
      fileTypeDescription: fileTypeInfo[fileType] || 'Unknown Figma File Type',
      branchKey: branchKey,
      viewParams: viewParams,
      originalUrl: figmaUrl,
      parsedUrl: {
        protocol: url.protocol,
        hostname: url.hostname,
        pathname: url.pathname,
        search: url.search,
      }
    };

    // Log the parsed result.
    console.log('URL Parsing Result:', {
      fileKey: result.fileKey,
      fileName: result.fileName,
      primaryNodeId: result.primaryNodeId,
      fileType: result.fileType,
      branchKey: result.branchKey,
    });

    return result;

  } catch (error) {
    console.error('URL Parsing Error:', error.message);

    return {
      success: false,
      error: error.message,
      fileKey: null,
      fileName: null,
      primaryNodeId: null,
      fileType: null,
      branchKey: null,
      viewParams: {},
      originalUrl: figmaUrl,
    };
  }
}

/**
 * Helper to validate the parsed result.
 * @param {Object} parseResult - Result from parseNodeIdsFromUrl
 * @returns {Object} - Validation result
 */
function validateParseResult(parseResult) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  if (!parseResult.success) {
    validation.isValid = false;
    validation.errors.push(`URL parsing failed: ${parseResult.error}`);
    return validation;
  }

  // Validate fileKey.
  if (!parseResult.fileKey || parseResult.fileKey.length < 10) {
    validation.isValid = false;
    validation.errors.push('Invalid fileKey: too short or missing');
  }

  // Validate primaryNodeId.
  if (!parseResult.primaryNodeId) {
    validation.warnings.push('No node-id found in URL - will need to use page root');
  } else if (!parseResult.primaryNodeId.includes(':')) {
    validation.warnings.push('Node ID format may be incorrect - expected format: "pageId:nodeId"');
  }

  // Validate file type.
  const supportedTypes = ['design', 'file', 'board'];
  if (!supportedTypes.includes(parseResult.fileType)) {
    validation.warnings.push(`Unsupported file type: ${parseResult.fileType}`);
  }

  // Add a FigJam-specific warning.
  if (parseResult.fileType === 'board') {
    validation.warnings.push('FigJam boards may have different node structure than design files');
  }

  return validation;
}

/**
 * Build get_metadata call parameters from the parsed URL info.
 * @param {Object} parseResult - Result from parseNodeIdsFromUrl
 * @returns {Object} - Parameters for the MCP tool call
 */
function createMetadataParams(parseResult) {
  if (!parseResult.success) {
    throw new Error(`Cannot create metadata params: ${parseResult.error}`);
  }

  return {
    // get_metadata expects a nodeId parameter.
    nodeId: parseResult.primaryNodeId || parseResult.fileKey, // Use the file root when nodeId is missing.
    fileKey: parseResult.fileKey,
    fileName: parseResult.fileName,
    fileType: parseResult.fileType,
  };
}

// Export for reuse in other scripts.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseNodeIdsFromUrl,
    validateParseResult,
    createMetadataParams,
  };
}
