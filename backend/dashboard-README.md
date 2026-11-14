# Dashboard doanh nghiệp demo

Một doanh nghiệp, một mật khẩu quản trị. Một session là một hồ sơ; chỉ hồ sơ được chủ token chia sẻ rõ ràng mới xuất hiện. Không có token toàn dịch vụ, không nhận bearer di động làm mật khẩu quản trị. Không thêm dependency, không gọi model/provider, không đọc `.env`.

## Tích hợp đã nối trong `create_app`

Sau API hiện có, trước `return app`, backend tự cài dashboard API rồi mount native `StaticFiles` từ thư mục cố định `dashboard/` tại `/dashboard`, `html=True`. Mở `/dashboard/` khi đã cấu hình an toàn trước startup; không cần server frontend riêng. API đứng trước static nên `/dashboard/api/*` không bị catchall che. Không tự bật dashboard hoặc đổi cấu hình dịch vụ đang chạy.

```python
install_dashboard(app, connect, authorized, validate_stored_evidence, evidence_records)
app.mount('/dashboard', StaticFiles(directory=Path(__file__).resolve().parents[1] / 'dashboard', html=True),
          name='dashboard')
```

Outer upload limiter trong `app.py` giữ 16 KiB cho route khác; chỉ `/evidence`, `/verify` và đúng shape `/dashboard/api/sessions/{session_id}/verify` nhận `MAX_IMAGE_BYTES + 64 * 1024`. Kiểm tra fullmatch trên ASGI `scope['path']`, không dùng URL đã bỏ control character; path thiếu ID, thêm segment/suffix/trailing slash hoặc encoded slash không hưởng ngoại lệ. Query string không đổi route. Cả outer limiter và dashboard chặn wire bytes thật, kể cả chunked/Content-Length khai thiếu, ở 10 MiB + 64 KiB; phần ảnh riêng tối đa 10 MiB, JPEG/PNG giải mã thật tối đa 20.000.000 pixel. Dashboard còn giữ giới hạn riêng 4096 byte cho route khác. Không dùng `Content-Length` làm bảo vệ duy nhất.

Module không import `backend.app`, tránh module-level `app = create_app()` chạm DB ngoài ý muốn. Schema `dashboard_grants(session_id PRIMARY KEY REFERENCES sessions, shared_at)` tạo trong transaction additive riêng. Không sửa bảng evidence/report. Count truy vấn động, không ép đúng 4 ảnh hoặc mỗi category chỉ một ảnh. Giữ nguyên `evidence_records` callback, gồm analysis và metadata mới. `next_action` vẫn chọn category còn thiếu trong 4 category hiện hữu; đây không phải giới hạn số ảnh.

`app.py` phục vụ static frontend **sau API routes**, tránh catchall nuốt `/dashboard/api/*`. Module dashboard không tự mount static và không public corpus/raw. API không thêm CORS; toàn `/dashboard` kể cả static vẫn qua guard disabled và `Cache-Control: no-store`.

## Cấu hình trước startup

- `TRUSTCAM_DASHBOARD_PASSWORD`: mật khẩu ngẫu nhiên riêng, 16–1024 ký tự. Thiếu/yếu: toàn `/dashboard` trả 503 `dashboard_disabled`, không mật khẩu mặc định.
- HTTPS mặc định; cookie `trustcam_dashboard`, `HttpOnly`, `SameSite=Strict`, `Secure`, `Path=/dashboard`, `Max-Age=3600`.
- `TRUSTCAM_DASHBOARD_ALLOW_HTTP=1`: chỉ demo HTTP trên LAN đáng tin; tắt `Secure`. Không dùng với dữ liệu thật trên mạng không tin cậy.
- Mật khẩu chỉ được scrypt với salt ngẫu nhiên trong bộ nhớ tiến trình (`n=16384,r=8,p=1,dklen=32`), so sánh constant-time. Không ghi credential hoặc token vào DB/log.
- Cookie ngẫu nhiên 256 bit; chỉ SHA256 cookie giữ phía server. CSRF riêng từng phiên. Tối đa 256 phiên bộ nhớ, hết hạn tuyệt đối 1 giờ, logout thu hồi server-side, restart đăng xuất hết.
- Login tối đa 5 lần/client/phút, tối đa 1024 bucket, từ chối bucket mới khi đầy; state process-local. JSON login/share tối đa 4096 wire bytes; kiểm tra schema, duplicate keys và Unicode lỗi.
- `Origin` có mặt phải khớp chính xác scheme/authority request ở login và mutation. Client native không có Origin vẫn dùng bearer share. CSRF header bắt buộc cho mutation dashboard trừ login. Không nhận CSRF query parameter.

## Contract frontend

Tất cả response dashboard/share, kể cả lỗi, có `Cache-Control: no-store`. Lỗi vận hành ngoài dự kiến trả mã ổn định `dashboard_unavailable`, không stack trace/raw exception.

| Route | Request / response |
|---|---|
| `POST /dashboard/api/login` | JSON `{password:string}`; 200 `{csrf_token:string}`, đặt cookie; sai 401, giới hạn 429 |
| `GET /dashboard/api/me` | 200 `{authenticated:true,csrf_token:string}`; không phiên 401 |
| `POST /dashboard/api/logout` | Cookie + `X-CSRF-Token`; 200 `{authenticated:false}`, xóa cookie và thu hồi phiên |
| `GET /dashboard/api/sessions` | `{sessions:[{session_id,status,evidence_count,history_count,report_id,shared_at}]}`; chỉ grant |
| `GET /dashboard/api/sessions/{id}` | Shape `/session/{id}` hiện có và `shared_at`; `max_evidence=20`, `max_history=80`; evidence/history/analysis không viết lại |
| `GET /dashboard/api/sessions/{id}/evidence/{eid}/image` | Cookie + grant + ID thuộc đúng hồ sơ; current/history; xác minh stored signature/bindings/hash; trả nguyên JPEG/PNG bytes với Content-Type thực |
| `GET /dashboard/api/sessions/{id}/report` | Envelope `{report_id,report}` hiện hữu; grant/auth; chưa report 404 |
| `POST /dashboard/api/sessions/{id}/verify` | Cookie + `X-CSRF-Token`; multipart đúng `{evidence_id,image}`; không sửa DB |
| `GET /dashboard/api/legal?q=...` | Cookie; `{mode:'retrieval_only',results:[{id,document_title,article,text,source_url,legal_status}],notice}` |

Verify trả đúng ba kết quả: `PASS/integrity_verified`, `FAIL/image_modified`, `FAIL/signature_invalid`. Ảnh lỗi định dạng 400, quá lớn 413, ID khác hồ sơ 404. Corrupt stored evidence luôn fail closed. PASS chỉ chứng minh byte integrity và chữ ký/bindings thiết bị; không chứng minh sự thật cảnh chụp, thời gian, danh tính, hiệu lực pháp lý; không tự động phạt.

Ngoài dashboard:

- `POST /session/{id}/share-enterprise`: bearer chủ hồ sơ, JSON đúng `{consent:true}`; false/1/extra key không hợp lệ. Ghi idempotent `{shared:true,shared_at:ISO}`; retry giữ timestamp đầu. Parent phải có nút xác nhận consent rõ ràng trên mobile.
- `GET /session/{id}/share-enterprise`: cùng bearer, `{shared:false}` hoặc `{shared:true,shared_at}`. Cookie quản trị không thay bearer. Chưa có revoke grant trong demo.

## Pháp lý: retrieval-only, không generative RAG

Đường dẫn cố định `corpus/legal-demo/chunks.jsonl` và `manifest.json`; không filename từ client, không tải URL, không gửi ảnh hay hồ sơ sang provider. Token matching Unicode bằng stdlib, xếp hạng số từ trùng, tối đa 5 nguyên điều, query tối đa 512 ký tự. Document title từ manifest; `article` dùng label nguyên gốc. SHA256 text kiểm tra trước trả kết quả. URL nguồn chỉ HTTP(S).

Thiếu/hỏng corpus: results rỗng, notice `Corpus unavailable`. Không có kết quả cũng không tạo câu trả lời giả. Chỉ corpus luật công khai bản gốc demo; `legal_status` giữ cảnh báo `original text; amendment applicability not fully verified`. Chưa xác minh đầy đủ sửa đổi và hiệu lực hiện tại; không tư vấn pháp lý.

## Kiểm tra đã chạy

```sh
.venv/bin/python -W error::ResourceWarning -m unittest discover -s tests -v
.venv/bin/python tests/live_smoke.py
node dashboard/check.mjs
```

Kết quả tích hợp: **70 backend tests PASS** (12 dashboard); live HTTP TypeScript/Python PASS với original `PASS/integrity_verified`, edited `FAIL/image_modified`, retake/history/stale rejection, ảnh bổ sung thứ năm và report 5 ảnh; Node dashboard check PASS. Tests dùng SQLite tạm trước import app, provider ngoài tắt; VLM tests chỉ gọi stub localhost. Không đọc DB live, không sửa secret, không restart dịch vụ.

TDD RED trước fix: test grant cũ thiếu `max_evidence/max_history`; create_app chưa có dashboard API trả 404; integrated verify ảnh >16 KiB bị 413; probe limiter xác nhận shape hợp lệ bị chặn. GREEN sau fix: create_app tự cài API, static native đứng cuối; mặc định disabled bao gồm static; giới hạn đúng 10 MiB + 64 KiB, quá 1 byte bị chặn kể cả chunked/Content-Length sai; unrelated/malformed paths giữ 16 KiB. Probe dùng chính middleware thực, không mock body-limit logic. Encoded newline cuối path phát hiện `request.url.path` chuẩn hóa mất ký tự; đổi sang ASGI `scope['path']` giữ nguyên path router nhận.

Các test còn bao phủ cookie/CSRF/Origin/logout/expiry/restart; login limiter/HTTP opt-in; grant isolation/persistence/legacy sessions; ảnh current/history/report/analysis và corruption; verify exact/edited/signature/không mutation; corpus retrieval/unavailable; JSON hostile/lỗi storage; ảnh >16 KiB, chunked >10 MiB, pixel >20 MP, multipart dư field. Report/chữ ký cũ giữ nguyên.

## Giới hạn trước production

Không coi đây là kiến trúc enterprise production. Cần identity/SSO/MFA, tenant isolation thật, grant revoke/lifecycle, audit trail, backup/retention, TLS/origin/Host trust proxy chuẩn và phân quyền theo người dùng. Proxy phải hạn chế Host hợp lệ và chỉ tin forwarded header từ proxy được cấu hình. Limiter/cookie state hiện không chia sẻ giữa worker/replica, restart mất state; cần shared store và rate limit biên theo deployment. Cần concurrency/memory budget và proxy upload limit: bản demo buffer tối đa khoảng 10 MiB mỗi request trước multipart. Cổng còn thiếu trên mobile: nút chia sẻ doanh nghiệp với xác nhận consent rõ ràng và trạng thái đã chia sẻ; chưa tự cấp grant cho hồ sơ cũ. Chưa triển khai lên dịch vụ live, không cài deps, restart dịch vụ, sửa secret hoặc tạo commit.
