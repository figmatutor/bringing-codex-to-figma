# figma-scan-nodes Validation and Recovery

## Validate after each scan

1. Confirm `success: true` and inspect `count`.
2. Verify `searchedTypes` matches your intended filter.
3. Spot-check a few returned `path` values to ensure you scanned the right subtree.

## Recovery flow when scan fails

1. `Node not found`: re-check `nodeId` normalization (`0-1` -> `0:1`) and source URL.
2. Empty results with expected content: verify `types` and `includeInvisible` settings.
3. Timeouts or oversized output: reduce scan scope and rerun per section/frame.
4. For follow-up text edits, rerun a targeted `TEXT` scan and use the fresh IDs.

## Safe retry pattern

- Retry with smaller scope first.
- Keep each retry deterministic (`nodeId`, `types`, `chunkSize` explicitly set).
- Avoid changing multiple parameters at once; isolate the failing factor.
