# Step 1: Design Token Foundation

Run this step only after the workspace has been resolved and the user has answered the template reuse question. The goal is to establish the token system already present in the selected Figma scope so later component generation can reuse stable names and values.

## Goal

- Extract only the colors and text styles that already exist in the selected Figma scope.
- Consolidate duplicates.
- Propose primitive, semantic, and component-level token names where appropriate.
- Pause for approval before writing files.

## Scope Rules

- Work from the smallest sensible scope.
- Treat hidden nodes as out of scope unless the user explicitly includes them.
- Do not invent missing scales, aliases, or text styles.
- If a value appears once and its role is unclear, surface the ambiguity in the proposal.
- Respect the chosen project template folder. Token files belong inside the reused or newly created template project, not in an ad-hoc location.

## Extraction Workflow

1. Inspect the target.
- Use `get_metadata` to confirm the node tree and scope boundaries.
- Use `get_screenshot` or `get_design_context` when visual meaning is needed for naming.

2. Extract raw colors.
- Use `use_figma` to traverse visible fills, strokes, gradient stops, and shadow colors.
- Preserve alpha.
- Keep usage context: node path, node name, node type, and occurrence count.

3. Extract raw text styles.
- Collect visible `TEXT` node values for `fontFamily`, `fontStyle`, `fontSize`, `lineHeight`, `letterSpacing`, and weight when available.
- If a text node contains mixed ranges, either split it deliberately or flag it as mixed. Do not silently flatten it into one fake style.

4. Consolidate values.
- Merge identical raw values first.
- Keep separate aliases only when the distinction is meaningful for the system.

5. Propose token names.
- Use primitive names for raw reusable colors such as `blue-500` or `gray-100`.
- Use semantic names for purpose such as `primary`, `bg-surface`, `text-secondary`, or `border-default`.
- Use component names only when shared semantics are not enough, such as `button-primary-bg` or `input-border-focus`.
- Use role-based typography names such as `heading-1`, `body-default`, `label`, or `caption`.

6. Pause for approval.
- Show the proposed token list before writing files.
- Include raw value, proposed name, token tier, and a usage example when the choice is not obvious.
- **STOP — call `AskUserQuestion` now.** Ask: "Does this token proposal look correct? Should I proceed with generating the files?" Do not write any files until the user confirms. Wait again if the user asks for revisions.

7. Generate files after approval.
- Write `tokens.css` by default.
- Write `tokens.js` only if the repo already uses a JS token layer or the user explicitly asks for it.

## Approval Example

```text
Primitive colors
- color-blue-500 = #2563EB

Semantic colors
- color-primary -> color-blue-500
- color-text-secondary -> color-gray-600

Component colors
- color-button-primary-bg -> color-primary

Text styles
- heading-1 = Pretendard / 32px / 700 / 40px / 0px
- body-default = Pretendard / 16px / 400 / 24px / 0px
```

## Output Rules

- Use kebab-case names.
- Keep semantic and component tokens as references when possible.
- Include a short rationale when consolidation or naming is non-obvious.
