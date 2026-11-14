# Công nghệ, công cụ và bài học / Stack, tools, and one lesson

## Công nghệ chính

- **Ứng dụng di động:** Expo, React Native và TypeScript; chạy thử qua Expo Go, hỗ trợ tiếng Việt và tiếng Anh. Dùng Expo Camera để chụp ảnh, SecureStore để lưu khóa và thông tin truy cập.
- **Backend và lưu trữ:** Python, FastAPI và SQLite; lưu ảnh, hồ sơ và lịch sử chụp lại bằng giao dịch nguyên tử.
- **Kiểm tra toàn vẹn:** SHA-256 và chữ ký Ed25519, dùng `@noble/ed25519` phía ứng dụng và PyNaCl phía backend. Ký manifest chứa hash của nguyên byte ảnh; backend đối chiếu ảnh với dữ liệu đã ký.
- **AI thị giác:** VLM qua API OpenAI để nhận xét ảnh khi người dùng đồng ý. Nhận xét chỉ mang tính tham khảo, không quyết định quyền lợi bảo hiểm.
- **Dashboard doanh nghiệp:** HTML, CSS và JavaScript thuần; xem hồ sơ được cấp quyền, ảnh, lịch sử và báo cáo.
- **Tra cứu tài liệu:** Kho văn bản có nguồn trích dẫn; hiện truy xuất đoạn gốc, chưa sinh câu trả lời pháp lý bằng RAG.

## Công cụ phát triển

Git, Expo CLI, Expo Doctor, TypeScript typecheck, Python `unittest`, kiểm thử HTTP và Playwright/Chromium. Hermes Agent hỗ trợ chia việc song song giữa mobile, backend, dashboard và kiểm thử.

## Một bài học đội học được

**Ảnh không bị sửa không đồng nghĩa nội dung ảnh là sự thật.** Thử nghiệm ảnh gốc PASS và ảnh đã sửa FAIL giúp đội tách rõ kiểm tra toàn vẹn khỏi nhận xét AI và quyết định nghiệp vụ. Với hồ sơ bảo hiểm ô tô, TRUSTCAM hỗ trợ thu thập, lưu lịch sử và đối chiếu bằng chứng; doanh nghiệp vẫn phải xác minh sự việc và quyết định bồi thường theo hợp đồng.

