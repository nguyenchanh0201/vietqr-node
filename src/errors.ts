const messages = {
  'qr.missing_param': 'Thiếu tham số bắt buộc (bankBin, accountNo, amount, description).',
  'qr.invalid_amount': 'Số tiền không hợp lệ (nhỏ hơn hoặc bằng 0).',
  'qr.invalid_bin': 'Mã BIN sai định dạng (bắt buộc đúng 6 chữ số).',
  'qr.bank_not_found': 'Không tìm thấy thông tin ngân hàng trong danh mục NAPAS.',
  'qr.invalid_template': "Template không hợp lệ (chỉ chấp nhận 'compact', 'qr_only' hoặc 'print').",
  'qr.system_error': 'Lỗi xử lý hệ thống.',
  'qr.invalid_payload': 'Chuỗi mã QR không đúng định dạng EMVCo TLV hoặc vượt quá độ dài cho phép.',
  'qr.invalid_crc': 'Mã kiểm tra CRC16 (Tag 63) không khớp với nội dung dữ liệu mã QR.',
  'qr.not_vietqr': 'Mã QR không phải là mã thanh toán VietQR hợp lệ (thiếu Tag 38 hoặc AID A000000727).',
  'qr.image_decode_failed': 'Không tìm thấy hoặc không thể giải mã mã QR từ hình ảnh cung cấp.',
  'qr.image_too_large': 'Hình ảnh vượt quá giới hạn kích thước cho phép.',
  'qr.invalid_image': 'Dữ liệu hình ảnh không hợp lệ hoặc không được hỗ trợ.',
  'qr.invalid_render_size': 'Kích thước render phải là số nguyên từ 1 đến 4096.',
} as const;

export type VietQrErrorCode = keyof typeof messages;

export class VietQrError extends Error {
  readonly code: VietQrErrorCode;

  constructor(code: VietQrErrorCode) {
    super(messages[code]);
    this.name = 'VietQrError';
    this.code = code;
  }
}
