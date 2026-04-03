# Template Integration Reference

Simple guide for using Figma templates in Next.js projects.

## 1. Project Setup

### Create Project with Content-Based Name
```bash
# Convert content title to kebab-case project name
# "Machine Learning Basics" → "machine-learning-basics"  
# "Product Design Guide 2024" → "product-design-guide-2024"

npx create-next-app@latest ${contentTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
cd ${project-name}
```

## 2. Configure Next.js

### next.config.js
```javascript
// next.config.js
const path = require('path');
const os = require('os');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '~/.figma/template-automation': path.join(
        os.homedir(),
        '.figma',
        'template-automation'
      )
    };
    return config;
  }
};

module.exports = nextConfig;
```

## 3. Template Component Usage

### Import and Use Templates
```typescript
// Import template components directly
import {
  TutorialContentDesignHero,
  TutorialContentDesignCard,
  TutorialContentDesignButton,
  TutorialContentDesignTokens
} from '~/.figma/template-automation';

// Use in your pages/components
export default function MyPage() {
  return (
    <div style={{ backgroundColor: TutorialContentDesignTokens.colors.background }}>
      <TutorialContentDesignHero 
        title="My Title"
        subtitle="My Subtitle" 
      />
      <TutorialContentDesignCard
        heading="Section Title"
        body="Section content here..."
      />
      <TutorialContentDesignButton variant="primary">
        Call to Action
      </TutorialContentDesignButton>
    </div>
  );
}
```

## 4. Available Resources

### Components (per template)
- `{TemplateName}Hero` - Hero section
- `{TemplateName}Card` - Content cards  
- `{TemplateName}Button` - CTA buttons
- `{TemplateName}Tokens` - Design tokens

### Design Tokens Usage
```typescript
TutorialContentDesignTokens.colors.primary      // #007AFF
TutorialContentDesignTokens.colors.background   // #FFFFFF
TutorialContentDesignTokens.typography.fontSize.xl  // 1.25rem
TutorialContentDesignTokens.spacing.lg          // 1.5rem
```

That's it! AI handles the rest of the Next.js setup.