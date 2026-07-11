import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const sizes = [16, 32, 48, 128];
const outDir = new URL("../icons/", import.meta.url);

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function png(width, height, rgba) {
  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const src = y * stride;
    const dst = y * (stride + 1);
    rgba.copy(scanlines, dst + 1, src, src + stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (value) => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
  255,
];

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function over(dst, src) {
  const alpha = src[3] / 255;
  const inv = 1 - alpha;
  return [
    Math.round(src[0] * alpha + dst[0] * inv),
    Math.round(src[1] * alpha + dst[1] * inv),
    Math.round(src[2] * alpha + dst[2] * inv),
    255,
  ];
}

function inRoundRect(x, y, rx, ry, w, h, r) {
  const cx = Math.max(rx + r, Math.min(x, rx + w - r));
  const cy = Math.max(ry + r, Math.min(y, ry + h - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function renderPixel(x, y) {
  let color = [0, 0, 0, 0];
  if (inRoundRect(x, y, 0, 0, 128, 128, 28)) {
    color = mix(hex("#15355A"), hex("#0A2540"), (x * 0.32 + y * 0.68) / 128);
    const highlight = y < 72 && y > 16 + Math.sin(x / 18) * 5 + x * 0.28;
    if (highlight) color = over(color, [56, 189, 248, 46]);
  }

  const shadowShapes = [
    [36, 29, 56, 80, 8],
    [24, 45, 80, 72, 8],
    [12, 61, 104, 60, 10],
  ];
  for (const [sx, sy, sw, sh, sr] of shadowShapes) {
    if (inRoundRect(x, y, sx, sy + 5, sw, sh, sr)) color = over(color, [2, 6, 23, 48]);
  }

  if (inRoundRect(x, y, 36, 24, 56, 80, 8)) color = over(color, [56, 189, 248, 220]);
  if (inRoundRect(x, y, 24, 40, 80, 72, 8)) color = over(color, [125, 211, 252, 224]);
  if (inRoundRect(x, y, 12, 56, 104, 60, 10)) color = mix(hex("#FFFFFF"), hex("#EAF4FF"), Math.max(0, y - 56) / 60);

  const nearLine = (x1, y1, x2, y2, width) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    return (x - px) ** 2 + (y - py) ** 2 <= (width / 2) ** 2;
  };
  const dist = (cx, cy) => Math.hypot(x - cx, y - cy);
  const brand = hex("#0A2540");
  const focusRing = dist(64, 86) >= 9.5 && dist(64, 86) <= 16.5;
  const focusDot = dist(64, 86) <= 4.2;
  const focusMarks = nearLine(42, 86, 52, 86, 7)
    || nearLine(76, 86, 86, 86, 7)
    || nearLine(64, 64, 64, 74, 7)
    || nearLine(64, 98, 64, 108, 7);
  if (focusRing || focusDot || focusMarks) color = brand;

  if (dist(96, 72) <= 5.2) {
    color = hex("#10B981");
  }

  return color;
}

function render(size) {
  const scale = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const sample = renderPixel(((x + (sx + 0.5) / scale) / size) * 128, ((y + (sy + 0.5) / scale) / size) * 128);
          for (let i = 0; i < 4; i += 1) acc[i] += sample[i];
        }
      }
      const offset = (y * size + x) * 4;
      for (let i = 0; i < 4; i += 1) rgba[offset + i] = Math.round(acc[i] / (scale * scale));
    }
  }
  return png(size, size, rgba);
}

for (const size of sizes) {
  writeFileSync(join(outDir.pathname, `icon-${size}.png`), render(size));
}
