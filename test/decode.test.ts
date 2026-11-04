import { afterEach, describe, expect, it, vi } from 'vitest';

const prepareSpy = vi.hoisted(() => vi.fn());
vi.mock('zxing-wasm/reader', async (original) => {
  const actual = await original<typeof import('zxing-wasm/reader')>();
  return {
    ...actual,
    prepareZXingModule: (...args: Parameters<typeof actual.prepareZXingModule>) => {
      prepareSpy(...args);
      return actual.prepareZXingModule(...args);
    },
  };
});
vi.mock('@napi-rs/canvas', async (original) => {
  const actual = await original<typeof import('@napi-rs/canvas')>();
  return { ...actual, loadImage: vi.fn(actual.loadImage) };
});

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeImage, readQrText } from '../src/decode/decoder';
import { verifyCrc } from '../src/emv/crc';
import { createDynamicAccount, createDynamicCard } from '../src/emv/payload';
import { MAX_IMAGE_BYTES } from '../src/image/limits';
import { render } from '../src/render';

const code = async (p: Promise<unknown>) => p.then(() => 'no-throw', (e) => (e as { code?: string }).code);
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures/images', name));
const loaded = () => vi.mocked(loadImage).mock.calls.map((c) => c[0]);
afterEach(() => vi.mocked(loadImage).mockClear());

const payloads = {
  account: createDynamicAccount('970422', '0123456789', 150000, 'Thanh toán đơn hàng Đ123'),
  card: createDynamicCard('970422', '9704229999999999', 150000, 'Chuyen vao the'),
};

async function rasterize(svg: string): Promise<Buffer> {
  const img = await loadImage(Buffer.from(svg));
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas.encode('png');
}

describe('render → decodeImage round-trip', () => {
  for (const template of ['compact', 'print', 'qr_only'] as const) {
    for (const serviceType of ['account', 'card'] as const) {
      for (const format of ['png', 'jpeg', 'webp', 'svg'] as const) {
        it(`${template} ${serviceType} ${format}`, async () => {
          const payload = payloads[serviceType];
          const out = await render(payload, { template, serviceType, format, bankBin: '970422', accountName: 'NGUYỄN VĂN ĐỨC' });
          const bytes = format === 'svg' ? await rasterize(out as string) : (out as Buffer);
          const info = await decodeImage(bytes);
          expect(info.rawPayload).toBe(payload);
          expect(info.serviceType).toBe(serviceType);
        });
      }
    }
  }
});

// APP1 Exif segment (big-endian TIFF, one IFD entry: Orientation 0x0112 SHORT = `orientation`), spliced right after SOI.
function withOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

describe('EXIF orientation (upstream SKBitmap.Decode ignores it)', () => {
  for (const orientation of [6, 8]) {
    it(`print jpeg with Orientation=${orientation} still decodes`, async () => {
      const jpeg = (await render(payloads.account, { template: 'print', format: 'jpeg', bankBin: '970422' })) as Buffer;
      const rotated = withOrientation(jpeg, orientation);
      expect(await readQrText(rotated)).toBe(payloads.account);
      expect((await decodeImage(rotated)).rawPayload).toBe(payloads.account);
    });
  }

  it('any other decoded-size mismatch is still rejected', async () => {
    const png = (await render(payloads.account, { template: 'qr_only' })) as Buffer;
    const other = createCanvas(300, 500);
    vi.mocked(loadImage).mockResolvedValueOnce(other as unknown as Awaited<ReturnType<typeof loadImage>>);
    expect(await code(readQrText(png))).toBe('qr.image_decode_failed');
  });
});

describe('upstream examples', () => {
  const dir = join(__dirname, 'fixtures/upstream-examples');
  it.each(readdirSync(dir))('%s decodes to a CRC-valid payload', async (name) => {
    const text = await readQrText(readFileSync(join(dir, name)));
    expect(text).toMatch(/^000201/);
    expect(verifyCrc(text!)).toBe(true);
  });
});

describe('no QR / bad input', () => {
  it('blank white image: readQrText → null, decodeImage → qr.image_decode_failed', async () => {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 200, 200);
    const blank = await canvas.encode('png');
    expect(await readQrText(blank)).toBeNull();
    expect(await code(decodeImage(blank))).toBe('qr.image_decode_failed');
  });

  it('valid header with corrupt body → qr.image_decode_failed', async () => {
    expect(await code(decodeImage(fixture('png-100x100.png')))).toBe('qr.image_decode_failed');
  });

  it('passes parse options through', async () => {
    const tampered = payloads.account.slice(0, -4) + '0000';
    const png = (await render(tampered, { template: 'qr_only' })) as Buffer;
    expect(await code(decodeImage(png))).toBe('qr.invalid_crc');
    expect((await decodeImage(png, { strictCrc: false })).isValidCrc).toBe(false);
  });
});

describe('public boundary: rejected uploads never reach loadImage', () => {
  const oversized = fixture('png-60000x60000.png');
  const cases: Array<[string, Uint8Array, string]> = [
    ['oversized header', oversized, 'qr.image_too_large'],
    ['vp8x oversized header', fixture('vp8x-60000x60000.webp'), 'qr.image_too_large'],
    ['too many bytes', Buffer.alloc(MAX_IMAGE_BYTES + 1), 'qr.image_too_large'],
    ['malformed', fixture('random.bin'), 'qr.invalid_image'],
    ['empty', new Uint8Array(0), 'qr.invalid_image'],
  ];
  it.each(cases)('%s', async (_n, bytes, expected) => {
    expect(await code(readQrText(bytes))).toBe(expected);
    expect(await code(decodeImage(bytes))).toBe(expected);
    expect(loaded()).toHaveLength(0);
  });
});

it('initializes zxing once under concurrency', async () => {
  vi.resetModules();
  prepareSpy.mockClear();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('network blocked in test'); }) as typeof fetch;
  try {
    const fresh = await import('../src/decode/decoder');
    const fresh2 = await import('../src/render');
    const png = (await fresh2.render(payloads.account, { template: 'qr_only' })) as Buffer;
    const results = await Promise.all(Array.from({ length: 10 }, () => fresh.decodeImage(png)));
    expect(results.every((r) => r.rawPayload === payloads.account)).toBe(true);
    expect(prepareSpy).toHaveBeenCalledTimes(1);
    expect(prepareSpy.mock.calls[0][0]).toMatchObject({ overrides: { wasmBinary: expect.any(Uint8Array) } });
  } finally {
    globalThis.fetch = realFetch;
  }
});
