# Corpus pháp lý demo TRUSTCAM

3 văn bản gốc tiếng Việt, 17 chunk theo điều đầy đủ. Chỉ dữ liệu đầu vào demo RAG; chưa nối retrieval, API hay UI. Không phải tư vấn pháp lý, kết luận tranh chấp hoặc cơ chế tự động phạt/bồi thường.

**Cảnh báo phiên bản:** `original text; amendment applicability not fully verified`. Tất cả tài liệu/chunk có `demo_only=true`, `current_validity_verified=false`. Ngày hiệu lực trong metadata là ngày ghi ở trang nguồn, không chứng minh toàn bộ văn bản còn nguyên hiệu lực năm 2026. Không trộn nội dung sửa đổi vào bản gốc.

## Phạm vi

| Văn bản | Điều chọn | Nguồn thân văn bản |
|---|---|---|
| Luật Giao dịch điện tử 20/2023/QH15 | 8–11, 22–23 | PDF Cổng Thông tin điện tử Chính phủ [4] |
| Bộ luật Dân sự 91/2015/QH13 | 32, 38, 472, 479, 482, 589 | PDF Cục Tần số vô tuyến điện [10] |
| Bộ luật Tố tụng dân sự 92/2015/QH13 | 93–97 | PDF Công báo gốc, 3 phần [12] |

`manifest.json`: tên/số văn bản, ngày ban hành/hiệu lực xác minh từ HTML chính thức đã lưu, VN/vi, thời điểm tải UTC thực tế, URL yêu cầu/URL cuối, SHA256 raw/text, phạm vi điều và cảnh báo phiên bản. `raw/`: HTML/PDF nguyên trạng; `text/`: thân luật chuẩn hóa; `chunks.jsonl`: nguyên điều, nguồn, SHA256, vị trí ký tự trong text. `citations.json`: ledger và trích dẫn được kiểm tra khớp nguồn.

PDF Công báo tố tụng có văn bản khác cùng số báo; plain text chỉ giữ Bộ luật, từ số luật đến chữ ký cuối Điều 517. Chuẩn hóa bằng `pdftotext -layout -enc UTF-8`, bỏ header/chân trang, số trang, metadata ký; gộp dòng xuống hàng do dàn trang và khoảng trắng, không viết lại nội dung. Không OCR, không dịch, không cắt theo số ký tự. PDF dân sự dùng bản cơ quan nhà nước có text thay cho scan đính kèm Chính phủ. Không khẳng định bản sao này là bản hợp nhất.

## Câu hỏi thử và điều kỳ vọng

Các ví dụ chỉ kiểm tra tìm đúng điều, không là đáp án pháp lý hoàn chỉnh. Trả lời tiếng Anh sau này phải ghi rõ bản dịch; dữ liệu nguồn giữ tiếng Việt.

- **Thông điệp dữ liệu có bị phủ nhận giá trị pháp lý chỉ vì hình thức điện tử không?** Kỳ vọng: `20-2023-QH15`, Điều 8. Trích nguyên văn: “Thông tin trong thông điệp dữ liệu không bị phủ nhận giá trị pháp lý chỉ vì thông tin đó được thể hiện dưới dạng thông điệp dữ liệu.”[4]
- **Chữ ký điện tử có giá trị pháp lý thế nào trong văn bản gốc?** Kỳ vọng: `20-2023-QH15`, Điều 23. Trích nguyên văn: “1. Chữ ký điện tử không bị phủ nhận giá trị pháp lý chỉ vì được thể hiện dưới dạng chữ ký điện tử.”[4]
- **Chứng cứ trong vụ việc dân sự là gì?** Kỳ vọng: `92-2015-QH13`, Điều 93. Trích nguyên văn: “Chứng cứ trong vụ việc dân sự là những gì có thật được đương sự và cơ quan, tổ chức, cá nhân khác giao nộp, xuất trình cho Tòa án trong quá trình tố tụng hoặc do Tòa án thu thập được theo trình tự, thủ tục do Bộ luật này quy định và được Tòa án sử dụng làm căn cứ để xác định các tình tiết khách quan của vụ án cũng như xác định yêu cầu hay sự phản đối của đương sự là có căn cứ và hợp pháp.”[12]
- **Sử dụng hình ảnh cá nhân cần xem điều nào?** Kỳ vọng: `91-2015-QH13`, Điều 32. Trích nguyên văn: “1. Cá nhân có quyền đối với hình ảnh của mình. Việc sử dụng hình ảnh của cá nhân phải được người đó đồng ý. Việc sử dụng hình ảnh của người khác vì mục đích thương mại thì phải trả thù lao cho người có hình ảnh, trừ trường hợp các bên có thỏa thuận khác.”[10]
- **Trả lại tài sản thuê cần đối chiếu nghĩa vụ nào?** Kỳ vọng: `91-2015-QH13`, Điều 482. Trích nguyên văn: “1. Bên thuê phải trả lại tài sản thuê trong tình trạng như khi nhận, trừ hao mòn tự nhiên hoặc theo đúng như tình trạng đã thoả thuận; nếu giá trị của tài sản thuê bị giảm sút so với tình trạng khi nhận thì bên cho thuê có quyền yêu cầu bồi thường thiệt hại, trừ hao mòn tự nhiên.”[10]

## Kiểm tra offline

```sh
python corpus/legal-demo/verify.py
```

Bản GitHub không chứa `raw/` (HTML/PDF gốc). Full verifier cần các file gốc tải riêng theo URL và hash trong `manifest.json`; clone sạch chưa đủ chạy kiểm tra toàn corpus. Tra cứu dashboard chỉ cần chunks/manifest. Không tải lại phiên bản khác rồi coi hash là tương đương.

Chỉ Python stdlib, không tải mạng hoặc gọi provider. Kiểm tra SHA256 file gốc/text/chunk, metadata pháp lý, thời gian/host nguồn, ID duy nhất, nội dung chunk thuộc text, dấu mốc chống thiếu/trống và ranh giới nguyên điều. Không xác minh nội dung raw bằng OCR hoặc tình trạng hiệu lực pháp luật hiện tại.

## Giới hạn truy cập và quyền sử dụng

`vbpl.vn`/`moj.gov.vn` trả HTTP 403; `vbpl.moj.gov.vn` lỗi DNS; `toaan.gov.vn` lỗi chuỗi chứng chỉ TLS. Không tắt kiểm tra TLS. Đính kèm 2016 trên datafiles là scan không có thân text nên chuyển nguồn chính thức khác. Không có kiểm tra đầy đủ sửa đổi áp dụng năm 2026.

Chỉ lưu văn bản pháp luật công khai để demo, giữ nguồn và tính toàn vẹn. Không khẳng định giấy phép mở cụ thể hay quyền tái phân phối toàn bộ thành phần website/PDF; cần rà soát quyền sử dụng trước khi phát hành sản phẩm.

## Sources

[4] https://datafiles.chinhphu.vn/cpp/files/vbpq/2023/8/luat20-2023-qh15..pdf
    > "Điều 8. Giá trị pháp lý của thông điệp dữ liệu
Thông tin trong thông điệp dữ liệu không bị phủ nhận giá trị pháp lý chỉ vì thông tin đó được thể hiện dưới dạng thông điệp dữ liệu."
    > "Thông tin trong thông điệp dữ liệu không bị phủ nhận giá trị pháp lý chỉ vì thông tin đó được thể hiện dưới dạng thông điệp dữ liệu."
    > "1. Chữ ký điện tử không bị phủ nhận giá trị pháp lý chỉ vì được thể hiện dưới dạng chữ ký điện tử."
[10] https://rfd.gov.vn/content/vanban/Lists/VBPQ/Attachments/108/91_2015_QH13_Bo%20Luat%20Dan%20su.pdf
    > "Điều 32. Quyền của cá nhân đối với hình ảnh
1. Cá nhân có quyền đối với hình ảnh của mình. Việc sử dụng hình ảnh của cá nhân phải được người đó đồng ý. Việc sử dụng hình ảnh của người khác vì mục đích thương mại thì phải trả thù lao cho người có hình ảnh, trừ trường hợp các bên có thỏa thuận khác.
2. Việc sử dụng hình ảnh trong trường hợp sau đây không cần có sự đồng ý của người có hình ảnh hoặc người đại diện theo pháp luật của họ:
a) Hình ảnh được sử dụng vì lợi ích quốc gia, dân tộc, lợi ích công cộng;
b) Hình ảnh được sử dụng từ các hoạt động công cộng, bao gồm hội nghị, hội thảo, hoạt động thi đấu thể thao, biểu diễn nghệ thuật và hoạt động công cộng khác mà không làm tổn hại đến danh dự, nhân phẩm, uy tín của người có hình ảnh.
3. Việc sử dụng hình ảnh mà vi phạm quy định tại Điều này thì người có hình ảnh có quyền yêu cầu Tòa án ra quyết định buộc người vi phạm, cơ quan, tổ chức, cá nhân có liên quan phải thu hồi, tiêu hủy, chấm dứt việc sử dụng hình ảnh, bồi thường thiệt hại và áp dụng các biện pháp xử lý khác theo quy định của pháp luật."
    > "1. Cá nhân có quyền đối với hình ảnh của mình. Việc sử dụng hình ảnh của cá nhân phải được người đó đồng ý. Việc sử dụng hình ảnh của người khác vì mục đích thương mại thì phải trả thù lao cho người có hình ảnh, trừ trường hợp các bên có thỏa thuận khác."
    > "1. Bên thuê phải trả lại tài sản thuê trong tình trạng như khi nhận, trừ hao mòn tự nhiên hoặc theo đúng như tình trạng đã thoả thuận; nếu giá trị của tài sản thuê bị giảm sút so với tình trạng khi nhận thì bên cho thuê có quyền yêu cầu bồi thường thiệt hại, trừ hao mòn tự nhiên."
[12] https://congbaocdn.chinhphu.vn/CongBaoCP/VanBan/2015/11/18411/28624-1-incb-12511252-29-12-2015signedsignedsignedpdf
    > "Điều 93. Chứng cứ
Chứng cứ trong vụ việc dân sự là những gì có thật được đương sự và cơ quan, tổ chức, cá nhân khác giao nộp, xuất trình cho Tòa án trong quá trình tố tụng hoặc do Tòa án thu thập được theo trình tự, thủ tục do Bộ luật này quy định và được Tòa án sử dụng làm căn cứ để xác định các tình tiết khách quan của vụ án cũng như xác định yêu cầu hay sự phản đối của đương sự là có căn cứ và hợp pháp."
    > "Chứng cứ trong vụ việc dân sự là những gì có thật được đương sự và cơ quan, tổ chức, cá nhân khác giao nộp, xuất trình cho Tòa án trong quá trình tố tụng hoặc do Tòa án thu thập được theo trình tự, thủ tục do Bộ luật này quy định và được Tòa án sử dụng làm căn cứ để xác định các tình tiết khách quan của vụ án cũng như xác định yêu cầu hay sự phản đối của đương sự là có căn cứ và hợp pháp."
