# figma-plugin-alpha-031326

This repository contains Codex-compatible skills focused on Figma workflows.

## Included Skills

### `bringing-codex-to-figma`

Captures application routes or state-based views into Figma and organizes the
result as screens. Intended for larger app capture workflows that need route
discovery, browser automation, and Figma import coordination.

### `figma-create-figma-skill`

Scaffolds a new Figma skill inside this multi-skill repository. It creates the
standard directory layout for skill documentation, scripts, and agent config.

### `figma-scan-nodes`

Scans a Figma node tree and returns structured metadata for selected node
types. Useful for discovery tasks such as locating text, frames, components,
or instances before making edits.

### `figma-set-text`

Applies batched text replacements to Figma text nodes. This skill is typically
used after node discovery so text changes can be applied safely and
consistently.

## Repository Layout

```text
skills/
  bringing-codex-to-figma/
  figma-create-figma-skill/
  figma-scan-nodes/
  figma-set-text/
```

Each skill directory contains its own `SKILL.md` and any related references,
scripts, or agent configuration needed for that workflow.

## Typical Usage Flow

1. Use `figma-scan-nodes` to discover the relevant nodes.
2. Use `figma-set-text` when batch text replacement is needed.
3. Use `bringing-codex-to-figma` when the task is capturing application views
   into Figma.
4. Use `figma-create-figma-skill` to scaffold additional skills in this repo.
