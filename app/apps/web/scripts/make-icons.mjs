// Generates the PWA icons (PNG) without dependencies: navy square + cyan ring + dot,
// matching public/favicon.svg. Run: node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// Navy "system window" with a cyan ring.
const BG = [0x05, 0x12, 0x2e];
const FG = [0x7d, 0xd3, 0xfc];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Coverage (0–1) of a pixel by the shape, with 4×4 supersampling. */
function render(size, { rounded }) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2;
  const radius = rounded ? size * 0.22 : 0;
  const ringR = size * 0.3;
  const ringW = size * 0.075;
  const dotR = size * 0.09;
  const S = 4;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S;
          const py = y + (sy + 0.5) / S;
          // rounded square
          const dx = Math.max(radius - px, px - (size - radius), 0);
          const dy = Math.max(radius - py, py - (size - radius), 0);
          const inBg = radius === 0 || dx * dx + dy * dy <= radius * radius;
          if (!inBg) continue;
          bg++;
          const d = Math.hypot(px - c, py - c);
          if (Math.abs(d - ringR) <= ringW / 2 || d <= dotR) fg++;
        }
      }
      const a = bg / (S * S);
      const f = bg ? fg / bg : 0;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] * (1 - f) + FG[i] * f);
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = new URL("../public/", import.meta.url);
writeFileSync(new URL("icon-192.png", out), render(192, { rounded: true }));
writeFileSync(new URL("icon-512.png", out), render(512, { rounded: true }));
// Maskable + Apple: full bleed; the OS applies its own mask. Logo stays inside the safe zone.
writeFileSync(new URL("icon-maskable-512.png", out), render(512, { rounded: false }));
writeFileSync(new URL("apple-touch-icon.png", out), render(180, { rounded: false }));
console.log("icons written");
