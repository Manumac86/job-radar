// Draws the menu bar template icons (black + alpha; macOS tints them). Run: pnpm tsx scripts/icons.ts
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size: number, alpha: (x: number, y: number) => number): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) row[1 + x * 4 + 3] = Math.round(255 * alpha(x, y));
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Supersampled coverage of a shape defined in a 16-unit box. */
function shape(size: number, inside: (x: number, y: number) => boolean) {
  return (px: number, py: number) => {
    let hit = 0;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        if (inside(((px + (i + 0.5) / 4) * 16) / size, ((py + (j + 0.5) / 4) * 16) / size)) hit++;
    return hit / 16;
  };
}

const d = (x: number, y: number, cx: number, cy: number) => Math.hypot(x - cx, y - cy);
const ring = (x: number, y: number) => Math.abs(d(x, y, 8, 8) - 6) < 0.8;
const ICONS: Record<string, (x: number, y: number) => boolean> = {
  // Radar: ring, sweep line and a blip.
  ok: (x, y) =>
    ring(x, y) ||
    d(x, y, 8, 8) < 1.6 ||
    (Math.abs(x - y) < 0.7 && x > 8 && x < 12.5) ||
    d(x, y, 5.5, 10) < 1,
  // Ring with a solid badge.
  attention: (x, y) =>
    (ring(x, y) && d(x, y, 12.5, 3.5) > 3.2) || d(x, y, 12.5, 3.5) < 2.4 || d(x, y, 8, 8) < 1.6,
  // Hollow ring with a slash.
  stopped: (x, y) => ring(x, y) || (Math.abs(x + y - 16) < 0.7 && d(x, y, 8, 8) < 6),
};

for (const [name, inside] of Object.entries(ICONS)) {
  writeFileSync(join(out, `tray-${name}Template.png`), png(16, shape(16, inside)));
  writeFileSync(join(out, `tray-${name}Template@2x.png`), png(32, shape(32, inside)));
}
console.log(`icons written to ${out}`);
