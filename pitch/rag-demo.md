# RAG demo — tra cứu nguồn (retrieval-only)

Trạng thái thật: dashboard có tab **Căn cứ** gọi `GET /dashboard/api/legal?q=...`, trả 5 đoạn trích nguyên văn + tiêu đề + điều/khoản + URL nguồn + SHA-256. **Không có model sinh câu trả lời.** Nhãn UI: `CHỈ TRUY XUẤT · KHÔNG SINH CÂU TRẢ LỜI`.

Nói khi demo: "Đây là truy xuất căn cứ có nguồn, không phải chatbot tư vấn. Hệ thống trả đoạn gốc kèm hash để đối chiếu, không tự kết luận quyền lợi."

## Bộ câu hỏi đã kiểm (chạy được trên server demo)

Đăng nhập dashboard → tab **Căn cứ** → nhập đúng chuỗi dưới.

1. `hồ sơ bồi thường gồm những gì` → top-1 Điều 7 "Hồ sơ bồi thường" (chunk `baoviet-969-2026-7`).
   Nói: "Điều 7 liệt kê 7.1.1 thông báo tai nạn theo mẫu, 7.1.2 giấy tờ xe/người lái, 7.1.3 chứng từ thiệt hại; tuỳ vụ việc một hoặc nhiều loại."
2. `5.2.6` → top-1 khoản 5.2.6 "Nghĩa vụ khi xảy ra thiệt hại" (chunk `baoviet-969-2026-5-2-6`).
   Nói: "Thông báo ngay cho tổng đài trong 24 giờ hoặc ngay khi có thể, giữ hiện trường, không tự di chuyển/sửa chữa khi chưa có ý kiến; thông báo văn bản trong 5 ngày."
3. `điều khoản loại trừ trách nhiệm` → top-1 Điều 11 (chunk `baoviet-969-2026-11`).
   Nói: "Loại trừ gồm cố ý, mất đăng kiểm, không giấy phép lái hợp lệ, nồng độ cồn quá 50 mg/100 ml máu hoặc 0,25 mg/l khí thở, chất ma tuý... Trích nguyên văn, không diễn giải thêm."
4. `giám định thiệt hại` → top-1 Điều 6 (chunk `baoviet-969-2026-6`).
   Nói: "Điều 6 nói giám định có mặt các bên, lập văn bản; khoản 6.4 nêu trường hợp đặc biệt không giám định được thì hướng dẫn thu thập thông tin, ảnh chụp thiệt hại. **Nguồn không quy định bộ góc chụp cản xe** — checklist 4 nhóm trong app là của TRUSTCAM, không phải của hãng."
5. `PASS có đồng nghĩa được bồi thường không` → trả về đoạn về nghĩa vụ chứng minh và loại trừ, **không** trả câu kết luận.
   Nói: "Đúng như thiết kế: hệ thống không sinh câu trả lời. PASS của TRUSTCAM chỉ là toàn vẹn byte/chữ ký; quyền lợi do giám định viên và doanh nghiệp bảo hiểm quyết định theo hợp đồng thực tế."

## Giới hạn phải nói nếu bị hỏi

- Xếp hạng là **keyword + IDF + bigram**, không phải embedding. Câu hỏi diễn đạt khác từ trong văn bản (ví dụ `báo tổn thất thế nào`) có thể trả đoạn chưa đúng nhất; gõ từ khoá hoặc số điều/khoản (`5.2.6`, `Điều 7`) thì ổn định.
- Corpus demo: 3 văn bản luật (17 điều) + 3 tài liệu Bảo Việt (10 chunk). Không phải hợp đồng của khách, `current_validity_verified=false`, chưa kiểm hiệu lực/sửa đổi hiện tại.
- Không phải tư vấn pháp lý, không tính/duyệt bồi thường, không suy quyền lợi từ ảnh hay kết quả FAIL.
- Bản public chỉ có `chunks.jsonl` + `manifest.json`; verify toàn bộ gốc cần tải PDF/HTML gốc đúng hash trong `manifest.json`.

## Mở rộng nếu muốn "trả lời" thật

Cần: model sinh câu trả lời + trích dẫn bắt buộc + từ chối khi thiếu căn cứ, chạy server-side (VLM hiện tắt trên demo), kèm test chống bịa. Chưa làm; đừng gọi phần hiện tại là generative RAG.
