# TRUSTCAM — audit bảo mật/vận hành trước production

Ngày: 2026-11-14, UTC+7. Phạm vi: backend hiện tại tại `/home/rcong/Project/trustcam`; đọc source/config công khai, không triển khai sửa lỗi.

## Kết luận

**Chưa đủ điều kiện mở API trực tiếp ra Internet hoặc nhận ảnh khách hàng thật.** Có thể tiếp tục demo bằng dữ liệu tổng hợp trong mạng tin cậy. Các biện pháp integrity/session isolation đã có; chúng không thay thế kiểm soát truy cập người dùng, thu hồi quyền và vận hành dữ liệu.

Production tối thiểu có thể là **pilot một chủ sở hữu**, API nằm sau gateway/VPN có kiểm soát truy cập, HTTPS, quota và quy trình backup/thu hồi rõ ràng. Không cần xây dashboard, SSO, RBAC hay đa tenant trước pilot này. Không quảng cáo tính năng đó khi chưa có.

Mức độ: **Cao** = chặn phạm vi phát hành ghi tại từng mục; **Vừa** = phải đóng trước vận hành có cam kết. Không phát hiện bằng chứng đủ để kết luận có lỗ hổng vượt quyền xuyên phiên đang khai thác được. Đây không phải chứng nhận an toàn hay tư vấn pháp lý.

## Phạm vi và bằng chứng kiểm tra

- Đọc toàn bộ `backend/app.py`, `backend/vlm.py`, hai README, `.gitignore`, `.env.example`, dependency pins; đọc danh mục test và setup smoke. Không đọc `.env`, environment của dịch vụ, nội dung SQLite hay ảnh thật; không gọi provider, endpoint ghi dữ liệu, tải thử hoặc restart.
- `git status --short` xác nhận `?? backend/`, `?? tests/`, `?? README.md`, `?? .gitignore`: backend chưa được Git theo dõi. `git diff` trống không có nghĩa không có code cần audit. Đã đọc source trực tiếp.
- Kiểm tra AST và defaults của FastAPI đã cài, **không import `backend.app`**: PASS, 9 route ứng dụng; `/docs`, `/redoc`, `/openapi.json` mặc định bật; `debug=False`.
- `uv pip check --python .venv/bin/python`: **All installed packages are compatible**, 22 package. Không cài scanner; kết quả này không phải kiểm tra CVE.
- Chỉ kiểm tra metadata bằng `stat`: `backend/data` = `0700`, `backend/data/trustcam.sqlite3` = `0600`, UID/GID 1000. Không đọc dữ liệu. Quyền hiện tại tốt, không báo sai là DB world-readable.
- Không chạy lại full suite: parent phụ trách kiểm thử. `docs/DEMO-WORKFLOW.md:39` ghi 50 backend test với HTTP stub; đây là kết quả được tài liệu ghi lại, không phải lần chạy độc lập trong audit này. `tests/live_smoke.py:116–121` dùng SQLite tạm, localhost, xóa VLM config khỏi child environment; không phải chứng minh production deployment.
- Tìm kiếm trong toàn bộ source Python backend các nhóm `backup/restore`, `retention`, `revoke/expires`, `quota/rate/concurrency`, `CORS/CSRF/TrustedHost/HTTPSRedirect`, `logging/logger`, `CREATE INDEX`: không có kết quả. Đối chiếu trực tiếp schema, middleware và 9 route trước khi ghi nhận thiếu. Kiểm kê file Git tracked/untracked không thấy cấu hình triển khai gateway/service/backup; không kiểm tra cấu hình hạ tầng bên ngoài repository.

## 8 điểm phải chốt trước phát hành

### 1. Cao — Tạo phiên công khai, không có cổng admission hoặc quota tổng

**Đã xác nhận:** `POST /session` không yêu cầu credential (`backend/app.py:225–232`), nhận public key bất kỳ đúng mẫu (`:27–29`) rồi cấp bearer mới và ghi DB. Schema/handler không hạn chế số phiên, số byte theo chủ sở hữu hay thời gian. Giới hạn revision chỉ áp dụng từng phiên/slot (`:305–308`). README tự cảnh báo chưa rate limit/user auth (`backend/README.md:139–145`).

**Tác động:** Người truy cập API tự cấp quyền tạo vô hạn hồ sơ; mỗi phiên có tối đa 20 ảnh gồm history, riêng BLOB có thể đạt khoảng 200 MiB ở trần 10 MiB/ảnh (`:24`, `:37`, `:156–172`, `:305–316`). Giới hạn request không ngăn đầy đĩa hoặc chi phí provider trên nhiều phiên. Đăng ký public key không chứng minh người dùng hoặc tổ chức được cấp phép.

**Việc tối thiểu:** Trước public exposure, yêu cầu gateway authentication/VPN hoặc luồng cấp quyền tạo phiên có kiểm soát; áp rate limit, số phiên, tổng dung lượng và ngân sách VLM cho pilot. Giới hạn IP chỉ là một lớp, không thay quyền admission. Để mở B2C tự phục vụ mới thiết kế account/abuse controls phù hợp. Dashboard không phải điều kiện kỹ thuật ở đây.

**Điều kiện đóng:** Client không thuộc pilot không tạo được phiên; pilot vượt trần bị từ chối rõ ràng; đĩa có ngưỡng cảnh báo và quy trình dừng nhận mới. Chưa xác minh có lớp gateway bên ngoài hay không.

### 2. Cao — Chưa có cấu hình HTTPS/perimeter production được kiểm chứng

**Đã xác nhận:** Lệnh hướng dẫn chạy Uvicorn trực tiếp `0.0.0.0:8000`, không cấu hình TLS (`README.md:9–12`, `backend/README.md:95–103`); HTTP được ghi là demo LAN, không production (`README.md:21`, `:54`). App chỉ đăng ký middleware giới hạn body, không ép HTTPS/Host (`backend/app.py:175–188`).

**Tác động:** Nếu đưa nguyên cấu hình demo ra mạng không tin cậy, bearer và ảnh đi qua HTTP; ai lấy được bearer có toàn quyền trong phiên. Bind `0.0.0.0` không tự chứng minh Internet đang truy cập được: firewall, reverse proxy và tunnel production chưa được audit.

**Việc tối thiểu:** Domain HTTPS được phê duyệt, chứng chỉ/renewal, backend chỉ nhận traffic từ proxy/VPN; chặn đường truy cập trực tiếp cổng 8000. Đặt allowed hosts tại proxy hoặc app; chỉ tin forwarded headers từ proxy xác định, không tin toàn Internet. Cấm log `Authorization`, ảnh và provider key ở proxy.

**Điều kiện đóng:** Kiểm tra từ mạng phát hành xác nhận certificate hợp lệ, HTTP không nhận credential/ảnh và không có bypass trực tiếp backend; lưu cấu hình/deployment runbook đã review. Redirect không làm an toàn credential đã gửi qua HTTP.

### 3. Cao — Giới hạn byte có nhưng chưa chặn nghẽn đồng thời/slow upload/khóa SQLite

**Đã xác nhận:** Middleware đọc toàn bộ stream trước auth, giữ chunks rồi nối bytes (`backend/app.py:177–188`). Có trần wire thực 10 MiB + 64 KiB cho upload/verify và 16 KiB route khác; **không phải upload vô hạn**. Không có deadline đọc body hoặc admission đồng thời trong source. Multipart được parse trước handler auth (`:253–262`, `:428–433`). `image.verify()`/`image.load()` chạy đồng bộ trong async handler (`:99–117`, `:282`, `:441`); có trần 20 triệu pixel. Các async route dùng SQLite đồng bộ với timeout 15 giây (`:143`, `:261`, `:287–288`, `:328`, `:356–357`). Finalize lấy `BEGIN IMMEDIATE` trước kiểm tra bearer (`:372–376`).

**Tác động:** Nhiều request dưới trần vẫn nhân bộ nhớ, chi phí parse/decode; upload chậm giữ tài nguyên. SQLite chờ khóa và decode có thể chặn event loop, gây lỗi dây chuyền trên worker. Request finalize không hợp lệ vẫn đi vào đường lấy khóa ghi. Không đo tải nên không đặt con số throughput hoặc số worker an toàn giả định.

**Việc tối thiểu:** Áp body deadline/minimum data rate và giới hạn connection/request đồng thời ở gateway/server; giới hạn RAM/đĩa và fail fast khi quá tải. Kiểm tra auth trước phần công việc/khóa ghi có thể tránh; đưa decode và SQLite blocking ra khỏi event loop khi pilot cần concurrency. Không vội thay SQLite nếu workload nhỏ vẫn đáp ứng.

**Điều kiện đóng:** Kiểm thử riêng trên dữ liệu tổng hợp: upload chậm, nhiều upload ở trần, lock contention và unauth finalize; health/phiên hợp lệ vẫn đáp ứng SLO, không OOM, quá tải trả lỗi có kiểm soát. Không chạy tải trên dịch vụ demo đang chứa dữ liệu.

### 4. Cao — Bearer tồn tại vô thời hạn, không có thu hồi/rotation

**Đã xác nhận:** Token sinh bằng `secrets.token_urlsafe(32)`, chỉ lưu SHA-256 (`backend/app.py:225–231`); so sánh session digest bằng `hmac.compare_digest` (`:211–218`). Đây là thiết kế capability có entropy tốt, không phải password yếu cần password KDF. Nhưng bảng `sessions` chỉ có ID/key/hash (`:154–155`); mọi auth chỉ kiểm tra hash hiện hữu (`:199–218`, `:415–425`); không có expiry, revoked state hay route rotate/revoke trong toàn bộ 9 route.

**Tác động:** Token lộ tiếp tục đọc session/report, upload/finalize/analyze nếu phiên còn mở. Finalize chỉ khóa thay đổi, không chấm dứt quyền đọc. Mất token không có cơ chế phục hồi được xác thực; đăng ký cùng public key không khôi phục quyền phiên cũ.

**Việc tối thiểu:** Pilot phải có thủ tục quản trị thu hồi được kiểm thử, token expiry/rotation phù hợp thời gian giữ hồ sơ và cách khôi phục bằng quyền sở hữu xác thực; không cho lấy lại token chỉ bằng public key. Không cần enterprise IAM để làm điều này. Nếu dùng gateway một chủ sở hữu, tài liệu hóa rõ giới hạn thu hồi từng phiên và xử lý incident.

**Điều kiện đóng:** Token bị thu hồi/hết hạn không còn đọc hoặc ghi được trên mọi route, gồm `/report/{id}`; token mới giữ đúng isolation; restart không phục hồi quyền đã thu hồi. Cần index cho lookup hash khi số phiên tăng; hiện schema không tạo index `token_hash`, truy vấn auth (`:207`) phải tìm theo cột này.

### 5. Cao — Chưa có quy trình backup/restore và retention server có thể vận hành

**Đã xác nhận:** Ảnh hiện tại/lịch sử là BLOB trong một file SQLite (`backend/app.py:137–172`); chỉ thao tác xóa ảnh trong source là chuyển current sang history khi retake (`:309–312`), không phải purge. README yêu cầu backup trước migration (`backend/README.md:184–186`) nhưng repository không có lịch backup, restore script/runbook, thời hạn giữ hoặc quy trình xóa hồ sơ. Tài liệu ghi từng backup thủ công khi restart (`docs/DEMO-WORKFLOW.md:39`), không chứng minh bản backup còn dùng được hoặc có bản sao tách khỏi host.

**Tác động:** Mất host/DB có thể mất cả ảnh gốc lẫn history/report; giữ ID document vô hạn không có quyết định được ghi nhận. Local-photo cleanup không xóa dữ liệu backend. Không khẳng định DB hiện hỏng hoặc backup chưa từng được tạo.

**Việc tối thiểu:** Chốt owner, RPO/RTO, lịch snapshot nhất quán bằng SQLite backup API, bản sao ngoài host với quyền truy cập và mã hóa phù hợp; kiểm tra restore trong thư mục riêng. Không dùng raw file copy khi DB đang hoạt động, đặc biệt nếu sau này bật WAL. Chốt retention/purge cho cả BLOB, history, report và backup, có ngoại lệ giữ theo nghĩa vụ thực tế; xác nhận trước xóa, không tự suy diễn yêu cầu pháp lý.

**Điều kiện đóng:** Restore từ snapshot trên dữ liệu tổng hợp giữ nguyên bytes/hash/signature/token isolation/report; diễn tập mất host và purge theo chính sách được duyệt. Backup trước migration không thay thế kiểm tra restore định kỳ.

### 6. Cao nếu bật VLM với ảnh thật — Chưa có cổng kiểm soát privacy/chi phí ở server

**Đã xác nhận:** Server lấy original ảnh đã ký gửi data URL tới endpoint cấu hình (`backend/vlm.py:84–104`, `:108–110`); config cho cả HTTP và HTTPS (`:16–34`). Route phân tích kiểm tra bearer, tính toàn vẹn, ngôn ngữ; không nhận/lưu bằng chứng consent hoặc quyết định policy (`backend/app.py:325–355`). UI consent được tài liệu demo mô tả (`docs/DEMO-WORKFLOW.md:17`); không được nhầm thành server enforcement. Nhiều request đồng thời khi cache còn trống có thể cùng gọi provider (`backend/app.py:353–355`); `UPDATE ... analysis IS NULL` chỉ bảo vệ kết quả lưu, không gộp các network call (`:362–366`).

**Tác động:** Client API khác có thể gọi phân tích không qua hộp thoại UI; ảnh tài liệu/biển số đi ra nhà cung cấp. Request lỗi có thể thử lại, không có ngân sách tổng hoặc in-flight deduplication. HTTPS provider thực tế, vùng lưu trữ, thời gian giữ, quyền huấn luyện và hợp đồng xử lý dữ liệu **chưa được xác minh trong audit**, không đọc secret/config runtime để đoán.

**Việc tối thiểu:** An toàn nhất là tắt VLM với dữ liệu thật tới khi owner phê duyệt provider/HTTPS/retention và thông báo/đồng ý phù hợp. Nếu bật: lưu policy/consent tối thiểu gắn phiên khi cần chứng minh, bắt buộc HTTPS cho production, giới hạn concurrency/cost và gộp yêu cầu cùng evidence. URL do operator cấu hình, không có client override: không báo sai đây là SSRF cho người dùng tùy ý chọn URL.

**Điều kiện đóng:** Test stub chứng minh thiếu quyền/policy không gửi ảnh, request đồng thời không vượt ngân sách; review privacy thực tế có người chịu trách nhiệm. Không cần gọi provider thật để đóng phần protocol. Tư vấn pháp lý chuyên môn cần riêng nếu dùng dữ liệu cá nhân.

### 7. Vừa — Chưa có readiness, giám sát và quy trình sự cố đủ cho pilot có cam kết

**Đã xác nhận:** `/health` trả hằng `status:ok` và trạng thái cấu hình VLM, không mở DB/kiểm tra disk/khả năng ghi (`backend/app.py:220–223`); README nói rõ không chứng minh provider reachability (`backend/README.md:63–69`). Source không có structured app audit/error logging, readiness, metric hoặc handler cho `sqlite3.OperationalError`; handler hiện chỉ xử lý HTTPException (`backend/app.py:190–197`). Hướng dẫn chạy là lệnh terminal, chưa có cấu hình service supervisor trong repository.

**Tác động:** DB lỗi/đĩa đầy/worker nghẽn có thể xảy ra trong khi health còn xanh. Uvicorn access log không phải lịch sử hành động có actor đáng tin hoặc bằng chứng chống sửa. Không kết luận host hiện không có monitor/supervisor bên ngoài.

**Việc tối thiểu:** Tách liveness khỏi readiness DB/storage; cảnh báo disk, backup age, 5xx, latency và VLM cost; supervisor/restart và shutdown có kiểm soát. Log sự kiện admission/auth failure/upload/finalize/revoke bằng ID đủ truy vết, không token/ảnh/provider response body; chốt thời hạn giữ log. Chuẩn hóa lỗi storage/lock thành response redacted và có quy trình xử lý, không che mất lỗi vận hành.

**Điều kiện đóng:** Diễn tập trên storage tạm: DB không truy cập được/đĩa gần đầy/worker chết phải tạo tín hiệu lỗi đúng và phục hồi không mất bản ghi đã commit. Chưa cần nền tảng observability lớn.

### 8. Vừa — Chưa có release backend tái lập, code/test hiện chưa được Git theo dõi

**Đã xác nhận:** `git status --short` cho `?? backend/` và `?? tests/`; chỉ đọc trạng thái, không stage/commit. Dependencies được pin (`backend/requirements.txt:2–23`), nhưng pin không tạo release hoặc scan CVE. README còn nhiều mốc test cũ: 19 test (`README.md:42`), 35 test (`:52`), trong khi demo log ghi 50 (`docs/DEMO-WORKFLOW.md:39`).

**Tác động:** Commit hiện tại không mang backend/test để tái dựng hoặc rollback; người vận hành dễ dùng nhầm mốc kiểm thử. Mã chạy trên host không tự trở thành artifact đã kiểm chứng.

**Việc tối thiểu:** Sau review và kiểm tra không có secrets/data trong staging, owner đưa code/config mẫu/test vào version control, tạo release artifact theo commit, ghi Python/dependencies và migration/rollback runbook. Không commit `.env`, SQLite, ảnh hoặc backup; `.gitignore:1–9` đã có loại trừ cơ bản. Thống nhất một kết quả test có timestamp/commit; chạy dependency advisory scan bằng công cụ được duyệt trong release pipeline, không nâng cấp cưỡng bức.

**Điều kiện đóng:** Checkout sạch dựng và chạy full backend + isolated live smoke thành công; artifact và DB migration có phương án rollback đã diễn tập. Audit này không commit hoặc thay source.

## Các kiểm soát đã có — không ghi nhầm thành thiếu

- **Integrity:** Canonical manifest đúng sáu trường, timestamp kiểm tra cú pháp/ngày, Ed25519 ký raw canonical bytes (`backend/app.py:41–75`); upload ràng buộc session/key/hash (`:273–285`), DB UNIQUE current slot (`:156–160`), transaction thay ảnh/finalize (`:287–316`, `:372–399`). Finalize kiểm lại cả current/history trước tạo report (`:380–382`). Đây không phải bằng chứng đồng hồ hoặc cảnh thật.
- **Auth phiên:** Bearer hash tại rest; auth trước lookup tài nguyên trong analyze/report (`backend/app.py:329–341`, `:414–425`); đọc report không công khai. Người có bearer có quyền phiên, không phải role reviewer/owner riêng. Thêm người dùng/tổ chức mới cần grant/role/isolation riêng; chưa phải đa tenant.
- **Giới hạn input:** Wire bytes được đếm cả khi không có Content-Length (`backend/app.py:177–188`); JPEG/PNG verify + decode, 10 MiB, 20 triệu pixel (`:99–117`); exact multipart fields (`:247–251`), revision bound (`:305–308`). Không thay bằng kiểm Content-Length đơn thuần.
- **Storage:** Tạo thư mục mới mode `0700`, DB chmod `0600` (`backend/app.py:137–173`), hiện trạng đúng. `exist_ok=True` không sửa quyền thư mục đã tồn tại; parent dirs tạo tự động không được đảm bảo cùng mode `0700`. Cần kiểm tra owner/mode của đường dẫn `TRUSTCAM_DATA_DIR` và backups trong deployment, umask riêng. File permission không phải mã hóa at rest; khả năng mã hóa volume/backup chưa xác minh. User cùng UID/root vẫn có thể sửa DB.
- **Provider:** Stored hash/signature kiểm trước outbound (`backend/app.py:353–355`); không cho prompt/URL/model override từ client (`:344–352`); provider response bounded, không environment proxy/redirect mặc định, deadline 20 giây, output schema fail closed (`backend/vlm.py:44–76`, `:105–122`). Protocol validation không chứng minh độ chính xác hoặc VI/EN tương đương nghĩa.

## Docs, CORS, CSRF và cache/proxy

- `FastAPI(title='TRUSTCAM')` không tắt docs (`backend/app.py:175`): defaults đã kiểm bằng package cài đặt là `/docs`, `/redoc`, `/openapi.json`, không gắn auth. Đây là lộ API schema, **không phải tự động lộ ảnh/token đã lưu**. Production private pilot nên gateway chặn hoặc tắt docs; ẩn docs không sửa mục 1.
- Không có CORS middleware trong source. Native Expo không cần CORS; thiếu CORS không phải lỗ hổng. Chưa có web dashboard. Nếu xây web client, allowlist origin cụ thể; không mở wildcard kèm credentials để chữa lỗi trình duyệt.
- Auth dùng `Authorization` header, không đọc/set cookie (`backend/app.py:199–218`, `:225–232` và toàn bộ route). Vì không có ambient cookie auth, không ghi nhận lỗi CSRF cookie truyền thống hoặc yêu cầu CSRF token vô cớ. Public session spam thuộc mục 1. Nếu sau này đổi sang cookie, phải xét lại SameSite/CSRF/Origin.
- Không có `Cache-Control: no-store` trong response ứng dụng (`backend/app.py:190–197`, `:234–245`, `:402–426`). Đặt chính sách không cache cho token/session/report và không cache API ở reverse proxy; không mặc định khẳng định shared cache đang rò dữ liệu, vì cấu hình proxy chưa kiểm tra. Header auth phải được giữ tới app, không ghi vào access log.

## Giới hạn chứng cứ và lộ trình tối thiểu

1. Giữ demo LAN với ảnh tổng hợp trong khi chưa đóng mục 1–5; không coi thời hạn demo là bằng chứng đủ production.
2. Chọn pilot một chủ sở hữu: gateway admission + HTTPS, quota/timeouts, thu hồi bearer, backup/restore, retention và service monitoring. Đóng mục 8 để có release có thể kiểm chứng. VLM tắt nếu mục 6 chưa đóng.
3. Parent chạy full suite/HTTP smoke và kiểm thử thiết bị; owner kiểm tra perimeter thực tế, restore, tải nhỏ có giới hạn trên dữ liệu tổng hợp. Test PASS chức năng không thay các gate vận hành trên.
4. Enterprise accounts/grants, dashboard, SSO, RAG isolation, billing, share links và full-report attestation là **tính năng riêng**, chỉ xây khi scope khách hàng cần. Không gọi dashboard hay RAG đã triển khai: `README.md:56` ghi chúng còn planned.

**Crypto/legal:** Report chỉ là server snapshot, không ký toàn khối (`backend/app.py:386–399`, `backend/README.md:150–153`). Revision links, thứ tự history, VLM reason và metadata không nằm trong manifest ký; người kiểm soát server/DB có thể thay metadata. PASS chỉ xác nhận bytes/signature so với key phần mềm đã đăng ký, không xác nhận danh tính, timestamp đáng tin, cảnh không dàn dựng hoặc giá trị pháp lý (`backend/app.py:389–396`). Không tự động xử phạt khi FAIL. Muốn chứng minh độc lập toàn bộ report hoặc chuỗi quản lý chứng cứ phải chốt yêu cầu rồi thiết kế attestation/log thích hợp; chưa cần cho pilot chỉ hứa byte integrity.

**Chưa biết:** Firewall/TLS/gateway thật, cấu hình process/proxy, backup còn tồn tại/restore được, encryption volume, hạn mức provider, chính sách dữ liệu nhà cung cấp và tải production. Không có kết luận phủ định các thứ này chỉ từ việc thiếu file trong repository.

## Thay đổi của lần audit

Chỉ tạo `docs/PRODUCTION-SECURITY-AUDIT.md`. Không sửa backend/app/test/config, không đọc secrets hoặc dữ liệu production, không gọi provider, không commit/deploy/restart.
