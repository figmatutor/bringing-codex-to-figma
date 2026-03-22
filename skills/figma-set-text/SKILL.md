---
name: figma-set-text
description: Set text content in one or more Figma text nodes in batch. Use when the user wants to replace or fill text in Figma design nodes — e.g. applying data from a JSON file, translating text, or filling template placeholders. Requires node IDs (get them first with figma-scan-nodes).
license: MIT
metadata:
  author: JooHyung Park <dusskapark@gmail.com>
  version: "0.1.0"
  compatibility: |
    - mcp-server: figma
---

# figma-set-text — Figma Batch Text Update Skill

Apply new content to multiple Figma text nodes in a batch. The workflow handles font loading, error recovery, and chunk-based safety controls automatically.

## Parameters

Pass an object to `setMultipleTextContents(params)`:

| Parameter | Type | Required | Description |
|---------|------|------|------|
| `nodeId` | string | yes | Root node ID for the working context, usually the same root used during scanning |
| `text` | array | yes | Replacement list in the form `[{ nodeId, text }, ...]` |
| `commandId` | string | no | Correlation ID for tracking the run. Auto-generated when omitted |

### Shape of Each `text` Entry

```javascript
{
  nodeId: "123:456",   // TEXT node ID to replace
  text: "New text"     // Content to apply
}
```

## Return Value

```javascript
{
  success: true,
  nodeId: "0:1",
  replacementsApplied: 8,
  replacementsFailed: 1,
  totalReplacements: 9,
  results: [
    { success: true, nodeId: "123:456", originalText: "Old", replacedText: "New" },
    { success: false, nodeId: "789:012", error: "Node not found" }
  ],
  completedInChunks: 2,
  commandId: "cmd_abc123"
}
```

## Usage Examples

### Basic Usage

```javascript
(async () => {
  try {
    const result = await setMultipleTextContents({
      nodeId: "0:1",
      text: [
        { nodeId: "123:456", text: "Home" },
        { nodeId: "789:012", text: "About" },
        { nodeId: "345:678", text: "Contact" },
      ],
    });
    figma.closePlugin(JSON.stringify(result));
  } catch (e) {
    figma.closePluginWithFailure(e.toString());
  }
})();
```

### Pattern Using `figma-scan-nodes` Output

```javascript
// Build the replacement list from scanResult, then run this script.
(async () => {
  try {
    // Analyze scanResult.nodes and build the replacements array.
    const replacements = [
      { nodeId: "111:222", text: "Headline text" },
      { nodeId: "333:444", text: "Subtitle text" },
    ];

    const result = await setMultipleTextContents({
      nodeId: "0:1",
      text: replacements,
    });
    figma.closePlugin(JSON.stringify(result));
  } catch (e) {
    figma.closePluginWithFailure(e.toString());
  }
})();
```

## Core Workflow

```
1. Run `/figma-scan-nodes` with `types=["TEXT"]` to collect TEXT node IDs
2. Map `scanResult.nodes` to a `[{ nodeId, text }]` replacement list
3. Run `/figma-set-text` to apply the new text
4. Verify the result with `get_metadata` or `get_screenshot`
```

## Processing Behavior

- **Chunking**: Process 5 nodes in parallel per chunk, with a 1-second delay between chunks to reduce Figma overload
- **Font loading**: Automatically load each text node's font with `figma.loadFontAsync`
- **Mixed fonts**: Normalize to the font of the first character before applying text
- **Font load failure**: Fall back to `Inter Regular`
- **Partial failure**: Continue processing other nodes even if some fail, and include success/failure stats in the result
- **Success flag**: `success` is `true` only when every replacement succeeds

## Mapping Rules

- Instance-qualified TEXT node IDs returned by `figma-scan-nodes`, such as `I...;...`, are valid targets as-is.
- If the source text count does not match the target TEXT node count, decide explicitly which items to drop, combine, or remap. `figma-set-text` does not resolve count mismatches automatically.
- For sitemap or footer replacements, mapping titles and links in scan order is usually the safest approach.

## Runtime Notes

- In the current `use_figma` runtime, chunking should be treated as an internal overload-reduction strategy for large edits, not as a formal contract for real-time progress reporting.
- For broader discussion of bulk and progress APIs, see [USE_FIGMA_BULK_PROPOSAL.md](/Users/jude.park/Sites/figma/USE_FIGMA_BULK_PROPOSAL.md).

## Error Handling

### Partial Execution
If an error occurs during text replacement:
1. Do not retry immediately. Inspect the partially applied state first.
2. Use `get_metadata` to confirm which text nodes already changed.
3. Retry only the failed items.

### Font-Related Errors
- Automatic font loading handles mixed-font cases safely inside the workflow.
- If a font cannot be loaded, fall back to `Inter Regular`.
- For mixed-font nodes, normalize to the first character's font.

## Scripts

- [setMultipleTextContents.js](scripts/setMultipleTextContents.js): Batch text replacement with chunking, font handling, and progress tracking
- [parseNodeIdsFromUrl.js](scripts/parseNodeIdsFromUrl.js): Extract `nodeId` from a Figma URL when needed

## Reference Documents

- [gotchas.md](references/gotchas.md): Known pitfalls and fixes, including font-loading issues
- [validation-and-recovery.md](references/validation-and-recovery.md): Error recovery workflow
