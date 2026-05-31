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

export function createPdfBlob(jpegBytes, imageWidth, imageHeight) {
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
