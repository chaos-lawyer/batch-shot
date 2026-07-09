import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '../popup/popup.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const lines = html.split('\n');
const stack = [];
const parentChild = []; // Array of { id, parentId, parentTag }

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

    if (isClosing) {
      if (stack.length > 0) {
        const top = stack.pop();
        if (top.tag !== tagName) {
          console.error(`Tag mismatch at line ${i + 1}: expected closing </${top.tag}> but got </${tagName}>`);
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
  console.error(`Unclosed tags remaining:`, stack);
  process.exit(1);
}

// Assertions
const dashboard = parentChild.find(item => item.id === 'dashboardPanel');
if (dashboard) {
  if (dashboard.parentId === 'urlTemplatePane') {
    console.error('Assertion failed: dashboardPanel parent is urlTemplatePane!');
    process.exit(1);
  }
}

console.log('HTML structure check passed!');
