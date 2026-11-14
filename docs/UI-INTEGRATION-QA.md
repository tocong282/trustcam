# TRUSTCAM — QA độc lập sau tích hợp UI

Ngày: 2026-11-14, UTC+07. Workspace: `/home/rcong/Project/trustcam`.

## Kết luận

Không xác nhận lỗi P0/P1/P2 mới trong các luồng tích hợp được kiểm tra. Backend 46 tests PASS; HTTP thật retake/history/stale/report/verify PASS; app typecheck/self-check/config-check PASS. Sáu màn đã nối vào `App.tsx`, không chỉ nằm trong `ui-ready/`.

**Chưa kiểm thử native trên điện thoại hoặc simulator.** Node structural checks không phải React/native renderer; không chứng minh camera, lifecycle, SecureStore, picker hoặc Share chạy đúng trên thiết bị. Không gọi VLM provider thật, không đọc `.env`/secrets, không restart dịch vụ, không commit, không sửa `app/`, `backend/` hoặc thiết kế gốc.

## Snapshot và phạm vi

- Bắt đầu đọc lúc 14:09:34; implementer còn sửa `app/App.tsx`, `app/src/ui/`, `app/test/ui-check.cjs`.
- Kiểm tra app lần đầu 14:10:49–14:10:53 PASS. Kiểm tra lại 14:12:27–14:12:33 PASS, có thêm structural checks trên JSX App thực.
- Đọc lại App tích hợp cuối ở 14:13–14:14; đã có `navigationDisabled={busy}`, sáu màn, cả callbacks Verify refresh/Settings. Parent xác nhận implementer hoàn tất; không coi khác biệt snapshot trước đó là bug.
- Snapshot SHA-256 lúc 14:13:40:
  - `app/App.tsx`: `29459501a1163b56378fc6c90e8b0dac9fbddbf8c0ee27c899af4b58e167c111`
  - `app/src/ui/screens.tsx`: `9496279fa174b488ce32a7824f6dc04bc6f69978b74987d394ae4aa8d48f7d6f`
  - `app/src/ui/copy.ts`: `9f2b1da485d2006209ce7f0f1b03099bbcde93a1b97f63f158c92f742f225cc1`
  - `app/src/ui/theme.ts`: `fbde9848cc2c7d2eb069c1de652806cea87d06237587a524970cc302bf3956e0`
  - `app/test/ui-check.cjs`: `bffb2ad23448dd4c505e4da42d7797c9dbaf007c320847d22391f92b02bced59`

## Kết quả thực thi độc lập

| Kiểm tra | Kết quả |
|---|---|
| Backend unittest discover, `-W error::ResourceWarning` | **46 tests OK**, 10.335 giây |
| `tests/live_smoke.py` | **PASS** TypeScript canonical/signing + Python verification qua HTTP thật; retake/history/stale rejection; báo cáo bốn ảnh; khôi phục report; ảnh lịch sử gốc PASS, sửa FAIL; ảnh thay thế PASS |
| `npm run typecheck` | **PASS**, không diagnostics |
| `npm run self-check` | **PASS** signing, URL/error boundary, VI/EN, response validators, finalized guards, foreground permission source wiring, camera bounds, local storage/pending reconciliation; UI + actual App composition 6 screens × 2 themes × 2 locales |
| `npm run config-check` | **PASS** camera permission, bilingual native reasons, không microphone/Face ID |
| `node ui-ready/check.cjs` | **PASS**, TypeScript 6.0.3, 2 source files, 0 diagnostics; presentation contracts |
| `git diff --check` | **PASS** |
| GET `http://127.0.0.1:8000/health` | `status=ok`, `analysis_mode=checklist`, `vlm_configured=true`, `vlm_status=not_checked` |
| GET `http://127.0.0.1:8081/status` | `packager-status:running` |

Backend tests và live smoke dùng DB/ảnh tổng hợp riêng; không tạo session test trong API production đang chạy. Để tuân thủ giới hạn ghi, tiến trình Python dùng `PYTHONDONTWRITEBYTECODE=1`, `-B` và wrapper chuyển `tempfile.TemporaryDirectory` sang `$TMPDIR`; source test không đổi. Server smoke riêng dùng port ngẫu nhiên, tắt `VLM_BASE_URL`, `VLM_API_KEY`, `VLM_MODEL`. VLM unittest chỉ dùng HTTP fixture localhost, không gọi provider thật.

Lệnh tái lập read-only từ repo root:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -B -W error::ResourceWarning -c 'import tempfile, os, unittest; original=tempfile.TemporaryDirectory; tempfile.TemporaryDirectory=lambda *a, **kw: original(*a, **(kw | {"dir": os.environ["TMPDIR"]})); result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover("tests")); raise SystemExit(not result.wasSuccessful())'
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -B -c 'import tempfile, os, runpy; original=tempfile.TemporaryDirectory; tempfile.TemporaryDirectory=lambda *a, **kw: original(*a, **(kw | {"dir": os.environ["TMPDIR"]})); runpy.run_path("tests/live_smoke.py", run_name="__main__")'
(cd app && npm run typecheck && npm run self-check && npm run config-check)
node ui-ready/check.cjs
git diff --check
```

Không chạy export/Expo doctor thêm trong lần QA này vì phạm vi không cho ghi build/cache trong app. Không cài dependencies hoặc chạy lint tự cấu hình mới.

## Đối chiếu chức năng đã giữ

| Luồng | Source tích hợp / bằng chứng | Đánh giá |
|---|---|---|
| Camera foreground permission | `app/App.tsx:61–75`: getter lúc khởi động và khi active, tránh duplicate active, reset readiness/generation; `:203–208`, `:299`, `:316–327`: handler + shutter guards, CameraView thật | Không thấy mất remediation; native chưa kiểm |
| Retake/current/history | `App.tsx:164–185`, `:198–201`, `:219–238`, `:290–297`, `:328–331`; `app/src/ui/screens.tsx:122–154`: ảnh lịch sử không có retake; `app/src/responses.ts:9–16`: current ID + revision cap | PASS logic/tests/HTTP; không overwrite signed originals |
| Consent mô hình | `App.tsx:247–255`, `:332–340`: confirm trước POST, chỉ current collecting, lý do model nguyên văn; `app/src/ui/copy.ts:4–8` giữ message cũ; `app/src/locale.ts:28–36`, `:89–97` | Không auto-send; configured không bị gọi thành provider healthy; advisory không chặn finalize |
| Finalization/report resume | `App.tsx:180–184`, `:240–245`, `:313–315`, `:328–329`, `:343–344`; `app/src/responses.ts:21–22`; `backend/app.py:370–407` | Guard collecting; report thật, không serialize session giả; backend rechecks current + archived evidence trong transaction |
| Pending + xóa có xác nhận | `App.tsx:99–103`, `:170–176`, `:211–220`, `:362–368`; `app/src/photoStorage.ts:10–25`, `:36–80`; `app/src/locale.ts:19`, `:80` | Giữ byte trước upload; metadata pending trước network; reconcile hash/slot/time; chỉ app-owned; confirm rõ xóa cả pending/phiên cũ, không xóa server |
| Verify current/history | `App.tsx:269–280`, `:345–351`; `screens.tsx:192–219` | ID đúng nguồn; đổi selection xóa kết quả cũ; picker/API thật; refresh và Settings còn |
| VI/EN/theme | `App.tsx:125–148`, `:284`, `:352–360`; `app/src/ui/copy.ts:4–8`; `app/test/ui-check.cjs:82–95`, `:187–212` | Key parity PASS; thông điệp consent/retention cũ thắng defaults; language/theme lưu SecureStore trước cập nhật UI |
| Connection/server label | `App.tsx:119–123`, `:155`, `:257–267`, `:313`; `app/src/core.ts:1–6`; `backend/app.py:220–223` | Health thật + request generation guard; label lấy URL normalized, từ chối username/password/query/fragment; không truyền bearer/seed cho UI |
| Không fake production UI | `app/src/ui/screens.tsx`, `theme.ts`, `copy.ts`; `App.tsx:187–196`, `:269–280`, `:343–344` | Không thấy random session/fake signature/simulated PASS/green badge cứng; fixtures `TEST_*` chỉ trong test; RAG unavailable |

## Phát hiện còn lại và sửa tối thiểu

### P3 — Structural fixture phụ thuộc vị trí hook, chưa có test shutter-not-ready độc lập

- Nguồn: `app/test/ui-check.cjs:150–157`, `:197`, `:213–217`; App guards tại `app/App.tsx:203–205`, `:318`.
- `fixtureApp` cấp state bằng mảng số thứ tự, `useState` tăng index. Snapshot đang đặt `ready=true`, `loaded=true`, `busy=false`; camera test chỉ kiểm preview/pictureSize và finalized state. Đổi thứ tự hoặc thêm hook có thể làm fixture mô phỏng sai trạng thái mà tên test không cho biết.
- Tái lập: đọc mảng `states` dòng 154 và các `useState` trong App; `ready` hiện index 20, giá trị `true`. Existing fixture không mô phỏng `ready=false`.
- Sửa tối thiểu: thêm override state fixture có tên hoặc ít nhất một tham số `ready`; assert `CameraScreen.canCapture === false` khi camera có quyền nhưng chưa ready, khi `busy=true`, và khi finalized. Không cần đổi production code hoặc thêm framework.
- Đây là khoảng trống test, **không phải bug camera đã xác nhận**. QA từng chạy thêm probe in-memory giả định sai fixture đang unready; assertion thất bại vì fixture thực sự `ready=true`. Loại kết quả đó khỏi regression verdict. Lần thử sửa probe bị runtime approval chặn trước thực thi; không coi là product failure.

### P3 — Badge connection mô tả lần health gần nhất, không tự cập nhật khi foreground/mất mạng

- Nguồn: `app/App.tsx:63–74`, `:119–123`, `:155`, `:257`, `:265`; label `app/src/ui/theme.ts:13`, `:36`.
- AppState active chỉ refresh camera permission; health chạy lúc startup, đổi URL hoặc nhấn refresh. Vì vậy badge có thể giữ trạng thái lần trước sau đổi mạng/trở lại app. VI/EN hiện dùng “Máy chủ phản hồi”/“Server responded”, không hứa kết nối liên tục: không phải blocker integrity.
- Tái lập cần phone/native: health thành công, đưa app background, ngắt mạng, trở lại Session; trước nhấn refresh kiểm tra badge còn trạng thái cũ. Chưa tái hiện trên điện thoại trong lần QA này.
- Sửa tối thiểu nếu muốn badge phản ánh foreground hiện tại: đặt connection `unknown` khi rời foreground, gọi `loadHealth` khi active với URL hiện hành; giữ request generation guard, không polling hoặc gọi provider. Hoặc ghi rõ “lần kiểm tra gần nhất”.

## Việc còn phải kiểm thử trên điện thoại

1. Camera grant/deny/deny-permanently; cấp lại trong Settings và trở về; background giữa discovery/remount/capture; quyền bị thu hồi; shutter chỉ bật khi ready.
2. Chụp đủ bốn mục; retake current; lịch sử nguyên vẹn; verify cả current/history; finalized khóa capture/retake/analyze/finalize.
3. Upload timeout/mất mạng: pending còn sau đóng/mở, share đúng original, refresh reconcile không nhân bản; xóa hủy/đồng ý và lỗi xóa một phần. Nút retry-upload pending vẫn chưa có, đúng giới hạn đã ghi trong audit remediation.
4. Khôi phục session/report sau kill/reopen; đổi API/new session cần confirm, storage failure không bỏ credentials cũ; health offline rồi retry.
5. VI/EN, dark/light còn sau reopen; font lớn/màn nhỏ, cuộn sáu tab, safe area, bàn phím URL, screen reader; Share/picker có giữ byte gốc.
6. Consent mỗi lần yêu cầu phân tích, cancel không gửi; không cần gọi provider thật để kiểm tra cancel path. Chỉ test transmission thật khi user cho phép riêng.

File duy nhất được tạo bởi QA: `docs/UI-INTEGRATION-QA.md`.
