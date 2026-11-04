import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { buildMatrix, drawModules } from './qr-matrix';

/** Port of QrImageService.CreateQrOnlySurface. `logo` is already validated. */
export async function drawQrOnly(payload: string, size: number, logo: Buffer, ratio: number): Promise<Canvas> {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const padding = Math.max(10, Math.trunc(size * 0.02));
  const inner = size - padding * 2;
  drawModules(ctx, buildMatrix(payload), padding, padding, inner);

  const box = Math.trunc(inner * ratio);
  const boxXY = Math.trunc((size - box) / 2);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(boxXY, boxXY, box, box, Math.max(4, Math.trunc(box * 0.12)));
  ctx.fill();

  const icon = Math.trunc(box * 0.82);
  const iconXY = Math.trunc((size - icon) / 2);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(await loadImage(logo), iconXY, iconXY, icon, icon);
  return canvas;
}

const f2 = (n: number) => n.toFixed(2);

/** Port of Rendering/VietQrSvgRenderer.Render (hand-written string, no canvas). */
export function qrOnlySvg(payload: string, size: number, logo: Buffer, logoMime: string, ratio: number): string {
  const matrix = buildMatrix(payload);
  const n = matrix.length;
  const padding = Math.max(10, Math.trunc(size * 0.025));
  const inner = size - padding * 2;
  const m = inner / n;

  const logoBox = inner * ratio;
  const logoXY = padding + (inner - logoBox) / 2;
  const boxStart = Math.floor((logoXY - padding) / m);
  const boxEnd = Math.ceil((logoXY + logoBox - padding) / m);

  const path: string[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!matrix[row][col]) continue;
      if (row >= boxStart && row <= boxEnd && col >= boxStart && col <= boxEnd) continue;
      path.push(`M${f2(padding + col * m)},${f2(padding + row * m)}h${f2(m)}v${f2(m)}h-${f2(m)}z`);
    }
  }

  const bg = logoXY - 4, bgSize = logoBox + 8;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    '  <rect width="100%" height="100%" fill="#FFFFFF" />',
    ...(path.length ? [`  <path fill="#000000" d="${path.join(' ')}" />`] : []),
    `  <rect x="${f2(bg)}" y="${f2(bg)}" width="${f2(bgSize)}" height="${f2(bgSize)}" rx="6" ry="6" fill="#FFFFFF" />`,
    `  <image href="data:${logoMime};base64,${logo.toString('base64')}" x="${f2(logoXY)}" y="${f2(logoXY)}" width="${f2(logoBox)}" height="${f2(logoBox)}" preserveAspectRatio="xMidYMid meet" />`,
    '</svg>',
    '',
  ].join('\n');
}
