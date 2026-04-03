#!/usr/bin/env node

/**
 * Template Folder Creation Script
 *
 * Creates the complete folder structure for a new Figma template
 * Usage: node create-template-folder.js <templateId> <templateName>
 */

const fs = require('fs');
const path = require('path');

// Configuration
const TEMPLATE_DIR = path.join(require('os').homedir(), '.figma', 'template-automation');

/**
 * Convert display name to PascalCase prefix
 * "Tutorial Content Design" → "TutorialContentDesign"
 */
function toPascalCase(displayName) {
  return displayName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Create directory if it doesn't exist
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

/**
 * Create template.json configuration file
 */
function createTemplateConfig(templatePath, templateId, templateName, pascalPrefix, tokensNodeId, componentsNodeId) {
  const configPath = path.join(templatePath, 'template.json');

  const config = {
    displayName: templateName,
    pascalPrefix: pascalPrefix,
    templateId: templateId,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    figmaNodeIds: {
      tokens: tokensNodeId || null,
      components: componentsNodeId || null
    },
    components: {
      Hero: {
        props: ['title', 'subtitle', 'backgroundImage'],
        variants: ['default', 'centered']
      },
      Button: {
        props: ['children', 'variant', 'onClick'],
        variants: ['primary', 'secondary', 'outline']
      },
      Card: {
        props: ['heading', 'body', 'image'],
        variants: ['default', 'horizontal']
      }
    },
    layouts: {
      default: ['Hero', 'Card', 'Button'],
      slideshow: ['Hero', 'Card', 'Card', 'Button'],
      landing: ['Hero', 'Card', 'Card', 'Card', 'Button']
    }
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`📝 Created template.json`);
}

/**
 * Create design tokens TypeScript file
 */
function createTokensFile(templatePath, pascalPrefix) {
  const tokensPath = path.join(templatePath, 'tokens.ts');

  const tokensContent = `// Design tokens for ${pascalPrefix}
// Auto-generated template - customize as needed

export const tokens = {
  colors: {
    primary: '#007AFF',
    secondary: '#5856D6',
    background: '#FFFFFF',
    surface: '#F2F2F7',
    text: {
      primary: '#000000',
      secondary: '#3C3C43',
      disabled: '#8E8E93'
    },
    border: '#C6C6C8',
    error: '#FF3B30',
    warning: '#FF9500',
    success: '#34C759'
  },

  typography: {
    fontFamily: {
      primary: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      mono: 'SF Mono, Monaco, monospace'
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem'  // 36px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75
    }
  },

  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
    '2xl': '3rem',   // 48px
    '3xl': '4rem',   // 64px
    '4xl': '6rem'    // 96px
  },

  borderRadius: {
    none: '0',
    sm: '0.25rem',   // 4px
    md: '0.375rem',  // 6px
    lg: '0.5rem',    // 8px
    xl: '0.75rem',   // 12px
    '2xl': '1rem',   // 16px
    full: '9999px'
  },

  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
  }
};

export default tokens;
`;

  fs.writeFileSync(tokensPath, tokensContent);
  console.log(`🎨 Created tokens.ts`);
}

/**
 * Create placeholder React component
 */
function createComponent(componentsPath, componentName, pascalPrefix) {
  const componentPath = path.join(componentsPath, `${componentName}.tsx`);

  let componentContent;

  switch (componentName) {
    case 'Hero':
      componentContent = `import React from 'react';
import { tokens } from '../tokens';

interface ${pascalPrefix}HeroProps {
  title: string;
  subtitle?: string;
  backgroundImage?: string;
  variant?: 'default' | 'centered';
  className?: string;
}

export function ${pascalPrefix}Hero({
  title,
  subtitle,
  backgroundImage,
  variant = 'default',
  className = ''
}: ${pascalPrefix}HeroProps) {
  const baseClasses = 'relative overflow-hidden bg-gradient-to-r from-blue-600 to-purple-600 text-white';
  const variantClasses = variant === 'centered' ? 'text-center' : 'text-left';

  return (
    <section
      className={\`\${baseClasses} \${variantClasses} \${className}\`}
      style={{
        backgroundImage: backgroundImage ? \`url(\${backgroundImage})\` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '60vh',
        padding: tokens.spacing['2xl']
      }}
    >
      <div className="relative z-10 max-w-4xl mx-auto">
        <h1
          className="mb-4 font-bold"
          style={{
            fontSize: tokens.typography.fontSize['4xl'],
            lineHeight: tokens.typography.lineHeight.tight
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="opacity-90"
            style={{
              fontSize: tokens.typography.fontSize.xl,
              lineHeight: tokens.typography.lineHeight.normal
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}

export default ${pascalPrefix}Hero;
`;
      break;

    case 'Button':
      componentContent = `import React from 'react';
import { tokens } from '../tokens';

interface ${pascalPrefix}ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function ${pascalPrefix}Button({
  children,
  variant = 'primary',
  onClick,
  disabled = false,
  className = ''
}: ${pascalPrefix}ButtonProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: tokens.colors.secondary,
          color: 'white',
          border: \`2px solid \${tokens.colors.secondary}\`
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: tokens.colors.primary,
          border: \`2px solid \${tokens.colors.primary}\`
        };
      default:
        return {
          backgroundColor: tokens.colors.primary,
          color: 'white',
          border: \`2px solid \${tokens.colors.primary}\`
        };
    }
  };

  return (
    <button
      className={\`inline-flex items-center justify-center font-medium transition-all duration-200 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed \${className}\`}
      style={{
        ...getVariantStyles(),
        padding: \`\${tokens.spacing.md} \${tokens.spacing.xl}\`,
        borderRadius: tokens.borderRadius.lg,
        fontSize: tokens.typography.fontSize.base,
        fontWeight: tokens.typography.fontWeight.medium
      }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default ${pascalPrefix}Button;
`;
      break;

    case 'Card':
      componentContent = `import React from 'react';
import { tokens } from '../tokens';

interface ${pascalPrefix}CardProps {
  heading: string;
  body: string;
  image?: string;
  variant?: 'default' | 'horizontal';
  className?: string;
}

export function ${pascalPrefix}Card({
  heading,
  body,
  image,
  variant = 'default',
  className = ''
}: ${pascalPrefix}CardProps) {
  const isHorizontal = variant === 'horizontal';

  return (
    <div
      className={\`overflow-hidden \${isHorizontal ? 'flex' : 'block'} \${className}\`}
      style={{
        backgroundColor: tokens.colors.background,
        borderRadius: tokens.borderRadius.xl,
        boxShadow: tokens.shadows.lg,
        border: \`1px solid \${tokens.colors.border}\`
      }}
    >
      {image && (
        <div className={\`\${isHorizontal ? 'w-1/3' : 'w-full h-48'} bg-gray-200\`}>
          <img
            src={image}
            alt={heading}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div
        className={\`\${isHorizontal ? 'flex-1' : 'w-full'}\`}
        style={{ padding: tokens.spacing.xl }}
      >
        <h3
          className="mb-2"
          style={{
            fontSize: tokens.typography.fontSize.xl,
            fontWeight: tokens.typography.fontWeight.semibold,
            color: tokens.colors.text.primary
          }}
        >
          {heading}
        </h3>
        <p
          style={{
            fontSize: tokens.typography.fontSize.base,
            lineHeight: tokens.typography.lineHeight.relaxed,
            color: tokens.colors.text.secondary
          }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

export default ${pascalPrefix}Card;
`;
      break;

    default:
      componentContent = `import React from 'react';
import { tokens } from '../tokens';

interface ${pascalPrefix}${componentName}Props {
  className?: string;
}

export function ${pascalPrefix}${componentName}({ className = '' }: ${pascalPrefix}${componentName}Props) {
  return (
    <div className={className} style={{ padding: tokens.spacing.md }}>
      <p>TODO: Implement ${componentName} component</p>
    </div>
  );
}

export default ${pascalPrefix}${componentName};
`;
  }

  fs.writeFileSync(componentPath, componentContent);
  console.log(`⚛️ Created ${componentName}.tsx`);
}

/**
 * Create complete template folder structure
 */
function createTemplateFolder(templateId, templateName, tokensNodeId, componentsNodeId) {
  const pascalPrefix = toPascalCase(templateName);

  console.log(`🚀 Creating template folder...`);
  console.log(`   Template ID: ${templateId}`);
  console.log(`   Template Name: ${templateName}`);
  console.log(`   Pascal Prefix: ${pascalPrefix}`);
  if (tokensNodeId) console.log(`   Tokens Node ID: ${tokensNodeId}`);
  if (componentsNodeId) console.log(`   Components Node ID: ${componentsNodeId}`);

  // Create main directories
  const templatePath = path.join(TEMPLATE_DIR, templateId);
  const componentsPath = path.join(templatePath, 'components');

  ensureDirectory(TEMPLATE_DIR);
  ensureDirectory(templatePath);
  ensureDirectory(componentsPath);

  // Create basic configuration only
  createTemplateConfig(templatePath, templateId, templateName, pascalPrefix, tokensNodeId, componentsNodeId);

  // Create placeholder files
  const placeholderTokens = path.join(templatePath, 'tokens.ts');
  fs.writeFileSync(placeholderTokens, `// Design tokens will be extracted from Figma\n// This file will be replaced during DS extraction\n\nexport const tokens = {};\nexport default tokens;\n`);

  console.log(`\n✨ Template folder structure created!`);
  console.log(`   Location: ${templatePath}`);
  console.log(`\n📁 Directory structure:`);
  console.log(`   ${templateId}/`);
  console.log(`   ├── template.json`);
  console.log(`   ├── tokens.ts (placeholder)`);
  console.log(`   └── components/ (ready for generation)`);
  console.log(`\n⏭️  Next: Run design system extraction to populate with real content`);

  return {
    templatePath,
    templateId,
    templateName,
    pascalPrefix,
    components: []  // Will be generated later
  };
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node create-template-folder.js <templateId> <templateName> [tokensNodeId] [componentsNodeId]');
    console.error('Example: node create-template-folder.js eqvQ8FthY4KfgmRcFzHOpa "Tutorial Content Design" "2004-2187" "2001-1913"');
    process.exit(1);
  }

  const [templateId, templateName, tokensNodeId, componentsNodeId] = args;

  try {
    const result = createTemplateFolder(templateId, templateName, tokensNodeId, componentsNodeId);
    console.log(`\n🎯 Next steps:`);
    console.log(`   1. Run: node update-template-registry.js ${templateId} "${templateName}"`);
    console.log(`   2. Customize components in: ${result.templatePath}/components/`);
    console.log(`   3. Update design tokens in: ${result.templatePath}/tokens.ts`);
  } catch (error) {
    console.error('❌ Error creating template folder:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  createTemplateFolder,  // (templateId, templateName, tokensNodeId?, componentsNodeId?)
  toPascalCase
};