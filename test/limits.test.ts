import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@napi-rs/canvas', async (original) => ({
  ...(await original<typeof import('@napi-rs/canvas')>()),
  loadImage: vi.fn(),
}));

import { loadImage } from '@napi-rs/canvas';
import {
  MAX_AXIS, MAX_BASE64_CHARS, MAX_IMAGE_BYTES, MAX_PIXELS, MAX_RENDER_SIZE,
  assertImageBytes, assertRenderSize, assertSurface, decodeBase64Logo, inspectImageHeader,
} from '../src/image/limits';

const dir = join(__dirname, 'fixtures/images');
const fixture = (name: string) => readFileSync(join(dir, name));
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as { code?: string }).code; }
  return 'no-throw';
};

afterEach(() => vi.restoreAllMocks());

describe('constants', () => {
  it('match the spec', () => {
    expect([MAX_IMAGE_BYTES, MAX_PIXELS, MAX_AXIS, MAX_RENDER_SIZE]).toEqual([10 * 1024 * 1024, 16_000_000, 8192, 4096]);
    expect(MAX_BASE64_CHARS).toBe(13_981_016);
  });
});

describe('header fixtures', () => {
  const sized = readdirSync(dir).filter((f) => /^\w+-\d+x\d+\./.test(f));
  it('has every planned fixture under 1 KB', () => {
    expect(sized.length).toBe(33);
    for (const f of readdirSync(dir).filter((n) => n !== "make.ts")) expect(readFileSync(join(dir, f)).length).toBeLessThan(1024);
  });

  for (const name of sized) {
    const [, kind, w, h] = /^(\w+)-(\d+)x(\d+)\./.exec(name)!;
    const width = Number(w), height = Number(h);
    const format = kind === 'png' ? 'png' : kind === 'jpeg' ? 'jpeg' : 'webp';
    it(`${name}: reads dims and applies limits`, () => {
      expect(inspectImageHeader(fixture(name))).toEqual({ format, width, height });
      const expected = width === 0 || height === 0 ? 'qr.invalid_image'
        : width > MAX_AXIS || height > MAX_AXIS || width * height > MAX_PIXELS ? 'qr.image_too_large' : 'no-throw';
      expect(code(() => assertImageBytes(fixture(name)))).toBe(expected);
    });
  }

  it('limit boundaries behave as specified', () => {
    expect(assertImageBytes(fixture('png-8192x1.png'))).toEqual({ format: 'png', width: 8192, height: 1 });
    expect(assertImageBytes(fixture('vp8l-4000x4000.webp')).width).toBe(4000);
    expect(code(() => assertImageBytes(fixture('vp8x-8193x1.webp')))).toBe('qr.image_too_large');
    expect(code(() => assertImageBytes(fixture('jpeg-4001x4000.jpg')))).toBe('qr.image_too_large');
  });

  it('reads headers from a byteOffset view', () => {
    const backing = Buffer.concat([Buffer.alloc(7, 0xaa), fixture('png-100x100.png')]);
    const view = new Uint8Array(backing.buffer, backing.byteOffset + 7, backing.length - 7);
    expect(inspectImageHeader(view)).toEqual({ format: 'png', width: 100, height: 100 });
  });
});

describe('malformed input', () => {
  it.each(['png-truncated.png', 'random.bin'])('%s is qr.invalid_image', (name) => {
    expect(code(() => inspectImageHeader(fixture(name)))).toBe('qr.invalid_image');
    expect(code(() => assertImageBytes(fixture(name)))).toBe('qr.invalid_image');
  });

  it('rejects empty, GIF and JPEG regressions from the spike', () => {
    const cases = [
      new Uint8Array(0),
      Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00', 'latin1'),
      Buffer.from([0xff, 0xd8, ...Array(10).fill(0xff)]),
      Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x02, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x00]),
      Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9, 0, 0, 0, 0]),
    ];
    for (const bytes of cases) expect(code(() => assertImageBytes(bytes))).toBe('qr.invalid_image');
  });

  it('walks a large APP1 segment to the SOF', () => {
    const jpeg = fixture('jpeg-100x100.jpg');
    const app1 = Buffer.alloc(60_004);
    app1.set([0xff, 0xe1]); app1.writeUInt16BE(60_002, 2);
    const big = Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
    expect(inspectImageHeader(big)).toEqual({ format: 'jpeg', width: 100, height: 100 });
  });

  it('rejects more than MAX_IMAGE_BYTES before reading the header', () => {
    expect(code(() => assertImageBytes(Buffer.alloc(MAX_IMAGE_BYTES + 1)))).toBe('qr.image_too_large');
  });
});

describe('decodeBase64Logo', () => {
  it('rejects an oversized encoded string before decoding', () => {
    const from = vi.spyOn(Buffer, 'from');
    expect(code(() => decodeBase64Logo('A'.repeat(14_000_000)))).toBe('qr.image_too_large');
    expect(code(() => decodeBase64Logo('A'.repeat(MAX_BASE64_CHARS + 1)))).toBe('qr.image_too_large');
    expect(from.mock.calls.some((c) => (c as unknown[])[1] === "base64")).toBe(false);
  });

  it('decodes with or without a data: prefix', () => {
    const png = fixture('png-100x100.png');
    expect(decodeBase64Logo(png.toString('base64'))).toEqual(png);
    expect(decodeBase64Logo(`data:image/png;base64,${png.toString('base64')}`)).toEqual(png);
  });

  it('accepts exactly the encoded bound and still caps decoded bytes', () => {
    // 13,981,016 chars of 'A' decode to 10,485,762 bytes > 10 MiB.
    expect(code(() => decodeBase64Logo('A'.repeat(MAX_BASE64_CHARS)))).toBe('qr.image_too_large');
    expect(decodeBase64Logo('A'.repeat(MAX_BASE64_CHARS - 4)).length).toBe(MAX_IMAGE_BYTES - 1);
  });
});

describe('assertRenderSize / assertSurface', () => {
  it.each([0, 4097, 1.5, NaN, Infinity, '500', -1, undefined])('rejects %s', (v) => {
    expect(code(() => assertRenderSize(v))).toBe('qr.invalid_render_size');
  });
  it('accepts 1 and 4096 unchanged', () => {
    expect(assertRenderSize(1)).toBe(1);
    expect(assertRenderSize(4096)).toBe(4096);
  });
  it('caps surfaces at 16M pixels and rejects non-finite or empty surfaces', () => {
    expect(() => assertSurface(4000, 4000)).not.toThrow();
    expect(code(() => assertSurface(4096, 4096))).toBe('qr.image_too_large');
    for (const [w, h] of [[0, 10], [10, NaN], [Infinity, 1], [1.5, 2]]) {
      expect(code(() => assertSurface(w, h))).toBe('qr.image_too_large');
    }
  });
});

it('rejects oversized dimensions from header without decoding', () => {
  const png60000 = fixture('png-60000x60000.png');
  expect(code(() => assertImageBytes(png60000))).toBe('qr.image_too_large');
  expect(loadImage).not.toHaveBeenCalled();
});
