#!/usr/bin/env node

/**
 * Template Registry Update Script
 *
 * Updates metadata.json and regenerates index.ts for centralized template imports
 * Usage: node update-template-registry.js <templateId> <displayName>
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Configuration
const TEMPLATE_DIR = path.join(require('os').homedir(), '.figma', 'template-automation');
const METADATA_FILE = path.join(TEMPLATE_DIR, 'metadata.json');
const INDEX_FILE = path.join(TEMPLATE_DIR, 'index.ts');

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
 * Ensure template directory structure exists
 */
function ensureTemplateDirectory() {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
  }
}

/**
 * Load or create metadata.json
 */
function loadMetadata() {
  if (!fs.existsSync(METADATA_FILE)) {
    return { templates: {} };
  }

  try {
    return JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
  } catch (error) {
    console.warn('Invalid metadata.json, creating new one');
    return { templates: {} };
  }
}

/**
 * Update metadata.json with new template
 */
function updateMetadata(templateId, displayName, pascalPrefix) {
  const metadata = loadMetadata();

  metadata.templates[templateId] = {
    displayName: displayName,
    pascalPrefix: pascalPrefix,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  console.log(`✅ Updated metadata.json: ${displayName} → ${pascalPrefix}`);
}

/**
 * Get all components from a template folder
 */
function getTemplateComponents(templateId) {
  const templatePath = path.join(TEMPLATE_DIR, templateId);
  const componentsPath = path.join(templatePath, 'components');

  if (!fs.existsSync(componentsPath)) {
    return [];
  }

  const componentFiles = glob.sync('*.tsx', { cwd: componentsPath });
  return componentFiles.map(file => path.basename(file, '.tsx'));
}

/**
 * Check if template has tokens.ts
 */
function hasTokens(templateId) {
  const tokensPath = path.join(TEMPLATE_DIR, templateId, 'tokens.ts');
  return fs.existsSync(tokensPath);
}

/**
 * Generate centralized index.ts
 */
function generateIndexFile() {
  const metadata = loadMetadata();
  const templates = metadata.templates || {};

  let indexContent = `// Auto-generated centralized template exports
// This file is automatically updated when templates are added or modified

`;

  // Generate exports for each template
  Object.entries(templates).forEach(([templateId, templateInfo]) => {
    const { displayName, pascalPrefix } = templateInfo;

    indexContent += `// ${displayName} (${templateId})\n`;

    // Export components
    const components = getTemplateComponents(templateId);
    components.forEach(component => {
      indexContent += `export { ${component} as ${pascalPrefix}${component} } from './${templateId}/components/${component}';\n`;
    });

    // Export tokens if exists
    if (hasTokens(templateId)) {
      indexContent += `export { tokens as ${pascalPrefix}Tokens } from './${templateId}/tokens';\n`;
    }

    indexContent += '\n';
  });

  // Add helper function for template discovery
  indexContent += `// Template registry for dynamic access
export const TEMPLATE_REGISTRY = ${JSON.stringify(templates, null, 2)};

/**
 * Get available templates
 */
export function getAvailableTemplates() {
  return Object.entries(TEMPLATE_REGISTRY).map(([id, info]) => ({
    id,
    displayName: info.displayName,
    pascalPrefix: info.pascalPrefix
  }));
}

/**
 * Get template by ID
 */
export function getTemplate(templateId: string) {
  return TEMPLATE_REGISTRY[templateId];
}
`;

  fs.writeFileSync(INDEX_FILE, indexContent);
  console.log(`✅ Generated index.ts with ${Object.keys(templates).length} templates`);
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node update-template-registry.js <templateId> <displayName>');
    console.error('Example: node update-template-registry.js eqvQ8FthY4KfgmRcFzHOpa "Tutorial Content Design"');
    process.exit(1);
  }

  const [templateId, displayName] = args;
  const pascalPrefix = toPascalCase(displayName);

  console.log(`🚀 Updating template registry...`);
  console.log(`   Template ID: ${templateId}`);
  console.log(`   Display Name: ${displayName}`);
  console.log(`   Pascal Prefix: ${pascalPrefix}`);

  try {
    ensureTemplateDirectory();
    updateMetadata(templateId, displayName, pascalPrefix);
    generateIndexFile();

    console.log(`\n✨ Template registry updated successfully!`);
    console.log(`\nYou can now import components like:`);
    console.log(`import { ${pascalPrefix}Hero, ${pascalPrefix}Button, ${pascalPrefix}Tokens } from '~/.figma/template-automation';`);

  } catch (error) {
    console.error('❌ Error updating template registry:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  toPascalCase,
  updateMetadata,
  generateIndexFile,
  main
};