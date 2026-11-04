import { VietQrError } from '../errors';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 16_000_000;
export const MAX_AXIS = 8192;
export const MAX_RENDER_SIZE = 4096;
export const MAX_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

export interface ImageHeader {
  format: 'png' | 'jpeg' | 'webp';
  width: number;
  height: number;
}

const ascii = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

// Header-only read (spike Decision 2); never decodes pixels. Returns null for anything unrecognised.
function sniff(buf: Uint8Array): ImageHeader | null {
  if (buf.length < 12) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  if (buf[0] === 0x89 && ascii(buf, 1).slice(0, 3) === 'PNG' && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    if (buf.length < 24 || ascii(buf, 12) !== 'IHDR') return null;
    return { format: 'png', width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off < buf.length) {
      if (buf[off] !== 0xff) return null;
      while (off < buf.length && buf[off] === 0xff) off++;
      if (off >= buf.length) return null;
      const marker = buf[off++];
      if (marker === 0xd9 || marker === 0xda) return null;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0 || off + 2 > buf.length) return null;
      const len = view.getUint16(off);
      if (len < 2 || off + len > buf.length) return null;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (len < 7) return null;
        return { format: 'jpeg', width: view.getUint16(off + 5), height: view.getUint16(off + 3) };
      }
      off += len;
    }
    return null;
  }

  if (buf.length >= 30 && ascii(buf, 0) === 'RIFF' && ascii(buf, 8) === 'WEBP') {
    const chunk = ascii(buf, 12);
    if (chunk === 'VP8 ') {
      if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
      return { format: 'webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      if (buf[20] !== 0x2f) return null;
      const bits = view.getUint32(21, true);
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
      const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
      return { format: 'webp', width: w + 1, height: h + 1 };
    }
  }
  return null;
}

export function inspectImageHeader(bytes: Uint8Array): ImageHeader {
  const header = sniff(bytes);
  if (!header) throw new VietQrError('qr.invalid_image');
  return header;
}

/** Byte cap, header, and dimension limits — call before any native decode. */
export function assertImageBytes(bytes: Uint8Array): ImageHeader {
  if (bytes.length > MAX_IMAGE_BYTES) throw new VietQrError('qr.image_too_large');
  const header = inspectImageHeader(bytes);
  const { width, height } = header;
  if (width === 0 || height === 0) throw new VietQrError('qr.invalid_image');
  if (width > MAX_AXIS || height > MAX_AXIS || width * height > MAX_PIXELS) throw new VietQrError('qr.image_too_large');
  return header;
}

export function decodeBase64Logo(b64: string): Buffer {
  const body = b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
  if (body.length > MAX_BASE64_CHARS) throw new VietQrError('qr.image_too_large');
  const bytes = Buffer.from(body, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw new VietQrError('qr.image_too_large');
  return bytes;
}

export function assertSurface(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new VietQrError('qr.image_too_large');
  }
}

export function assertRenderSize(size: unknown): number {
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_RENDER_SIZE) {
    throw new VietQrError('qr.invalid_render_size');
  }
  return size;
}
