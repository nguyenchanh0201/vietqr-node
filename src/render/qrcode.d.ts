// Minimal typing for the part of `qrcode` we use (no @types package needed).
declare module 'qrcode' {
  interface BitMatrix { size: number; get(row: number, col: number): number | boolean }
  const QRCode: { create(text: string, options: { errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' }): { modules: BitMatrix } };
  export default QRCode;
}
