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

## Skill Installer Usage (openai/skills)

List curated skills from `openai/skills`:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/list-skills.py
```

Install one curated skill from `openai/skills`:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo openai/skills \
  --path skills/.curated/<skill-name>
```

Install from a GitHub URL path:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --url https://github.com/openai/skills/tree/main/skills/.curated/<skill-name>
```

## Manual (Short)

1. `list-skills.py`로 목록 확인
2. `install-skill-from-github.py`로 설치
3. Codex 재시작
