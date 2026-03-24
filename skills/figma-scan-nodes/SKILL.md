---
name: figma-scan-nodes
description: Thin helper skill for scanning and listing Figma nodes by type. Always load and follow figma-use first for shared Plugin API execution, validation, and recovery rules.
license: MIT
metadata:
  author: JooHyung Park <dusskapark@gmail.com>
  version: "0.2.0"
  compatibility: |
    - mcp-server: figma
---

# figma-scan-nodes — Figma Node Scanning Helper Skill

This is a **node-scan-only helper skill**.

Before running any `use_figma` script in this skill, **load `$figma-use` first** and treat it as the source of truth for:
- generic Plugin API rules,
- validation patterns,
- recovery/error-handling conventions.

Use this skill only for recursive node scanning and structured node metadata extraction.

## Parameters

| Parameter | Type | Default | Description |
|---------|------|--------|------|
| `nodeId` | string | required | Root node ID to start scanning from |
| `types` | string[] | `[]` | Node types to filter for. Use an empty array to return every node |
| `useChunking` | boolean | `true` | Process in chunks to reduce timeout risk on large files |
| `chunkSize` | number | `10` | Number of nodes to process per chunk |
| `includeInvisible` | boolean | `false` | Include hidden nodes |
| `commandId` | string | auto-generated | Correlation ID for tracking a specific run |

## Return Value

```javascript
{
  success: true,
  count: N,
  nodes: [
    {
      id: "123:456",
      name: "Button Label",
      type: "TEXT",
      x: 100, y: 200,
      width: 80, height: 24,
      visible: true,
      depth: 3,
      path: "Frame > Card > Button Label",
      // Additional TEXT-only fields:
      characters: "Click me",
      fontSize: 14,
      fontFamily: "Inter",
      fontStyle: "Medium",
      // Additional COMPONENT/INSTANCE-only fields:
      // componentId: "789:012"
    }
  ],
  searchedTypes: ["TEXT"],
  commandId: "cmd_abc123"
}
```

## Usage Examples

### Scan TEXT Nodes

```javascript
(async () => {
  try {
    const result = await scanNodes({
      nodeId: "0:1",
      types: ["TEXT"],
      useChunking: true,
      chunkSize: 10,
    });
    figma.closePlugin(JSON.stringify(result));
  } catch (e) {
    figma.closePluginWithFailure(e.toString());
  }
})();
```

### Scan FRAME and COMPONENT Nodes

```javascript
(async () => {
  try {
    const result = await scanNodes({
      nodeId: "0:1",
      types: ["FRAME", "COMPONENT"],
    });
    figma.closePlugin(JSON.stringify(result));
  } catch (e) {
    figma.closePluginWithFailure(e.toString());
  }
})();
```

### Scan the Entire Node Tree

```javascript
(async () => {
  try {
    const result = await scanNodes({
      nodeId: "0:1",
      types: [],  // all nodes
    });
    figma.closePlugin(JSON.stringify(result));
  } catch (e) {
    figma.closePluginWithFailure(e.toString());
  }
})();
```

## Extract `nodeId` from a URL

If the input is a Figma URL, use `scripts/parseNodeIdsFromUrl.js` to extract the `nodeId`:

```javascript
(async () => {
  try {
    const figmaUrl = "https://www.figma.com/design/ABC123/TestFile?node-id=0-1";
    const { primaryNodeId } = parseNodeIdsFromUrl(figmaUrl);

    const result = await scanNodes({
      nodeId: primaryNodeId,
      types: ["TEXT"],
    });
    figma.closePlugin(JSON.stringify(result));
  } catch (e) {
    figma.closePluginWithFailure(e.toString());
  }
})();
```

## Core Workflow with `figma-set-text`

```
1. `/figma-scan-nodes` with `types=["TEXT"]` to collect TEXT node IDs
2. Build a `[{ nodeId, text }]` replacement list from `scanResult.nodes`
3. Run `/figma-set-text` to apply the text updates
4. Verify the result with `get_metadata` or `get_screenshot`
```

## Practical Tips

- If you scan text inside instances, you may get instance-qualified node IDs such as `I400...;...`. Pass them directly to `figma-set-text` to apply text overrides.
- If the response may become too large, prefer narrowing the scan scope with a smaller root subtree or a tighter `types` filter rather than inventing a custom response format.
- If the source data count does not match the number of target TEXT nodes, decide the mapping order explicitly before calling `figma-set-text`, especially for footers or sitemaps.

## Runtime Notes

- In the current `use_figma` flow, chunking is best understood as an internal stability mechanism for large scans, not as a formal real-time progress streaming contract.

## Commonly Supported Node Types

Use these values in the `types` array:

| Type | Description |
|------|------|
| `TEXT` | Text node, including `characters`, `fontSize`, `fontFamily`, and `fontStyle` |
| `FRAME` | Frame |
| `COMPONENT` | Component, including `componentId` |
| `INSTANCE` | Component instance, including `componentId` |
| `GROUP` | Group |
| `RECTANGLE` | Rectangle |
| `ELLIPSE` | Ellipse |
| `VECTOR` | Vector |
| `COMPONENT_SET` | Component set, including variant groups |
| `SECTION` | Section |

## Scripts

- [scanNodes.js](scripts/scanNodes.js): Generic node scanning with type filters, chunking, and progress tracking
- [parseNodeIdsFromUrl.js](scripts/parseNodeIdsFromUrl.js): Extract `fileKey` and `nodeId` from Figma URLs

## Reference Documents

- [url-parsing.md](references/url-parsing.md): Guide to Figma URL structure and parsing
- [figma-use gotchas](../figma-use/references/gotchas.md): Shared generic Figma gotchas
- [figma-use validation/recovery](../figma-use/references/validation-and-recovery.md): Shared validation and recovery workflow
