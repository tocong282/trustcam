# Kiểm chứng mobile: hồ sơ, 20 ảnh, consent doanh nghiệp

## Thay đổi

- `App.tsx`: trong chi tiết hồ sơ Checklist/Report/Verify, thêm thông báo quyền riêng tư và nút chia sẻ có xác nhận riêng; hộp thoại ghi đúng máy chủ + ID hồ sơ, không lộ bearer. Hủy/đóng hộp thoại không gửi yêu cầu. Không tự chia sẻ khi mở hồ sơ/tab hoặc đổi ngôn ngữ.
- `POST /session/{id}/share-enterprise`: JSON đúng `{consent:true}`, bearer của hồ sơ đã chọn, chỉ khi thông tin chọn khớp chỉ mục an toàn theo máy chủ. Không sửa SecureStore hoặc xóa hồ sơ cũ.
- Nút kiểm tra trạng thái dùng GET cùng endpoint/bearer; không tạo grant. Chỉ hiển thị thành công sau phản hồi máy chủ hợp lệ; lỗi xác thực/dịch vụ, mất mạng, phản hồi lỗi giữ khả năng thử lại thủ công.
- `src/locale.ts`: VI/EN đầy đủ; doanh nghiệp được truy cập ảnh, lịch sử và báo cáo; demo chưa có thu hồi. Không bịa tên hay danh tính doanh nghiệp.
- `test/ui-check.cjs`: mở rộng kiểm tra callback App thật với native doubles và HTTP loopback tới Node server test cô lập.

## Kết quả chạy

`npm run typecheck && npm run self-check && npm run config-check`: exit 0.

- TypeScript 6.0.3: 21 source files, 0 diagnostics.
- Consent VI/EN: render không gửi; hủy/đóng không gửi; POST wire body đúng `{"consent":true}`, Content-Type JSON; ID được encode, bearer đúng hồ sơ/máy chủ; chặn bấm đôi; GET không body; lỗi 401, 503, response thiếu timestamp và network_error; thử lại thủ công thành công; chỉ mục hồ sơ không đổi.
- Hồ sơ: migration legacy, giữ token cũ, lỗi lưu không đổi tham chiếu, cô lập máy chủ, tab mở danh sách trước chi tiết, giới hạn số lượng/byte.
- 20 ảnh: parser 20 ảnh hiện tại / 80 ảnh lịch sử; capability bổ sung, legacy không gửi additional; chống trùng ảnh chính; đủ 4 nhóm mới chốt; giới hạn chụp lại theo chuỗi; report 20 ảnh.
- Config native: camera được bật, permission reasons song ngữ, không microphone/Face ID.

Đây là HTTP thật tới test server Node tự sinh trong tiến trình, KHÔNG phải backend live hoặc renderer/native thật. Không gọi provider, không cài dependency, không lint, không restart dịch vụ.

## Giới hạn SecureStore đã đo, không thay kiến trúc

`src/dossiers.ts`: một giá trị JSON nguyên tử, tối đa 4 tham chiếu trên toàn bộ máy chủ và 2000 byte UTF-8. `credentials` đang chọn lặp dữ liệu đã có trong `dossiers`, nên số byte phụ thuộc URL/token/ID; 4 là trần, không phải bảo đảm luôn lưu đủ 4.

Probe dùng UUID 36 ký tự, bearer test 43 ký tự, key 64 ký tự, thời gian ISO:

| Độ dài URL | 1 hồ sơ | 2 hồ sơ | 3 hồ sơ | 4 hồ sơ |
|---|---:|---:|---:|---:|
| 19 ký tự | 500 byte | 756 byte | 1012 byte | 1268 byte |
| 116 ký tự | 694 byte | 1047 byte | 1400 byte | 1753 byte |
| 196 ký tự | 854 byte | 1287 byte | 1720 byte | từ chối `dossier_limit`, giữ 3 hồ sơ |

Không tự loại hồ sơ cũ. Muốn vượt trần cần migration lưu trữ giao dịch riêng, ngoài phạm vi này. Tạo phiên gọi server trước khi biết kích thước token mới; nếu ghi SecureStore bị từ chối, server có thể còn phiên mới nhưng app giữ tham chiếu cũ. Không thể bảo đảm phục hồi phiên mới khi bearer chưa lưu thành công.

## Còn kiểm tra native / tích hợp thật

- Trên Android/iOS: Alert hủy/đóng/xác nhận, bấm đôi, text scaling, screen reader, mục tiêu bấm 48 px, lỗi và thử lại.
- SecureStore thật: cold restart, giữ nhiều hồ sơ và token theo máy chủ, lỗi ghi gần trần byte; probe Node không chứng minh giới hạn native từng OS.
- Camera/upload thật: 4 nhóm bắt buộc + thêm tới 20 ảnh, chụp lại giữ lịch sử, chốt/mở lại report, quyền camera, ảnh gốc và integrity PASS/FAIL.
- Sau backend được chủ sở hữu tích hợp/restart riêng: dùng token hồ sơ thật kiểm chứng POST/GET, auth lỗi trung thực, dashboard chỉ thấy hồ sơ được xác nhận, ảnh/lịch sử/report còn nguyên. Chưa kiểm chứng backend live trong công việc này.
