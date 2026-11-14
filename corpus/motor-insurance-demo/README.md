# Corpus ví dụ — bảo hiểm vật chất ô tô Bảo Việt

## Phạm vi và cảnh báo

- 3 tài liệu cùng doanh nghiệp, 10 đoạn nguyên mục/khoản được chọn; ví dụ xe đỗ an toàn, phát hiện cản xe bị xước. Không khẳng định vết xước thuộc phạm vi, không ước lượng tiền chi trả.
- Đây là **điều kiện hợp đồng bảo hiểm tự nguyện**, biểu mẫu và thông tin sản phẩm, **không phải văn bản quy phạm pháp luật**. Không dùng Nghị định 67/2023/NĐ-CP hay bảo hiểm bắt buộc TNDS thay cho quy tắc bảo hiểm vật chất. Không thu thập luật bổ sung trong đợt này.
- Bảo Việt chỉ là ví dụ nguồn công khai, không phải đối tác TRUSTCAM được xác nhận, không phải khuyến nghị mua hàng, không phải hợp đồng của người dùng. Cần đối chiếu giấy chứng nhận/đơn bảo hiểm, thời hạn, thanh toán phí, phụ lục, sửa đổi và tình tiết/giám định thực tế.
- `current_validity_verified=false`, `latest_version_verified=false`, `demo_only=true` cho toàn bộ bộ dữ liệu. URL truy cập được không chứng minh quy tắc còn áp dụng năm 2026 hay hợp đồng cụ thể.
- Quy tắc 969/QĐ-BHBV ngày 26/01/2026 được đọc trực tiếp từ ảnh trang 1 PDF; trang sản phẩm gắn nhãn “áp dụng từ 1/3/2026”. Đây là **nhãn áp dụng trên website**, không suy thành ngày hiệu lực pháp luật hay xác nhận bản mới nhất.[3][1]
- Ngày công bố trang web và mẫu yêu cầu bồi thường: **không xác định**. Ngày hiệu lực ghi trong quyết định độc lập: **chưa xác minh**, để `effective_date=null`. Không lấy PDF CreationDate làm ngày ban hành.

## Tài liệu được chọn

| document_id | Loại | Nội dung | Nguồn |
|---|---|---|---|
| `baoviet-969-2026` | `insurer_policy` | PDF đầy đủ 21 trang; chọn nguyên khoản 5.2.6, 5.2.7, nguyên Điều 6, 7, 10, 11, 14 và nguyên khoản 15.2 | [3] |
| `baoviet-product-54` | `claims_guide`* | HTML sản phẩm, chọn nhãn phiên bản 5688/969; giữ toàn bộ HTML | [1] |
| `baoviet-own-damage-claim-form` | `claims_guide` | PDF 1 trang “Áp dụng đối với tổn thất vật chất đơn giản”; thông tin người, xe, ngày giờ/nơi, nguyên nhân, đề xuất, cam đoan | [6] |

*Schema chỉ cho `insurer_policy|claims_guide|law`; trang sản phẩm xếp nhóm tham chiếu `claims_guide`, **không phải hướng dẫn bồi thường riêng**. Quy trình nghĩa vụ, giám định và checklist chính thức nằm tại khoản 5.2.6, Điều 6 và Điều 7 của chính quy tắc 969.[3] Mẫu công khai không có ngày/phiên bản, không xác nhận được là mẫu áp dụng riêng quy tắc 969.[6]

## Các điểm có thể trả lời có nguồn

1. **Báo tổn thất:** khoản 5.2.6(a) yêu cầu thông báo ngay cho Tổng đài dịch vụ chăm sóc khách hàng của Bảo Việt, giữ nguyên toàn bộ điều kiện “trong vòng 24 giờ … hoặc ngay khi có thể, trừ trường hợp bất khả kháng”; khoản (c) quy định thông báo bằng văn bản trong năm (05) ngày và các ngoại lệ/hình thức khác. Không trộn mốc sáu giờ từ bản cũ.[3]
2. **Trước sửa chữa/di chuyển:** khoản 5.2.6(b) không cho tự ý di chuyển, tháo dỡ, sửa chữa khi chưa được chấp thuận; có ngoại lệ an toàn, đề phòng hạn chế thiệt hại và yêu cầu cơ quan có thẩm quyền. Khoản 15.2(a) nêu giảm trừ khi tự ý tháo dỡ/sửa chữa, nhưng không dùng đoạn này để tự tính tiền hay kết luận hồ sơ cụ thể.[3]
3. **Chụp ảnh gì:** Điều 6.4 chỉ nói chứng từ, ảnh chụp thiệt hại và tài liệu liên quan, trong trường hợp đặc biệt không thể giám định và doanh nghiệp hướng dẫn thu thập. Nguồn không có checklist số ảnh/góc chụp cho cản xe; không được gán checklist do demo đề xuất thành yêu cầu bắt buộc của hãng.[3]
4. **Hồ sơ:** Điều 7 mở đầu “Đối với từng vụ việc cụ thể … một hoặc nhiều loại tài liệu”; giữ toàn bộ điều kiện “nếu có”, nhánh công an, bên thứ ba và mất trộm. Không bắt mọi hồ sơ xước nhẹ phải có hồ sơ công an/tòa án.[3]
5. **Phạm vi/loại trừ/khấu trừ:** nguyên Điều 10, 11, 14 được giữ kèm ngoại lệ. Điều 14 nêu mức khấu trừ chung tối thiểu 500.000 đồng/vụ và mức khác ghi trong hợp đồng; đây không phải khấu trừ thực tế của người dùng. Điều 11 là ngôn ngữ hợp đồng của ví dụ, không dùng các mức trong đó để diễn giải ngưỡng pháp luật giao thông hiện hành.[3]
6. Mẫu có ô “Xước xát trong quá trình sử dụng” nhưng sự tồn tại ô kê khai **không xác nhận vết xước được bồi thường**; mẫu cũng cảnh báo thông tin không đúng sự thật có thể dẫn đến từ chối/giảm tiền bồi thường.[6]

**PASS không đồng nghĩa được bồi thường.** Đây là guardrail thiết kế demo, không phải trích tuyên bố doanh nghiệp về TRUSTCAM. Kiểm tra toàn vẹn/chứng cứ độc lập với xác định hợp đồng, rủi ro, loại trừ, trách nhiệm, khấu trừ và quyết định bồi thường. Không nguồn nào trong corpus định nghĩa TRUSTCAM PASS. `queries.json` buộc từ chối kết luận coverage.

## File và khả năng kiểm tra

- **Bản public chỉ giữ corpus chọn lọc và provenance** (`chunks.jsonl`, các text chọn lọc, manifest, citations, retrievals, query fixtures và script). Không phân phối `raw/` hoặc `text/baoviet-969-2026.full-ocr-unreviewed.txt`, tránh phát hành lại toàn bộ quy tắc gốc.
- `raw/` là dữ liệu **cục bộ, không nằm trong bản public**: byte HTML/PDF đã tải, text layer `pdftotext`, ảnh render, Tesseract `vie` thật, bản chép có đối chiếu ảnh của các mục chọn.
- `text/baoviet-969-2026.selected.txt`: bản chép nguyên mục/khoản được đối chiếu trực quan; **không phải toàn bộ quy tắc**. Các mục không liên tiếp, ranh giới nêu rõ trong chunk.
- `text/baoviet-969-2026.full-ocr-unreviewed.txt` (**chỉ cục bộ, không phát hành public**): toàn bộ kết quả Tesseract 21 trang, có lỗi OCR; không dùng trực tiếp để trả lời pháp lý. PDF mới có text layer lỗi nặng, không âm thầm sửa bằng phỏng đoán. Các đoạn chọn được đọc lại từ PNG trang 9–15, 17–18; số/ngày quyết định kiểm tra ảnh trang 1. Ảnh và OCR gốc giữ nguyên. Chuẩn hóa ngắt dòng, không giữ bố cục in.
- `chunks.jsonl`: cùng trường nền như `legal-demo`, thêm `boundary_start`, `boundary_end`, `pdf_pages`, `citation_id`. `article` **có thể là chuỗi** như `5.2.6`, `15.2`, `Mẫu toàn trang`, không chỉ số nguyên. `legal_status` phân biệt điều khoản/biểu mẫu với luật.
- `text_start/text_end`: chỉ số **ký tự Unicode**, nửa mở `[start,end)`, trong file UTF-8 `source_file`; không phải byte offset hoặc tọa độ PDF. `sha256` mỗi chunk là hash UTF-8 chính xác `text`.
- `manifest.json`: 3 documents với version/type/insurer/URLs/file hashes; inventory toàn bộ raw/text và candidates loại khỏi chunk. `retrievals.json`: HTTP 200 và timestamp UTC lần tải kiểm tra lại. Hai PDF kiểm tra lại trùng byte; HTML động khác hash, giữ cả `.refetch`, không coi hash khác là giả mạo. Timestamp lần đầu từ mtime ghi rõ phương pháp, không giả lập HTTP headers.
- `citations.json`: ledger cục bộ đăng ký URL thật; evidence nguyên đoạn đã qua `sources.py quote --from` trên file text. Kiểm tra quote xác nhận trùng bản chép/extraction, **không chứng minh OCR đúng từng ký tự so với ảnh**, không xác nhận quyền lợi khách hàng.
- `queries.json`: 5 query fixtures, trích nguyên passage kỳ vọng, chunk ID, URL, offset và guardrail; là dữ liệu test tĩnh, **không phải kết quả retrieval/model đã chạy**.
- `build.py`: tái dựng offline từ byte/text giữ lại; chỉ phần ghi evidence cần helper ledger có sẵn của Hermes. `verify.py`: stdlib-only, không mạng, không helper bên ngoài.

```bash
cd /home/rcong/Project/trustcam/corpus/motor-insurance-demo
python verify.py
```

**Full verifier yêu cầu bản gốc được tải cục bộ.** Fresh clone public không đủ file để chạy thành công `verify.py`: phải tự tải các bản gốc từ URL trong manifest, khôi phục đường dẫn raw/text và các sản phẩm OCR/render tương ứng. Script kiểm tra hash chính xác của snapshot đã ghi; nguồn thay đổi hoặc OCR khác môi trường có thể không khớp, không được sửa hash để tạo PASS giả. Backend retrieval chỉ cần manifest/chunks chọn lọc, không cần raw hay full OCR.

Khi có đủ dữ liệu cục bộ, verifier kiểm tra hash mọi file raw/text; exact substring/hash mọi chunk; ranh giới mục và khoản cuối; metadata; PDF magic; hash retrieval; 5 query fixtures. PASS của script này chỉ là kiểm tra dữ liệu, không phải kết luận bảo hiểm.

## Nguồn thử nhưng không dùng để trả lời

- `raw/baoviet-6556-2016.pdf`: bản 2016 tìm thấy đầu tiên; bỏ khỏi chunks vì đã tìm được bản 969 trên trang sản phẩm cùng hãng. Không lấy deadline bản này.
- `raw/baoviet-5688-2021.pdf`: website nhãn trước 1/3/2026; chỉ giữ nghiên cứu, không chunk nội dung.
- `raw/claims-guide.html`: trang hướng dẫn bồi thường sức khỏe, không phải vật chất xe; loại khỏi chunks. Không áp thời gian xử lý trang sức khỏe cho xe.
- `urllib` gặp 403 tại trang sản phẩm; tải lại bằng `curl -A Mozilla/5.0` nhận HTML thật có nhãn phiên bản và liên kết PDF, không dùng snippet làm nội dung.
- Không thu thập hướng dẫn checklist góc chụp riêng, hợp đồng khách hàng, quyết định ban hành độc lập hoặc luật bổ sung. Không xác minh bộ quy tắc là mới nhất.

## Tích hợp retrieval-only

`GET /dashboard/api/legal?q=...` đọc hai nguồn cố định `legal-demo` và `motor-insurance-demo`, xác thực dashboard như trước. Tìm từ khóa, tối đa 5 đoạn, không gọi model/provider, không sinh câu trả lời hay kết luận coverage. Giữ nguyên text/hash, tiêu đề, `label` và nhãn khoản dạng chuỗi như `5.2.6`; trả `document_type`, `legal_status` phân biệt luật với điều khoản/biểu mẫu và `current_validity_verified=false`. PASS không đồng nghĩa được bồi thường. Không cần tải bản gốc trong lúc truy vấn; không commit/restart dịch vụ trong bước tích hợp này.

## Sources

[1] https://baovietonline.com.vn/vi/bao-hiem-ca-nhan/54/bao-hiem-vat-chat-xe-o-to.html
[3] https://baovietonline.com.vn/uploads/attachment/quy-tac-bao-hiem-vat-chat-o-to-bao-hiem-vat-chat-xe-o-to-vi.pdf
[6] https://baovietonline.com.vn/uploads/attachment/a28f0c31be4a2ff2618c17a0a1365970.pdf
