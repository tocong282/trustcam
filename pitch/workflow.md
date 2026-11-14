# TRUSTCAM · Pitcher handoff V1 · Bảo hiểm vật chất xe

**Bản workflow/cue sheet giao người thuyết trình và người dựng video. Không yêu cầu làm video ở bước này.** Thời lượng lời đọc mục tiêu 90 giây, cần tập và căn nhịp khi sản xuất. Nếu người nhận dựng bản minh họa, giữ nhãn **“MINH HỌA WORKFLOW — KHÔNG PHẢI QUAY MÀN HÌNH”** suốt video. Không dựng giao diện giả, dữ liệu cá nhân, đầu ra AI giả hoặc kết quả kiểm thử giả. Bản quay sản phẩm thật chỉ làm sau khi app/dashboard tích hợp ổn định.

## Phạm vi câu chuyện

Xe đang đỗ bị trầy cản nhẹ; chủ xe đã dừng an toàn mới ghi nhận. Luồng tiếp nhận hồ sơ yêu cầu giải quyết quyền lợi **bảo hiểm vật chất xe tự nguyện**, không phải bảo hiểm trách nhiệm dân sự bắt buộc. Không dựng tai nạn, không hướng dẫn chụp trên đường đang chạy. Kịch bản chỉ đổi ngữ cảnh sử dụng các slot ảnh sẵn có, không công bố chức năng xử lý bảo hiểm mới.

Một phiên = một hồ sơ. Một app chủ xe + một dashboard doanh nghiệp bảo hiểm, không phải hai app. Doanh nghiệp xem hồ sơ sau cấp quyền rõ ràng; giám định viên xem ảnh/lịch sử/báo cáo. Doanh nghiệp bảo hiểm quyết định quyền lợi dựa trên hợp đồng và xác minh thực tế; AI không tự duyệt, không tự chi trả. Không bịa phạm vi bảo hiểm, loại trừ, thời hạn, tiền phạt hay mức bồi thường.

## Bàn giao duy nhất: workflow.md

Gửi chính tài liệu này cho pitcher/người dựng. Không cần gửi hoặc dùng video nháp, SRT hay ảnh dựng trước đó. Người nhận tự chuẩn bị quay/thu lời sau khi kiểm tra các điều kiện bên dưới.

### Recording brief cho người nhận

- Mục tiêu: giải thích tiếp nhận hồ sơ bảo hiểm vật chất xe, không quảng cáo tự động bồi thường hay phát hiện gian lận.
- Dự kiến 7 cảnh, 90 giây, khung ngang 16:9. Nếu sản xuất video sau này, ưu tiên 1080p, phụ đề Việt lớn và lời đọc người thật; không giả tiếng khách hàng/giám định viên.
- Dùng cue sheet làm shot list. Cảnh app/dashboard chỉ quay thao tác thật trên build đã kiểm tra; cảnh chưa mở khóa dùng sơ đồ chữ/khối màu với nhãn “Đang tích hợp”, không tạo màn hình giống ứng dụng đang hoạt động.
- Với bản minh họa, nhãn “MINH HỌA WORKFLOW — KHÔNG PHẢI QUAY MÀN HÌNH” phải tồn tại ở mọi cảnh. Với đoạn quay trước, ghi “BẢN QUAY TRƯỚC — KHÔNG TRỰC TIẾP”. Không ghép hai loại rồi gọi tất cả là demo trực tiếp.
- Cắt lời theo mốc dự kiến, giữ đủ thời gian đọc cảnh báo. Có thể tinh chỉnh tốc độ/thời lượng nhưng không bỏ consent, trạng thái tích hợp hoặc giới hạn toàn vẹn/quyền lợi.
- Quay xe mẫu đứng yên an toàn, chụp toàn cảnh rồi cận vết trầy. Biển/VIN và giấy tờ chỉ đạo cụ test có nhãn. Không dùng stock để giả vụ yêu cầu bồi thường hoặc ảnh AI để giả bằng chứng.
- Màu tham chiếu từ `app/src/ui/theme.ts`, `palettes.dark`: nền `#020617`, bề mặt `#0f172a`, chữ `#f8fafc`, emerald `#6ee7b7`, blue `#93c5fd`, warning `#fde68a`. Chọn font Việt dễ đọc như Noto Sans; không thay theme app.
- Chưa có trích dẫn bảo hiểm được xác nhận cho kịch bản này. Để placeholder nội bộ “CHỜ NGUỒN ĐƯỢC XÁC MINH”, không đọc hoặc xuất placeholder như trích dẫn thật. Chỉ thêm điều khoản sau khi người phụ trách nguồn bàn giao và duyệt.

## Kịch bản 90 giây / cue sheet

Lời đọc dưới đây là bản tập theo mốc dự kiến, chưa thu âm. Các cú bấm là **slot quay thật tương lai**, không được giả vờ thao tác khi trình chiếu minh họa. Chỉ thực hiện trên build đã chốt; tên nút phải đối chiếu lại app tích hợp.

| Thời gian | Lời đọc | Cue thao tác thật / giới hạn |
|---|---|---|
| 00–10s | “Xe đang đỗ bị trầy cản nhẹ. Chủ xe ghi nhận khi đã dừng an toàn. Đây là luồng tiếp nhận hồ sơ bảo hiểm vật chất xe tự nguyện.” | Kể tình huống chung, không tạo lời chứng hay vụ yêu cầu bồi thường giả như thật. Đạo cụ thử nghiệm có quyền sử dụng; không gây thiệt hại xe để quay. |
| 10–23s | “Chủ xe tạo một hồ sơ. Chụp toàn cảnh xe và cận cảnh hư hại. Bổ sung biển số hoặc VIN và giấy tờ mẫu, không dùng dữ liệu thật. Camera ký byte ảnh trước khi tải; giới hạn hai mươi ảnh đang tích hợp.” | Vào Camera → tạo hồ sơ → chụp bốn nhóm bên dưới. Các tab Danh sách/Báo cáo/Kiểm tra chọn hồ sơ trước khi mở chi tiết. **CHƯA DEMO** dossier-list-first/20 ảnh trước khi nhánh app/backend tích hợp và smoke-test. Camera hiện có tạo phiên, ký Ed25519 đúng byte và tải lên; không quảng bá 20 ảnh là đã ship. |
| 23–37s | “Nhận xét độ rõ và góc chụp là tùy chọn, cần đồng ý gửi ảnh ra ngoài. Nếu ảnh mờ, có thể chụp lại và giữ ảnh gốc trong lịch sử. Không bảo đảm mô hình gợi ý đúng; AI không duyệt checklist.” | Chọn ảnh → yêu cầu nhận xét → đọc thông báo provider ngoài → chỉ xác nhận khi có quyền chia sẻ. Không dựng phản hồi “ảnh mờ” như AI đã nói. Nếu phản hồi thật đề cập độ rõ/góc chụp thì giới thiệu là tham khảo; nếu không thì nói đúng phản hồi và chủ động chụp lại khi cần. Giữ ảnh cũ bất biến. Dịch vụ không có/không đồng ý: bỏ nhánh AI, nói rõ. |
| 37–53s | “Đủ checklist thì lập báo cáo. Thử HTTP trước đó: gốc PASS, bản sửa FAIL. Chỉ kiểm tra byte với dữ liệu đã ký; không xác nhận cảnh thật hay thời điểm. Không suy ra gian lận, phạm vi bảo hiểm, quyền chi trả hay giá trị pháp lý.” | Hoàn tất bốn nhóm → báo cáo JSON → chia sẻ báo cáo → chia sẻ tệp gốc byte-exact → chọn đúng bằng chứng và tệp gốc kiểm tra → chọn bản sửa riêng. Chạy lại đúng build/tệp trước quay; test HTTP cũ không phải bằng chứng UI hiện tại. FAIL không đồng nghĩa gian lận, PASS không bảo đảm được bồi thường. |
| 53–69s | “Chủ xe cấp quyền để giám định viên xem ảnh, lịch sử và báo cáo. Dashboard và quyền đang tích hợp; demo giới hạn một công ty. Doanh nghiệp quyết định quyền lợi theo hợp đồng và xác minh, không phải AI.” | **CHƯA DEMO**: chủ xe cấp quyền rõ ràng cho doanh nghiệp → doanh nghiệp đăng nhập → danh sách hồ sơ được cấp quyền → chi tiết ảnh/lịch sử/báo cáo → kiểm tra. Chỉ mở khóa sau thử quyền và tích hợp thực. Không dựng dashboard giả hoặc mô phỏng tự duyệt quyền lợi. |
| 69–81s | “Kho hiện tại là nguồn chứng cứ chung, không quyết định quyền lợi bảo hiểm. Chưa có luật bảo hiểm hay hợp đồng được duyệt trong kho. RAG chưa nối; hướng dẫn quyền lợi cần kho hợp đồng được phê duyệt.” | **CHƯA DEMO** truy xuất trích đoạn/RAG. Khi đã tích hợp, demo tra cứu chỉ dùng nguồn chứng cứ chung, dân sự/giao dịch điện tử; không biến thành tư vấn bảo hiểm. Chờ bổ sung kho luật bảo hiểm/hợp đồng đã phê duyệt, kiểm tra hiệu lực và nguồn trước khi hướng dẫn quyền lợi. |
| 81–90s | “TRUSTCAM hỗ trợ hồ sơ để xem xét, không tự động bồi thường. Đây là bản tập; quay demo thật sau khi tích hợp và kiểm thử xong.” | Giữ nhãn bản tập. Mời thử luồng thật khi build sẵn sàng, không gọi production-ready. |

## Bốn nhóm ảnh: dùng slot hiện có, không sửa schema

| Slot hiện có | Nội dung minh họa bảo hiểm xe | Quy tắc dữ liệu |
|---|---|---|
| `wide_context` | Toàn xe và bối cảnh xe đang đỗ an toàn | Không lộ người, địa chỉ, biển xe thật xung quanh; không dựng nguyên nhân thiệt hại |
| `damage_closeup` | Cận vết trầy/cản hư hại nhẹ | Không suy ra nguyên nhân, thời điểm hoặc mức bồi thường từ ảnh |
| `serial_or_plate` | Biển số hoặc VIN mẫu của xe thử | Chỉ dữ liệu test có nhãn; không dùng số nhận dạng thật; không tuyên bố OCR/xác thực định danh |
| `identifier_doc` | Tờ giấy mẫu thông tin xe/bảo hiểm | Placeholder tổng hợp ghi lớn “MẪU THỬ NGHIỆM — KHÔNG CÓ GIÁ TRỊ”; không mô phỏng giấy tờ hợp lệ, không có thông tin thật. Slot giấy tờ chung giữ nguyên, không phải chức năng đọc hợp đồng |

Tài liệu này không kèm ảnh xe hoặc giấy tờ. Khi người nhận quay thật sau này, chuẩn bị đạo cụ test đúng các quy tắc trên. Bốn nhóm là checklist thu thập, không phải điều kiện bảo hiểm hoặc AI phê duyệt. Tối đa 20 **ảnh hiện tại**/hồ sơ đang tích hợp; ảnh cũ thuộc lịch sử, không tự đổi nghĩa thành 20 phiên.

## Phân tách đã có / đang làm

Theo trạng thái kỹ thuật được bàn giao; lần soạn workflow này **không chạy lại app/backend và không gọi mô hình**.

- Đã có nền tảng: Expo VI/EN mặc định VI; Camera tạo phiên, ký Ed25519 đúng byte ảnh rồi upload; bốn nhóm checklist bắt buộc; retake giữ lịch sử bất biến; báo cáo JSON và kiểm tra toàn vẹn. Khóa phần mềm qua SecureStore, không phải chữ ký phần cứng.
- Đã có kiểm thử HTTP gốc PASS / bản sửa FAIL. Chỉ xác minh toàn vẹn, không chứng minh cảnh thật/thời gian/quyền sở hữu/pháp lý/gian lận/phạm vi bảo hiểm/chi trả.
- VLM tùy chọn: ảnh chỉ gửi ra provider ngoài sau xác nhận và khi có quyền chia sẻ; có lý do VI/EN và cache; nhánh backend có 50 tests theo bàn giao. Độ đúng ngữ nghĩa chưa xác lập. Video chỉ định vị gợi ý độ rõ/độ phủ góc chụp, không khẳng định model chuyên bảo hiểm hoặc chắc chắn phát hiện ảnh mờ.
- Đang tích hợp: danh sách hồ sơ làm màn hình đầu, mỗi phiên một hồ sơ, 20 ảnh hiện tại, bốn nhóm bắt buộc. Không gọi đã phát hành.
- Đang tích hợp: dashboard ba góc nhìn (danh sách; chi tiết ảnh + lịch sử + báo cáo; kiểm tra), auth và grant rõ ràng; demo một công ty, không phải đa tenant production.
- Kho nguồn: ba văn bản chính thức, 17 điều; integrity tệp đã kiểm tra. Nội dung chung về giao dịch điện tử/chứng cứ dân sự, **không phải kho luật bảo hiểm hoặc điều khoản hợp đồng**. Các sửa đổi hiện hành chưa xác minh đầy đủ. Retrieval/generative RAG chưa nối; không có hướng dẫn quyền lợi bảo hiểm. Không bịa trích dẫn, điều khoản loại trừ, hạn khai báo hoặc mức chi trả.

## Checklist vận hành trước quay thật

1. Chốt build app/backend đã tích hợp và ghi phiên bản. Chạy tests và smoke-test trên đúng thiết bị, mạng, build. Chỉ mở cue đang chặn khi có bằng chứng tích hợp thực.
2. Chỉ quay khi xe đứng yên tại vị trí an toàn và có quyền quay. Không tạo va chạm. Dùng đồ thử nghiệm, biển/VIN mẫu và giấy placeholder rõ nhãn; không có tên, số hợp đồng, CCCD, địa chỉ, thông tin ngân hàng, khuôn mặt hoặc token thật. Không mở terminal chứa secrets.
3. Tạo một hồ sơ thử. Kiểm tra đủ bốn slot, giới hạn 20 ảnh hiện tại, chụp lại giữ lịch sử, tải lại/tiếp tục đúng hồ sơ. Không tạo hồ sơ mới cho từng ảnh.
4. Giữ nguyên **tệp gốc byte-exact đã ký và tải lên**. Chia sẻ dưới dạng tệp không nén/chuyển mã, không dùng screenshot. Bản sửa là tệp khác, tên rõ ràng, tuyệt đối không ghi đè gốc. Nếu picker/thư viện chuyển mã làm FAIL, nói đúng giới hạn và chọn lại bản gốc.
5. Không bỏ qua consent gửi provider ngoài để demo mượt. Không có quyền chia sẻ, không đồng ý hoặc provider lỗi: bỏ nhánh nhận xét. Không điền phản hồi AI giả, không biến gợi ý độ rõ/góc chụp thành kết luận tổn thất hoặc quyền lợi.
6. Nếu upload timeout chưa rõ kết quả, giữ ảnh cục bộ và làm mới hồ sơ trước khi chụp/tải lại; chỉ retry theo hành vi app hỗ trợ. Không xóa ảnh chờ tải, không tạo bản sao không kiểm soát.
7. Chuẩn bị bản quay trước từ build đã kiểm tra. Nếu mạng lỗi, nói “Chuyển sang bản quay trước, không phải trực tiếp”; giữ nhãn **BẢN QUAY TRƯỚC — KHÔNG TRỰC TIẾP** suốt đoạn thay thế. Nếu chưa có bản quay thật, trình bày sơ đồ workflow có nhãn minh họa hoặc dừng phần demo; không gọi là quay sản phẩm.
8. Thử đăng nhập doanh nghiệp, cấp quyền, thu hồi và từ chối truy cập chưa được cấp. Không tự thêm dòng hồ sơ mẫu trên dashboard. Không mô phỏng quyết định chi trả hoặc thông báo “được bảo hiểm” từ AI.
9. Kiểm tra phụ đề/nhãn/cảnh báo trước xuất. Không rút gọn bằng cách bỏ cảnh báo toàn vẹn, consent hoặc phân quyền. Không xuất dữ liệu thật cho pitcher.

## Slot quay thật để thay slide sau

| Slot | Footage cần | Điều kiện |
|---|---|---|
| 10–23s | Danh sách hồ sơ, tạo/tiếp tục, bốn ảnh theo slot | Chờ dossier-list/20 ảnh tích hợp; camera trên build chốt |
| 23–37s | Consent thực, phản hồi thật nếu có, retake và lịch sử | AI tùy chọn, không dự đoán/bịa nhận xét; không có thì bỏ nhánh |
| 37–53s | JSON report, tệp gốc PASS và bản sửa FAIL | Chạy lại đúng byte/build; không suy ra gian lận hay chi trả |
| 53–69s | App cấp quyền, dashboard insurer đăng nhập/list/detail/verify | Chặn đến khi auth/grant và thử truy cập trái phép đạt |
| 69–81s | Tra cứu nguồn chứng cứ chung có nguồn/điều/phiên bản | Chặn: retrieval/RAG chưa nối; không hướng dẫn quyền lợi khi chưa có policy corpus phê duyệt |

## Bản rút gọn để tập lời — không tạo video khác

### Luồng chính 60 giây

- 00–08: trầy cản khi xe đang đỗ; bảo hiểm vật chất xe tự nguyện, ghi nhận an toàn.
- 08–20: một hồ sơ, bốn slot ảnh, ký byte; 20 ảnh đang tích hợp.
- 20–30: gợi ý độ rõ tùy chọn, consent ngoài, chụp lại giữ lịch sử.
- 30–43: JSON, gốc/sửa; chỉ toàn vẹn, không gian lận hay quyền lợi.
- 43–53: cấp quyền cho giám định; dashboard đang tích hợp, doanh nghiệp quyết định.
- 53–60: kho nguồn chung, chưa có policy/RAG; bản tập, không tự chi trả.

### B2C · khoảng 40 giây

“Xe đang đỗ bị trầy cản nhẹ? Chỉ ghi nhận khi đã an toàn. TRUSTCAM hỗ trợ một hồ sơ bảo hiểm vật chất xe với ảnh toàn cảnh, cận hư hại, biển số hoặc VIN mẫu và giấy tờ thử nghiệm. Camera ký byte ảnh; chụp lại vẫn giữ lịch sử. Nhận xét độ rõ là tùy chọn, cần đồng ý gửi ảnh ra ngoài. Kiểm tra chỉ xác nhận toàn vẹn, không xác nhận gian lận hay quyền lợi. Dashboard cấp quyền và giới hạn hai mươi ảnh đang tích hợp. Đây là bản tập; doanh nghiệp bảo hiểm quyết định theo hợp đồng và xác minh.”

### B2B · khoảng 60 giây

“Đây là luồng tiếp nhận hồ sơ yêu cầu bảo hiểm vật chất xe tự nguyện, minh họa xe đang đỗ bị trầy cản nhẹ. Chủ xe dùng một app, tạo một hồ sơ với bốn nhóm ảnh. Camera ký đúng byte; chụp lại giữ lịch sử. Gợi ý độ rõ và góc chụp là tùy chọn, cần đồng ý gửi ảnh ra ngoài, không phải AI duyệt hồ sơ. Báo cáo và kiểm tra toàn vẹn không kết luận gian lận, phạm vi bảo hiểm hay chi trả. Chủ xe cấp quyền để giám định viên xem ảnh, lịch sử và báo cáo trên dashboard. Quyền, dashboard và giới hạn hai mươi ảnh đang tích hợp; demo một công ty. Kho pháp lý hiện là nguồn chứng cứ chung, chưa có luật bảo hiểm hay hợp đồng phê duyệt; RAG chưa nối. Doanh nghiệp quyết định quyền lợi theo hợp đồng và xác minh. Đây là bản tập, không tự động bồi thường.”

## Điều kiện phát hành bản quay thật

Không đổi nhãn thành demo trực tiếp chỉ vì có giao diện. Từng thao tác phải thực hiện thật trên build chốt, dữ liệu được phép dùng, consent và quyền truy cập hoạt động, 20 ảnh/bốn nhóm được kiểm tra, cảnh báo toàn vẹn và không suy ra quyền lợi vẫn hiện. Phần chưa xong giữ “Đang tích hợp”. Không gọi kho chứng cứ chung là công cụ giải thích quyền lợi bảo hiểm.
