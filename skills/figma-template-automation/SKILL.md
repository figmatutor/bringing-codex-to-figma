---
name: figma-template-automation
description: Turn Figma designs into reusable templates and generate new content from them. Use when users want to create PPT slides, SNS assets, landing pages from Figma templates, or when they mention template creation, content generation, or batch design production. Triggers on Figma URLs, template requests, slide generation, or content automation tasks.
compatibility: |
  - @figma MCP `use_figma` tool for direct Figma interactions
license: MIT
metadata:
  author: JooHyung Park <dusskapark@gmail.com>
  version: "0.1.0"
---

# Figma Template Automation

Turn Figma designs into reusable templates and generate new content from existing templates.

**Core Flow**: User provides Figma URL → Template selection → Content requirements → Next.js pages generation → Send to Figma

## Main Workflow (Mode A)

### 1. URL Validation
When user provides a Figma URL:
1. Validate URL using `parse-node-ids-from-url.js`
2. **If failed**: Ask for valid Figma URL
3. **If passed**: Proceed to next step

### 2. Template Selection
Check `metadata.json` file:

**If file doesn't exist**:
```markdown
No templates found yet. Let's create your first template!
Would you like to create a new template using the provided Figma URL?
```
→ Go to Mode B (Template Creation)

**If file exists**:
```markdown
Available templates:

1. **Tutorial Content Design**
2. **Landing Page Template**
3. **Create new template** (using provided URL)

Which option would you like?
```

### 3. Content Requirements Collection

**Step 3a: Initial User Input**
Allow user to freely describe what they want to create:

```markdown
Template selected: [Template Name]

Please describe what content you'd like to create. Feel free to include any details about:
- Type of content, number of pages, format
- Source materials or content to include
- Target audience, style preferences
- Any other requirements

Tell me as much or as little as you'd like - I'll ask for more details if needed.
```

**Step 3b: Detailed Information Gathering**

**STOP — call `AskUserQuestion` now. Do not proceed until the user responds.**

Always ask for the following, unless the user already provided it in Step 3a:

```markdown
I need a few more details to create the perfect content:

**Ask only what's missing:**
- Content type and quantity specifics
- Screen size/format requirements  
- Source material details (file paths, URLs)
- Specific text, images, or data to include
- Target audience and tone clarification
- Timeline or special requirements
```

Call `AskUserQuestion` with the missing fields as a single consolidated question. Do not assume or fill in details — wait for the user's response before moving to Step 4.

### 4. Next.js App Creation & Setup
- Create Next.js app using content-based project name
- Configure webpack alias for template imports
- Set up project structure and template design tokens
- Follow [references/nextjs-setup.md](references/nextjs-setup.md) for setup

### 5. Content Generation
- Generate pages/slides based on user requirements
- Use selected template components (Hero, Card, Button, etc.)
- Create multiple pages if needed (slides, content pages)

### 6. Send to Figma
1. Use `/figma-generate-design` skill (priority)
2. If not available, use Figma MCP `use_figma` tool directly
3. Push generated Next.js content to Figma
4. Provide Figma URL and summary

## Template Creation Workflow (Mode B)

### 1. URL Validation & Template Naming
Mode B requires **two separate Figma URLs** that point to **different nodes inside the same file**:
- **Tokens URL**: points to the design tokens / styles node (`?node-id=XXXX:YYYY` required)
- **Components URL**: points to the components node (`?node-id=XXXX:YYYY` required)

Use the `--mode-b` flag to validate both at once:

```bash
node scripts/parse-node-ids-from-url.js --mode-b "${tokensUrl}" "${componentsUrl}"
```

This single command enforces all three rules:
1. Both URLs are valid Figma URLs with a `node-id` parameter.
2. Both share the **same `fileKey`** (same Figma file).
3. The two `nodeId` values are **different** (they target distinct nodes).

> **Important**: same `fileKey` is EXPECTED and correct. The error condition is when the nodeIds are the same — that means the user accidentally provided the same node twice.

If validation fails, surface the error message and ask the user to provide correct URLs.

After validation, extract from each:
- `fileKey` (same for both)
- `tokensNodeId` (nodeId from the tokens URL — colon-separated, e.g. `2004:2187`)
- `componentsNodeId` (nodeId from the components URL — colon-separated, e.g. `2001:1913`)
- `decodedFileName` (from either URL)

**STOP — call `AskUserQuestion` now. Do not proceed until the user responds.**

```markdown
Found Figma file: **"${decodedFileName}"**

Tokens node: ${tokensNodeId}
Components node: ${componentsNodeId}

What would you like to call this template?

Example: "Tutorial Content Design"
```

### 2. Template Folder Creation
Create the folder structure, passing both node IDs:
```bash
node scripts/create-template-folder.js "${fileKey}" "${templateName}" "${tokensNodeId}" "${componentsNodeId}"
```

### 3. Design System Extraction
Extract actual design tokens and generate components using the stored node IDs:
- Use `tokensNodeId` as the entry point for token/variable extraction
- Use `componentsNodeId` as the entry point for component scanning
- Follow [references/design-token-extraction.md](references/design-token-extraction.md) for token extraction
- Follow [references/component-generation.md](references/component-generation.md) for components
- Replace placeholder files with extracted design system
- Create React component templates based on Figma nodes
- **Do not use `<img>` tags with CDN asset URLs** from `get_design_context` — they produce non-editable bitmaps in Figma. Build with React DOM elements and token styles instead.

### 4. Template Registration & Index Generation
**After completing design system extraction**, register the template:
```bash
node scripts/update-template-registry.js "${fileKey}" "${templateName}"
```

This will:
- Update `metadata.json` with template info
- Generate PascalCase prefix (e.g., "Tutorial Content Design" → "TutorialContentDesign")
- **Create/regenerate centralized `index.ts`** for clean imports
- Make template available for Mode A usage

**Important**: Only run this after tokens.ts and components are finalized!

### 5. Template Validation
- Verify `index.ts` contains all exports (TutorialContentDesignHero, TutorialContentDesignTokens, etc.)
- Test component imports: `import { TutorialContentDesignHero } from '~/.figma/template-automation'`
- Validate design token integration works correctly
- **Template is now ready for Mode A content generation**

## Directory Structure

```
~/.figma/template-automation/
├── index.ts                 # Centralized exports (auto-generated)
├── metadata.json           # Template registry (auto-generated)
├── eqvQ8FthY4KfgmRcFzHOpa/ # Template folder (fileKey-based)
│   ├── template.json        # Template metadata
│   ├── tokens.ts            # Design tokens (TypeScript)
│   └── components/          # React components
│       ├── Hero.tsx
│       └── Button.tsx
└── abc123def456/           # Another template
    ├── template.json
    ├── tokens.ts
    └── components/
        └── LandingHero.tsx
```

## Usage Examples

- **Use existing template**: "Create slides using the tutorial template"
- **Create new template**: "Turn this Figma URL into a reusable template"