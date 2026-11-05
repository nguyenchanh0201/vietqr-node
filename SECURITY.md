# CHÍNH SÁCH BẢO MẬT (SECURITY POLICY)

`vietqr-node` xử lý thông tin khởi tạo giao dịch thanh toán ngân hàng, nên an toàn thông tin và bảo mật luôn được ưu tiên hàng đầu.

## 1. Các phiên bản được hỗ trợ

| Phiên bản | Trạng thái hỗ trợ | Runtime |
| :-------- | :---------------: | :------ |
| `0.x` (bản mới nhất) | ✅ Nhận bản vá bảo mật | Node.js ≥ 20 |
| Các bản `0.x` cũ hơn | ❌ Vui lòng nâng cấp lên bản mới nhất | |

## 2. Các biện pháp bảo mật đã triển khai

- **Offline-first:** tạo payload, phân tích (parse), giải mã ảnh, render và danh mục ngân hàng đều chạy hoàn toàn trong tiến trình Node. Không có lệnh gọi mạng, không CDN, không tải tài nguyên lúc chạy; WASM của ZXing được đóng gói sẵn trong package. Chỉ client deeplink (`vietqr-node/deeplink`) gọi mạng, tới URL gateway do bạn cấu hình.
- **Kiểm tra đầu vào:**
  - Mã BIN phải đúng 6 chữ số, số tiền phải lớn hơn 0.
  - Các trường trong Tag 62 bị cắt theo chuẩn: tối đa 25 ký tự mỗi trường con, 99 ký tự cho toàn bộ Tag 62.
  - Chuỗi QR được kiểm tra cấu trúc TLV và CRC16 (Tag 63) trước khi trả kết quả.
- **Giới hạn tài nguyên khi xử lý ảnh:**
  - Mỗi ảnh tối đa 10 MiB và 16 triệu pixel, mỗi chiều tối đa 8192 px.
  - Kích thước được kiểm tra từ header ảnh *trước khi* giải mã, để chặn ảnh "decompression bomb".
  - Kích thước render chỉ chấp nhận 1–4096.
- **Chuỗi cung ứng (supply chain):**
  - Package chỉ được phát hành từ GitHub Actions qua npm trusted publishing (OIDC). Không tồn tại npm token nào, và npm từ chối mọi lần publish bằng token.
  - Từ bản 0.1.1, mỗi bản phát hành có npm provenance. Bạn có thể kiểm tra bằng `npm audit signatures`.
  - Dependency runtime được ghim phiên bản chính xác.
  - CI cài đặt với `--ignore-scripts`, và các GitHub Action được ghim theo commit SHA.

## 3. Báo cáo lỗ hổng bảo mật

Nếu bạn phát hiện lỗ hổng, vui lòng **KHÔNG TẠO ISSUE CÔNG KHAI TRÊN GITHUB**. Hãy báo cáo qua kênh riêng tư:

1. **Gửi báo cáo:**
   - Dùng [GitHub Private Vulnerability Reporting](https://github.com/nguyenchanh0201/vietqr-node/security/advisories/new) tại tab **Security** của repository.
   - Hoặc gửi email tới `chanhnguyen34@gmail.com` với tiêu đề `[SECURITY] Lỗ hổng trong vietqr-node`.
2. **Nội dung nên có:**
   - Mô tả bản chất lỗ hổng (ví dụ: ReDoS, vượt giới hạn tài nguyên, bỏ qua kiểm tra CRC, payload sai lệch).
   - Các bước tái hiện (PoC), hoặc chuỗi QR / ảnh đầu vào gây lỗi.
   - Mức độ ảnh hưởng (Nghiêm trọng / Trung bình / Thấp).
   - Đề xuất khắc phục, nếu có.

Bạn sẽ nhận được phản hồi xác nhận trong vòng 7 ngày.

Lỗ hổng nằm trong thư viện gốc .NET cũng nên được báo cho dự án [vietqr-core](https://github.com/Ngochiendev/vietqr-core/security).
