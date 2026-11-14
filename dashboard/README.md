# TRUSTCAM · Dashboard giám định viên bảo hiểm

Frontend thuần HTML/CSS/JS, không dependency runtime, không CDN/font ngoài. Màu navy/emerald lấy từ `app/src/ui/theme.ts`. Tất cả thay đổi frontend nằm trong `dashboard/`.

## Tích hợp

Phục vụ thư mục này tại `/dashboard/` **cùng origin** với API; khai báo các route `/dashboard/api/...` trước static mount trong backend. Asset dùng `./styles.css`, `./app.js`. Không mở bằng `file://`; không cấu hình URL API hoặc nhập bearer token điện thoại.

Các endpoint dùng đúng contract:

- `POST /dashboard/api/login` với JSON `{password}`; nhận `{csrf_token}` và cookie do backend đặt.
- `GET /dashboard/api/me`; `POST /dashboard/api/logout`.
- `GET /dashboard/api/sessions`; `GET /dashboard/api/sessions/{id}`.
- `GET /dashboard/api/sessions/{id}/evidence/{eid}/image` hiển thị bản gốc có cookie; backend phải trả `Cache-Control: no-store`.
- `GET /dashboard/api/sessions/{id}/report`; chỉ tải JSON sau khi đọc báo cáo tồn tại.
- `POST /dashboard/api/sessions/{id}/verify` multipart đúng hai field `evidence_id`, `image`. Gửi `File` nguyên byte, không canvas/chuyển mã.
- `GET /dashboard/api/legal?q=...`, chỉ nhận `mode: retrieval_only`.

Fetch dùng URL relative, `credentials: same-origin`, `cache: no-store`, `redirect: error`. CSRF chỉ giữ trong closure, đặt `X-CSRF-Token` trên request thay đổi dữ liệu cùng origin (không đặt trên login). Không lưu mật khẩu, cookie, CSRF, hồ sơ hay ảnh vào storage. Chỉ locale `trustcam.dashboard.locale` lưu localStorage. Cookie HttpOnly, Secure, SameSite, hết hạn và quyền truy cập do backend thực thi; frontend không chứng minh auth production hoặc đa tenant.

## Màn hình và giới hạn

- Một session API = một **hồ sơ yêu cầu bồi thường**; không tạo schema bảo hiểm giả hoặc dữ liệu khách hàng mẫu.
- Ba tab `Hồ sơ`, `Chi tiết`, `Căn cứ`; hai tab đầu chung queue trái/detail phải, màn hẹp xếp dọc.
- Tối đa 20 ảnh hiện tại và 80 ảnh lịch sử. Hỗ trợ nhiều ảnh cùng slot, nhãn `is_additional`. Đếm số ảnh riêng; progress chỉ số nhóm ảnh bắt buộc khác nhau trên bốn nhóm, không lấy số ảnh/4 hoặc coi đủ nhóm là PASS.
- Ảnh hiện tại và lịch sử tách riêng. Thumbnail lazy; ảnh lớn theo lựa chọn. Metadata chữ ký thu gọn. Phân tích chỉ hiển thị nhận xét đã lưu của ảnh đang chọn, dùng `reasons[locale]`; thiếu bản dịch ghi rõ nhận xét gốc.
- Đối chiếu JPEG/PNG tối đa 10 MiB. Xóa kết quả cũ khi đổi ảnh, tệp hoặc hồ sơ. Kiểm tra hash/chữ ký là việc backend, không tự PASS khi ảnh hiển thị. PASS không chứng minh cảnh thật/thời điểm thật/giá trị pháp lý. FAIL không kết luận gian lận, vi phạm hoặc từ chối bồi thường.
- Không tạo/sửa/chốt hồ sơ, yêu cầu bổ sung, gửi ảnh tới mô hình, tính tổn thất, xác định phạm vi bảo hiểm hoặc duyệt chi trả.
- Bảo hiểm vật chất xe tự nguyện khác trách nhiệm dân sự bắt buộc với bên thứ ba. Kho pháp luật về chứng cứ không phải hợp đồng/điều khoản bảo hiểm. Không suy ra quyền lợi, loại trừ hoặc thời hạn yêu cầu từ kho này; quyết định thuộc con người.
- Tra cứu hiển thị nguyên đoạn, điều khoản, tình trạng và link nguồn HTTP(S) có `noopener noreferrer`; không sinh câu trả lời RAG. Kho rỗng/lỗi được ghi rõ. Text máy chủ dùng `textContent`, không HTML injection.
- VI mặc định, EN lưu qua tải lại; văn bản nguồn và nhận xét legacy không tự dịch. Có trạng thái loading/rỗng/lỗi/thử lại, 401/CSRF hết hạn về login, 503 rõ ràng. Ảnh lỗi kiểm tra lại `/me` để phát hiện hết phiên.
- Native button/form/details, focus ring, skip link, live status, tab điều hướng bằng ArrowLeft/ArrowRight/Home/End, responsive và reduced motion. Chưa có audit trình đọc màn hình thủ công.

## Kiểm tra chạy lại

Từ gốc repo:

```sh
node --check dashboard/app.js
node dashboard/check.mjs
```

Kiểm tra không dependency: parse dữ liệu, giới hạn 20/80, ảnh bổ sung cùng nhóm, language fallback, kết quả PASS/FAIL hợp lệ, escape ID, URL nguồn, credentials/cache/redirect/CSRF, lỗi an toàn, hook HTML/CSS. Test fetch dùng fixture rõ ràng, không chứng minh backend thật.

Tùy chọn: UI test dùng **Playwright đã có trên máy**, không cài gói mới. Trỏ `PLAYWRIGHT_MODULE` tới file entry module; `CHROMIUM` có thể đổi executable. Cần HTTP static server tạm ở terminal riêng:

```sh
python -m http.server 8873 --bind 127.0.0.1 --directory .
# Terminal khác; đường dẫn dưới là gói có sẵn ở môi trường kiểm tra:
PLAYWRIGHT_MODULE=/home/rcong/.cache/ms-playwright-go/1.50.1/package/index.mjs node dashboard/check.mjs
```

`DASHBOARD_URL` mặc định `http://127.0.0.1:8873/dashboard/`; `DASHBOARD_SCREENSHOT` tùy chọn đường dẫn ảnh chụp. Dừng HTTP server sau kiểm tra. UI test chặn API bằng fixture: login/logout, 401/503/rỗng, 5 ảnh cùng 1 nhóm, current/history, nguyên byte multipart, PASS/FAIL/reset, báo cáo, text pháp luật chống XSS, rỗng, locale, keyboard tabs, 390px không tràn ngang, reduced motion. Fixture chỉ nằm trong `check.mjs`, không được frontend import.

Đã chạy thành công syntax, check Node và UI fixture Chromium; đã xem screenshot desktop. Browser tool Camofox không kết nối được; dùng Chromium headless qua Playwright có sẵn thay thế. **Chưa kiểm chứng xuyên stack với API/cookie/quyền dữ liệu thật**; parent tích hợp và kiểm tra sau khi backend hoàn tất. Không commit/deploy hoặc sửa backend/app.
