# TRUSTCAM — clone và chạy demo riêng trên server

**Public production: NO-GO.** Gói này chỉ là mẫu triển khai **demo dữ liệu tổng hợp trong VPN có kiểm soát**, không đóng các blocker tại [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) và [PRODUCTION-SECURITY-AUDIT.md](PRODUCTION-SECURITY-AUDIT.md). Chưa triển khai/restart server live. Backend live cũ không tự cập nhật khi đẩy GitHub. Test source PASS không chứng minh TLS, perimeter, restore hoặc mobile native hoạt động.

## Phạm vi và điều kiện

- Linux/systemd; Python **3.12+**, ưu tiên 3.12 đã kiểm thử; Git, venv/pip, Caddy do operator chuẩn bị. Không cần Docker/Node để chạy API + dashboard; dashboard được backend phục vụ tại `/dashboard/` cùng origin.
- Chỉ một worker/instance: cookie, CSRF và login limiter nằm trong RAM; restart đăng xuất dashboard. Không thêm worker để chữa quá tải.
- VPN phải xác thực từng thiết bị được cấp phép; thu hồi tại VPN. Caddy bind IP VPN và allowlist **IP VPN client cụ thể cho mọi route**, gồm `/health`, `/session`, `/docs`, `/openapi.json`, `/dashboard` và API khác. Dashboard password không bảo vệ API ngoài dashboard.
- Không dùng HTTP Basic làm gate cho mobile: `Authorization` đang cần cho session Bearer. Không có gateway password trong app; dùng VPN, không nhúng credential vào URL. Không đặt CDN/tunnel/reverse proxy khác trước mẫu này: `remote_ip` phải là peer VPN thật, không phải proxy chung.
- Firewall server chỉ cho client VPN được duyệt vào TCP 443; chặn TCP 80 và 8000 từ bên ngoài. Uvicorn chỉ bind loopback. Không công khai VPN interface qua NAT/tunnel. TLS vẫn bắt buộc trong VPN.
- Mẫu không cung cấp quota tổng dung lượng/phiên, thu hồi bearer từng phiên, retention/purge, rate limit API toàn cục hoặc audit trail. Giới hạn concurrency 8 và read-body deadline 30s chỉ là trần demo khởi đầu, chưa đo tải. Dừng nhận mới khi thiếu disk; không dùng ảnh khách thật.

## 1. Clone release đã duyệt

Các lệnh dưới là **hướng dẫn operator**, chưa chạy trên server. Thay `REPOSITORY_URL`, `REVIEWED_COMMIT` bằng repo/commit đã publish và review secrets; không dùng URL chứa token. Không clone DB, ảnh, `.env` hoặc backup.

```sh
sudo useradd --system --user-group --home-dir /var/lib/trustcam --shell /usr/sbin/nologin trustcam
sudo git clone REPOSITORY_URL /opt/trustcam
sudo git -C /opt/trustcam checkout --detach REVIEWED_COMMIT
sudo python3.12 -m venv /opt/trustcam/.venv
sudo /opt/trustcam/.venv/bin/python -m pip install -r /opt/trustcam/backend/requirements.txt
sudo /opt/trustcam/.venv/bin/python -m pip check
sudo install -d -o trustcam -g trustcam -m 0700 /var/lib/trustcam
sudo install -d -o root -g root -m 0700 /etc/trustcam
sudo install -o root -g root -m 0600 /opt/trustcam/deploy/demo.env.example /etc/trustcam/demo.env
```

Nếu user/thư mục đã tồn tại, kiểm tra owner/quyền trước, không chạy lại `useradd` mù quáng. Source và venv thuộc root, chỉ đọc/chạy được bởi service; không `chown -R trustcam /opt/trustcam`. Toàn clone phải đọc được, gồm `dashboard/` và `corpus/legal-demo/`. Không chạy service bằng root.

## 2. Environment thật, ngoài Git

Sinh mật khẩu ngẫu nhiên riêng bằng stdlib, giữ trong password manager; không dán vào chat, command history hoặc commit:

```sh
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
sudoedit /etc/trustcam/demo.env
```

Thay `REPLACE_WITH_RANDOM_PASSWORD` bằng kết quả sinh; backend chấp nhận 16–1024 ký tự. Mẫu placeholder đủ dài nên **không tự bị backend từ chối**: bắt buộc thay trước startup. File thật mode `0600 root:root`; systemd đọc và truyền cho process non-root qua `EnvironmentFile`. Không tự đọc `.env`, không dùng `source`, không dùng `export` hay `$(...)` trong file. Không chạy `systemctl show ... Environment` rồi chia sẻ output có secret.

Giữ `TRUSTCAM_DATA_DIR=/var/lib/trustcam` bền vững ngoài checkout. SQLite `trustcam.sqlite3` chứa ảnh BLOB, chữ ký, grants và reports; thư mục `0700`, DB `0600`, `UMask=0077`. Quyền file không phải mã hóa at rest.

**Không đặt `TRUSTCAM_DASHBOARD_ALLOW_HTTP=1` trên server.** Cookie mặc định `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/dashboard`, sống tối đa một giờ. Browser dùng HTTPS đúng domain; cookie Secure vẫn đúng dù proxy gọi loopback HTTP. Uvicorn chỉ tin forwarded headers từ `127.0.0.1`.

VLM mặc định tắt: để cả ba `VLM_BASE_URL`, `VLM_MODEL`, `VLM_API_KEY` không có trong environment. Chỉ bật sau phê duyệt provider/privacy/retention/chi phí, URL HTTPS, và consent trước mỗi lần gửi ảnh. Khai báo cả ba trong `/etc/trustcam/demo.env`, không đưa key vào mobile. Cấu hình đọc lúc startup; `/health` báo configured không chứng minh inference thành công. Không gọi provider thật trong bước kiểm tra gói deploy.

## 3. HTTPS và gate toàn API

Copy `deploy/Caddyfile.example` vào vị trí operator quản lý (ví dụ `/etc/caddy/Caddyfile`). Thay **mọi** `demo.example.invalid`, IP TEST-NET `192.0.2.2`, `192.0.2.10/32`, và đường dẫn certificate/key:

- Domain duy nhất, DNS private phân giải về IP VPN server; không wildcard Host. Matcher Host và upstream Host cố định cùng domain. Không dùng request Host tùy ý làm upstream Host.
- `bind` = IP VPN server; `remote_ip` = IP VPN client được duyệt, nhiều IP có thể liệt kê cách nhau bằng dấu cách. Không đổi thành `private_ranges`, không tin `X-Forwarded-For` do client gửi. Gate nằm trước proxy cho **toàn bộ** route, không chỉ dashboard.
- Certificate có DNS SAN chính xác, chain được thiết bị thật tin cậy; operator provision/renew ngoài gói này. Key chỉ Caddy/root đọc, không thuộc repo và không cấp cho user `trustcam`. Không dùng `curl -k` để coi kiểm tra TLS là PASS.
- `auto_https disable_redirects`: không mở HTTP redirect. Credential đã gửi HTTP không thể được bảo vệ bằng redirect; luôn nhập URL `https://...`, firewall chặn 80.
- Body max **10 MiB + 64 KiB = 10551296 byte** toàn request, không phải chỉ file. Backend giữ trần 10 MiB/file, pixel limit và trần nhỏ hơn từng route. Caddy `request_body { max_size ... }`, không dùng directive `client_max_body_size` của nginx.
- `route` giữ thứ tự Host/IP gate trước reverse proxy; cache `no-store`, không bật access log, không ghi Authorization/cookie/body. Backend access log tắt. Không serve toàn repo hoặc corpus/raw bằng `file_server`.

Validate bằng Caddy trên server, với certificate thật đã provision. Nếu phiên bản không nhận directive, **dừng**, đọc tài liệu đúng phiên bản; không xóa gate để chạy cho kịp:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemd-analyze verify /opt/trustcam/deploy/trustcam-demo.service
python3 /opt/trustcam/deploy/check_config.py
```

Script cuối chỉ kiểm tra mẫu bằng stdlib, không đọc environment/secret/DB và **không thay Caddy parser**. Không kiểm perimeter bằng script này.

## 4. Start và kiểm tra từ mạng phát hành

**Nếu có DB cũ: backup nhất quán trước startup/migration. Không khởi động bản mới vào DB live chưa backup.** Demo sạch dùng `/var/lib/trustcam` mới rỗng. Không copy DB LAN đang chứa ảnh thật lên host để demo.

```sh
sudo install -o root -g root -m 0644 /opt/trustcam/deploy/trustcam-demo.service /etc/systemd/system/trustcam-demo.service
sudo systemctl daemon-reload
sudo systemctl enable --now trustcam-demo
sudo systemctl status trustcam-demo --no-pager
# Chỉ sau khi validate Caddy thành công, operator đã duyệt firewall/VPN/TLS:
sudo systemctl reload caddy
```

Caddy phải đã cài/enabled theo distro; gói này không cài hoặc bật dịch vụ. `journalctl -u trustcam-demo` chỉ dùng nội bộ, redact trước chia sẻ; app errors có thể chứa metadata vận hành. `--no-access-log` không đồng nghĩa không còn log.

Từ thiết bị VPN được duyệt:

```sh
curl --fail --silent --show-error https://YOUR_EXACT_DOMAIN/health
```

Phải thấy HTTP 200 và checklist; VLM tắt báo `vlm_configured:false`. Health không kiểm DB writable, disk, backup hoặc provider. Mở `https://YOUR_EXACT_DOMAIN/dashboard/`, đăng nhập bằng password riêng, kiểm cookie Secure và logout. Dashboard mới trống là đúng: chỉ thấy hồ sơ sau chủ bearer **đồng ý rõ ràng** và gọi share; không tự cấp grant cho hồ sơ cũ. Không nhập bearer mobile làm password quản trị.

Kiểm tra bắt buộc trước chia demo: client ngoài allowlist/VPN không gọi được **cả `/session`, `/health`, `/docs` lẫn `/dashboard/`**; cổng 8000 không vào được ngoài host; Host sai không tới app; certificate hợp lệ trên điện thoại; request quá trần bị 413; HTTP 80 không nhận ảnh/token. Chưa chạy các kiểm tra mạng này trong lượt chuẩn bị gói.

App: đặt API URL `https://YOUR_EXACT_DOMAIN` trong Cài đặt (hoặc `EXPO_PUBLIC_API_URL` trước build), không có `/dashboard` ở cuối; điện thoại bật VPN và tin chain TLS. Default mobile vẫn localhost, cấu hình LAN HTTP trong source **chưa phải release-hardening**. Không thay config app trong gói này. Thử ảnh tổng hợp: tạo hồ sơ, bốn nhóm, ảnh bổ sung, retake/history, chốt, share có consent, mở dashboard, tải đúng file gốc để verify; PASS chỉ byte/signature integrity, không sự thật cảnh/thời gian/danh tính/pháp lý.

## 5. Backup/rollback tối thiểu

Dùng **SQLite connection backup API**, không `cp` file DB đang chạy vì có thể bỏ sót WAL hoặc snapshot không nhất quán. Ví dụ chạy dưới user `trustcam`, source chỉ đọc, destination mới không ghi đè; backup là dữ liệu nhạy cảm, không nằm trong checkout. Chuẩn bị thư mục `0700 trustcam:trustcam` trên volume private, đặt đường dẫn thật trước chạy:

```sh
sudo -u trustcam /opt/trustcam/.venv/bin/python - /var/lib/trustcam/trustcam.sqlite3 /PRIVATE_BACKUP_DIR/trustcam-before-release.sqlite3 <<'PY'
import os, sqlite3, sys
from pathlib import Path
os.umask(0o077)
source, target = map(Path, sys.argv[1:])
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
os.close(fd)
try:
    with sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True) as src:
        with sqlite3.connect(target) as dst:
            src.backup(dst)
            if dst.execute('PRAGMA quick_check').fetchone() != ('ok',):
                raise RuntimeError('backup quick_check failed')
finally:
    # Connections close explicitly; partial backup stays for operator inspection.
    if 'src' in locals(): src.close()
    if 'dst' in locals(): dst.close()
PY
```

Nếu backup lỗi, dừng deploy; file đích có thể dở dang, không dùng nó làm restore. Backup hoàn tất cần copy mã hóa ra host khác theo policy owner duyệt. `quick_check` không chứng minh phục hồi chức năng. Diễn tập restore vào thư mục riêng, backend riêng loopback/cổng khác, VLM tắt; kiểm hash/signature, current/history, grants, bearer isolation và report cũ. Không thử restore trực tiếp DB đang phục vụ.

Rollback: đóng admission ở VPN/firewall, dừng service, giữ snapshot DB mới để điều tra; checkout commit cũ và **chỉ phục hồi snapshot trước migration đã kiểm tra** dưới quyền `trustcam`, thư mục `0700`, DB `0600`; không trộn WAL/SHM cũ. Restore có thể mất mọi ghi sau snapshot, cần owner phê duyệt trước hành động. Không trỏ code cũ vào schema mới rồi đoán tương thích. Gói chưa diễn tập restore/migration rollback, chưa có lịch backup/retention tự động.

## Bằng chứng kiểm tra gói

Chuẩn bị 2026-11-14 (+07), không install/remote deploy/commit, không đọc secrets hoặc DB live. Chỉ thêm `deploy/` và tài liệu này.

- Máy chuẩn bị **không có `caddy`**: cấu hình Caddy **chưa validate bằng parser**, chưa kiểm TLS/firewall/VPN/runtime trên server. Operator bắt buộc validate trước start.
- `python3 deploy/check_config.py`: **PASS** lúc 15:51 +07; chỉ kiểm invariant của mẫu. Python AST và các trường INI systemd: PASS. Các option Uvicorn đã đối chiếu `--help` từ venv hiện tại.
- `systemd-analyze verify deploy/trustcam-demo.service`: **exit 1**, chỉ báo executable `/opt/trustcam/.venv/bin/python` chưa tồn tại trên máy chuẩn bị. Bản sao tạm thay đúng executable Python cục bộ: **exit 0**; không sửa mẫu, không chạy service. Kiểm lại unit nguyên bản trên server sau clone.
- Đã chạy đúng đoạn SQLite backup bên trên trên **DB tổng hợp tạm trong scratch**: `quick_check`, đọc lại bản ghi và mode `0600` đều PASS. Không đọc DB live; đây chưa phải restore drill toàn ứng dụng.
- Đây là artifact triển khai demo, **không phải thông báo production ready hoặc live backend đã nâng cấp**.
