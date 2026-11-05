import { createCanvas, GlobalFonts, loadImage, SvgExportFlag, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { assetPath, readAsset } from '../assets';
import { findBank, getBankLogo } from '../banks/catalog';
import type { ServiceType } from '../emv/payload';
import { upperInvariant } from '../emv/payload';
import { assertSurface } from '../image/limits';
import { buildMatrix, drawModules } from './qr-matrix';

const FONT = 'Google Sans';
let fontReady = false;
function ensureFont(): void {
  if (fontReady) return;
  if (!GlobalFonts.registerFromPath(assetPath('fonts/GoogleSans-Regular.ttf'), FONT)) throw new Error('Cannot register bundled font');
  fontReady = true;
}

export interface CardInput {
  template: 'compact' | 'print';
  bankBin?: string; bankName?: string; bankFullName?: string;
  bankLogo?: Buffer; // already validated caller bytes
  accountNo?: string; accountName?: string; amount?: number; description?: string;
  serviceType?: ServiceType;
  centerLogo: Buffer; // already validated, or the bundled icon
}

const blank = (s: string | undefined): s is undefined => !s || !s.trim();
const navy = 'rgb(0,59,112)';
// C# Math.Round is banker's rounding.
const roundEven = (x: number) => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r; };
const vnd = (n: number) => `${String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} VND`;

/** Upstream bank auto-fill: BIN first, then name. */
function resolveBank(o: CardInput) {
  let { bankBin, bankName, bankFullName } = o;
  if (bankBin) {
    const info = findBank(bankBin);
    if (info) { bankName ??= info.shortName; bankFullName ??= info.name; }
  } else if (bankName) {
    const info = findBank(bankName);
    if (info) { bankBin ??= info.bin; bankFullName ??= info.name; }
  }
  const displayBankName = !blank(bankFullName) ? bankFullName.trim() : (bankName ?? '');
  return { bankBin, bankName, displayBankName };
}

function printLines(o: CardInput, displayBankName: string): Array<[string, boolean, number]> {
  const lines: Array<[string, boolean, number]> = [];
  if (o.amount !== undefined && o.amount > 0) lines.push([`Số tiền: ${vnd(o.amount)}`, false, 16]);
  if (!blank(o.description)) lines.push([`Nội dung CK: ${o.description.trim()}`, false, 16]);
  if (!blank(o.accountName)) lines.push([`Tên chủ TK: ${upperInvariant(o.accountName.trim())}`, false, 16]);
  if (!blank(o.accountNo)) lines.push([`${o.serviceType === 'card' ? 'Số thẻ' : 'Số TK'}: ${o.accountNo.trim()}`, true, 18]);
  if (!blank(displayBankName)) lines.push([displayBankName, false, 15]);
  return lines;
}

/** Port of CalculateCardDimensions. */
export function cardSize(o: CardInput): [number, number] {
  if (o.template !== 'print') return [540, 540];
  return [600, 590 + printLines(o, resolveBank(o).displayBankName).length * 28 + 16];
}

/** Port of GetVisualBounds: non-background bounding box and mean ink row. */
function visualBounds(img: Image) {
  const c = createCanvas(img.width, img.height).getContext('2d');
  c.drawImage(img, 0, 0);
  const { data } = c.getImageData(0, 0, img.width, img.height);
  let minX = img.width, maxX = 0, minY = img.height, maxY = 0, sumY = 0, count = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (data[i + 3] <= 15 || (data[i] >= 248 && data[i + 1] >= 248 && data[i + 2] >= 248)) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      sumY += y; count++;
    }
  }
  if (!count) return { x: 0, y: 0, w: img.width, h: img.height, centerY: img.height / 2 };
  return { x: minX, y: minY, w: maxX + 1 - minX, h: maxY + 1 - minY, centerY: sumY / count };
}

// Skia fake-bold (SKFont.Embolden): outline grows by size * ratio, ratio 1/24 at <=9px to 1/32 at >=36px.
function boldText(ctx: SKRSContext2D, text: string, x: number, y: number, size: number): void {
  const t = Math.min(1, Math.max(0, (size - 9) / 27));
  ctx.lineWidth = size * (1 / 24 + t * (1 / 32 - 1 / 24));
  ctx.strokeStyle = ctx.fillStyle;
  ctx.fillText(text, x, y);
  ctx.strokeText(text, x, y);
}

/** Port of QrImageService.RenderCardCanvasAsync onto a raster or SVG canvas. */
export async function drawCard(payload: string, o: CardInput, target: 'raster' | 'svg') {
  ensureFont();
  const [width, height] = cardSize(o);
  assertSurface(width, height);
  const canvas = target === 'svg' ? createCanvas(width, height, SvgExportFlag.ConvertTextToPaths) : createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const isPrint = o.template === 'print';
  const { bankBin, bankName, displayBankName } = resolveBank(o);
  const lines = isPrint ? printLines(o, displayBankName) : [];

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Header logo
  const header = await loadImage(readAsset('vietqr.png'));
  const hb = visualBounds(header);
  const targetH = isPrint ? 48 : 46;
  const targetW = Math.trunc(targetH * (hb.w / hb.h));
  ctx.drawImage(header, hb.x, hb.y, hb.w, hb.h, Math.trunc((width - targetW) / 2), isPrint ? 24 : 18, targetW, targetH);

  // Frame and QR
  const frame = 374, frameX = Math.trunc((width - frame) / 2), frameY = isPrint ? 96 : 84;
  ctx.strokeStyle = navy;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(frameX, frameY, frame, frame);
  drawModules(ctx, buildMatrix(payload), frameX + 9, frameY + 9, frame - 18);

  // Center icon
  const icon = await loadImage(o.centerLogo);
  const box = 58, boxX = Math.trunc((width - box) / 2), boxY = frameY + Math.trunc((frame - box) / 2);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, box, box, 5);
  ctx.fill();
  ctx.drawImage(icon, Math.trunc((width - 46) / 2), frameY + Math.trunc((frame - 46) / 2), 46, 46);

  // Footer: Napas247 | bank logo or bank label
  const footerY = isPrint ? 516 : 495;
  const napas = await loadImage(readAsset('napas247.png'));
  const nb = visualBounds(napas);
  const scale = 35 / nb.h;
  const napasW = Math.trunc(nb.w * scale), napasH = Math.trunc(nb.h * scale);

  const bankBytes = o.bankLogo ?? (bankBin ? getBankLogo(bankBin.trim()) : undefined) ?? (bankName ? logoByName(bankName) : undefined);
  const bank = bankBytes ? await loadImage(bankBytes) : undefined;
  // Unknown BIN with no name: show the BIN instead of an empty slot.
  const label = bankName ?? bankBin;
  const bankFont = `24px "${FONT}"`;
  let bankW = 0, bankH = 0, bb = { x: 0, y: 0, w: 0, h: 0, centerY: 0 }, bankScale = scale, textMidY = 0;
  if (bank) {
    bb = visualBounds(bank);
    bankScale = 35 / Math.max(1, bb.h);
    if (bank.width >= 800 && bank.height >= 300) bankScale = scale;
    if (bb.h * bankScale > 42) bankScale = 42 / bb.h;
    if (bb.w * bankScale > 220) bankScale = 220 / bb.w;
    bankW = Math.trunc(bb.w * bankScale);
    bankH = Math.trunc(bb.h * bankScale);
  } else if (!blank(label)) {
    ctx.font = bankFont;
    const m = ctx.measureText(label);
    bankW = Math.trunc(m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
    textMidY = (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2;
  }

  const gap = 14, lineW = 2;
  const napasX = Math.trunc((width - (napasW + gap + lineW + gap + bankW)) / 2);
  const sepX = napasX + napasW + gap + lineW / 2;
  const bankX = sepX + lineW / 2 + gap;
  ctx.strokeStyle = navy;
  ctx.lineWidth = lineW;
  ctx.beginPath();
  ctx.moveTo(sepX, footerY - 18);
  ctx.lineTo(sepX, footerY + 18);
  ctx.stroke();

  ctx.drawImage(napas, nb.x, nb.y, nb.w, nb.h, napasX, roundEven(footerY - (nb.centerY - nb.y) * scale), napasW, napasH);
  if (bank) {
    ctx.drawImage(bank, bb.x, bb.y, bb.w, bb.h, bankX, roundEven(footerY - (bb.centerY - bb.y) * bankScale), bankW, bankH);
  } else if (!blank(label)) {
    ctx.font = bankFont;
    ctx.fillStyle = 'rgb(0,82,155)';
    ctx.textAlign = 'left';
    boldText(ctx, label, bankX, footerY - textMidY, 24);
  }

  // Print detail lines
  ctx.fillStyle = navy;
  ctx.textAlign = 'center';
  let y = 566;
  for (const [text, bold, size] of lines) {
    ctx.font = `${size}px "${FONT}"`;
    if (bold) boldText(ctx, text, width / 2, y, size);
    else ctx.fillText(text, width / 2, y);
    y += bold ? 29 : 26;
  }
  return { canvas, width, height };
}

function logoByName(name: string): Buffer | undefined {
  const bin = findBank(name)?.bin;
  return bin ? getBankLogo(bin) : undefined;
}
