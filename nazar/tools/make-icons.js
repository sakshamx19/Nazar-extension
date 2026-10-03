// Draws the Nazar icon (an evil-eye style ring) as PNGs without any dependencies.
// Usage: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const INK = [16, 35, 28], WHITE = [255, 255, 255], AMBER = [251, 191, 36], TEAL = [15, 118, 110];

function colorAt(x, y) {
  // x, y in 0..1. Rounded square background, then concentric rings.
  const r = 0.22, cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  if (Math.hypot(x - cx, y - cy) > r) return null;
  const d = Math.hypot(x - 0.5, y - 0.5);
  if (d < 0.09) return INK;
  if (d < 0.19) return TEAL;
  if (d < 0.29) return AMBER;
  if (d < 0.37) return WHITE;
  return INK;
}

function png(size) {
  const ss = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = colorAt((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
        if (c) { rr += c[0]; gg += c[1]; bb += c[2]; aa++; }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = aa ? rr / aa : 0; raw[o + 1] = aa ? gg / aa : 0; raw[o + 2] = aa ? bb / aa : 0;
      raw[o + 3] = Math.round(aa / (ss * ss) * 255);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const TABLE = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return c ^ -1; }

const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const s of [16, 48, 128]) fs.writeFileSync(path.join(dir, `icon${s}.png`), png(s));
console.log('icons written to', dir);
