# TRUSTCAM — kiểm tra trước production

Mốc kiểm tra: 2026-11-14, UTC+07. Quyết định hiện tại: **NO-GO cho public production**. Chỉ demo LAN có kiểm soát. Không có triển khai Internet nào được thực hiện trong lượt kiểm tra này.

## Bằng chứng đã chạy lại

- `.venv/bin/python -m unittest discover -s tests -q`: 50 tests PASS.
- `.venv/bin/python tests/live_smoke.py`: TypeScript ký/canonical/API qua HTTP thật, upload, retake/history/stale rejection, báo cáo 4 ảnh PASS; ảnh gốc PASS `integrity_verified`, ảnh sửa FAIL `image_modified`. Đây không phải kiểm thử camera/native.
- Trong `app/`: `npm run typecheck`, `npm run self-check`, `npm run config-check`: PASS; UI kiểm cấu trúc 6 màn, 2 theme, VI/EN, ảnh cục bộ, chọn nhận xét, quyền/trạng thái khóa. Không phải native renderer.
- `npx expo install --check`: Dependencies are up to date. `npx expo-doctor`: 20/20 PASS.
- `npm audit --omit=dev --json`: exit 1; 3 moderate qua `expo`, `@expo/fingerprint`, `minimatch`; 0 high/critical. Advisory GHSA-g3hv-75wg-m249. Audit đề nghị đổi major xuống Expo 52.0.49; KHÔNG áp dụng tự động. Cần đánh giá reachability và cách nâng dependency tương thích trước release.
- Backend hoạt động `/health` 200, VLM configured. Bản song ngữ chưa được đánh giá ngôn ngữ/độ chính xác bằng provider thật sau cập nhật; stub chỉ chứng minh giao thức/cache.
- Access log trước restart đã ghi LAN client tạo phiên, upload, lấy report và phân tích HTTP 200. Không chứng minh toàn bộ native workflow hoặc mọi giai đoạn trên mọi thiết bị.
- `python3 corpus/legal-demo/verify.py`: 3 văn bản, 17 nguyên điều; hashes/provenance/metadata/excerpts/IDs/boundaries PASS. Citation ledger README `--evidence`: citations OK. Bản gốc demo, chưa kiểm chứng đầy đủ sửa đổi/hiệu lực hiện tại; corpus không đồng nghĩa RAG đã hoạt động.

## Release blockers

| Ưu tiên | Hiện trạng xác nhận | Điều kiện đóng |
|---|---|---|
| P0 | API dùng HTTP LAN; app cho phép cleartext toàn Android (`app/plugins/withLanHttp.cjs:2-5`), iOS cho local networking (`app/app.json:13-15`); API URL chỉnh được và default localhost trong `app/App.tsx` | Domain/API HTTPS ổn định; release config chặn cleartext ngoài môi trường demo; thử chứng chỉ, lỗi mạng và không forward bearer sang host khác |
| P0 | Prototype chưa có user account/rate limiting production theo `README.md:21`; session bearer chưa thay cho danh tính/người dùng/doanh nghiệp | Giới hạn tạo phiên/upload/VLM, quota dung lượng/chi phí, chính sách thu hồi/expiry và quyền truy cập phù hợp phạm vi phát hành; xác nhận lại bằng audit backend độc lập |
| P0 | Chỉ Expo Go và bundle; `app/eas.json` chưa có; máy không có adb/sdkmanager | Build release đã ký bằng native toolchain hoặc EAS; cài thật Android/iOS mục tiêu; thử camera/permission Settings/foreground/SecureStore/restart/picker/share/xóa và ảnh gốc byte-exact PASS/ảnh sửa FAIL |
| P0 | Chưa có cấu hình deploy/service/reverse proxy ở root được kiểm tra; server hiện là uvicorn chạy theo phiên CLI | Chọn host, TLS, service restart/health/readiness, secret injection, volume bền vững, rollback; kiểm thử restart và restore backup ở môi trường staging |
| P0 | Ảnh gốc trong SQLite và bản cục bộ; quyền thư mục DB 0700, file DB 0600 đã kiểm tra, nhưng không chứng minh mã hóa at rest hoặc chính sách vận hành | Quy định retention/xóa/xuất dữ liệu, backup mã hóa và restore drill, quyền vận hành, thông báo/consent và rà soát quyền riêng tư trước dữ liệu khách thật |
| P1 | DEMO-01 dọn config/debug mới ghi task, chưa áp dụng | Đưa cấu hình kỹ thuật vào mục nâng cao; không giấu lỗi, consent, giới hạn integrity hay đường khôi phục kết nối |
| P1 | Phần lớn implementation vẫn untracked (`git status`), chưa có release baseline/CI được kiểm tra | Rà soát và tạo release commit theo user phê duyệt; CI cài từ lock/pins rồi chạy tests và build; không đưa .env/DB/ảnh vào Git |
| P1 | Dependency audit có 3 moderate | Đánh giá phiên bản, khả năng khai thác thực tế và bản sửa tương thích; ghi risk acceptance nếu chưa sửa, không `audit fix --force` |

## Các phần chức năng không được quảng cáo là đã có

- Dashboard doanh nghiệp đang được hai agent xây, chưa tích hợp hoặc kiểm thử toàn luồng. Phạm vi đầu tiên một doanh nghiệp demo, đăng nhập và grant hồ sơ tường minh; không phải production multi-tenancy. Audit quyền phải chạy lại sau tích hợp.
- RAG hiện có corpus thật; retrieval/generation/citation-grounding trong app chưa hoàn tất. Không tạo câu trả lời pháp lý từ văn bản chưa kiểm chứng hiệu lực mà thiếu cảnh báo. Trích nguồn không tự chứng minh lập luận đúng hoặc áp dụng đúng vụ việc.
- Retry upload ảnh pending vẫn cần hoàn thiện; không xóa ảnh khi upload thất bại. Hiện giữ ảnh và reconcile khi tải lại phiên.
- Preview ảnh dùng bản cục bộ; bản cục bộ mất thì không có endpoint client tải ảnh để xem lại. Preview không thay thế verify.
- Danh tính thiết bị/chữ ký là software key; PASS không chứng minh cảnh thật, thời điểm tin cậy, danh tính được chứng nhận hoặc giá trị pháp lý. Báo cáo không được ký toàn bộ; quan hệ retake và nhận xét là metadata server.

## Thứ tự tiếp theo

1. Audit backend độc lập đã hoàn tất tại `docs/PRODUCTION-SECURITY-AUDIT.md`: 8 phát hiện, kết luận chưa đủ điều kiện public production. Chặn chính: admission/quota, HTTPS/perimeter, timeout/concurrency/SQLite blocking, expiry/revoke bearer, backup/restore/retention; VLM cần policy/privacy và giới hạn chi phí nếu dùng dữ liệu thật. Các tham chiếu dòng và giới hạn 4 ảnh trong audit là snapshot trước thay đổi hồ sơ 20 ảnh/dashboard đang phát triển; phải audit lại sau tích hợp, không coi tests xanh là an toàn production.
2. Tích hợp dashboard và kiểm thử share-consent, login, CSRF, chỉ thấy hồ sơ được cấp quyền, ảnh thật, logout và truy cập chéo bị chặn.
3. Hoàn tất demo LAN trên điện thoại trước; không mở public để thay thế kiểm thử.
4. Đóng P0 trên staging HTTPS, rồi mới quyết định deploy production. Dashboard/RAG chỉ là release gate nếu được đưa vào phạm vi phát hành.
