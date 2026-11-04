import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@napi-rs/canvas', async (original) => {
  const actual = await original<typeof import('@napi-rs/canvas')>();
  return { ...actual, loadImage: vi.fn(actual.loadImage) };
});

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAsset } from '../src/assets';
import { getBankLogo } from '../src/banks/catalog';
import { createDynamicAccount, createDynamicCard } from '../src/emv/payload';
import { inspectImageHeader, MAX_IMAGE_BYTES } from '../src/image/limits';
import { parse } from '../src/parse/parser';
import { render, type RenderOptions } from '../src/render';

const snapshots = join(__dirname, '__snapshots__');
mkdirSync(snapshots, { recursive: true });
const snap = (name: string, png: Buffer) => writeFileSync(join(snapshots, `${name}.png`), png);
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures/images', name));
const code = async (p: Promise<unknown>) => p.then(() => 'no-throw', (e) => (e as { code?: string }).code);
const loaded = () => vi.mocked(loadImage).mock.calls.map((c) => c[0]);
afterEach(() => vi.mocked(loadImage).mockClear());

const account = createDynamicAccount('970422', '0123456789', 150000, 'Thanh toan don hang');
const card = createDynamicCard('970422', '9704229999999999', 150000, 'Thanh toan don hang');
const details: RenderOptions = {
  bankBin: '970422', accountNo: '0123456789', accountName: 'Nguyễn Văn Đức', amount: 150000, description: 'Thanh toán đơn hàng Đ123',
};

// Upstream CalculateCardDimensions: compact fixed; print counts present lines (bank name resolved from catalog).
function expectedSize(template: 'compact' | 'print', o: RenderOptions): [number, number] {
  if (template === 'compact') return [540, 540];
  const lines = [o.amount && o.amount > 0, o.description?.trim(), o.accountName?.trim(), o.accountNo?.trim(), o.bankBin === '970422' || o.bankName?.trim()]
    .filter(Boolean).length;
  return [600, 590 + lines * 28 + 16];
}

describe('template × service type × format × center logo', () => {
  for (const template of ['compact', 'print'] as const) {
    for (const [serviceType, payload] of [['account', account], ['card', card]] as const) {
      for (const format of ['png', 'jpeg', 'webp', 'svg'] as const) {
        for (const custom of [false, true]) {
          const name = `${template}-${serviceType}-${format}${custom ? '-custom-logo' : ''}`;
          it(name, async () => {
            const opts: RenderOptions = { ...details, template, serviceType, format, ...(custom ? { centerLogo: readAsset('logos/970436.png') } : {}) };
            const [w, h] = expectedSize(template, opts);
            const out = await render(payload, opts);
            if (format === 'svg') {
              expect(typeof out).toBe('string');
              expect(out).not.toContain('<text');
              expect(out).toContain(`width="${w}"`);
              expect(out).toContain(`height="${h}"`);
            } else {
              expect(inspectImageHeader(out as Buffer)).toEqual({ format, width: w, height: h });
              if (format === 'png') snap(name, out as Buffer);
            }
          });
        }
      }
    }
  }

  it('print height follows the upstream line count', async () => {
    const minimal = (await render(account, { template: 'print' })) as Buffer;
    expect(inspectImageHeader(minimal)).toMatchObject({ width: 600, height: 606 });
    const full = (await render(account, { ...details, template: 'print' })) as Buffer;
    expect(inspectImageHeader(full)).toMatchObject({ width: 600, height: 746 });
  });
});

it('card service type changes the output and the payload parses as card', async () => {
  const a = (await render(account, { ...details, template: 'print' })) as Buffer;
  const c = (await render(card, { ...details, template: 'print', serviceType: 'card' })) as Buffer;
  expect(a.equals(c)).toBe(false);
  expect(parse(card).serviceType).toBe('card');
});

async function inkTop(png: Buffer, y0: number, y1: number): Promise<number> {
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, y0, img.width, y1 - y0);
  for (let i = 0; i < data.length; i += 4) if (data[i] < 160) return y0 + Math.floor(i / 4 / img.width);
  return -1;
}

it('renders Vietnamese account name without missing glyphs', async () => {
  const withMarks = (await render(account, { template: 'print', accountName: 'NGUYỄN VĂN ĐỨC' })) as Buffer;
  const plain = (await render(account, { template: 'print', accountName: 'NGUYEN VAN DUC' })) as Buffer;
  snap('print-vietnamese-name', withMarks);
  expect(withMarks.equals(plain)).toBe(false);
  // Diacritics sit above the capitals; tofu boxes or dropped marks would not raise the ink line.
  const top = await inkTop(withMarks, 545, 580), plainTop = await inkTop(plain, 545, 580);
  expect(plainTop).toBeGreaterThan(0);
  expect(top).toBeGreaterThan(0);
  expect(top).toBeLessThan(plainTop - 1);
});

it('renders unknown BIN without logo', async () => {
  const unknown = createDynamicAccount('999999', '0123456789', 1000, 'x');
  const out = (await render(unknown, { bankBin: '999999' })) as Buffer;
  const none = (await render(unknown, {})) as Buffer;
  snap('compact-unknown-bin', out);
  expect(inspectImageHeader(out)).toMatchObject({ width: 540, height: 540 });
  expect(out.equals(none)).toBe(false); // BIN drawn as the bank label
});

it('auto-fills bank logo from the catalog when only bankBin is given', async () => {
  await render(account, { bankBin: '970422' });
  const logo = getBankLogo('970422')!;
  expect(loaded().some((arg) => Buffer.isBuffer(arg) && arg.equals(logo))).toBe(true);
});

it('custom bankLogo bytes replace the catalog logo', async () => {
  const custom = readAsset('logos/970436.png');
  await render(account, { bankBin: '970422', bankLogo: custom });
  expect(loaded().some((arg) => Buffer.isBuffer(arg) && arg.equals(custom))).toBe(true);
  expect(loaded().some((arg) => Buffer.isBuffer(arg) && arg.equals(getBankLogo('970422')!))).toBe(false);
});

describe('public boundary: rejected images never reach loadImage', () => {
  const oversized = fixture('png-60000x60000.png');
  const bad: Array<[string, Uint8Array | string, string]> = [
    ['oversized header', oversized, 'qr.image_too_large'],
    ['too many bytes', Buffer.alloc(MAX_IMAGE_BYTES + 1), 'qr.image_too_large'],
    ['malformed', fixture('random.bin'), 'qr.invalid_image'],
  ];
  for (const template of ['compact', 'print'] as const) {
    for (const format of ['png', 'jpeg', 'webp', 'svg'] as const) {
      it.each(bad)(`${template}/${format} bankLogo: %s`, async (_n, bankLogo, expected) => {
        expect(await code(render(account, { template, format, bankLogo: bankLogo as Uint8Array }))).toBe(expected);
        expect(loaded()).not.toContain(bankLogo);
        for (const arg of loaded()) expect(Buffer.from(arg as Uint8Array).equals(oversized)).toBe(false);
      });
      it.each([...bad, ['oversized base64', oversized.toString('base64'), 'qr.image_too_large']] as typeof bad)(
        `${template}/${format} centerLogo: %s`, async (_n, centerLogo, expected) => {
          expect(await code(render(account, { template, format, centerLogo }))).toBe(expected);
          for (const arg of loaded()) expect(Buffer.from(arg as Uint8Array).equals(oversized)).toBe(false);
        });
    }
  }
});
