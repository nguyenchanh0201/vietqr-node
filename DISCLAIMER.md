# TUYÊN BỐ MIỄN TRỪ TRÁCH NHIỆM (DISCLAIMER)

## 1. Quyền Sở Hữu Thương Hiệu & Bản Quyền Tài Liệu
- **Nhãn hiệu NAPAS & VietQR:** Các tên gọi, biểu trưng, logo và nhãn hiệu thương mại **VietQR**, **NAPAS**, **NAPAS247** thuộc toàn quyền sở hữu của **Công ty Cổ phần Thanh toán Quốc gia Việt Nam (NAPAS)**.
- **Tiêu chuẩn kỹ thuật:** Bộ định dạng mã thanh toán áp dụng trong dự án này được xây dựng dựa trên:
  1. *Tiêu chuẩn cơ sở cho mã phản hồi nhanh (QR Code) trong lĩnh vực thanh toán tại Việt Nam* do **Ngân hàng Nhà nước Việt Nam** ban hành.
  2. [*Quy định về Định dạng mã VietQR trong Dịch vụ chuyển nhanh NAPAS247 (Phiên bản 1.0 - 09/2021)*](https://github.com/Ngochiendev/vietqr-core/blob/1b92450/docs/QR_Format_T%26C_v1.0_VN_092021.pdf) do **NAPAS** công bố.
  3. *EMVCo QR Code Specification for Payment Systems (Merchant-Presented Mode)*.
- **Tuân thủ T&C của NAPAS:** Dự án cam kết và tôn trọng đầy đủ các Điều khoản & Điều kiện sử dụng (Terms & Conditions) của NAPAS:
  - Dự án không sở hữu và không tuyên bố hoặc ngầm ý xác lập quyền sở hữu đối với tài liệu đặc tả, nhãn hiệu thương mại, logo hay bất kỳ tài sản sở hữu trí tuệ nào thuộc về NAPAS, NHNN hay EMVCo.
  - Việc tích hợp và sử dụng định dạng mã VietQR tuân thủ đúng mục đích kỹ thuật phục vụ các giao dịch thanh toán qua mạng lưới Dịch vụ Chuyển nhanh NAPAS247.

## 2. Bản Quyền Mã Nguồn (Source Code Implementation)
- `vietqr-node` là bản port TypeScript độc lập của `vietqr-core`, không phải sản phẩm chính thức của NAPAS/VietQR. Logo ngân hàng thuộc quyền sở hữu của các ngân hàng tương ứng.
- Dự án gốc `vietqr-core` là bộ công cụ kỹ thuật mã nguồn mở / vi mô (microservice) độc lập, cung cấp giải thuật tạo chuỗi chuẩn EMVCo và render ảnh thẻ thanh toán (Base64 PNG).
- Phần mềm được cung cấp theo nguyên tắc **"NGUYÊN BẢN" (AS-IS)** và không đi kèm bất kỳ cam kết hay bảo đảm nào (dù rõ ràng hay ngụ ý) về tính sẵn sàng, tính liên tục hoặc sự phù hợp cho một mục đích cụ thể ngoài phạm vi chức năng kỹ thuật đã mô tả.

## 3. Trách Nhiệm Vận Hành & An Toàn Dữ Liệu
- Đơn vị hoặc cá nhân sử dụng, triển khai phần mềm này chịu hoàn toàn trách nhiệm đối với:
  1. Tính chính xác và tính hợp pháp của các thông tin thanh toán nạp vào mã QR (bao gồm: Số tài khoản, Mã BIN ngân hàng, Tên người thụ hưởng, Số tiền giao dịch, Nội dung chuyển khoản).
  2. Việc bảo mật dữ liệu khách hàng và tuân thủ các quy định hiện hành của pháp luật Việt Nam, các thông tư của Ngân hàng Nhà nước về an toàn, bảo mật thông tin trong hoạt động thanh toán ngân hàng và thanh toán điện tử.
- Các tác giả và nhà phát triển dự án không chịu trách nhiệm đối với bất kỳ khiếu nại, tranh chấp, tổn thất tài chính, giao dịch chuyển nhầm hoặc sự cố kỹ thuật nào phát sinh từ việc sử dụng, triển khai hoặc tích hợp phần mềm này trong các hệ thống thực tế.
