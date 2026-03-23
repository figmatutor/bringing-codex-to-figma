# figma-scan-nodes Gotchas

## Common pitfalls

1. `nodeId` format must be `pageId:nodeId` (for example `0:1`).
2. URL query often provides `node-id=0-1`; normalize `-` to `:` before scanning.
3. `types` filtering is exact and case-sensitive (`TEXT`, `FRAME`, `COMPONENT`).
4. Hidden nodes are excluded by default. Set `includeInvisible: true` only when needed.
5. Large roots can produce very large payloads. Prefer narrowing the root scope over requesting `types: []` from file root.
6. Instance-qualified IDs (such as `I123:4;567:8`) are valid scan outputs and should be kept as-is for follow-up edits.

## Stability tips

- Keep `useChunking: true` for wide/deep trees.
- If results are too large, split by section/frame and run multiple scans.
- When you only need text replacements, scan only `types: ["TEXT"]`.
