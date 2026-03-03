# sending-codex-to-figma-sample

Sample skill repository focused on Codex workflows.

## Structure

Local development copy (root):
- `SKILL.md`
- `scripts/capture.mjs`
- `references/capture-views-spec.md`
- `agents/openai.yaml`
- `LICENSE.txt`

Installable catalog copy (`openai/skills` style):
- `skills/.curated/sending-codex-to-figma-sample/`

## Use in Codex

1. Local auto-discovery in a target project:

```text
<project>/.agents/skills/sending-codex-to-figma-sample
```

2. Installer/catalog style path:

```text
skills/.curated/sending-codex-to-figma-sample
```

## Notes

- This is a sample/learning skill, not a production-certified workflow.
- Claude-only directives were removed and replaced with Codex-compatible instructions.

## Publish And Install (Codex)

1. Make the GitHub repo public (one-time):

```bash
gh repo edit dusskapark/sending-codex-to-figma-sample \
  --visibility public \
  --accept-visibility-change-consequences
```

2. Install the skill in Codex with the built-in `skill-installer` script:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo dusskapark/sending-codex-to-figma-sample \
  --path skills/.curated/sending-codex-to-figma-sample
```

Alternative URL form:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --url https://github.com/dusskapark/sending-codex-to-figma-sample/tree/main/skills/.curated/sending-codex-to-figma-sample
```

3. Restart Codex to pick up the newly installed skill.
