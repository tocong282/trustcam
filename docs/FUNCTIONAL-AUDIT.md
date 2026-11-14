# TRUSTCAM — kiểm tra chức năng, không đánh giá UI/UX

Ngày: 2026-11-14. Workspace: `/home/rcong/Project/trustcam`.

## Cập nhật khắc phục — 2026-11-14

Các phát hiện bên dưới giữ làm baseline audit, không còn mô tả đầy đủ code hiện tại.

- Đã sửa refresh quyền camera khi foreground và chuẩn hóa lỗi mạng native Expo; thêm test regression và giới hạn độ phân giải trước ký.
- Đã kiểm lại chữ ký/binding/hash mọi ảnh hiện tại và lịch sử trước finalize, transaction không tạo report khi hỏng.
- Đã thêm retake phiên bản mới giữ nguyên evidence cũ, history/verify ảnh lịch sử, phát hiện thay thế stale, giới hạn 5 phiên bản/mục. Hồ sơ finalized vẫn khóa.
- Đã lưu metadata ảnh cục bộ bền vững, giữ/chia sẻ pending, đối chiếu kết quả chưa rõ khi refresh; xóa bản sao app-owned cần xác nhận và không xóa server.
- Parent chạy lại: 46 backend tests PASS; HTTP TypeScript/Python retake/history/stale + ảnh gốc PASS/ảnh sửa FAIL; mobile self-check/typecheck/config-check PASS; Expo doctor20/20.
- Backend đã restart với migration và VLM config; DB có backup trước migration trong runtime scratch.
- Chưa có nút gửi lại pending, chưa test native thiết bị, chưa ký toàn report hay triển khai RAG. UI mới đang chuẩn bị riêng, chưa tích hợp.

## Kết luận (baseline trước khắc phục)

Chưa hoàn thiện toàn bộ chức năng. Lõi checklist + ký ảnh + báo cáo + đối chiếu đã qua kiểm thử tự động và HTTP thật. Native điện thoại chưa kiểm chứng; vòng lặp VLM yêu cầu chụp lại chưa thực hiện được trong cùng phiên. RAG/B2B roles/public sharing chưa xây.

Không thay code sản phẩm trong lần audit này. Chỉ chạy kiểm thử, đọc source, kiểm thử provider bằng ảnh màu tổng hợp và ghi báo cáo. Ảnh test tạo trong server đang chạy được lưu thành một hồ sơ thử; không sử dụng ảnh cá nhân.

## Kết quả thực thi

- `.venv/bin/python -W error::ResourceWarning -m unittest discover -s tests -v`: 35 tests PASS.
- `.venv/bin/python tests/live_smoke.py`: PASS, gồm TypeScript canonical/signing/API với Python qua HTTP, đủ bốn ảnh, chốt/khôi phục báo cáo, ảnh gốc PASS, ảnh sửa FAIL. Script này chủ động tắt VLM trong server riêng.
- Kiểm thử bổ sung server LAN đang chạy `http://172.20.10.2:8000`: dùng cùng code TypeScript, upload bốn ảnh tổng hợp, gọi model thật `analysis`, lưu nhận xét, chốt và lấy lại báo cáo, kiểm tra ảnh gốc/sửa. PASS. Model trả `retake` với ảnh màu không chứa cảnh thật.
- `npm run typecheck`, `npm run self-check`, `npm run config-check`: PASS.
- `npx expo-doctor`: 20/20 PASS; `npx expo install --check`: dependencies up to date.
- Metro `/status`: running; tải Android dev bundle HTTP 200, 4,262,053 bytes.
- `git diff --check`: PASS.

Các kết quả này không chứng minh camera/SecureStore/picker/share đã chạy trên điện thoại. Node HTTP test không dùng native Expo fetch.

## Ma trận chức năng

| Chức năng | Kết quả / giới hạn |
|---|---|
| Tạo phiên, bearer token, cách ly phiên | PASS tự động / HTTP |
| Hash đúng byte ảnh và Ed25519 raw manifest | PASS RFC vector, OpenSSL và Python/TypeScript |
| Upload JPEG/PNG, giới hạn byte/pixel, input bất hợp lệ | PASS tự động |
| Checklist bốn mục | PASS; thu thập đủ không đồng nghĩa AI duyệt |
| Chốt, lấy lại báo cáo, khóa phiên đã chốt qua API | PASS đường bình thường; xem lỗi integrity khi chốt bên dưới |
| Verify ảnh gốc / sửa / chữ ký lỗi | PASS tự động và HTTP |
| Khôi phục phiên/báo cáo trong logic app | Checks PASS; SecureStore vòng đời native chưa xác minh |
| VI/EN, lỗi và nhãn | Key parity PASS; phát hiện ngoại lệ native fetch chưa ánh xạ đúng |
| VLM thật, timeout/schema/auth/caching | Call thật PASS trên ảnh tổng hợp; negative tests dùng provider fixture |
| VLM nhận xét rồi chụp lại | CHƯA: slot đã thu thập không nhận ảnh thay thế |
| Camera / photo picker / chia sẻ / persistence native | Cần kiểm thử điện thoại thật |
| RAG, quyền tổ chức, hai bên chia sẻ/thu hồi, PDF | CHƯA triển khai |

## Phát hiện cần sửa

### P1 — Khôi phục quyền camera khi quay lại từ Settings

Nguồn: `app/App.tsx` phần `useCameraPermissions`, listener AppState; dependency `expo-modules-core/src/PermissionsHook.ts`.

AppState hiện chỉ cập nhật active/ready, không gọi getter quyền. Sau khi từ chối tới `canAskAgain=false`, mở Settings cấp quyền rồi quay lại, state quyền cũ có thể giữ false; camera không mount và nút xin quyền vẫn bị khóa. Kết luận dựa source app/hook, chưa tái hiện trên điện thoại.

Sửa tối thiểu: dùng phần tử getter thứ ba từ `useCameraPermissions()` khi app trở lại active; xử lý lỗi, không tự bật camera trước xác nhận quyền.

### P2 — Lỗi mạng native Expo hiện thành lỗi chung

Nguồn: `app/src/api.ts:17-20`, Expo `winter/fetch/FetchErrors.ts`, `app/App.tsx` error handler.

Expo SDK 58 dùng FetchError extends Error, còn API helper chỉ đổi TypeError thành `network_error`. Agent đã probe với lớp FetchError thật: lỗi không được chuẩn hóa; app sẽ dùng `request_failed`, thiếu hướng dẫn kiểm tra mạng/IP. Chưa thử tắt Wi-Fi điện thoại.

Sửa: nhận diện transport error Expo nhưng giữ timeout/machine codes; regression test đúng lớp lỗi, không dùng message không tin cậy để hiển thị trực tiếp.

### P1 integrity hardening — Finalize không kiểm lại evidence đang lưu

Nguồn: `backend/app.py` endpoint session_finalize, so với evidence_analyze/verify.

Đã tái hiện trong DB tạm: upload đủ bốn slot, sửa signature của một record thành 128 ký tự 0, finalize trả HTTP 200 và tạo report. Endpoint chỉ kiểm đủ slot rồi snapshot; verify cùng record có cơ chế phát hiện chữ ký lỗi.

Đây không phải đường sửa SQLite qua API hoặc bypass auth; cần dữ liệu lưu trữ bị hỏng/quyền ghi DB. Sửa trước khẳng định chốt đủ bằng chứng ký hợp lệ: recheck bindings/signatures/image hashes trong transaction finalize; kiểm thử không tạo report khi hỏng. Không coi đây là bảo vệ tuyệt đối trước người kiểm soát DB.

### P2 — Bản sao ảnh cục bộ không có retention/index bền vững

Nguồn: `app/App.tsx` ghi `Paths.document/trustcam-UUID.jpg`, state localImages.

Ảnh được copy trước upload; upload lỗi, đổi phiên/API hoặc mở lại app có thể mất chỉ mục trong bộ nhớ nhưng tệp vẫn còn. Dung lượng và ảnh giấy tờ nhạy cảm có thể tích lũy. Chưa đo trên thiết bị.

Cần chốt retention. Không tự xóa ảnh gốc chỉ vì timeout: server có thể đã nhận. Giải pháp cần chỉ mục + hành động giữ/xóa minh bạch hoặc vùng cache có chính sách rõ ràng.

## Giới hạn không được quảng bá thành tính năng đã có

- Retake/uncertain là tư vấn: upload cùng slot trả 409 `slot_already_collected`. Cần versioned evidence / lịch sử thay thế để hoàn thành vòng lặp; không overwrite ảnh đã ký.
- Chốt vẫn được dù VLM retake vì VLM là advisory, không phải acceptance gate. GET session đã chốt vẫn trả next_action finalize; client phải dùng status finalized (app đã làm).
- Report JSON không có chữ ký bao phủ toàn report. Chữ ký chỉ bao phủ từng manifest ảnh, không analysis/report_id/integrity_notice. `/verify` kiểm ảnh với record server, không kiểm JSON báo cáo xuất ra độc lập.
- Đổi IP LAN không tự sửa API URL đã lưu. Settings thay URL sẽ bỏ tham chiếu token cũ theo thiết kế hiện tại; không tự gửi token sang host mới.
- Chia sẻ report hiện là JSON dạng văn bản qua Share.share, không phải tệp .json/PDF.
- RAG và phân quyền tài liệu/tổ chức, review, public links, nhiều phiên, offline queue chưa triển khai.

## Kiểm thử điện thoại bắt buộc còn lại

1. Expo Go mở app, tạo phiên, VI/EN và lựa chọn còn sau đóng/mở.
2. Camera cho phép/từ chối; mở Settings cấp lại rồi trở về.
3. Chụp bốn mục, ký/upload thật, report và phiên khôi phục sau restart app.
4. Lưu/chia sẻ ảnh gốc, picker chọn ảnh gốc PASS; bản sửa FAIL. Kiểm tra picker không vô tình re-encode ảnh gốc; khác byte không mặc định là gian lận.
5. Tắt mạng/đổi mạng, timeout, thử lại, session vẫn có thể tải lại; không gửi lặp thao tác khi bận.
6. VLM consent trước gửi ra provider; lời nhận xét nguyên văn và nhãn advisory.
7. Ảnh camera lớn: hiện quality=1, không pictureSize. Kiểm tra <=10 MiB và <=20 triệu pixel; nếu vượt, chọn độ phân giải/resize TRƯỚC hash/ký. Không kết luận mọi điện thoại sẽ lỗi.

## Ưu tiên tiếp theo

1. Sửa camera foreground permissions và native network mapping; thêm regression checks.
2. Harden finalize integrity và regression test corruption.
3. Hoàn thành retake có lịch sử ảnh, không phá manifest đã ký.
4. Chốt retention và kiểm thử điện thoại theo checklist trên.
5. RAG sau khi có corpus thật; B2B roles/sharing theo scope được xác nhận.
