import { formatDateTime } from './date-format.js';

export function normalizeUrl(rawUrl) {
  const value = rawUrl.trim();
  if (!value) {
    throw new Error('URL is empty');
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

export function sanitizeFilename(value) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150) || 'screenshot';
}

export function sanitizePath(value) {
  return String(value ?? '')
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => sanitizeFilename(part))
    .join('/');
}

const PATH_TEMPLATE_ALIASES = {
  index: ['index', '序号', '编号'],
  total: ['total', '总数', '总计'],
  host: ['host', 'hostname', 'domain', '域名', '主机名', '网站'],
  folder: ['folder', '文件夹', '目录'],
  datetime: ['datetime', 'dateTime', '日期时间', '时间戳'],
  title: ['title', '标题', '页面标题'],
  keyword: ['keyword', 'searchKeyword', 'query', '搜索关键词', '关键词', '搜索词'],
  url: ['url', '网址', '链接', '地址']
};

const SEARCH_KEYWORD_PARAMS = [
  'q',
  'query',
  'keyword',
  'keywords',
  'search',
  'search_query',
  'term',
  'wd',
  'word',
  'text',
  'k',
  'p'
];

function searchKeywordFromUrl(parsed) {
  const params = parsed.searchParams;
  const key = SEARCH_KEYWORD_PARAMS.find((name) => params.get(name));

  return key ? params.get(key) : '';
}

function pathTemplateValues(url, index, total, options, context = {}, folder = '') {
  const parsed = new URL(url);
  const now = new Date();
  const datetime = formatDateTime(now, options.filenameDateTimeFormat || 'YYYY-MM-DD_HHmmss');

  return {
    index: String(index + 1).padStart(3, '0'),
    total: String(total ?? ''),
    host: parsed.hostname.replace(/^www\./, ''),
    folder: folder || 'download',
    datetime,
    title: context.title || '',
    keyword: context.keyword || context.searchKeyword || searchKeywordFromUrl(parsed),
    url
  };
}

function renderPathTemplate(template, values) {
  let rendered = String(template ?? '');

  Object.entries(PATH_TEMPLATE_ALIASES).forEach(([key, names]) => {
    names.forEach((name) => {
      rendered = rendered.replaceAll(`{${name}}`, values[key]);
    });
  });

  return rendered;
}

export function buildFolderPath(folder, url, index, total, options, context = {}) {
  const values = pathTemplateValues(url, index, total, options, context, '');

  return sanitizePath(renderPathTemplate(String(folder ?? '').trim(), values));
}

export function buildFilename(url, index, options, context = {}) {
  const total = context.total ?? options.total ?? '';
  const extension = options.format === 'jpg' ? 'jpg' : options.format;
  const folder = buildFolderPath(options.folder, url, index, total, options, context);
  const values = pathTemplateValues(url, index, total, options, context, folder);
  const basename = renderPathTemplate(options.filenamePattern || '{index}-{host}', values);
  const filename = `${sanitizeFilename(basename)}.${extension}`;

  return folder ? `${folder}/${filename}` : filename;
}

export function buildDownloadPath(folder, filename) {
  const sanitizedFolder = sanitizePath(String(folder ?? '').trim());
  const sanitizedFilename = sanitizeFilename(filename);

  return sanitizedFolder ? `${sanitizedFolder}/${sanitizedFilename}` : sanitizedFilename;
}

export function csvEscape(value) {
  const stringValue = String(value ?? '');
  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}
