---
name: figma-create-figma-skill
description: Scaffold a new Figma skill directory in this multi-skill repo, including `SKILL.md`, `agents/openai.yaml`, and symlinks to shared Figma Plugin API references. Use when creating a new Codex-compatible Figma skill.
license: MIT
metadata:
  author: JooHyung Park <dusskapark@gmail.com>
  version: "0.1.0"
compatibility: |
  - mcp-server: figma
---

# figma-create-figma-skill — Figma Skill Scaffolding Helper

Create a new Figma skill directory with the standard multi-skill repo layout, and automatically symlink the shared reference files from `figma-evaluate-script`. The generated output is intended to be immediately usable by Codex.

## Instructions

1. Run the setup script from anywhere in the repo:
   ```bash
   bash skills/figma-create-figma-skill/scripts/setup-skill-symlinks.sh <skill-name>
   ```
   The script automatically:
   - Creates `skills/<skill-name>/agents/`, `references/`, and `scripts/`
   - Generates a `skills/<skill-name>/SKILL.md` template
   - Generates a `skills/<skill-name>/agents/openai.yaml` template
   - Creates symlinks to the 8 shared files from `figma-evaluate-script/references/`

2. Fill in the generated `skills/<skill-name>/SKILL.md` template:
   - Update the frontmatter `name` and `description` to match the actual purpose
   - Add the skill-specific workflow, parameters, and examples

3. Refine `display_name`, `short_description`, and `default_prompt` in `skills/<skill-name>/agents/openai.yaml`. Codex uses this file for the skill list and chip UI.

4. Add any skill-specific reference files directly under `skills/<skill-name>/references/`. Remove any shared-reference symlink you do not need.

5. Add any skill-specific scripts under `skills/<skill-name>/scripts/`.

6. When installing the skill into Codex, place each skill folder directly under `~/.codex/skills/<skill-name>/`. Do not wrap the repo again inside a nested `skills/.curated/...` copy.

## Shared Reference Files (8)

These shared files are symlinked from `figma-evaluate-script/references/`:

| File | Purpose |
|------|------|
| `api-reference.md` | Node creation, variable APIs, and core properties |
| `common-patterns.md` | Working code examples for shapes, text, layout, and similar tasks |
| `gotchas.md` | Known pitfalls with WRONG/CORRECT examples |
| `plugin-api-patterns.md` | Fills, strokes, auto layout, effects, and grouping patterns |
| `plugin-api-standalone.d.ts` | Full Plugin API type definitions (440 KB) |
| `plugin-api-standalone.index.md` | Index of the full Plugin API surface |
| `validation-and-recovery.md` | Error recovery workflow |
| `variable-patterns.md` | Variable collections, modes, and binding patterns |
