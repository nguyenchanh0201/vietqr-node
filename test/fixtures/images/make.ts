// Regenerate header-only image fixtures: `node test/fixtures/images/make.ts` (Node >= 22.18, native type stripping).
// Files are committed; tests never run this script.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const out = dirname(fileURLToPath(import.meta.url));
mkdirSync(out, { recursive: true });

function fits(value: number, bits: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** bits) throw new Error(`${value} does not fit in ${bits} bits`);
}

function png(w: number, h: number): Buffer {
  fits(w, 32); fits(h, 32);
  const ihdr = Buffer.alloc(17);
  ihdr.write('IHDR', 0, 'latin1');
  ihdr.writeUInt32BE(w, 4); ihdr.writeUInt32BE(h, 8);
  ihdr[12] = 8; ihdr[13] = 6; // 8-bit RGBA
  const len = Buffer.alloc(4); len.writeUInt32BE(13);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(ihdr));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), len, ihdr, crc]);
}

function jpeg(w: number, h: number): Buffer {
  fits(w, 16); fits(h, 16);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

function riff(chunk: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(20);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(12 + payload.length, 4);
  head.write('WEBP', 8, 'latin1'); head.write(chunk, 12, 'latin1'); head.writeUInt32LE(payload.length, 16);
  return Buffer.concat([head, payload]);
}

function vp8(w: number, h: number): Buffer {
  fits(w, 14); fits(h, 14);
  const p = Buffer.alloc(10);
  p.set([0x9d, 0x01, 0x2a], 3); p.writeUInt16LE(w, 6); p.writeUInt16LE(h, 8);
  return riff('VP8 ', p);
}

function vp8l(w: number, h: number): Buffer {
  fits(w - 1, 14); fits(h - 1, 14);
  const p = Buffer.alloc(10);
  p[0] = 0x2f; p.writeUInt32LE(((w - 1) | ((h - 1) << 14)) >>> 0, 1);
  return riff('VP8L', p);
}

function vp8x(w: number, h: number): Buffer {
  fits(w - 1, 24); fits(h - 1, 24);
  const p = Buffer.alloc(10);
  p.writeUIntLE(w - 1, 4, 3); p.writeUIntLE(h - 1, 7, 3);
  return riff('VP8X', p);
}

const common: Array<[number, number]> = [[100, 100], [8192, 1], [8193, 1], [4000, 4000], [4001, 4000]];
const writers: Array<[string, string, (w: number, h: number) => Buffer, Array<[number, number]>]> = [
  ['png', 'png', png, [...common, [60000, 60000], [0, 10]]],
  ['jpeg', 'jpg', jpeg, [...common, [60000, 60000], [0, 10]]],
  ['vp8', 'webp', vp8, [...common, [16383, 16383], [0, 10]]],
  ['vp8l', 'webp', vp8l, [...common, [16383, 16383]]],
  ['vp8x', 'webp', vp8x, [...common, [60000, 60000]]],
];

for (const [kind, ext, make, sizes] of writers) {
  for (const [w, h] of sizes) writeFileSync(join(out, `${kind}-${w}x${h}.${ext}`), make(w, h));
}
writeFileSync(join(out, 'png-truncated.png'), png(100, 100).subarray(0, 20));
let seed = 42;
const random = Buffer.alloc(256);
for (let i = 0; i < random.length; i++) random[i] = (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 0xff;
writeFileSync(join(out, 'random.bin'), random);
