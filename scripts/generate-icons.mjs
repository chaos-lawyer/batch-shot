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
    color = mix(hex("#1f6feb"), hex("#0d1117"), (x * 0.34 + y * 0.66) / 128);
    const wave = y < 66 && y > 16 + Math.sin(x / 13) * 8 + x * 0.15;
    if (wave) color = over(color, [88, 166, 255, 64]);
  }

  const shadowShapes = [
    [25, 35, 57, 70, 8],
    [35, 27, 57, 70, 8],
    [45, 37, 57, 70, 8],
    [70, 77, 38, 30, 8],
  ];
  for (const [sx, sy, sw, sh, sr] of shadowShapes) {
    if (inRoundRect(x, y, sx, sy + 5, sw, sh, sr)) color = over(color, [1, 4, 9, 42]);
  }

  if (inRoundRect(x, y, 25, 28, 57, 70, 8)) color = over(color, [139, 148, 158, 184]);
  if (inRoundRect(x, y, 35, 20, 57, 70, 8)) color = hex("#c9d1d9");
  if (inRoundRect(x, y, 45, 30, 57, 70, 8)) color = mix(hex("#ffffff"), hex("#c9d1d9"), (y - 30) / 70);

  const bars = [
    [52, 39, 42, 7, 3.5, hex("#2f81f7")],
    [52, 53, 24, 5, 2.5, hex("#8b949e")],
    [52, 64, 34, 5, 2.5, hex("#8b949e")],
    [52, 75, 28, 5, 2.5, hex("#8b949e")],
  ];
  for (const [bx, by, bw, bh, br, fill] of bars) {
    if (inRoundRect(x, y, bx, by, bw, bh, br)) color = fill;
  }

  const stroke = (cond) => {
    if (cond) color = hex("#f0f6fc");
  };
  const nearLine = (x1, y1, x2, y2, width) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    return (x - px) ** 2 + (y - py) ** 2 <= (width / 2) ** 2;
  };
  stroke(nearLine(30, 46, 30, 34, 7.5) || nearLine(30, 34, 39, 25, 7.5) || nearLine(39, 25, 51, 25, 7.5));
  stroke(nearLine(98, 82, 98, 94, 7.5) || nearLine(98, 94, 89, 103, 7.5) || nearLine(89, 103, 77, 103, 7.5));

  if (inRoundRect(x, y, 70, 70, 38, 30, 8)) color = hex("#0d1117");
  const reportBars = [
    [76, 78, 26, 4, 2, hex("#3fb950")],
    [76, 87, 11, 4, 2, hex("#58a6ff")],
    [91, 87, 11, 4, 2, hex("#58a6ff")],
  ];
  for (const [bx, by, bw, bh, br, fill] of reportBars) {
    if (inRoundRect(x, y, bx, by, bw, bh, br)) color = fill;
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
