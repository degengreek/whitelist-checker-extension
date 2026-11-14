// Run once: node create-icons.js
// Generates icons/icon16.png, icon48.png, icon128.png — no dependencies needed.

import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

function crc32(buf) {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = t[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (~crc) >>> 0;
}

function chunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const lb = Buffer.allocUnsafe(4);
  lb.writeUInt32BE(data.length);
  const cb = Buffer.allocUnsafe(4);
  cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([lb, tb, data, cb]);
}

function makePNG(size) {
  // Dark background: #1a1a2e  green circle: #22c55e
  const BG  = [26,  26,  46];
  const FG  = [34, 197,  94];
  const cx = size / 2, cy = size / 2, r = size * 0.36;

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.allocUnsafe(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const inCircle = Math.sqrt(dx * dx + dy * dy) <= r;
      const col = inCircle ? FG : BG;
      const i = y * (1 + size * 3) + 1 + x * 3;
      raw[i] = col[0]; raw[i+1] = col[1]; raw[i+2] = col[2];
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

if (!existsSync('icons')) mkdirSync('icons');

for (const size of [16, 48, 128]) {
  const file = `icons/icon${size}.png`;
  writeFileSync(file, makePNG(size));
  console.log(`Created ${file}`);
}

console.log('Done.');
