import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@napi-rs/canvas', async (original) => {
  const actual = await original<typeof import('@napi-rs/canvas')>();
  return { ...actual, loadImage: vi.fn(actual.loadImage) };
});

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAsset } from '../src/assets';
import { createDynamicAccount } from '../src/emv/payload';
import { inspectImageHeader, MAX_IMAGE_BYTES } from '../src/image/limits';
import { buildMatrix, render, renderDataUrl } from '../src/render';

const payload = createDynamicAccount('970422', '0123456789', 50000, 'Thanh toan don hang');
const icon = readAsset('vietqr_icon.png');
const code = async (p: Promise<unknown>) => p.then(() => 'no-throw', (e) => (e as { code?: string }).code);
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures/images', name));
const loaded = () => vi.mocked(loadImage).mock.calls.map((c) => c[0]);

afterEach(() => vi.mocked(loadImage).mockClear());

describe('buildMatrix', () => {
  it('returns a square boolean matrix without quiet zone', () => {
    const m = buildMatrix(payload);
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    expect(m[0].slice(0, 7)).toEqual([true, true, true, true, true, true, true]); // finder pattern
  });
});

describe('payload too long for a QR code', () => {
  it.each(['qr_only', 'compact', 'print'] as const)('%s → qr.invalid_payload', async (template) => {
    await expect(render('A'.repeat(5000), { template })).rejects.toMatchObject({ name: 'VietQrError', code: 'qr.invalid_payload' });
  });
});

describe('center logo white backing (upstream rounded rect under the logo)', () => {
  // size 500, ratio 0.18: raster box 86 at 207 (icon 70 at 215); SVG bg rect 203.16..296.84, logo 207.16..292.84.
  it.each([['png', 209, 215, 70], ['svg', 205, 210, 80]] as const)('%s', async (format, edge, from, len) => {
    const out = await render(payload, { template: 'qr_only', format });
    const img = await loadImage(typeof out === 'string' ? Buffer.from(out) : out);
    const c = createCanvas(img.width, img.height).getContext('2d');
    c.drawImage(img, 0, 0);
    const px = [...c.getImageData(from, edge, len, 1).data, ...c.getImageData(edge, from, 1, len).data];
    expect(Math.min(...px)).toBeGreaterThanOrEqual(250);
  });
});

describe('qr_only raster', () => {
  it('defaults to 500x500 PNG', async () => {
    const png = (await render(payload, { template: 'qr_only' })) as Buffer;
    expect(inspectImageHeader(png)).toEqual({ format: 'png', width: 500, height: 500 });
  });

  it('honours size', async () => {
    const png = (await render(payload, { template: 'qr_only', size: 1000 })) as Buffer;
    expect(inspectImageHeader(png)).toMatchObject({ width: 1000, height: 1000 });
  });

  it('writes JPEG and WebP magic bytes', async () => {
    const jpeg = (await render(payload, { template: 'qr_only', format: 'jpeg', quality: 80 })) as Buffer;
    expect([...jpeg.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const webp = (await render(payload, { template: 'qr_only', format: 'webp' })) as Buffer;
    expect(webp.subarray(0, 4).toString()).toBe('RIFF');
    expect(webp.subarray(8, 12).toString()).toBe('WEBP');
  });

  it('uses vietqr_icon.png as the default center logo', async () => {
    await render(payload, { template: 'qr_only' });
    expect(loaded().some((arg) => Buffer.isBuffer(arg) && arg.equals(icon))).toBe(true);
  });

  it('accepts custom center logo as bytes, base64 and data URL', async () => {
    const custom = readAsset('logos/970422.png');
    const plain = (await render(payload, { template: 'qr_only' })) as Buffer;
    for (const centerLogo of [custom, custom.toString('base64'), `data:image/png;base64,${custom.toString('base64')}`]) {
      const out = (await render(payload, { template: 'qr_only', centerLogo })) as Buffer;
      expect(out.equals(plain)).toBe(false);
    }
  });

  it('clamps centerLogoRatio instead of throwing', async () => {
    const big = (await render(payload, { template: 'qr_only', centerLogoRatio: 0.9 })) as Buffer;
    const max = (await render(payload, { template: 'qr_only', centerLogoRatio: 0.35 })) as Buffer;
    expect(big.equals(max)).toBe(true);
  });
});

describe('qr_only svg', () => {
  it('returns an svg string with viewBox and embedded default icon', async () => {
    const svg = await render(payload, { template: 'qr_only', format: 'svg' });
    expect(typeof svg).toBe('string');
    expect(svg as string).toMatch(/^(<\?xml[^>]*>\s*)?<svg/);
    expect(svg).toContain('viewBox="0 0 500 500"');
    expect(svg).toContain(`data:image/png;base64,${icon.toString('base64')}`);
  });
});

describe('renderDataUrl', () => {
  it.each([
    ['png', 'data:image/png;base64,'], ['jpeg', 'data:image/jpeg;base64,'],
    ['webp', 'data:image/webp;base64,'], ['svg', 'data:image/svg+xml;base64,'],
  ] as const)('%s → %s', async (format, prefix) => {
    expect(await renderDataUrl(payload, { template: 'qr_only', format })).toMatch(new RegExp(`^${prefix.replace(/[+]/g, '\\+')}`));
  });
});

describe('validation', () => {
  it('rejects unknown template', async () => {
    expect(await code(render(payload, { template: 'card' as never }))).toBe('qr.invalid_template');
  });
  it('rejects out-of-range size without clamping', async () => {
    expect(await code(render(payload, { template: 'qr_only', size: 5000 }))).toBe('qr.invalid_render_size');
    expect(await code(render(payload, { template: 'qr_only', size: 4096 }))).toBe('qr.image_too_large');
  });
  it('falls back to png for unknown formats, including prototype keys', async () => {
    expect(await renderDataUrl(payload, { template: 'qr_only', format: 'toString' as never })).toMatch(/^data:image\/png;base64,/);
  });
  it('treats an empty custom logo as absent (upstream)', async () => {
    const plain = (await render(payload, { template: 'qr_only' })) as Buffer;
    expect(((await render(payload, { template: 'qr_only', centerLogo: ' ' })) as Buffer).equals(plain)).toBe(true);
    expect(((await render(payload, { template: 'qr_only', centerLogo: new Uint8Array() })) as Buffer).equals(plain)).toBe(true);
  });
  it('rejects an empty payload', async () => {
    expect(await code(render('  ', { template: 'qr_only' }))).toBe('qr.missing_param');
  });
});

describe('public boundary: custom logos never reach loadImage when rejected', () => {
  const oversizedHeader = fixture('png-60000x60000.png');
  const cases: Array<[string, Uint8Array | string, string]> = [
    ['oversized header bytes', oversizedHeader, 'qr.image_too_large'],
    ['oversized header base64', oversizedHeader.toString('base64'), 'qr.image_too_large'],
    ['too many bytes', Buffer.alloc(MAX_IMAGE_BYTES + 1), 'qr.image_too_large'],
    ['too many base64 chars', 'A'.repeat(14_000_000), 'qr.image_too_large'],
    ['malformed bytes', fixture('random.bin'), 'qr.invalid_image'],
  ];
  for (const format of ['png', 'jpeg', 'webp', 'svg'] as const) {
    it.each(cases)(`${format}: %s`, async (_name, centerLogo, expected) => {
      const got = await code(render(payload, { template: 'qr_only', format, centerLogo }));
      expect(loadImage).not.toHaveBeenCalled(); // validation runs before any drawing
      expect(got).toBe(expected);
    });
  }
});
