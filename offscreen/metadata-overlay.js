import { formatDateTime } from '../utils/date-format.js';
import { clampNumber } from '../utils/number.js';

const METADATA_FIELDS = {
  capturedAt: {
    label: { en: 'Captured at', zh_CN: '截图时间' },
    aliases: ['capturedAt', 'captured_at', 'time', 'date', '截图时间', '时间', '日期']
  },
  url: {
    label: { en: 'URL', zh_CN: '网址' },
    aliases: ['url', 'URL', '网址', '链接', '地址']
  },
  title: {
    label: { en: 'Title', zh_CN: '标题' },
    aliases: ['title', '标题', '页面标题']
  },
  host: {
    label: { en: 'Host', zh_CN: '域名' },
    aliases: ['host', 'hostname', 'domain', '域名', '主机名', '网站']
  },
  index: {
    label: { en: 'Index', zh_CN: '序号' },
    aliases: ['index', '序号', '编号', '当前序号']
  },
  total: {
    label: { en: 'Total', zh_CN: '总数' },
    aliases: ['total', '总数', '总计', '总数量']
  },
  keyword: {
    label: { en: 'Keyword', zh_CN: '关键词' },
    aliases: ['keyword', 'searchKeyword', 'query', '搜索关键词', '关键词', '搜索词']
  }
};

const METADATA_FIELD_ALIASES = Object.fromEntries(
  Object.entries(METADATA_FIELDS).flatMap(([field, config]) => (
    config.aliases.map((alias) => [alias.toLowerCase(), field])
  ))
);

function getMetadataLanguage(options) {
  const language = options.appLanguage;
  if (language === 'zh_CN' || language === 'en') {
    return language;
  }

  const uiLanguage = globalThis.chrome?.i18n?.getUILanguage?.() || '';
  return uiLanguage.toLowerCase().startsWith('zh') ? 'zh_CN' : 'en';
}

function normalizeMetadataField(field) {
  return METADATA_FIELD_ALIASES[String(field).trim().toLowerCase()] || field;
}

export function getMetadataRows(options) {
  if (!options.metadataEnabled) {
    return [];
  }

  const context = options.metadataContext || {};
  const dateFormat = options.metadataDateTimeFormat || 'YYYY/MM/DD HH:mm';
  const language = getMetadataLanguage(options);
  const values = {
    capturedAt: formatDateTime(context.capturedAt, dateFormat, context.capturedAt || ''),
    url: context.url,
    title: context.title,
    host: context.host,
    index: context.index,
    total: context.total,
    keyword: context.keyword
  };

  return String(options.metadataFields || 'capturedAt,url')
    .split(',')
    .map((field) => field.trim())
    .map(normalizeMetadataField)
    .filter((field) => values[field] !== undefined && values[field] !== null && values[field] !== '')
    .map((field) => ({
      label: METADATA_FIELDS[field]?.label[language] || field,
      value: String(values[field])
    }));
}

function tokenizeRow(row, options) {
  if (!options.metadataLabelsEnabled) {
    return [{ text: row.value, bold: false }];
  }

  return [
    { text: `${row.label}: `, bold: Boolean(options.metadataBoldLabels) },
    { text: row.value, bold: false }
  ];
}

function measureToken(ctx, token, fontSize, fontFamily) {
  ctx.font = `${token.bold ? '700 ' : ''}${fontSize}px ${fontFamily}`;
  return ctx.measureText(token.text).width;
}

export function wrapTokens(ctx, tokens, maxWidth, fontSize, fontFamily) {
  const lines = [];
  let line = [];
  let width = 0;

  tokens.forEach((token) => {
    const parts = token.text.split(/(\s+)/);
    parts.forEach((part) => {
      if (!part) return;
      const piece = { ...token, text: part };
      let pieceWidth = measureToken(ctx, piece, fontSize, fontFamily);

      if (!/\s+/.test(part) && pieceWidth > maxWidth) {
        [...part].forEach((char) => {
          const charToken = { ...token, text: char };
          const charWidth = measureToken(ctx, charToken, fontSize, fontFamily);
          if (line.length && width + charWidth > maxWidth) {
            lines.push(line);
            line = [];
            width = 0;
          }
          line.push(charToken);
          width += charWidth;
        });
        return;
      }

      if (line.length && width + pieceWidth > maxWidth) {
        lines.push(line);
        line = [];
        width = 0;
        if (/^\s+$/.test(part)) return;
        pieceWidth = measureToken(ctx, piece, fontSize, fontFamily);
      }

      line.push(piece);
      width += pieceWidth;
    });
  });

  if (line.length) {
    lines.push(line);
  }

  return lines;
}

export function buildMetadataLines(ctx, options, width, fontSize, fontFamily, padding) {
  const rows = getMetadataRows(options);
  const maxWidth = Math.max(20, width - padding * 2);

  if (!rows.length) {
    return [];
  }

  if (options.metadataLayout === 'inline') {
    const separator = options.metadataSeparator ?? '  |  ';
    const tokens = rows.flatMap((row, index) => {
      const rowTokens = tokenizeRow(row, options);
      if (index === rows.length - 1) {
        return rowTokens;
      }
      return [...rowTokens, { text: separator, bold: false }];
    });
    return wrapTokens(ctx, tokens, maxWidth, fontSize, fontFamily);
  }

  return rows.flatMap((row) => wrapTokens(ctx, tokenizeRow(row, options), maxWidth, fontSize, fontFamily));
}

function drawMetadataLine(ctx, line, x, y, fontSize, fontFamily) {
  let cursorX = x;
  line.forEach((token) => {
    ctx.font = `${token.bold ? '700 ' : ''}${fontSize}px ${fontFamily}`;
    ctx.fillText(token.text, cursorX, y);
    cursorX += ctx.measureText(token.text).width;
  });
}

export function getMetadataBand(ctx, options, width) {
  const fontSize = clampNumber(options.metadataFontSize, 24, 10, 96);
  const padding = clampNumber(options.metadataPadding, 10, 0, 160);
  const gap = clampNumber(options.metadataGap, 10, 0, 96);
  const fontFamily = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Arial, Helvetica, sans-serif';
  const lineHeight = Math.ceil(fontSize * 1.35);
  const lines = buildMetadataLines(ctx, options, width, fontSize, fontFamily, padding);

  if (!lines.length) {
    return null;
  }

  return {
    lines,
    fontSize,
    padding,
    gap,
    fontFamily,
    lineHeight,
    height: padding * 2 + lines.length * lineHeight + Math.max(0, lines.length - 1) * gap
  };
}

export function drawMetadataBand(ctx, band, options, width, y) {
  ctx.fillStyle = options.metadataBackgroundColor || '#000000';
  ctx.fillRect(0, y, width, band.height);
  ctx.fillStyle = options.metadataTextColor || '#ffffff';
  ctx.textBaseline = 'top';

  let lineY = y + band.padding;
  band.lines.forEach((line) => {
    drawMetadataLine(ctx, line, band.padding, lineY, band.fontSize, band.fontFamily);
    lineY += band.lineHeight + band.gap;
  });
}

export function scaleMetadataOptions(options, scale) {
  return {
    ...options,
    metadataFontSize: clampNumber(options.metadataFontSize, 24, 10, 96) * scale,
    metadataPadding: clampNumber(options.metadataPadding, 10, 0, 160) * scale,
    metadataGap: clampNumber(options.metadataGap, 10, 0, 96) * scale
  };
}
