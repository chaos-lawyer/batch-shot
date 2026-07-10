import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function checkHtmlFile(htmlPath, fileSpecificChecks = null) {
  if (!fs.existsSync(htmlPath)) {
    console.error(`Error: HTML file does not exist at ${htmlPath}`);
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const lines = html.split('\n');
  const stack = [];
  const parentChild = []; // Array of { id, parentId, parentTag }
  const referencedResources = []; // Array of string paths

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    // A regex that matches opening tag, closing tag, or self-closing tag
    const tagReg = /<(\/?)([a-zA-Z0-9:-]+)(?:\s+([^>]*?))?(\/?)>/g;
    while ((match = tagReg.exec(line)) !== null) {
      const isClosing = match[1] === '/';
      const tagName = match[2].toLowerCase();
      const attrsStr = match[3] || '';
      const isSelfClosing = match[4] === '/' || ['img', 'br', 'hr', 'input', 'meta', 'link'].includes(tagName);

      // Track referenced stylesheets and script sources
      if (tagName === 'link') {
        const relMatch = /\brel\s*=\s*['"]([^'"]+)['"]/i.exec(attrsStr);
        const hrefMatch = /\bhref\s*=\s*['"]([^'"]+)['"]/i.exec(attrsStr);
        if (relMatch && relMatch[1] === 'stylesheet' && hrefMatch) {
          referencedResources.push(hrefMatch[1]);
        }
      }
      if (tagName === 'script') {
        const srcMatch = /\bsrc\s*=\s*['"]([^'"]+)['"]/i.exec(attrsStr);
        if (srcMatch) {
          referencedResources.push(srcMatch[1]);
        }
      }

      if (isClosing) {
        if (stack.length > 0) {
          const top = stack.pop();
          if (top.tag !== tagName) {
            console.error(`Tag mismatch in ${path.basename(htmlPath)} at line ${i + 1}: expected closing </${top.tag}> but got </${tagName}>`);
            process.exit(1);
          }
        }
      } else if (!isSelfClosing) {
        const idMatch = /\bid\s*=\s*['"]([^'"]+)['"]/i.exec(attrsStr);
        const id = idMatch ? idMatch[1] : null;
        
        const parent = stack[stack.length - 1];
        if (id) {
          parentChild.push({ id, parentId: parent ? parent.id : null, parentTag: parent ? parent.tag : null });
        }
        stack.push({ tag: tagName, id: id || (parent ? parent.id : null), line: i + 1 });
      }
    }
  }

  if (stack.length > 0) {
    console.error(`Unclosed tags remaining in ${path.basename(htmlPath)}:`, stack);
    process.exit(1);
  }

  // Check referenced files existence
  const dir = path.dirname(htmlPath);
  for (const resource of referencedResources) {
    // Only verify local files (ignore URLs)
    if (!resource.startsWith('http://') && !resource.startsWith('https://') && !resource.startsWith('chrome://')) {
      const fullPath = path.resolve(dir, resource);
      if (!fs.existsSync(fullPath)) {
        console.error(`Error in ${path.basename(htmlPath)}: Referenced local resource "${resource}" not found at "${fullPath}"`);
        process.exit(1);
      }
    }
  }

  // Run file specific assertions if any
  if (fileSpecificChecks) {
    fileSpecificChecks(parentChild);
  }
}

// 1. Validate popup/popup.html
const popupHtmlPath = path.join(__dirname, '../popup/popup.html');
checkHtmlFile(popupHtmlPath, (parentChild) => {
  const dashboard = parentChild.find(item => item.id === 'dashboardPanel');
  if (dashboard) {
    if (dashboard.parentId === 'urlTemplatePane') {
      console.error('Assertion failed: dashboardPanel parent is urlTemplatePane!');
      process.exit(1);
    }
  }
});
console.log('popup.html check passed!');

// 2. Validate help/help.html
const helpHtmlPath = path.join(__dirname, '../help/help.html');
checkHtmlFile(helpHtmlPath);
console.log('help.html check passed!');

console.log('All HTML structures and resource reference checks passed!');
