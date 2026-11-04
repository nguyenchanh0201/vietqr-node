import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { readAsset } from '../assets';
import { VietQrError } from '../errors';
import { assertImageBytes } from '../image/limits';
import { parse, type ParseOptions, type VietQrInfo } from '../parse/parser';

let ready: Promise<unknown> | undefined;

// Local WASM only: without wasmBinary zxing-wasm fetches from jsDelivr. One shared init per module instance.
function zxingReady(): Promise<unknown> {
  ready ??= prepareZXingModule({ overrides: { wasmBinary: readAsset('zxing_reader.wasm') }, fireImmediately: true })
    .catch((error: unknown) => { ready = undefined; throw error; });
  return ready;
}

/** Raw QR text, or null when the image decodes but holds no QR code. Limits are checked before any pixel decode. */
export async function readQrText(bytes: Uint8Array): Promise<string | null> {
  const { width, height } = assertImageBytes(bytes);
  let img: Image;
  try {
    img = await loadImage(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch {
    throw new VietQrError('qr.image_decode_failed');
  }
  if (img.width !== width || img.height !== height) throw new VietQrError('qr.image_decode_failed');
  const ctx = createCanvas(width, height).getContext('2d');
  ctx.drawImage(img, 0, 0);
  await zxingReady();
  const results = await readBarcodes(ctx.getImageData(0, 0, width, height) as Parameters<typeof readBarcodes>[0], { formats: ['QRCode'] });
  if (results.length === 0) return null;
  const hit = results.find((r) => r.isValid);
  if (!hit) throw new VietQrError('qr.image_decode_failed');
  return hit.text;
}

export async function decodeImage(bytes: Uint8Array, opts?: ParseOptions): Promise<VietQrInfo> {
  const text = await readQrText(bytes);
  if (!text?.trim()) throw new VietQrError('qr.image_decode_failed');
  return parse(text, opts);
}
