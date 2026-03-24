# Figma Workflow Skills

This repository contains Codex-compatible skills focused on Figma workflows.

## Included Skills

### `bringing-codex-to-figma`

Route/view capture orchestration skill. It captures application routes or
state-based views into Figma and organizes results as grouped screens. This
skill is focused on discovery, runtime orchestration, and capture flow
coordination.

### `figma-scan-nodes`

Thin helper skill for scanning a Figma node tree and returning structured
metadata for selected node types. Use it primarily for discovery and node ID
collection before edits.

### `figma-set-text`

Thin helper skill for batched text replacement across Figma TEXT nodes. Use it
after node discovery and explicit text mapping.

## Shared Rule Source

Common Figma Plugin API execution rules, generic gotchas, and
validation/recovery guidance are centralized in `figma-use`.

- Skills in this repository should reference `../figma-use/...` for shared rules.
- Local `references/` should contain only skill-specific domain knowledge.

## Repository Layout

```text
skills/
  bringing-codex-to-figma/
  figma-scan-nodes/
  figma-set-text/
```

Each skill directory contains its own `SKILL.md` and any related references,
scripts, or agent configuration needed for that workflow.

## Typical Usage Flow

1. Load `figma-use` first for common Figma write/runtime rules.
2. Use `figma-scan-nodes` to discover relevant nodes.
3. Use `figma-set-text` when batch text replacement is needed.
4. Use `bringing-codex-to-figma` when the task is capturing application views
   into Figma.
