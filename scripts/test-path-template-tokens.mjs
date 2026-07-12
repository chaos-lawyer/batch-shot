import assert from 'assert';
import { buildFilename, buildFolderPath } from '../utils/helpers.js';

const options = {
  folder: '{datetime}/{date}/{日期}/{year}/{年}',
  filenamePattern: '{datetime}-{time}-{时间}-{month}-{月}-{day}-{日}',
  filenameDateTimeFormat: 'YYYYMMDD-HHmmss',
  format: 'png'
};

const folder = buildFolderPath(options.folder, 'https://example.com', 0, 1, options);
assert.match(folder, /^\d{8}-\d{6}\//, 'The datetime token should still be expanded');
assert.ok(folder.includes('{date}'), 'The removed date token should remain unexpanded');
assert.ok(folder.includes('{日期}'), 'The removed Chinese date token should remain unexpanded');
assert.ok(folder.includes('{year}'), 'The removed year token should remain unexpanded');
assert.ok(folder.includes('{年}'), 'The removed Chinese year token should remain unexpanded');

const filename = buildFilename('https://example.com', 0, options, { total: 1 });
assert.match(filename, /^\d{8}-\d{6}\//, 'Folder datetime should be expanded in the download path');
assert.ok(filename.includes('{time}'), 'The removed time token should remain unexpanded');
assert.ok(filename.includes('{时间}'), 'The removed Chinese time token should remain unexpanded');
assert.ok(filename.includes('{month}'), 'The removed month token should remain unexpanded');
assert.ok(filename.includes('{月}'), 'The removed Chinese month token should remain unexpanded');
assert.ok(filename.includes('{day}'), 'The removed day token should remain unexpanded');
assert.ok(filename.includes('{日}'), 'The removed Chinese day token should remain unexpanded');

console.log('Path template token tests passed!');
