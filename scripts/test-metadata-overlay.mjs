import assert from 'node:assert/strict';
import {
  buildMetadataLines,
  getMetadataBand,
  getMetadataRows,
  scaleMetadataOptions
} from '../offscreen/metadata-overlay.js';

function createMeasureContext() {
  return {
    font: '',
    measureText(text) {
      return { width: String(text).length * 8 };
    }
  };
}

const options = {
  metadataEnabled: true,
  metadataLayout: 'inline',
  metadataFields: 'capturedAt,url,title',
  metadataDateTimeFormat: 'YYYY-MM-DD HH:mm',
  metadataLabelsEnabled: true,
  metadataBoldLabels: true,
  metadataSeparator: ' | ',
  metadataFontSize: 12,
  metadataPadding: 8,
  metadataGap: 4,
  appLanguage: 'en',
  metadataContext: {
    capturedAt: '2026-05-30T12:34:56',
    url: 'https://example.com/very/long/path',
    title: 'Example title'
  }
};

const ctx = createMeasureContext();
const rows = getMetadataRows(options);
const lines = buildMetadataLines(ctx, options, 120, 12, 'Arial', 8);
const band = getMetadataBand(ctx, options, 120);
const scaled = scaleMetadataOptions(options, 2);

assert.deepEqual(rows.map((row) => row.label), ['Captured at', 'URL', 'Title']);
assert.equal(rows[0].value, '2026-05-30 12:34');
assert.ok(lines.length > 1, 'narrow inline metadata should wrap to multiple lines');
assert.ok(band.height > 0, 'metadata band should report a drawable height');
assert.equal(scaled.metadataFontSize, 24);
assert.equal(scaled.metadataPadding, 16);
assert.equal(scaled.metadataGap, 8);

assert.deepEqual(getMetadataRows({ metadataEnabled: false }), []);

console.log('Metadata overlay tests passed');
