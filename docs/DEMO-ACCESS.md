# TRUSTCAM — truy cập demo cho giám khảo

Demo công khai: **https://trustcam.minet.vn/dashboard/**

Trang chạy HTTPS (Let's Encrypt); HTTP tự chuyển 301 sang HTTPS; cookie phiên `Secure`. Dùng trình duyệt hiện đại, không cần VPN, không cần cài đặt.

## Đăng nhập

- Mật khẩu dashboard: `MsWJ6j4KDbcID3s_g9YYlhVv`

Đây là mật khẩu demo riêng, dữ liệu tổng hợp, cố ý công bố trong tài liệu này. Mật khẩu được đổi sau sự kiện.

Dashboard dành cho giám khảo ở chế độ **chỉ đọc**: không tạo/sửa/chốt hồ sơ, không yêu cầu bổ sung ảnh, không gửi ảnh tới mô hình. Toàn bộ dữ liệu là dữ liệu tổng hợp cho demo, không phải ảnh khách hàng thật.

## Hồ sơ mẫu

Trong tab `Hồ sơ` chỉ có một hồ sơ:

- `session_id`: `25bc1bde-d6a8-4ce0-99ca-167db558317a`
- Trạng thái: `finalized`
- 4 ảnh hiện hành: `wide_context`, `damage_closeup`, `serial_or_plate`, `identifier_doc`
- Đã chia sẻ cho doanh nghiệp với sự đồng ý rõ ràng của khách trong luồng app

Không có hồ sơ nào khác. Chọn hồ sơ này để xem ảnh, metadata chữ ký và báo cáo.

## Kiểm tra tính toàn vẹn (Verify)

Nằm trong tab `Chi tiết`, mục `Kiểm tra tính toàn vẹn`: chọn một ảnh của hồ sơ, tải tệp lên, bấm `Kiểm tra tệp`. Backend băm byte tệp và so với hash đã ký của ảnh gốc.

Kết quả **PASS chỉ khi** tệp tải lên trùng chính xác từng byte với ảnh gốc đã ký.

Ảnh gốc của demo **không được phát hành** kèm hồ sơ, nên giám khảo thường sẽ nhận **FAIL / signature mismatch**. Đây là kết quả đúng như mong đợi, không phải lỗi hệ thống: ảnh hiển thị trên dashboard không phải ảnh gốc đã ký, và ảnh chụp lại/qua mạng xã hội cũng bị đổi byte. Hãy đọc FAIL là "không chứng minh được toàn vẹn với tệp đang có", không phải kết luận gian lận.

PASS chỉ chứng minh toàn vẹn byte và chữ ký; không chứng minh cảnh thật, thời điểm thật, danh tính, giá trị pháp lý hay quyền lợi bảo hiểm.

## Tab Căn cứ (nguồn pháp lý)

Tra cứu **chỉ trả về đoạn trích nguồn**, không sinh câu trả lời và không kết luận bồi thường. Câu truy vấn nên thử:

| Truy vấn | Kết quả mong đợi |
| --- | --- |
| `hồ sơ bồi thường gồm những gì` | Điều 7 |
| `5.2.6` | khoản 5.2.6 |
| `điều khoản loại trừ trách nhiệm` | Điều 11 |
| `giám định thiệt hại` | Điều 6 |

Truy vấn mơ hồ như `báo tổn thất thế nào` có thể trả kết quả yếu hoặc lệch, vì xếp hạng dựa trên từ khoá chứ không phải hiểu ngữ nghĩa. Đó là giới hạn đã biết của bản demo.

## Ứng dụng mobile (tuỳ chọn)

Giám khảo không cần cài app để chấm demo dashboard. Mã nguồn Expo React Native nằm trong `app/`; chạy local trỏ về API demo bằng `EXPO_PUBLIC_API_URL=https://trustcam.minet.vn`.

- Giao diện VI/EN; URL API đặt trong Settings, ưu tiên hơn biến môi trường.
- App lưu tối đa 4 hồ sơ, chịu trần 2000 byte SecureStore; URL dài có thể đầy sớm hơn.
- Chưa có bản build APK/IPA production trong repo.

## Giới hạn cần biết

- Mật khẩu dashboard chỉ bảo vệ dashboard. API mobile chưa có cơ chế kiểm soát truy cập và quota đầy đủ; chưa có hết hạn/thu hồi token theo từng phiên.
- `/docs` và `/openapi.json` của backend chưa đạt chuẩn production.
- Không suy ra quyền lợi, loại trừ hay thời hạn yêu cầu từ kho luật; quyết định thuộc con người.
- Bản chạy demo: container `trustcam-demo`, commit `5c79c397388da6c11fd2aba7a00686937957138c`, backend chỉ bind `127.0.0.1:18080` sau reverse proxy HTTPS.

## English summary

Public demo: https://trustcam.minet.vn/dashboard/ — HTTPS (Let's Encrypt), HTTP 301 to HTTPS, Secure cookie. Dashboard password: `MsWJ6j4KDbcID3s_g9YYlhVv` (dedicated demo password, synthetic data, intentionally published, rotated after the event).

The dashboard is read-only for judges: no case creation or editing, no photo requests. All data is synthetic demo data, not real customer images. One shared case exists: `25bc1bde-d6a8-4ce0-99ca-167db558317a`, status `finalized`, four current photos (`wide_context`, `damage_closeup`, `serial_or_plate`, `identifier_doc`), shared with explicit customer consent.

Integrity check (tab `Chi tiết` → `Kiểm tra tính toàn vẹn`) returns PASS only for the exact original bytes against the signed hash. Demo originals are not distributed, so judges should expect FAIL / signature mismatch — the image shown in the dashboard is not the signed original. PASS covers byte integrity and signature only, not scene authenticity, trusted time, legal validity or insurance coverage.

Legal lookup (tab `Căn cứ`) is retrieval-only: it returns source excerpts, never generated answers. Try `hồ sơ bồi thường gồm những gì` → Điều 7, `5.2.6` → khoản 5.2.6, `điều khoản loại trừ trách nhiệm` → Điều 11, `giám định thiệt hại` → Điều 6. Vague queries such as `báo tổn thất thế nào` may rank weakly (keyword ranking).

Mobile app: Expo React Native source in `app/`; `EXPO_PUBLIC_API_URL=https://trustcam.minet.vn`; VI/EN; API URL in Settings; max 4 stored sessions, 2000-byte SecureStore cap. No production APK/IPA in the repo.

Known gaps: dashboard password does not protect the mobile API; no full API access control, quota, or per-session token expiry/revocation; `/docs` and `/openapi.json` are not production-grade.
