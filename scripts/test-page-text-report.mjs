import assert from 'node:assert/strict';
import { getReportColumns } from '../utils/report-fields.js';
import { createReportRow } from '../background/capture-flow.js';
import { downloadCombinedTextIfNeeded } from '../background/report-download.js';

// Mock chrome environment
const downloadedFiles = [];
globalThis.chrome = {
  downloads: {
    download: async (options) => {
      downloadedFiles.push(options);
      return 123;
    }
  }
};

// 1. Test getReportColumns behaves correctly with includeTextInReport
const fields = '{index},{url},{title},{status},{filename},{error}';
const colsWithoutText = getReportColumns(fields, false);
assert.equal(colsWithoutText.some(c => c.key === 'textFilename'), false);

const colsWithText = getReportColumns(fields, true);
assert.ok(colsWithText.some(c => c.key === 'textFilename'));
assert.ok(colsWithText.some(c => c.key === 'textLength'));
assert.ok(colsWithText.some(c => c.key === 'textExcerpt'));
assert.ok(colsWithText.some(c => c.key === 'metaDescription'));

// No duplication if already present
const fieldsWithText = '{index},{url},{textFilename}';
const colsWithTextDuplicate = getReportColumns(fieldsWithText, true);
const textFilenameCols = colsWithTextDuplicate.filter(c => c.key === 'textFilename');
assert.equal(textFilenameCols.length, 1);

// 2. Test createReportRow preserves extra parameters
const row = createReportRow({
  index: 0,
  url: 'https://example.com',
  title: 'Test Title',
  filename: 'test.png',
  status: 'ok',
  textFilename: 'test.txt',
  textLength: 10,
  textExcerpt: 'Excerpt...',
  metaDescription: 'Description...',
  text: 'Full Text...',
  lang: 'en',
  keyword: 'kw'
});

assert.equal(row.index, 1);
assert.equal(row.url, 'https://example.com');
assert.equal(row.textFilename, 'test.txt');
assert.equal(row.textLength, 10);
assert.equal(row.textExcerpt, 'Excerpt...');
assert.equal(row.metaDescription, 'Description...');
assert.equal(row.text, 'Full Text...');
assert.equal(row.lang, 'en');
assert.equal(row.keyword, 'kw');

// 3. Test downloadCombinedTextIfNeeded downloads combined file and clears row.text
const rows = [row];
const options = {
  extractPageText: true,
  saveTextMode: 'combined',
  saveTextCombinedSeparator: '===',
  saveTextTemplate: '{text}',
  folder: 'TestFolder'
};
const deps = {
  chrome: globalThis.chrome,
  buildFolderPath: () => 'TestFolder',
  buildDownloadPath: (folder, name) => `${folder}/${name}`
};

downloadedFiles.length = 0;
await downloadCombinedTextIfNeeded(rows, options, deps);

assert.equal(downloadedFiles.length, 1);
assert.ok(downloadedFiles[0].filename.startsWith('TestFolder/combined_text-'));
assert.ok(downloadedFiles[0].url.startsWith('data:text/plain;charset=utf-8,'));
const decoded = decodeURIComponent(downloadedFiles[0].url.split(',')[1]);
assert.equal(decoded, 'Full Text...');

// Verify row.text has been deleted/cleared to free memory
assert.equal(row.text, undefined);

console.log('Page Text Report tests passed successfully!');
