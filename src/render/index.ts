import type { Canvas } from '@napi-rs/canvas';
import { readAsset } from '../assets';
import type { ServiceType } from '../emv/payload';
import { VietQrError } from '../errors';
import { assertImageBytes, assertRenderSize, assertSurface, decodeBase64Logo } from '../image/limits';
import { drawCard } from './card';
import { drawQrOnly, qrOnlySvg } from './qr-only';

export { buildMatrix } from './qr-matrix';

export type Template = 'compact' | 'print' | 'qr_only';
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'svg';

export interface RenderOptions {
  template?: Template; format?: ImageFormat; size?: number; quality?: number;
  bankBin?: string; bankName?: string; bankFullName?: string; bankLogo?: Uint8Array;
  accountNo?: string; accountName?: string; amount?: number; description?: string; billNumber?: string;
  serviceType?: ServiceType; centerLogo?: Uint8Array | string; centerLogoRatio?: number;
}

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' } as const;

/** Validates caller-supplied image bytes (limits + header) before anything decodes them. */
export function validatedImage(input: Uint8Array | string): { bytes: Buffer; mime: string } {
  const bytes = typeof input === 'string' ? decodeBase64Logo(input) : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  return { bytes, mime: MIME[assertImageBytes(bytes).format] };
}

const formatOf = (f: unknown): ImageFormat => (typeof f === 'string' && Object.hasOwn(MIME, f) ? f as ImageFormat : 'png');
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

async function encode(canvas: Canvas, format: ImageFormat, quality: number): Promise<Buffer> {
  if (format === 'jpeg' || format === 'webp') return canvas.encode(format, quality);
  return canvas.encode('png');
}

export function render(payload: string, opts: RenderOptions & { format: 'svg' }): Promise<string>;
export function render(payload: string, opts?: RenderOptions & { format?: 'png' | 'jpeg' | 'webp' }): Promise<Buffer>;
export function render(payload: string, opts?: RenderOptions): Promise<Buffer | string>;
export async function render(payload: string, opts: RenderOptions = {}): Promise<Buffer | string> {
  if (typeof payload !== 'string' || !payload.trim()) throw new VietQrError('qr.missing_param');
  const template = opts.template ?? 'compact';
  if (template !== 'compact' && template !== 'print' && template !== 'qr_only') throw new VietQrError('qr.invalid_template');
  const format = formatOf(opts.format);
  const size = assertRenderSize(opts.size ?? 500);
  const quality = clamp(Number.isFinite(opts.quality) ? Math.trunc(opts.quality!) : 100, 1, 100);
  const ratio = clamp(Number.isFinite(opts.centerLogoRatio) ? opts.centerLogoRatio! : 0.18, 0.05, 0.35);
  // Upstream treats a blank/empty custom logo as absent.
  const custom = typeof opts.centerLogo === 'string' ? opts.centerLogo.trim() : opts.centerLogo;
  const logo = custom?.length ? validatedImage(custom) : { bytes: readAsset('vietqr_icon.png'), mime: MIME.png };

  if (template !== 'qr_only') {
    const bankLogo = opts.bankLogo?.length ? validatedImage(opts.bankLogo).bytes : undefined;
    const { canvas } = await drawCard(payload, { ...opts, template, bankLogo, centerLogo: logo.bytes }, format === 'svg' ? 'svg' : 'raster');
    if ('getContent' in canvas) return canvas.getContent().toString('utf8');
    return encode(canvas, format, quality);
  }
  assertSurface(size, size);
  if (format === 'svg') return qrOnlySvg(payload, size, logo.bytes, logo.mime, ratio);
  return encode(await drawQrOnly(payload, size, logo.bytes, ratio), format, quality);
}

export async function renderDataUrl(payload: string, opts: RenderOptions = {}): Promise<string> {
  const out = await render(payload, opts);
  const format = formatOf(opts.format);
  return `data:${MIME[format]};base64,${Buffer.from(out).toString('base64')}`;
}
