# Step 2: Component Generation

Use this reference after the token foundation is approved. This guide is adapted from another project's workflow, so treat it as a strong reference rather than guaranteed project truth. If an important assumption is unclear, ask the user before proceeding.

## Goal

- Reuse an existing project template from the OS temp workspace when possible.
- Create a new template project only when no suitable template exists.
- Generate components in React + TypeScript.
- Import design tokens rather than hardcoding colors, spacing, or typography.
- Reflect Figma component properties through props, especially `variant` and `size`.

## CRITICAL: Never use image assets

`get_design_context` may return CDN image URLs for logos, icons, maps, and charts. **Do not use these as `<img>` tags.** They become flat, non-editable bitmaps when pushed to Figma — text can't be changed, tokens don't connect.

- Text, fills, shapes → build as React DOM elements with token styles.
- Logos, icons, vector graphics → store the Figma `nodeId` and place as a component instance via `use_figma`. Do not embed the image URL.

## Required Discovery

Before writing component code:

1. Inspect the resolved workspace first.
- Use the workspace returned by `parseNodeIdsFromUrl.js`, not a hardcoded temp path.
- Read the workspace `index.yaml` before scanning folders directly.
- Check whether a matching project template already exists for the requested output family such as PPT, SNS, landing page, or detail page.
- Prefer branching from an existing indexed template over creating a new one.

2. Inspect the existing project template if found.
- Look for reusable components first.
- Look for token files and theme files first.
- Look for existing component conventions, prop naming, and file structure first.

3. Ask the user if any important choice is ambiguous.
- Ask whether to reuse an existing indexed template before Step 1 when viable candidates exist.
- If more than one candidate is plausible, present natural-language names from `index.yaml`.
- Which existing project template should be extended.
- Whether two nearby templates should be merged or kept separate.
- Whether an unclear Figma property should map to `variant`, `size`, or a different prop.

## Execution Flow

### 1. Understand the request

- Confirm the target component family and its role.
- Read the relevant Figma component, component set, or repeated frame.
- Confirm whether the design implies variants, sizes, or both.

### 2. Analyze properties

- Read component properties before building code.
- Preserve the real property names and option sets when they are clear and reusable.
- Normalize only when the original names are too noisy for code.

Common mappings:

- visual state or style choice -> `variant`
- dimensional scale -> `size`
- boolean toggles -> boolean props such as `disabled`, `selected`, `withBadge`
- content-bearing areas -> children or named props such as `title`, `description`, `imageSrc`

### 3. Plan the component structure

- Group generated components by type inside the chosen project template.
- Prefer a stable structure such as:

```text
<workspace-root>/<project-template>/
  components/
    feedback/
    navigation/
    cards/
    hero/
    commerce/
```

- If no suitable project template exists, create one during execution using a minimal structure that can accept token imports and typed components.

### 4. Report the plan before coding

Before writing or editing code, present the plan using the structure below. Then **STOP — call `AskUserQuestion`** with "이대로 진행해도 될까요?" Do not write any code until the user confirms.

```text
📋 작업 계획 보고

🔍 문제 상황 (What's wrong?)
[What is missing or why the componentization work is needed]

🎯 목표 (What we want to achieve)
[What the generated component system should support]

🔬 원인 분석 (Why it happens) - 문제 해결의 경우
[Only validated causes. If not a bug-fix task, say "해당 없음"]

📁 변경 예정 파일
| 파일 경로 | 변경 내용 | 비고 |
|-----------|----------|------|

⚡ Before → After
[Before] 현재 상태
[After] 작업 후 기대 상태

🎨 디자인 토큰 사용 계획
- 사용할 CSS 변수 / 토큰 import
- 재사용할 기존 컴포넌트
- 새로 필요한 토큰: 없으면 "없음"
```

Call `AskUserQuestion`: "이대로 진행해도 될까요?" — even if the user said "빠르게 진행해줘", still show the plan first before asking.

### 5. Build the components

- Use React + TypeScript only.
- Import tokens from the project's token layer.
- Avoid hardcoded colors, spacing, typography, or radius values.
- Reflect Figma properties through typed props.
- Always support `variant` and `size` when the design system exposes them.
- Prefer composable components over one-off monoliths.

### 6. Handle template creation

If no project template exists:

- Create a new template project under the folder resolved by `parseNodeIdsFromUrl.js`.
- Keep the folder name fixed after first creation, even if the Figma title changes later.
- Store project metadata in `metadata.yml` and rely on workspace `index.yaml` for future discovery.
- Include only the minimum structure needed for token imports, component files, and future extension.
- Keep the structure easy to branch by output family.

## Validation Checklist

Run this checklist before declaring the work complete:

| # | Check | Required |
|---|-------|:--------:|
| 1 | No build errors in the target project template | ✅ |
| 2 | No hardcoded color values | ✅ |
| 3 | No framework-default visual utility classes that bypass tokens | ✅ |
| 4 | No arbitrary spacing values outside the token system | ✅ |
| 5 | Existing components reused where appropriate | ✅ |
| 6 | Token files synchronized if new tokens were added | ✅ |
| 7 | Existing behavior still works | ✅ |
| 8 | No `<img>` tags with CDN asset URLs from `get_design_context` | ✅ |

## Guardrails

- Do not create new files or components without approval when the target project already has an established structure.
- Do not refactor beyond the approved scope.
- Do not silently change architecture.
- Do not style without tokens.
- Do not treat assumptions as facts. Verify or ask.
- Do not guess template reuse when `index.yaml` offers multiple plausible candidates.

## Output Rules

- Use human-readable file and component names.
- Keep prop APIs explicit and typed.
- Keep `variant` and `size` options aligned with the Figma source unless there is a strong reason to normalize.
- Include a short summary of reused assets, new files, and validation results.
