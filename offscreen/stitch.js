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

function getSegmentScale(image, metrics) {
  const fallback = Number(metrics.devicePixelRatio) || 1;
  const scaleX = metrics.viewportWidth
    ? image.width / metrics.viewportWidth
    : fallback;
  const scaleY = metrics.viewportHeight
    ? image.height / metrics.viewportHeight
    : fallback;

  return {
    x: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : fallback,
    y: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : fallback
  };
}

export async function stitchImages(segments, metrics, options) {
  const images = await Promise.all(segments.map((segment) => loadImage(segment.dataUrl)));
  const firstImage = images[0];
  const scale = firstImage ? getSegmentScale(firstImage, metrics) : {
    x: Number(metrics.devicePixelRatio) || 1,
    y: Number(metrics.devicePixelRatio) || 1
  };
  const metadataScale = Math.max(scale.x, scale.y);
  const { scrollHeight, scrollWidth, viewportWidth } = metrics;
  const measuringCanvas = document.createElement('canvas');
  const measuringContext = measuringCanvas.getContext('2d');
  const baseWidth = Math.round((scrollWidth || viewportWidth) * scale.x);
  const baseHeight = Math.round(scrollHeight * scale.y);
  const scaledMetadataOptions = scaleMetadataOptions(options, metadataScale);
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
    const image = images[i];
    const destX = Math.round((segment.actualScrollX || 0) * scale.x);
    const destY = Math.round(segment.actualScrollY * scale.y) + imageOffsetY;
    const sourceWidth = Math.min(image.width, canvas.width - destX);
    const sourceHeight = Math.min(image.height, baseHeight - Math.round(segment.actualScrollY * scale.y));

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      continue;
    }

    ctx.drawImage(
      image,
      0,
      0,
      sourceWidth,
      sourceHeight,
      destX,
      destY,
      sourceWidth,
      sourceHeight
    );
  }

  if (metadataBand && options.metadataPosition === 'bottom') {
    drawMetadataBand(ctx, metadataBand, scaledMetadataOptions, canvas.width, baseHeight);
  }

  return exportCanvas(canvas, options);
}
