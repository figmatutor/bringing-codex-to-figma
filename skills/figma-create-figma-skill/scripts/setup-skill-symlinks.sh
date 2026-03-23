#!/usr/bin/env bash

set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <skill-name>"
  exit 1
fi

SKILL_NAME="$1"
if ! [[ "${SKILL_NAME}" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Error: invalid <skill-name> '${SKILL_NAME}'"
  echo "Use lowercase letters, numbers, and hyphens only (example: figma-my-skill)."
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SKILL_DIR="${SKILLS_DIR}/${SKILL_NAME}"
REF_DIR="${SKILL_DIR}/references"
SCRIPT_TARGET_DIR="${SKILL_DIR}/scripts"
AGENTS_DIR="${SKILL_DIR}/agents"
DISPLAY_NAME="$(printf '%s\n' "${SKILL_NAME}" | tr '-' ' ' | awk '{for (i = 1; i <= NF; i++) $i = toupper(substr($i, 1, 1)) substr($i, 2)}1')"
SHARED_REF_SKILL="figma-evaluate-script"
SHARED_REF_DIR="${SKILLS_DIR}/${SHARED_REF_SKILL}/references"

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

create_shared_reference_symlinks() {
  if [ "${SKILL_NAME}" = "${SHARED_REF_SKILL}" ]; then
    echo "  Skipped shared reference symlinks for ${SKILL_NAME} (source skill)."
    return
  fi

  if [ ! -d "${SHARED_REF_DIR}" ]; then
    echo "  Warning: shared references not found at ${SHARED_REF_DIR}. Skipping symlink setup."
    return
  fi

  local created_count=0
  local skipped_count=0

  for source_path in "${SHARED_REF_DIR}"/*; do
    [ -f "${source_path}" ] || continue

    local file_name
    file_name="$(basename "${source_path}")"
    if [[ "${file_name}" = .* ]]; then
      continue
    fi

    local target_path
    target_path="${REF_DIR}/${file_name}"

    local relative_source
    relative_source="../../${SHARED_REF_SKILL}/references/${file_name}"

    if [ -e "${target_path}" ] || [ -L "${target_path}" ]; then
      skipped_count=$((skipped_count + 1))
      continue
    fi

    ln -s "${relative_source}" "${target_path}"
    created_count=$((created_count + 1))
    echo "  Linked: ${target_path} -> ${relative_source}"
  done

  echo "  Shared reference symlinks: ${created_count} created, ${skipped_count} skipped."
}

create_shared_reference_symlinks

echo ""
echo "Done! ${SKILL_DIR} structure created."
echo "Next steps:"
echo "  1. Refine ${SKILL_DIR}/SKILL.md"
echo "  2. Refine ${AGENTS_DIR}/openai.yaml"
echo "  3. Keep or remove generated shared-reference symlinks in ${REF_DIR}/ as needed"
echo "  4. Add skill-specific scripts to ${SCRIPT_TARGET_DIR}/"
