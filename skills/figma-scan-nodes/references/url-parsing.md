# Figma URL Parsing Reference

This document explains the Figma URL parsing approach used by the skill workflows in this repo.

## URL Structure Overview

### Basic Shape
Most Figma URLs follow this general pattern:
```
https://www.figma.com/{type}/{fileKey}/{additional_path}?{query_parameters}
```

### Supported URL Types

#### 1. Design Files
```
https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}&{other_params}
```

**Example:**
```
https://www.figma.com/design/SFYKVtJA3lUJYAQzk4y9CJ/Next.js-Blog-App---Route-Capture?node-id=0-1&p=f&t=ekiW5H8ABAUoUkln-11
```

**Parsed result:**
- `fileKey`: `SFYKVtJA3lUJYAQzk4y9CJ`
- `fileName`: `Next.js-Blog-App---Route-Capture` (URL-decoded)
- `primaryNodeId`: `0:1` (converted from `0-1`)
- `fileType`: `design`

#### 2. Legacy File URLs
```
https://www.figma.com/file/{fileKey}/{fileName}?node-id={nodeId}&{other_params}
```

**Characteristics:**
- Functionally equivalent to `/design/` URLs
- Used by older versions of Figma
- Still fully compatible in practice

#### 3. Branch Files
```
https://www.figma.com/design/{fileKey}/branch/{branchKey}/{fileName}?node-id={nodeId}&{other_params}
```

**Example:**
```
https://www.figma.com/design/ABC123/branch/DEF456/Feature-Branch?node-id=1-2
```

**Parsed result:**
- `fileKey`: `DEF456` (use `branchKey` as `fileKey`)
- `fileName`: `Feature-Branch`
- `primaryNodeId`: `1:2`
- `fileType`: `design`
- `branchKey`: `DEF456`

#### 4. FigJam Boards
```
https://www.figma.com/board/{fileKey}/{fileName}?node-id={nodeId}&{other_params}
```

**Example:**
```
https://www.figma.com/board/XYZ789/Brainstorming-Session?node-id=3-4
```

**Special considerations:**
- FigJam node structures can differ from design files
- Text-node handling may vary slightly from design files

## Query Parameter Notes

### Core Parameter

#### `node-id`
This is the most important parameter because it identifies the current node selection.

**Format normalization:**
```javascript
// input forms
"node-id=0-1"        → "0:1"
"node-id=1%3A2"      → "1:2" (URL-encoded colon)
"node-id=12%2D34"    → "12:34" (URL-encoded hyphen)

// normalization logic
primaryNodeId = nodeIdParam
  .replace(/-/g, ':')           // convert hyphens to colons
  .replace(/%3A/gi, ':')       // decode encoded colons
  .replace(/%2D/gi, '-');      // decode encoded hyphens
```

#### Other Parameters
```javascript
// view-related parameters
p: view mode ("f" = full view, etc.)
t: sharing or session token
viewport: viewport data such as zoom and position
mode: mode flag, for example dev mode
```

## URL Parsing Implementation

### `parseNodeIdsFromUrl`

```javascript
function parseNodeIdsFromUrl(figmaUrl) {
  const url = new URL(figmaUrl);
  const pathParts = url.pathname.split('/').filter(part => part.length > 0);

  let fileType = pathParts[0]; // 'design', 'file', 'board'
  let fileKey = pathParts[1];
  let fileName = pathParts[2];
  let branchKey = null;

  // Handle branch URLs.
  if (pathParts.length >= 5 && pathParts[2] === 'branch') {
    branchKey = pathParts[3];
    fileName = pathParts[4];
    fileKey = branchKey; // Use branchKey as fileKey for branch URLs.
  }

  // Parse node-id.
  const nodeIdParam = url.searchParams.get('node-id');
  let primaryNodeId = null;
  if (nodeIdParam) {
    primaryNodeId = nodeIdParam
      .replace(/-/g, ':')
      .replace(/%3A/gi, ':')
      .replace(/%2D/gi, '-');
  }

  return {
    success: true,
    fileKey,
    fileName: decodeURIComponent(fileName),
    primaryNodeId,
    fileType,
    branchKey,
    viewParams: {
      p: url.searchParams.get('p'),
      t: url.searchParams.get('t'),
      viewport: url.searchParams.get('viewport'),
      mode: url.searchParams.get('mode'),
    }
  };
}
```

## Handling Multi-Node Selections

### URL Versus Actual Selection

Important: the `node-id` shown in the URL is a single node ID, but the actual selection in Figma may contain multiple nodes.

#### Example Situation
```
URL: https://figma.com/design/ABC123/TestFile?node-id=0-1
Reality: the user may have multiple nodes selected
```

#### Recommended Strategy
1. Extract the base `nodeId` from the URL.
2. Use the `get_metadata` MCP tool to inspect the actual structure.
3. Identify all nodes that are really included in scope.

```javascript
// 1. Extract the base info from the URL.
const { fileKey, primaryNodeId } = parseNodeIdsFromUrl(figmaUrl);

// 2. Inspect the real node structure with an MCP tool.
const metadata = await get_metadata({ nodeId: primaryNodeId });

// 3. Confirm the actual targets by scanning text nodes.
const scanResult = await scanTextNodes({ nodeId: primaryNodeId });
```

## Error Handling and Validation

### Parse Validation

#### Required Validation Checks
```javascript
function validateParseResult(parseResult) {
  const validation = { isValid: true, errors: [], warnings: [] };

  // Validate fileKey.
  if (!parseResult.fileKey || parseResult.fileKey.length < 10) {
    validation.isValid = false;
    validation.errors.push('Invalid fileKey: too short or missing');
  }

  // Validate nodeId.
  if (!parseResult.primaryNodeId) {
    validation.warnings.push('No node-id found - will use page root');
  } else if (!parseResult.primaryNodeId.includes(':')) {
    validation.warnings.push('Node ID format may be incorrect');
  }

  // Validate file type.
  const supportedTypes = ['design', 'file', 'board'];
  if (!supportedTypes.includes(parseResult.fileType)) {
    validation.warnings.push(`Unsupported file type: ${parseResult.fileType}`);
  }

  return validation;
}
```

### Common Error Cases

#### 1. Invalid URL Shape
```javascript
// example failures
"https://google.com"                     // non-Figma domain
"https://figma.com"                      // missing path
"https://figma.com/design/"              // missing fileKey
"https://figma.com/unknown/ABC123/test"  // unknown URL type
```

#### 2. Node ID Problems
```javascript
// problematic examples
"node-id="           // empty value
"node-id=invalid"    // invalid format
"node-id=0"          // pageId only, no nodeId
```

#### 3. Permission Problems
- Attempting to access a private file
- Using an expired sharing link
- Missing permission for a branch file

## `get_metadata` Integration Strategy

### Building Parameters
```javascript
function createMetadataParams(parseResult) {
  return {
    nodeId: parseResult.primaryNodeId || '0:1',
    fileKey: parseResult.fileKey,
    fileName: parseResult.fileName,
    fileType: parseResult.fileType,
  };
}
```

### Workflow Integration
```javascript
// 1. Parse the URL.
const parseResult = parseNodeIdsFromUrl(figmaUrl);
const validation = validateParseResult(parseResult);

if (!validation.isValid) {
  throw new Error(`URL parsing failed: ${validation.errors.join(', ')}`);
}

// 2. Fetch metadata.
const metadataParams = createMetadataParams(parseResult);
const metadata = await get_metadata(metadataParams);

// 3. Scan text nodes.
const textNodes = await scanTextNodes({
  nodeId: parseResult.primaryNodeId,
  useChunking: true
});
```

## Example Usage

### Full Workflow
```javascript
// User input
const figmaUrl = "https://www.figma.com/design/SFYKVtJA3lUJYAQzk4y9CJ/Next.js-Blog-App---Route-Capture?node-id=0-1&p=f&t=ekiW5H8ABAUoUkln-11";
const transformation = "Translate all English text into Korean";

// 1. Parse the URL.
const parseResult = parseNodeIdsFromUrl(figmaUrl);
console.log("Parsed:", parseResult);
// {
//   fileKey: "SFYKVtJA3lUJYAQzk4y9CJ",
//   primaryNodeId: "0:1",
//   fileName: "Next.js-Blog-App---Route-Capture",
//   fileType: "design"
// }

// 2. Validate the parsed result.
const validation = validateParseResult(parseResult);
if (validation.warnings.length > 0) {
  console.warn("Warnings:", validation.warnings);
}

// 3. Continue with text transformation.
// ... (call scanTextNodes, setMultipleTextContents, etc.)
```

### Debugging and Logging
```javascript
// Detailed debug information
console.log('URL Parsing Debug:', {
  originalUrl: figmaUrl,
  fileKey: parseResult.fileKey,
  fileName: parseResult.fileName,
  primaryNodeId: parseResult.primaryNodeId,
  fileType: parseResult.fileType,
  branchKey: parseResult.branchKey,
  viewParams: parseResult.viewParams,
  parsedUrl: parseResult.parsedUrl
});
```

## Best Practices

### 1. Parse Defensively
- Always wrap URL parsing in `try...catch`.
- Degrade gracefully for unexpected URL shapes.
- Return clear error messages to the user.

### 2. Optimize for Performance
- Parse the URL once.
- Cache parsed results when the same URL is reused.
- Avoid unnecessary validation work.

### 3. Improve User Experience
- Provide explicit guidance when parsing fails.
- Tell the user when a URL shape is unsupported.
- Suggest an alternative URL format when possible.

Use this reference to understand and reuse the repo's Figma URL parsing workflow consistently.
