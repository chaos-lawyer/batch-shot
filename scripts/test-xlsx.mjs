import assert from 'node:assert/strict';
import { createReportWorkbookFiles } from '../utils/report-workbook.js';
import { createXlsxReportDataUrl } from '../utils/xlsx.js';
import { xmlEscape } from '../utils/xlsx-xml.js';

const columns = [
  { key: 'index', label: 'Index' },
  { key: 'url', label: 'URL' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'filename', label: 'Filename' },
  { key: 'error', label: 'Error' }
];

const mixedRows = [
  {
    index: 1,
    url: 'https://example.com/?a=1&b=<x>',
    title: 'A < B & C',
    status: 'ok',
    filename: 'BatchShot/example.png',
    error: ''
  },
  {
    index: 2,
    url: 'https://bad.example/',
    title: 'Bad',
    status: 'error',
    filename: '',
    error: 'Quote " and <tag>'
  }
];

function decodeXlsxDataUrl(dataUrl) {
  const prefix = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,';
  assert.ok(dataUrl.startsWith(prefix), 'XLSX data URL should use the expected MIME type');
  return Buffer.from(dataUrl.slice(prefix.length), 'base64');
}

function listZipLocalEntries(bytes) {
  const entries = [];
  let offset = 0;

  while (offset + 4 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034B50) {
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    entries.push(bytes.subarray(nameStart, nameStart + nameLength).toString('utf8'));
    offset = dataStart + compressedSize;
  }

  return entries;
}

function getWorkbookFile(rows, name) {
  return createReportWorkbookFiles(rows, columns)
    .find((file) => file.name === name)
    .content;
}

function countRows(worksheetXml) {
  return [...worksheetXml.matchAll(/<row\b/g)].length;
}

function assertWorkbookCanBeGenerated(rows) {
  const bytes = decodeXlsxDataUrl(createXlsxReportDataUrl(rows, columns));
  assert.ok(bytes.length > 0, 'Generated XLSX should not be empty');
  assert.deepEqual(listZipLocalEntries(bytes), [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/_rels/sheet1.xml.rels',
    'xl/worksheets/sheet2.xml',
    'xl/worksheets/_rels/sheet2.xml.rels'
  ]);
}

assert.equal(xmlEscape('A < B & C'), 'A &lt; B &amp; C');
assert.equal(xmlEscape('bad\u0000char'), 'badchar');

const worksheet = getWorkbookFile(mixedRows, 'xl/worksheets/sheet1.xml');
assert.ok(worksheet.includes('A &lt; B &amp; C'));
assert.ok(worksheet.includes('Quote " and &lt;tag&gt;'));

const emptyFailureSheet = getWorkbookFile([], 'xl/worksheets/sheet2.xml');
assert.equal(countRows(emptyFailureSheet), 1, 'empty report failure sheet should only contain the header');

const successOnlyFailureSheet = getWorkbookFile([mixedRows[0]], 'xl/worksheets/sheet2.xml');
assert.equal(countRows(successOnlyFailureSheet), 1, 'success-only failure sheet should only contain the header');
assert.ok(!successOnlyFailureSheet.includes('BatchShot/example.png'));
assert.ok(!successOnlyFailureSheet.includes('A &lt; B &amp; C'));

const mixedFailureSheet = getWorkbookFile(mixedRows, 'xl/worksheets/sheet2.xml');
assert.equal(countRows(mixedFailureSheet), 2, 'mixed report failure sheet should contain header plus failed rows');
assert.ok(mixedFailureSheet.includes('https://bad.example/'));
assert.ok(mixedFailureSheet.includes('Bad'));
assert.ok(mixedFailureSheet.includes('Quote " and &lt;tag&gt;'));
assert.ok(!mixedFailureSheet.includes('BatchShot/example.png'));
assert.ok(!mixedFailureSheet.includes('A &lt; B &amp; C'));

assertWorkbookCanBeGenerated([]);
assertWorkbookCanBeGenerated([mixedRows[0]]);
assertWorkbookCanBeGenerated(mixedRows);

console.log('XLSX tests passed');
