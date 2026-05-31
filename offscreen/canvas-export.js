import { clampNumber } from '../utils/number.js';
import { createPdfBlob } from './pdf.js';

function getMimeType(format) {
  if (format === 'jpg') return 'image/jpeg';
  return 'image/png';
}

function getExportQuality(options) {
  if (options.format === 'png') {
    return undefined;
  }

  return clampNumber(options.screenshotQuality, 92, 1, 100) / 100;
}

export function canvasToBlob(canvas, mimeType, quality) {
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

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not convert screenshot to data URL'));
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

export async function exportCanvas(canvas, options) {
  const quality = getExportQuality(options);

  if (options.format === 'pdf') {
    const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    return blobToDataUrl(createPdfBlob(jpegBytes, canvas.width, canvas.height));
  }

  const blob = await canvasToBlob(canvas, getMimeType(options.format), quality);
  return blobToDataUrl(blob);
}
