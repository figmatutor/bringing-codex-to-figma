# figma-set-text Gotchas

## Common pitfalls

1. Each `text[]` entry must include both `nodeId` and `text`.
2. Target node must be `TEXT`; frame/component IDs will fail.
3. Mixed-font nodes require font normalization before replacement.
4. Missing local fonts can fail font loading; fallback font is used when possible.
5. Text inside instances should use the instance-qualified text node ID returned by scans.
6. Batch updates are partially successful by design: some rows can fail while others apply.

## Practical mapping advice

- Build replacements from a fresh `figma-scan-nodes` result.
- Preserve order explicitly when mapping from external data.
- For large updates, split into smaller batches to reduce recovery cost.
