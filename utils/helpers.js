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

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatDateTime(date, format) {
  return (format || '')
    .replaceAll('YYYY', String(date.getFullYear()))
    .replaceAll('MM', pad(date.getMonth() + 1))
    .replaceAll('DD', pad(date.getDate()))
    .replaceAll('HH', pad(date.getHours()))
    .replaceAll('mm', pad(date.getMinutes()))
    .replaceAll('ss', pad(date.getSeconds()));
}

export function buildFilename(url, index, options, context = {}) {
  const parsed = new URL(url);
  const now = new Date();
  const datetime = formatDateTime(now, options.filenameDateTimeFormat || 'YYYY-MM-DD_HHmmss');
  const date = formatDateTime(now, 'YYYY-MM-DD');
  const time = formatDateTime(now, 'HHmmss');
  const extension = options.format === 'jpg' ? 'jpg' : options.format;
  const folder = sanitizeFilename(String(options.folder ?? '').trim());
  const values = {
    index: String(index + 1).padStart(3, '0'),
    host: parsed.hostname.replace(/^www\./, ''),
    folder: folder || 'download',
    datetime,
    date,
    time,
    title: context.title || '',
    url
  };
  const aliases = {
    index: ['index', '序号', '编号'],
    host: ['host', 'hostname', 'domain', '域名', '主机名', '网站'],
    folder: ['folder', '文件夹', '目录'],
    datetime: ['datetime', 'dateTime', '日期时间', '时间戳'],
    date: ['date', '日期'],
    time: ['time', '时间'],
    title: ['title', '标题', '页面标题'],
    url: ['url', '网址', '链接', '地址']
  };
  let basename = options.filenamePattern || '{index}-{host}';

  Object.entries(aliases).forEach(([key, names]) => {
    names.forEach((name) => {
      basename = basename.replaceAll(`{${name}}`, values[key]);
    });
  });

  const filename = `${sanitizeFilename(basename)}.${extension}`;

  return folder ? `${folder}/${filename}` : filename;
}

export function buildDownloadPath(folder, filename) {
  const sanitizedFolder = sanitizeFilename(String(folder ?? '').trim());
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
