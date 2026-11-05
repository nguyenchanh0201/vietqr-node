# HƯỚNG DẪN ĐÓNG GÓP MÃ NGUỒN (CONTRIBUTING GUIDELINES)

Cảm ơn bạn đã muốn đóng góp cho `vietqr-node`! Dưới đây là quy trình và tiêu chuẩn để việc cộng tác diễn ra trơn tru.

---

## 1. Quy trình làm việc

1. **Fork hoặc tạo branch mới từ `main`:**
   ```bash
   git checkout -b feat/ten-tinh-nang
   # hoặc
   git checkout -b fix/loi-can-sua
   ```
2. **Cài đặt:** yêu cầu **Node.js ≥ 20**.
   ```bash
   npm ci --ignore-scripts
   ```
3. **Thực hiện thay đổi:** viết code rõ ràng và có JSDoc cho API công khai. Thêm test cho tính năng mới hoặc lỗi được sửa.
4. **Chạy kiểm thử trước khi commit:**
   ```bash
   npx tsc --noEmit
   npm test
   node test/smoke/run.mjs   # đóng gói tarball, cài vào project ESM/CJS/NestJS sạch, chặn mạng
   ```
5. **Tạo Pull Request:** mô tả lý do thay đổi, giải pháp kỹ thuật và kết quả test. CI phải xanh trên Ubuntu và macOS, Node 20 và 22.

---

## 2. Tiêu chuẩn viết code

- **TypeScript strict:** không dùng `any` cho API công khai. Mọi lỗi nghiệp vụ được ném ra dưới dạng `VietQrError` với mã lỗi (`qr.*`) có sẵn trong `src/errors.ts`.
- **Đối chiếu với thư viện gốc:**
  - Payload phải giống **từng byte** với `vietqr-core` tại commit `1b92450`.
  - Fixture trong `test/fixtures/upstream/` được sinh từ chính thư viện .NET gốc bằng `tools/upstream-fixtures`. Không sửa tay fixture để test pass.
  - Nếu cố ý khác với thư viện gốc, hãy ghi rõ trong `docs/parity.md` và README.
- **Offline:** không thêm lệnh gọi mạng, CDN hay tải tài nguyên lúc chạy vào các phần payload, parse, decode, render hoặc danh mục ngân hàng.
- **Dependency:**
  - Hạn chế thêm dependency runtime mới. Nếu cần, ghim phiên bản chính xác (không dùng `^`/`~`).
  - Không thêm package dựa vào install script.
- **Tài nguyên đồ hoạ:** ảnh đầu vào phải đi qua các giới hạn trong `src/image/` (kích thước file, số pixel, chiều tối đa) trước khi giải mã.

---

## 3. Quy ước commit

Dự án dùng **Conventional Commits**:
- `feat:` thêm chức năng, template hoặc API mới.
- `fix:` sửa lỗi logic, lỗi render, hoặc tính sai CRC/TLV.
- `perf:` cải thiện hiệu năng.
- `test:` thêm hoặc cập nhật test.
- `docs:` cập nhật README hoặc tài liệu.
- `refactor:` tái cấu trúc mà không đổi hành vi.
- `chore:` nâng cấp dependency, CI/CD, `.gitignore`.
- `ci:` thay đổi workflow GitHub Actions.

*Ví dụ:*
```bash
git commit -m "feat: hỗ trợ template mới cho ảnh in"
git commit -m "fix: cắt đúng 25 ký tự cho trường con Tag 62"
```

---

## 4. Kiểm thử theo chuẩn

Mọi thay đổi liên quan tới chuỗi EMVCo phải đối chiếu với [quy định định dạng mã VietQR của NAPAS v1.0 (PDF)](https://github.com/Ngochiendev/vietqr-core/blob/1b92450/docs/QR_Format_T%26C_v1.0_VN_092021.pdf). Tuyệt đối không đưa vào thay đổi làm sai lệch cấu trúc trường TLV hoặc checksum CRC.

Lỗ hổng bảo mật xin báo riêng theo [SECURITY.md](SECURITY.md), không tạo issue công khai.
