import { expect, test } from 'vitest';
import { calcCrc, genCrcCode, verifyCrc } from '../src/emv/crc';
import { VietQrError, type VietQrErrorCode } from '../src/errors';

const BODY = '00020101021238540010A00000072701240006970422011003456789010208QRIBFTTA53037045802VN6304';

test('calcCrc matches EMV reference', () => {
  expect(calcCrc('123456789')).toBe(0x29b1);
  expect(genCrcCode('123456789')).toBe('29B1');
  expect(calcCrc('')).toBe(0xffff);
  expect(genCrcCode('')).toBe('FFFF');
  expect(genCrcCode('\0')).toBe('E1F0');
});

test('CRC consumes low bytes of UTF-16 code units, not UTF8 or code points', () => {
  expect(calcCrc('中')).toBe(calcCrc('\u002d'));
  expect(calcCrc('😀')).toBe(calcCrc('=\0'));
});

test('verifyCrc accepts valid', () => expect(verifyCrc(BODY + genCrcCode(BODY))).toBe(true));
test('verifyCrc rejects tampered', () => {
  const sample = BODY + genCrcCode(BODY);
  expect(verifyCrc(sample.replace('0345678901', '0345678902'))).toBe(false);
});
test('verifyCrc requires final 6304 tag and hex, accepts lowercase', () => {
  const crc = genCrcCode(BODY);
  expect(verifyCrc(BODY + crc.toLowerCase())).toBe(true);
  for (const payload of ['', '1234567', BODY + 'ZZZZ', BODY.replace('6304', '6305') + crc, BODY + crc + ' ']) {
    expect(verifyCrc(payload)).toBe(false);
  }
});

test.each([
  ['qr.missing_param', 'Thiếu tham số bắt buộc (bankBin, accountNo, amount, description).'],
  ['qr.invalid_amount', 'Số tiền không hợp lệ (nhỏ hơn hoặc bằng 0).'],
  ['qr.invalid_bin', 'Mã BIN sai định dạng (bắt buộc đúng 6 chữ số).'],
  ['qr.bank_not_found', 'Không tìm thấy thông tin ngân hàng trong danh mục NAPAS.'],
  ['qr.invalid_template', "Template không hợp lệ (chỉ chấp nhận 'compact', 'qr_only' hoặc 'print')."],
  ['qr.system_error', 'Lỗi xử lý hệ thống.'],
  ['qr.invalid_payload', 'Chuỗi mã QR không đúng định dạng EMVCo TLV hoặc vượt quá độ dài cho phép.'],
  ['qr.invalid_crc', 'Mã kiểm tra CRC16 (Tag 63) không khớp với nội dung dữ liệu mã QR.'],
  ['qr.not_vietqr', 'Mã QR không phải là mã thanh toán VietQR hợp lệ (thiếu Tag 38 hoặc AID A000000727).'],
  ['qr.image_decode_failed', 'Không tìm thấy hoặc không thể giải mã mã QR từ hình ảnh cung cấp.'],
] as const)('VietQrError preserves upstream code and message: %s', (code, message) => {
  const error = new VietQrError(code);
  expect(error).toBeInstanceOf(Error);
  expect(error.code).toBe(code);
  expect(error.message).toBe(message);
  expect(error.name).toBe('VietQrError');
});

test.each<VietQrErrorCode>(['qr.image_too_large', 'qr.invalid_image', 'qr.invalid_render_size'])('image error retains stable code %s', (code) => {
  expect(new VietQrError(code).code).toBe(code);
  expect(new VietQrError(code).message.length).toBeGreaterThan(0);
});
