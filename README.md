# TRUSTCAM

Thu thập hồ sơ ảnh có chữ ký số cho demo tiếp nhận yêu cầu bồi thường bảo hiểm vật chất ô tô. Mobile Expo React Native TypeScript VI/EN, backend FastAPI/SQLite, dashboard doanh nghiệp HTML/CSS/JavaScript thuần.

**Bản demo có kiểm soát, chưa sẵn sàng production public. Không dùng ảnh khách hàng thật.** Đăng nhập dashboard không bảo vệ các API tạo hồ sơ riêng; cần VPN/IP allowlist hoặc SSH tunnel cho toàn dịch vụ. Xem [audit](docs/PRODUCTION-SECURITY-AUDIT.md), [readiness](docs/PRODUCTION-READINESS.md) và [hướng dẫn server](docs/DEPLOY-DEMO.md).

## Giám khảo bắt đầu ở đây

- [Workflow và lời thoại bàn giao](pitch/workflow.md).
- [Stack, công cụ và một bài học](pitch/stack-tools-lesson.md).
- [Workflow kỹ thuật](docs/DEMO-WORKFLOW.md).
- [Dashboard và API/quyền](backend/dashboard-README.md).
- [Nguồn luật](corpus/legal-demo/README.md) và [tài liệu bảo hiểm mẫu Bảo Việt](corpus/motor-insurance-demo/README.md). Không phải đối tác hoặc hợp đồng của người dùng.

## Luồng chính

1. Khách tạo hồ sơ trong Camera, chụp bốn nhóm tối thiểu: toàn cảnh, tổn thất, biển số/VIN thử nghiệm, giấy tờ tổng hợp. Có thể bổ sung đến 20 ảnh hiện hành; lịch sử tối đa 80 ảnh.
2. App băm nguyên byte ảnh bằng SHA-256, ký canonical manifest chứa hash bằng Ed25519. Backend xác minh và lưu ảnh/metadata cùng giao dịch SQLite.
3. Khách chọn ảnh và đồng ý trước khi gửi VLM nhận xét. Chụp lại giữ phiên bản cũ; nhận xét chỉ tham khảo, không tự duyệt bồi thường.
4. Checklist/Báo cáo/Kiểm tra chọn hồ sơ trước khi xem chi tiết. App lưu tối đa 4 hồ sơ tổng cộng, chịu trần 2000 byte SecureStore; URL dài có thể đầy sớm hơn.
5. Khách xác nhận riêng để doanh nghiệp xem ảnh, lịch sử và báo cáo. Demo chưa hỗ trợ thu hồi cấp quyền. Dashboard chỉ liệt kê hồ sơ đã chia sẻ.
6. Đối chiếu ảnh gốc PASS, bản sửa FAIL chỉ xác nhận phạm vi toàn vẹn/chữ ký. Không chứng minh cảnh thật, thời gian thật, danh tính, gian lận, giá trị pháp lý hoặc quyền lợi bảo hiểm. JSON report chưa có chữ ký bao phủ toàn báo cáo.

## Chạy local

Python 3.12 và Node 26; môi trường được kiểm tra với Expo SDK 58.0.25, React Native 0.88.1 và React 19.3.0.

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Terminal khác:

```sh
cd app
npm ci
npx expo start --go
```

Điện thoại cần API LAN hoặc HTTPS truy cập được; localhost trên điện thoại là chính điện thoại. Chỉ bind `0.0.0.0` trên LAN tin cậy. URL đã lưu trong Settings ưu tiên hơn `EXPO_PUBLIC_API_URL`; không tự chuyển token sang server khác. Expo tunnel không tunnel backend.

Backend không tự nạp `.env`. Thiết lập biến môi trường qua shell hoặc service EnvironmentFile; dùng `.env.example` làm mẫu, không commit giá trị thật. VLM tùy chọn; thiếu cấu hình thì không tạo nhận xét giả. Dashboard mặc định tắt; mật khẩu riêng qua `TRUSTCAM_DASHBOARD_PASSWORD`, HTTPS cookie Secure mặc định. Chi tiết trong tài liệu backend.

## Kiểm tra

```sh
.venv/bin/python -W error::ResourceWarning -m unittest discover -s tests -v
.venv/bin/python tests/live_smoke.py
node dashboard/check.mjs
cd app
npm run typecheck
npm run self-check
npm run config-check
npx expo-doctor
npx expo export --platform all --output-dir dist
```

Snapshot kiểm tra ngày 14/11/2026: 71 test backend PASS (gồm tra cứu corpus bảo hiểm); mobile typecheck/self-check/config-check PASS; dashboard Node checks PASS. Live smoke dùng server/DB tạm, TypeScript signer và transport thật qua HTTP: ảnh gốc PASS, ảnh sửa FAIL, ảnh bổ sung, retake/lịch sử/stale rejection, report 5 ảnh bất biến. Các thay đổi sau snapshot cần chạy lại kiểm tra.

Expo Doctor trước đó 20/20; Android/iOS Hermes export thành công. Các kiểm tra này không thay camera, Alert, SecureStore hoặc luồng điện thoại đến dashboard trên thiết bị thật. Chưa có nghiệm thu native xuyên suốt; không có APK/IPA production trong repo.

## Tra cứu và dữ liệu

Dashboard có tra cứu đoạn trích nguồn, không sinh câu trả lời pháp lý hoặc quyết định bồi thường. Corpus luật chung và corpus bảo hiểm tách nguồn; hiệu lực áp dụng hiện tại/hợp đồng khách chưa được xác minh. Bản đầy đủ PDF/OCR bảo hiểm giữ local, không đưa vào Git; public repo giữ đoạn chọn, nguồn và hash. Full corpus verifier cần tải đúng bản gốc theo manifest.

Không đưa `.env`, DB, ảnh người dùng, khóa riêng, node_modules, build Expo hoặc video nháp vào repo. Dữ liệu server mới tách khỏi mã nguồn qua `TRUSTCAM_DATA_DIR`; không clone DB demo local lên server.
