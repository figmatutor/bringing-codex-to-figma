#!/usr/bin/env bash

set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <skill-name>"
  exit 1
fi

SKILL_NAME="$1"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SKILL_DIR="${SKILLS_DIR}/${SKILL_NAME}"
REF_DIR="${SKILL_DIR}/references"
SCRIPT_TARGET_DIR="${SKILL_DIR}/scripts"
AGENTS_DIR="${SKILL_DIR}/agents"
DISPLAY_NAME="$(printf '%s\n' "${SKILL_NAME}" | tr '-' ' ' | awk '{for (i = 1; i <= NF; i++) $i = toupper(substr($i, 1, 1)) substr($i, 2)}1')"

mkdir -p "${REF_DIR}" "${SCRIPT_TARGET_DIR}" "${AGENTS_DIR}"

if [ ! -f "${SKILL_DIR}/SKILL.md" ]; then
  cat > "${SKILL_DIR}/SKILL.md" <<EOF
---
name: ${SKILL_NAME}
description: TODO: Describe what this skill does and when Codex should use it.
metadata:
  mcp-server: figma
---

# ${SKILL_NAME}

Describe the workflow here.

## Instructions

1. Inspect the target Figma file before writing.
2. Use the shared references in \`references/\` as needed.
3. Work incrementally and validate after each write step.
EOF
  echo "  Created: ${SKILL_DIR}/SKILL.md"
fi

if [ ! -f "${AGENTS_DIR}/openai.yaml" ]; then
  cat > "${AGENTS_DIR}/openai.yaml" <<EOF
interface:
  display_name: "${DISPLAY_NAME}"
  short_description: "TODO: Describe the skill briefly for the Codex skill picker"
  default_prompt: "Use \$${SKILL_NAME} to TODO: describe the workflow."
EOF
  echo "  Created: ${AGENTS_DIR}/openai.yaml"
fi

echo ""
echo "Done! ${SKILL_DIR} structure created."
echo "Next steps:"
echo "  1. Refine ${SKILL_DIR}/SKILL.md"
echo "  2. Refine ${AGENTS_DIR}/openai.yaml"
echo "  3. Add skill-specific references to ${REF_DIR}/"
echo "  4. Add skill-specific scripts to ${SCRIPT_TARGET_DIR}/"
