# bringing-codex-to-figma

Agent skill for Codex to capture multiple app views and send them to Figma.

## Agent Skill

This repository contains one installable skill:

- `skills/.curated/bringing-codex-to-figma/`

## Installing This Skill

Install from inside Codex using `$skill-installer`.

```text
$skill-installer install https://github.com/dusskapark/bringing-codex-to-figma/tree/main/skills/.curated/bringing-codex-to-figma
```

For local development, you can also link the skill folder into a project:

```text
<project>/.agents/skills/bringing-codex-to-figma
```

After installing a skill, restart Codex to pick up new skills.

## Using This Skill

In Codex chat, ask for full-app capture to Figma. Example:

```text
Use bringing-codex-to-figma to discover routes, run batch capture, and send to Figma.
```

The skill workflow and behavior are defined in `SKILL.md`.

## SKILL.md (Short)

- `SKILL.md` is the skill contract Codex reads (metadata + instructions).
- It defines when to trigger the skill, required pre-flight inputs, capture steps, and output format.
