import { exportCanvas } from './canvas-export.js';
import { drawMetadataBand, getMetadataBand, scaleMetadataOptions } from './metadata-overlay.js';

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load captured segment'));
    image.src = dataUrl;
  });
}

export async function stitchImages(segments, metrics, options) {
  const { scrollHeight, viewportHeight, viewportWidth, devicePixelRatio: dpr } = metrics;
  const measuringCanvas = document.createElement('canvas');
  const measuringContext = measuringCanvas.getContext('2d');
  const baseWidth = Math.round(viewportWidth * dpr);
  const baseHeight = Math.round(scrollHeight * dpr);
  const scaledMetadataOptions = scaleMetadataOptions(options, dpr);
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
