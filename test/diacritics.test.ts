import { expect, test } from 'vitest';
import { removeDiacritics } from '../src/emv/diacritics';

test.each([
  ['Thanh toán Đơn hàng', 'Thanh toan Don hang'],
  ['Thanh toán đơn hàng Đ123 đ/Đ 😀 中', 'Thanh toan don hang D123 d/D 😀 中'],
  ['a\u0301 e\u0323\u0302', 'a e'],
  ['A\0\t\n\r\u007f\u0085B', 'AB'],
  ['  ASCII  ', '  ASCII  '],
  ['', ''],
  [' \t\n\u0085\u00a0\u2003', ''],
  ['\ufeff', '\ufeff'],
  ['क\u093e', 'का'],
  ['\u1100\u1161', '가'],
  ['\ud834\udd67', '\ud834\udd67'],
])('removeDiacritics normalizes %j', (text, expected) => {
  expect(removeDiacritics(text)).toBe(expected);
});
