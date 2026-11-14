# TRUSTCAM — Feature brief bàn giao UI/UX

Cập nhật: 2026-11-14.
Workspace: `/home/rcong/Project/trustcam`.
Đối tượng: UI/UX designer, mobile developer, người chuẩn bị demo.

## Cập nhật triển khai sau bàn giao — 2026-11-14

Các mục dưới đây ghi đè trạng thái cũ trong bảng / mô tả màn hình phía dưới:

- F11: tự tải phiên đã lưu, khôi phục báo cáo đã chốt; lỗi mạng giữ token và cho tải lại.
- S03/S04: API đã có `status` và `report_id`; app hiển thị đã chốt và chặn chụp/chốt lại, không cần dev bổ sung cho phần này.
- S01/S06: đã có Alert VI/EN trước thay phiên hoặc đổi API; giữ phiên cũ tới khi lưu thay đổi thành công. Dữ liệu server không bị xóa.
- F13: adapter VLM tùy chọn + nút phân tích đã có code, xin phép gửi ảnh tới provider ngoài trước mỗi lần. Nhận xét chỉ tham khảo, không phải xác thực ảnh thật. Đã cấu hình provider/model `analysis` và chạy kiểm thử ảnh tổng hợp qua HTTP thật, nhận khuyến nghị chụp lại và lưu thành công. Chưa đánh giá độ chính xác trên bộ ảnh nghiệp vụ hoặc điện thoại thật.
- Retake vẫn chỉ là khuyến nghị; chưa có luồng thay ảnh slot đã ký. F14 RAG và tổ chức/chia sẻ/billing vẫn chưa triển khai.
- Kiểm chứng mới: backend 35 tests PASS, HTTP liên thông PASS, mobile checks PASS, Expo doctor 20/20, xuất Android/iOS mỗi bundle khoảng 1.8 MB. Vẫn chưa kiểm thử điện thoại thật.

## 1. Mục tiêu và phạm vi

Thiết kế app mobile Expo React Native, hỗ trợ tiếng Việt / English. Tiếng Việt mặc định; người dùng đổi ngôn ngữ trong app, lựa chọn được lưu.

Giúp người dùng thu thập hồ sơ ảnh theo checklist, ký ảnh bằng khóa thiết bị, tạo báo cáo và đối chiếu ảnh đã ký. Giai đoạn sau thêm VLM hướng dẫn chụp bổ sung và RAG giải thích quy trình / chế tài có trích nguồn.

Bản hiện tại là prototype chức năng, chưa có thiết kế thị giác hoàn chỉnh. Designer đề xuất bố cục, màu, font, icon và component; tài liệu này không chốt visual style.

Điểm quan trọng: phân biệt trạng thái đã xây, đã kiểm thử kỹ thuật và chưa chạy trên điện thoại thật. Không thiết kế future feature như thể đã hoạt động.

## 2. Người dùng / bối cảnh

### B2C — cá nhân (giả thuyết cần xác nhận)

Ví dụ: người thuê / chủ tài sản ghi nhận tình trạng khi bàn giao. Hai bên cần biết hồ sơ có những ảnh nào và ảnh nhận được có khớp bản đã ký không.

- Người chụp: tạo hồ sơ, chụp theo yêu cầu, xem tiến độ, nhận báo cáo.
- Người đối chiếu: xem thông tin liên quan và xác minh ảnh. Hiện chỉ có xác minh trong phiên được cấp quyền; chưa có link công khai hoặc lời mời bên thứ hai.

### B2B — tổ chức (giai đoạn sau)

Ví dụ: nhân viên kiểm tra và người duyệt hồ sơ. Cần checklist theo quy trình đơn vị, nguồn tài liệu nội bộ, phân quyền và lịch sử xử lý.

- Nhân viên: ghi nhận đủ bằng chứng, hiểu lý do cần chụp bổ sung.
- Người duyệt: xem thiếu / đủ, hỏi căn cứ, yêu cầu bổ sung, ra quyết định nghiệp vụ.
- Quản trị: quản lý thành viên, quy trình và tài liệu. Chưa xây.

Một app / lõi nghiệp vụ chung; chưa làm hai app hoặc console web riêng trong phạm vi thiết kế P0.

## 3. Checklist tính năng và tiến độ

Ký hiệu: HIỆN CÓ = code đã xây; CHƯA = chưa triển khai. Tính năng native HIỆN CÓ vẫn cần kiểm thử điện thoại thật.

| ID | Tính năng | Trạng thái | Phạm vi designer |
|---|---|---|---|
| F01 | VI mặc định, chuyển EN, lưu lựa chọn | HIỆN CÓ; kiểm tra đủ bộ chuỗi VI/EN | P0: thiết kế switch và hai bản nội dung |
| F02 | Tạo phiên / hồ sơ gắn khóa thiết bị | HIỆN CÓ; backend đã test | P0: khởi tạo, loading, lỗi, hồ sơ rỗng |
| F03 | Camera, xin quyền, từ chối, mở Settings | HIỆN CÓ; chưa test thiết bị | P0: camera và các trạng thái quyền |
| F04 | Hash SHA-256 + ký Ed25519 + tải ảnh | HIỆN CÓ; crypto / HTTP đã test | P0: tiến trình, thành công, lỗi / thử lại |
| F05 | Checklist bốn ảnh, chỉ rõ mục còn thiếu | HIỆN CÓ; chưa đánh giá nội dung ảnh | P0: tiến độ và CTA tiếp theo |
| F06 | Danh sách ảnh: loại, thời gian, hash | HIỆN CÓ; UI hiện là thông tin chữ | P0: card bằng chứng, rút gọn chi tiết kỹ thuật |
| F07 | Chia sẻ tệp ảnh gốc | HIỆN CÓ; đường dẫn giữ trong bộ nhớ phiên UI | P0: action phụ; sau mở lại app có thể không còn action này |
| F08 | Chốt hồ sơ đủ bốn ảnh | HIỆN CÓ; backend chặn hồ sơ thiếu | P0: CTA, giải thích khóa hồ sơ, trạng thái đã chốt |
| F09 | Xem / chia sẻ báo cáo JSON | HIỆN CÓ; chưa PDF | P0: trang báo cáo dễ đọc, chia sẻ / xuất dữ liệu |
| F10 | Chọn ảnh đối chiếu, kết quả PASS / FAIL | HIỆN CÓ; HTTP gốc PASS / sửa FAIL | P0: chọn bằng chứng, chọn file, kết quả và lý do |
| F11 | Lưu khóa / token phiên trong SecureStore | HIỆN CÓ; chưa test native storage | P0: trải nghiệm tiếp tục hồ sơ, không lộ token |
| F12 | Cấu hình API URL, đổi URL xóa phiên đang nhớ | HIỆN CÓ | P0 demo: Settings riêng, cảnh báo trước thay đổi |
| F13 | VLM nhận xét chất lượng / nội dung, yêu cầu ảnh bổ sung | CHƯA; hiện chỉ checklist | Future: flow riêng, không gộp với F05 |
| F14 | RAG hỏi đáp quy trình / chế tài có nguồn cho hai bên | CHƯA; chưa có corpus thật | Future: hỏi đáp, nguồn, thiếu căn cứ, yêu cầu làm rõ |
| F15 | Quy trình riêng tổ chức, vai trò, review / phê duyệt | CHƯA | Future B2B; chưa là P0 |
| F16 | Link chia sẻ / mời bên thứ hai, quyền xem / thu hồi | CHƯA | Future B2C/B2B; không hứa link hoạt động |
| F17 | PDF, nhiều hồ sơ / lịch sử, retake / xóa ảnh, offline queue | CHƯA | Không dùng làm điều kiện để hoàn tất thiết kế P0 |
| F18 | Billing / pricing / console web | CHƯA | Ngoài phạm vi hiện tại |

Kiểm chứng gần nhất: backend 19 tests PASS; TypeScript / crypto self-check / VI-EN parity / native config PASS; Expo doctor 20/20; bundle Android và iOS đã xuất. Tích hợp HTTP thật đã chạy đủ bốn ảnh, báo cáo, ảnh gốc PASS và ảnh sửa FAIL. Chưa test native camera, SecureStore, picker hoặc sharing trên điện thoại thật; chưa build APK/IPA.

## 4. Sơ đồ màn hình P0

Điểm vào hiện tại: app title, switch VI/EN, Settings, nhãn CHECKLIST, thông báo giới hạn xác minh, bốn tab. Designer được thay cấu trúc điều hướng nếu giữ đủ chức năng.

### S01 — Bắt đầu / hồ sơ hiện tại

- Chưa có hồ sơ: giá trị ngắn gọn, CTA “Tạo hồ sơ” / “Create session”.
- Có phiên đã lưu nhưng chưa tải: CTA “Tiếp tục / tải hồ sơ”, trạng thái kết nối.
- Hồ sơ rỗng: giải thích mục đầu tiên và bước xin quyền camera.
- Tạo hồ sơ mới khi đã có phiên: cần xác nhận. Hiện app thay tham chiếu phiên, không xóa dữ liệu server; chưa có danh sách lịch sử để tìm lại phiên cũ.
- Không thiết kế login / OTP như chức năng đã có. Hiện dùng khóa thiết bị và token phiên.

### S02 — Chụp bằng chứng

- Preview camera, loại ảnh cần chụp, nút chụp, trạng thái camera sẵn sàng.
- Nhắc ngắn gọn đúng mục, không giả nhận xét “AI đã thấy hư hỏng”.
- Bốn mục prototype: toàn cảnh; cận cảnh hư hỏng; số sê-ri / biển số; tài liệu định danh.
- Tên và tính bắt buộc của bốn mục cần xác nhận theo nghiệp vụ trước dùng dữ liệu khách thật. Ảnh giấy tờ có thể chứa dữ liệu nhạy cảm.
- Hiển thị trạng thái đang xử lý / ký / tải. Hiện không có % upload thật: dùng trạng thái không xác định, không dựng % giả.
- Chặn thao tác lặp khi bận; xử lý camera chưa sẵn sàng, quyền bị từ chối, app về nền, ảnh quá 10 MiB, lỗi mạng / timeout.
- Chụp / tải thành công chuyển về danh sách hồ sơ.
- Chưa có màn review trước upload, retake hoặc sửa ảnh. Nếu designer đề xuất, đánh dấu cần dev thêm. Không crop / filter ảnh đã ký.

### S03 — Hồ sơ / checklist

- Tiến độ đủ / thiếu theo bốn mục; nhãn “Đã thu thập” không phải “Đã được AI duyệt”.
- CTA ưu tiên: chụp mục còn thiếu; đủ bốn ảnh thì chốt hồ sơ.
- Mỗi bằng chứng: loại ảnh, thời gian khai báo, trạng thái đã nhận, chi tiết hash có thể mở rộng.
- UI hiện chưa có thumbnail; thiết kế thumbnail là đề xuất cần thêm code, không phải dữ liệu có sẵn từ API ảnh.
- Thao tác phụ: tải lại, chia sẻ ảnh gốc khi còn tệp cục bộ, tạo hồ sơ mới có cảnh báo.
- UUID / hash nên rút gọn khi hiển thị, cho xem đầy đủ / sao chép bằng action rõ ràng. Sao chép là cải tiến UX chưa có nút riêng.
- Phiên đã chốt không nhận thêm ảnh. Designer cần trạng thái “Đã chốt”; API hiện trả action finalize kể cả khi đã chốt nên dev phải bổ sung / suy ra trạng thái phù hợp.

### S04 — Báo cáo

- Summary: mã hồ sơ, bốn mục bằng chứng, chế độ checklist, trạng thái đã chốt.
- Chi tiết từng ảnh: thời gian khai báo, SHA-256, chữ ký / khóa công khai dưới phần kỹ thuật.
- CTA chia sẻ báo cáo; định dạng hiện tại JSON, chưa PDF hoặc link web.
- Báo cáo chưa có: empty state và điều kiện để tạo.
- Sau khởi động lại: hiện cần tải hồ sơ và chốt lại idempotently để lấy báo cáo; tự khôi phục report cần dev nối thêm.
- Nội dung JSON gốc giữ khóa máy tiếng Anh; nhãn UI / tóm tắt phải theo VI/EN, không dịch ID hoặc hash.

### S05 — Xác minh

- Chọn đúng bằng chứng trong hồ sơ, sau đó chọn tệp ảnh cần đối chiếu.
- Cần phân biệt ảnh gốc với ảnh đã bị ứng dụng khác nén / lưu lại; ảnh nhìn giống vẫn có thể khác byte.
- Trạng thái: chưa chọn, đã chọn, picker bị hủy, đang kiểm tra, PASS, FAIL, lỗi hệ thống.
- PASS: byte ảnh khớp bản đã ký, chữ ký hợp lệ.
- FAIL `image_modified`: byte ảnh khác bản đã ký; không kết luận người dùng gian lận.
- FAIL `signature_invalid`: chữ ký / dữ liệu ràng buộc không hợp lệ; không kết luận vi phạm pháp luật.
- Mạng lỗi / file không hợp lệ không được trình bày như FAIL về toàn vẹn.
- Hiện chọn ảnh qua photo picker. Nếu muốn nút “Kiểm tra ảnh gốc đã lưu trong app”, đánh dấu cải tiến cần dev thêm.

### S06 — Settings / ngôn ngữ

- VI / EN chuyển tức thì, giữ lựa chọn khi mở lại.
- API URL dùng cho demo / kỹ thuật, không đặt làm trung tâm trải nghiệm người dùng cuối.
- Lưu URL mới xóa thông tin phiên đang nhớ, không xóa ảnh server; cần cảnh báo / xác nhận. Hiện đã có reset dữ liệu phiên phía app nhưng chưa có modal xác nhận.
- Điện thoại dùng IP LAN máy chạy backend, không phải `localhost`.
- Không hiển thị private seed hoặc bearer token trên bất cứ màn nào.

## 5. User flow cần có trong Figma

1. Người mới: mở app, VI mặc định, tạo hồ sơ, xin camera, chụp mục đầu, danh sách hiện một mục đã thu thập.
2. Hoàn tất: lần lượt bốn mục, chốt, báo cáo, chia sẻ JSON.
3. Kiểm tra: chọn bằng chứng, chọn ảnh gốc, PASS; chọn bản sửa, FAIL kèm giải thích.
4. Khôi phục: mở lại app, tải phiên đã lưu, tiếp tục mục thiếu; nếu token sai thì có đường xử lý lỗi rõ ràng, không treo UI.
5. Ngoại lệ: từ chối quyền / mở Settings, timeout / thử lại, file lớn, chụp chưa sẵn sàng, không kết nối backend.
6. Đổi VI/EN trên các màn chính; nội dung dài không vỡ layout.
7. Tạo phiên mới / đổi API khi có phiên: xác nhận và giải thích điều gì còn / mất. Đây là UX cần dev bổ sung.

## 6. Future flow — tách frame, ghi “Planned”

### VLM: chụp bổ sung theo bằng chứng

Ảnh gửi lên, phân tích thật, kết quả đủ / thiếu / không chắc, lý do cụ thể, CTA chụp bổ sung. Phải có trạng thái dịch vụ không sẵn sàng. Không dùng confidence % trang trí; chỉ dùng nếu API và đánh giá hỗ trợ.

### RAG: hỗ trợ hai bên

- Hỏi “Cần thêm bằng chứng nào?”, “Bước xử lý tiếp theo?”, “Quy định / chế tài nào có thể áp dụng?”.
- Trả lời kèm tài liệu, mục / điều, trang, đoạn trích, phiên bản / ngày hiệu lực và link nguồn khi có.
- Chi tiết nguồn mở được, phân biệt trích nguyên văn, diễn giải và bản dịch.
- Không đủ căn cứ: nói rõ, hỏi thêm hoặc đề nghị người phụ trách xem xét.
- Tài liệu chưa nạp / lỗi truy xuất / không có quyền / nguồn mâu thuẫn là các trạng thái riêng.
- Câu trả lời theo ngôn ngữ app; giữ nguyên nguồn và đánh dấu bản dịch.
- Chế tài chỉ là hỗ trợ tham khảo có căn cứ, không tự động áp dụng hoặc quy kết từ kết quả hash.

### B2B review / B2C chia sẻ

B2B: nhân viên gửi, người duyệt xem, yêu cầu bổ sung, kết luận nghiệp vụ; cần vai trò và quyền tài liệu. B2C: mời bên kia xem, consent, phạm vi chia sẻ, thu hồi. Đều chưa triển khai; không dùng demo P0 để hứa đã có.

## 7. Nội dung và accessibility

Ví dụ copy để designer phát triển, không phải quy định mới hoặc trích luật:

| Trạng thái | VI | EN |
|---|---|---|
| Chế độ | Checklist thu thập ảnh | Photo collection checklist |
| Bước tiếp | Chụp thêm: toàn cảnh | Next photo: wide view |
| Đủ ảnh | Đã thu thập đủ 4 mục | All 4 items collected |
| Chốt | Chốt hồ sơ | Finalize session |
| PASS | Ảnh khớp bản đã ký | Image matches signed record |
| FAIL ảnh | Ảnh không khớp bản đã ký | Image differs from signed record |
| Chưa có căn cứ RAG | Chưa tìm thấy căn cứ phù hợp | No applicable source found |

Thông báo giới hạn phải đọc được, không giấu toàn bộ trong tooltip:

VI: “Xác minh chỉ kiểm tra tính toàn vẹn và chữ ký. Không chứng minh cảnh chụp là thật, thời gian đáng tin cậy hoặc giá trị pháp lý.”
EN: “Verification checks integrity and signature only. It does not prove scene authenticity, trusted capture time or legal validity.”

- Contrast WCAG AA; trạng thái không chỉ dựa vào đỏ / xanh mà có icon, tiêu đề và lời giải thích.
- Touch target tối thiểu 44 pt iOS / 48 dp Android; hỗ trợ font hệ thống phóng to, safe area, bàn phím.
- Font có đầy đủ dấu tiếng Việt; thử tên tài liệu dài, UUID / hash không ngắt layout.
- Screen reader đọc được nút camera, trạng thái bận, lỗi, tab đang chọn và kết quả xác minh.
- Lỗi hệ thống có cách thử lại / sửa; không lộ exception, token hoặc seed.
- Native permission dialog của Expo Go do host / OS quản lý; Figma không hứa toàn bộ dialog thay ngôn ngữ tức thì theo switch app. Bản native riêng cần kiểm tra cấu hình thực tế.

## 8. Deliverables designer

- Sitemap / user flows P0 và future tách riêng.
- Wireframe đủ S01–S06, cả VI/EN ở màn quan trọng.
- High-fidelity sau khi thống nhất wireframe; chọn visual direction, không mặc định “fintech xanh = an toàn tuyệt đối”.
- Component set: buttons, tabs, language switch, evidence card, checklist progress, status banner, permission prompt, loading/error/empty state, result card, confirmation modal, technical detail disclosure.
- Clickable prototype: luồng bốn ảnh / báo cáo / PASS–FAIL và một luồng lỗi quyền hoặc mạng.
- Ghi annotation cho từng hành vi chưa có code; phân rõ “reskin hiện tại” và “feature dev mới”.
- Handoff typography, spacing, color, icons, interaction states, copy VI/EN; file assets có giấy phép phù hợp. Có thể dùng `DESIGN.md` sau khi chốt token, không cần tạo trước khi chọn hướng thiết kế.

## 9. Điều kiện nghiệm thu thiết kế

- Người mới hiểu cần chụp gì và còn thiếu gì mà không đọc JSON.
- Không nhầm “đã thu thập” với “AI duyệt” hoặc “hợp pháp”.
- Mọi CTA chính có trạng thái disabled / loading / lỗi / thành công.
- PASS / FAIL và lỗi mạng hiển thị ba loại ý nghĩa khác nhau.
- VI/EN đủ nội dung, không tràn ở font lớn, có nhãn screen reader.
- Hai hành động tạo phiên mới và đổi API có xác nhận rõ, không mô tả sai thành xóa dữ liệu server.
- Future VLM/RAG/B2B không lẫn với phạm vi P0 đã có.
- Developer xác nhận tính khả thi của ảnh thumbnail, resume report, retake, sharing và dữ liệu được API cung cấp trước khi khóa thiết kế.

## 10. Tham chiếu / quyết định còn mở

- Plan: `docs/plan.md`; chạy / kiểm thử: `README.md`.
- UI hiện tại: `app/App.tsx`; copy: `app/src/locale.ts`.
- API: `backend/README.md`; kiểm thử liên thông: `tests/live_smoke.py`.
- Cần chủ sản phẩm chốt: domain cụ thể, bốn loại ảnh, deadline, thiết bị chính, corpus RAG thật, vai trò hai bên, chia sẻ / retention / consent.
- Chưa có dữ liệu thị trường / pricing được xác thực. Designer không đưa số doanh thu hoặc cam kết pháp lý vào onboarding / paywall.
