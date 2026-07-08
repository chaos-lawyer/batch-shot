import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONTENT_SCRIPT_FILES } from '../utils/content-script-files.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, '../manifest.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const manifestScripts = manifest.content_scripts[0].js;

console.log('Verifying manifest.json content scripts match CONTENT_SCRIPT_FILES...');

try {
  assert.deepStrictEqual(manifestScripts, CONTENT_SCRIPT_FILES);
  console.log('Manifest content scripts match background injection files!');
} catch (error) {
  console.error('Mismatch found!');
  console.error('manifest.json scripts:', manifestScripts);
  console.error('CONTENT_SCRIPT_FILES:', CONTENT_SCRIPT_FILES);
  process.exit(1);
}
