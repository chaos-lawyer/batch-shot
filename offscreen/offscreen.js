function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load captured segment'));
    image.src = dataUrl;
  });
}

function getMimeType(format) {
  if (format === 'jpg') return 'image/jpeg';
  return 'image/png';
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function getExportQuality(options) {
  if (options.format === 'png') {
    return undefined;
  }

  return clampNumber(options.screenshotQuality, 92, 1, 100) / 100;
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas toBlob failed'));
        return;
      }

      resolve(blob);
    }, mimeType, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not convert screenshot to data URL'));
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function formatPdfNumber(value) {
  return Number(value.toFixed(3)).toString();
}

function concatByteParts(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    bytes.set(part, offset);
    offset += part.length;
  });

  return bytes;
}

function createPdfBlob(jpegBytes, imageWidth, imageHeight) {
  const encoder = new TextEncoder();
  const maxPageDimension = 14400;
  const scale = Math.min(1, maxPageDimension / Math.max(imageWidth, imageHeight));
  const pageWidth = formatPdfNumber(imageWidth * scale);
  const pageHeight = formatPdfNumber(imageHeight * scale);
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  const parts = [];
  const offsets = [0];
  let byteLength = 0;

  function addString(value) {
    const bytes = encoder.encode(value);
    parts.push(bytes);
    byteLength += bytes.length;
  }

  function addBytes(bytes) {
    parts.push(bytes);
    byteLength += bytes.length;
  }

  function addObject(id, bodyParts) {
    offsets[id] = byteLength;
    addString(`${id} 0 obj\n`);
    bodyParts.forEach((part) => {
      if (typeof part === 'string') {
        addString(part);
      } else {
        addBytes(part);
      }
    });
    addString('\nendobj\n');
  }

  addString('%PDF-1.4\n%\n');
  addObject(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  addObject(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
  addObject(3, [
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] `,
    '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'
  ]);
  addObject(4, [
    `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} `,
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    jpegBytes,
    '\nendstream'
  ]);
  addObject(5, [
    `<< /Length ${encoder.encode(content).length} >>\nstream\n`,
    content,
    'endstream'
  ]);

  const xrefOffset = byteLength;
  addString('xref\n0 6\n');
  addString('0000000000 65535 f \n');
  for (let id = 1; id <= 5; id += 1) {
    addString(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  addString(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob([concatByteParts(parts)], { type: 'application/pdf' });
}

async function exportCanvas(canvas, options) {
  const quality = getExportQuality(options);

  if (options.format === 'pdf') {
    const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    return blobToDataUrl(createPdfBlob(jpegBytes, canvas.width, canvas.height));
  }

  const blob = await canvasToBlob(canvas, getMimeType(options.format), quality);
  return blobToDataUrl(blob);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDate(isoDate, pattern) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate || '';
  }

  return (pattern || 'YYYY/MM/DD HH:mm')
    .replaceAll('YYYY', String(date.getFullYear()))
    .replaceAll('MM', pad(date.getMonth() + 1))
    .replaceAll('DD', pad(date.getDate()))
    .replaceAll('HH', pad(date.getHours()))
    .replaceAll('mm', pad(date.getMinutes()))
    .replaceAll('ss', pad(date.getSeconds()));
}

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

  const uiLanguage = chrome.i18n?.getUILanguage?.() || '';
  return uiLanguage.toLowerCase().startsWith('zh') ? 'zh_CN' : 'en';
}

function normalizeMetadataField(field) {
  return METADATA_FIELD_ALIASES[String(field).trim().toLowerCase()] || field;
}

function getMetadataRows(options) {
  if (!options.metadataEnabled) {
    return [];
  }

  const context = options.metadataContext || {};
  const dateFormat = options.metadataDateTimeFormat || 'YYYY/MM/DD HH:mm';
  const language = getMetadataLanguage(options);
  const values = {
    capturedAt: formatDate(context.capturedAt, dateFormat),
    url: context.url,
    title: context.title,
    host: context.host,
    index: context.index,
    total: context.total
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

function wrapTokens(ctx, tokens, maxWidth, fontSize, fontFamily) {
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
        const chars = [...part];
        chars.forEach((char) => {
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

function buildMetadataLines(ctx, options, width, fontSize, fontFamily, padding) {
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

function getMetadataBand(ctx, options, width) {
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

function drawMetadataBand(ctx, band, options, width, y) {
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

async function stitchImages(segments, metrics, options) {
  const { scrollHeight, viewportHeight, viewportWidth, devicePixelRatio: dpr } = metrics;
  const measuringCanvas = document.createElement('canvas');
  const measuringContext = measuringCanvas.getContext('2d');
  const baseWidth = Math.round(viewportWidth * dpr);
  const baseHeight = Math.round(scrollHeight * dpr);
  const scaledMetadataOptions = {
    ...options,
    metadataFontSize: clampNumber(options.metadataFontSize, 24, 10, 96) * dpr,
    metadataPadding: clampNumber(options.metadataPadding, 10, 0, 160) * dpr,
    metadataGap: clampNumber(options.metadataGap, 10, 0, 96) * dpr
  };
  const metadataBand = getMetadataBand(measuringContext, scaledMetadataOptions, baseWidth);
  const metadataHeight = metadataBand ? metadataBand.height : 0;
  const imageOffsetY = metadataBand && options.metadataPosition !== 'bottom' ? metadataHeight : 0;
  const canvas = document.createElement('canvas');
  canvas.width = baseWidth;
  canvas.height = baseHeight + metadataHeight;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (metadataBand && options.metadataPosition !== 'bottom') {
    drawMetadataBand(ctx, metadataBand, scaledMetadataOptions, canvas.width, 0);
  }

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const image = await loadImage(segment.dataUrl);
    const destY = Math.round(segment.actualScrollY * dpr) + imageOffsetY;

    if (!segment.isLastFrame) {
      ctx.drawImage(image, 0, destY);
      continue;
    }

    const previousFrameBottom = (segments.length - 1) * viewportHeight;
    const overlap = previousFrameBottom - segment.actualScrollY;
    const overlapPx = Math.round(overlap * dpr);

    if (overlapPx > 0 && overlapPx < image.height) {
      const sourceHeight = image.height - overlapPx;
      const targetDestY = Math.round(previousFrameBottom * dpr) + imageOffsetY;
      ctx.drawImage(
        image,
        0,
        overlapPx,
        image.width,
        sourceHeight,
        0,
        targetDestY,
        canvas.width,
        sourceHeight
      );
    } else {
      ctx.drawImage(image, 0, destY);
    }
  }

  if (metadataBand && options.metadataPosition === 'bottom') {
    drawMetadataBand(ctx, metadataBand, scaledMetadataOptions, canvas.width, baseHeight);
  }

  return exportCanvas(canvas, options);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'stitch') {
    return false;
  }

  stitchImages(message.segments, message.metrics, message.options)
    .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
