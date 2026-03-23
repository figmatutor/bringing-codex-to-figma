# figma-set-text Validation and Recovery

## Validate each run

1. Check `success`, `replacementsApplied`, and `replacementsFailed`.
2. Review `results[]` and isolate failed `nodeId`s.
3. Spot-check changed nodes in Figma (metadata first, screenshot when needed).

## Recovery flow for partial failures

1. Do not rerun the full batch immediately.
2. Build a retry list from failed rows only.
3. Re-scan affected region (`types: ["TEXT"]`) if IDs may have changed.
4. Retry with a smaller batch and verify counters again.

## Typical failure causes

- Node deleted or moved after initial scan
- Non-text node passed into batch list
- Font-loading issues for specific text nodes
- Mismatch between source data count and target node count
