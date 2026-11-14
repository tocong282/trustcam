# TRUSTCAM — D-5 → D-1 Prep Plan

**Goal:** ship end-to-end demo — photo → agent asks for missing evidence → signed capture → evidence report → verify PASS/FAIL — running on real device with backup video.

**Source:** `/home/rcong/Downloads/struct` (Excalidraw, 42 text / 15 rect elements).

**Status:** plan only. No code. Frontend *visual design* (Figma/deck) deferred — screens get default RN/Expo styling first.

---

## 1. What the struct actually says (extracted)

**North star:** Chụp ảnh → Agent yêu cầu bổ sung → Ký số → Evidence Report → Verify

| Bucket | P0 MUST | P1 NICE | P2 OUT |
|---|---|---|---|
| | camera capture, VLM analysis, agent next action, SHA-256 + signature, report, verification | GPS/timestamp, C2PA, loading/retry/polish | fake-image detector, multi-agent, blockchain, general-purpose workflows |

**P1.5 (not in excalidraw, added):** RAG over chế tài + quy trình xử lý documents — see §5.

**Owners / deliverables**

| Area | Stack in struct | Deliverable |
|---|---|---|
| Mobile / iOS | React Native, AVFoundation, CryptoKit | camera + signing prototype |
| AI / Agent | VLM, decision policy, test images | agent PoC + structured JSON |
| Backend | FastAPI, storage, verify API | API contract + verification |
| Design / Pitch | Figma, user journey, storytelling | prototype + demo script |

**Timeline:** D-5 MVP + product brief · D-4 feasibility spikes (camera/signing/VLM) · D-3 UX flow + API contract + agent workflow · D-2 dataset, test cases, env setup · D-1 review, task split, device check.

**Acceptance:** (1) agent picks next photo from existing evidence; (2) signed photo verifies PASS, edited photo verifies FAIL; (3) E2E on real device + backup demo video.

---

## 2. Assumptions (correct me now, cheap; later, expensive)

1. Domain = **damage/asset inspection claim** (generic enough for pitch, concrete enough to build a checklist). Evidence slots: `wide_context`, `damage_closeup`, `serial_or_plate`, `identifier_doc`.
2. Event day **D = Fri 2026-11-20** → D-5 Sun 11-15, D-4 Mon 11-16, D-3 Tue 11-17, D-2 Wed 11-18, D-1 Thu 11-19. If D = Sat 11-21, shift everything +1 day; task order unchanged.
3. Repo = `~/Project/trustcam` (created, git init, plan at `docs/plan.md`). NOT drl-cam-app — that project untouched/restored.
4. VLM = hosted vision API behind env var (`VLM_API_KEY`, `VLM_MODEL`), provider swappable. Demo path must not need live network — canned responses for the fallback run.
5. **Mobile = Expo React Native** (confirmed). SDK 58 pinned, Ed25519 in JS + `expo-secure-store` — zero custom native modules. See §10. Tradeoff: key not hardware-backed; Secure Enclave/CryptoKit is P1. Documented as such in the pitch, not hidden.

---

## 3. Architecture

```
 Expo RN app                    FastAPI                         VLM (vision API)
 ───────────                    ───────                         ───────────────
 expo-camera  ──POST /evidence──▶ hash(bytes) SHA-256
                                   store blob
                                   VLM analyze ────────────────▶ {labels, findings, quality}
                                 ◀──────────────────────────────
                                  policy: slots filled? 
                ◀──next_action──  {shoot: "damage_closeup", why: "no close-up yet"}
 sign(thumb+meta) ──POST /evidence/:id/sign──▶ verify sig, attach device pubkey
                ──POST /session/:id/finalize─▶ Evidence Report (JSON + PDF)
 verify screen  ──POST /verify {image, report}─▶ PASS | FAIL(reason)

 RAG (P1.5)  docs/legal/*.{pdf,docx,txt} → chunk → embed → chunks.json (numpy cosine, no vector DB)
             ├─ next_action.why cites clause: "cần ảnh cận cảnh (Quy trình A, Điều 4.2)"
             ├─ verify FAIL reason cites clause
             └─ POST /ask {session_id, q} → answer + citations[] (both parties)
```

**Canonical signed message** (must be byte-identical on both sides):
```python
# backend/canonical.py
import json, hashlib
def canonical_payload(sha256_hex, captured_at, device_id, gps=None, slot=None):
    return json.dumps({
        "sha256": sha256_hex, "captured_at": captured_at,
        "device_id": device_id, "gps": gps, "slot": slot,
    }, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()

def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()
```
Signature covers `digest(payload)`; image bytes are covered transitively via `sha256_hex`.

**Verify rules** (server, in this order):
1. recompute `sha256_hex` of received bytes ≠ report value → `FAIL image_modified`
2. `ed25519.verify(sig, digest(payload), report.pubkey)` false → `FAIL signature_invalid`
3. `device_id`/pubkey not registered to session → `FAIL unknown_device`
4. all pass → `PASS` + report id

**Agent decision policy** — deterministic function first, VLM only fills slots:
```python
REQUIRED = ["wide_context", "damage_closeup", "serial_or_plate", "identifier_doc"]
def next_action(filled: dict[str, float]) -> dict:
    missing = [s for s in REQUIRED if filled.get(s, 0) < 0.6]
    if not missing:
        return {"type": "finalize"}
    return {"type": "capture", "slot": missing[0],
            "why": f"no acceptable {missing[0]} yet (best confidence {filled.get(missing[0], 0):.2f})"}
```
VLM returns per-slot confidence; policy is pure → testable, demo-stable.

---

## 4. Build tasks (D-5 → D-1)

### D-5 Sun 11-15 — skeleton + contract freeze

**T1 repo + backend skeleton**
- Create `~/Project/trustcam/backend/{app.py,canonical.py,policy.py,store.py}` + `tests/`
- `pip install fastapi uvicorn pynacl pillow pytest httpx` (or `uv add`)
- Run: `pytest -q` → 0 collected, exit 5 (expected)
- Commit.

**T2 canonical payload + digest tests** (`tests/test_canonical.py`)
```python
def test_digest_is_stable_across_key_order():
    a = canonical_payload("ab", "2026-11-15T10:00:00Z", "dev1", None, "wide_context")
    b = canonical_payload("ab", "2026-11-15T10:00:00Z", "dev1", None, "wide_context")
    assert digest(a) == digest(b) and b"gps": not in a
```
Run `pytest tests/test_canonical.py -v` → PASS.

**T3 policy tests** — empty evidence → `capture wide_context`; 3/4 filled → last one; all ≥0.6 → `finalize`. `pytest -q` → 3 passed.

**T4 API contract frozen** → `docs/api.md`:

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/session` | `{device_id, pubkey_b64}` | `{session_id, next_action}` |
| POST | `/evidence` | multipart `image` + `{session_id, device_id, slot, captured_at, gps?}` | `{evidence_id, sha256, slot_confidence, next_action}` |
| POST | `/evidence/{id}/sign` | `{sig_b64, payload_fields}` | `{ok, verify}` |
| POST | `/session/{id}/finalize` | `{}` | `{report_id, report}` |
| POST | `/verify` | multipart `image` + `{report_id}` | `{result: PASS\|FAIL, reason?}` |
| GET | `/session/{id}` | — | `{filled, report?}` |

**T5 product brief** `docs/brief.md` — one page: problem, who pays, why signature+agent (not blockchain, see P2), demo narrative 90s.

### D-4 Mon 11-16 — feasibility spikes (kill risks early)
**T6 camera spike**: Expo app boots on real device, `expo-camera` capture → base64 → POST `/evidence` against local backend over LAN. Verify device can reach host (`http://<lan-ip>:8000`). Fail fast on: camera perms, dev-client build, http cleartext on Android.
**T7 signing spike**: `@noble/ed25519` generate key, store `expo-secure-store`, sign canonical payload, verify in Python (`pynacl`) → PASS; flip one byte of image → FAIL. **This is acceptance criterion #2; prove it on D-4, not D-1.**
**T8 VLM spike**: one test image → structured JSON `{slot: confidence, findings[]}`. Note latency + cost per image. Cache response to disk for offline demo.
**T9 storage**: SQLite (`sqlite3`, stdlib) `sessions, evidence, reports` tables — no Postgres, no ORM.

### D-3 Tue 11-17 — UX flow + API + agent wiring
**T10** wire `/evidence` end-to-end (real VLM if key ready, else cached fixture) + policy → `next_action` reaches app; app shows "chụp thêm: cận cảnh hư hỏng".
**T11** `/finalize` report builder: JSON `{report_id, session_id, created_at, device_id, images:[{slot, sha256, captured_at, gps, sig, pubkey, vlm}], verdict_summary}` + PDF via `reportlab` (single page is fine).
**T12** `/verify` implementing the 4 rules + `tests/test_verify.py`: PASS case, tampered-bytes case, wrong-pubkey case → 3 passed.
**T13** Figma + architecture diagram (draw.io/mermaid in `docs/arch.md`) — deferred-visual allowed here: Figma can be wireframe-only.

### D-2 Wed 11-18 — dataset, tests, env, demo assets
**T14** `data/test_images/` — 4 slots × (good, bad-quality, tampered) ≈ 12 files. Name `{slot}_{variant}.jpg`. Tampered = 1-pixel edit, saved re-encoded (proves hash catches it).
**T15** `tests/test_e2e.py` — httpx TestClient: full session → 4 evidences → finalize → verify PASS; then verify tampered → FAIL. `pytest -q` → all green. **This is the demo in code.**
**T16** env setup doc `docs/run.md`: backend (`uvicorn app:app --host 0.0.0.0 --port 8000`), app (`npx expo start --dev-client`), LAN IP step, offline fixtures flag `USE_CACHED_VLM=1`.
**T17** demo assets: EAS preview build (APK for Android; iOS needs device UDID in dev-client — verify D-2, not D-1), recorded backup video attempt #1.

### D-1 Thu 11-19 — freeze, split, device check
**T18** full dress rehearsal on real device, 3 runs; log failures.
**T19** backup video, final, stored on 2 devices + cloud.
**T20** task split sheet + demo script (`docs/script.md`, 90s, Vietnamese, who clicks what).
**T21** device check: charge, storage, dev-client installed, hotspot fallback, screenshots of PASS and FAIL for slides.

---

## 5. RAG module — chế tài + quy trình xử lý (P1.5, added)

**Purpose:** both sides (bên yêu cầu/bên cung cấp, or claimant/inspector) get cited answers during capture and after verify: "thiếu ảnh này thì theo quy trình nào", "vi phạm điều nào", "chế tài ra sao". Every answer carries citations — no citation, no answer.

**Lazy stack (no vector DB):**
- Ingest: `pypdf` + `docx2txt` → text; chunk 800 chars / 100 overlap, keep `{doc_id, doc_title, clause_id, page, text}`.
- Embed: same provider as VLM embeddings endpoint (`EMBED_MODEL`); fallback TF-IDF (`sklearn` not needed — `collections.Counter` cosine is enough at ~300 chunks). Store `data/index/chunks.json` + `vectors.npy`.
- Retrieval: numpy cosine top-k=4, dedupe by `doc_id`, require score ≥ threshold else answer `không tìm thấy căn cứ`.
- Generation: VLM/LLM with strict template — must quote `clause_id` verbatim from retrieved chunk; validator rejects answer with an unretrieved clause id.

**Wiring (3 touch points, all optional at runtime — flag `RAG_ENABLED=1`):**
1. `policy.next_action()` → append `why_citation` from `retrieval.top("evidence requirement for <slot>")`.
2. `verify()` FAIL path → append applicable clause: `reason_citation`.
3. `POST /ask` → `{answer, citations:[{doc_title, clause_id, page, snippet}]}`; same endpoint serves both parties (no auth divergence for demo; note as caveat).

**Files:** `backend/rag/{ingest.py,index.py,retrieve.py,answer.py}`, `data/legal/`, `data/index/`, `tests/test_rag.py`.

**Tasks (do D-3/D-2 only if P0 green; otherwise slide-only)**
- **R1** drop 3–5 real docs into `data/legal/` (nghị định/quy trình nội bộ + 1 doc chế tài). Legal text must be real — never invent clause numbers, they get quoted on stage.
- **R2** `ingest.py` + `tests`: 10 chunks from fixture doc, each has `doc_id/clause_id/page`, no empty text. Run `pytest tests/test_rag.py -v` → PASS.
- **R3** `retrieve.py` + `tests`: query "ảnh cận cảnh hư hỏng" returns the expected `clause_id` in top-3; junk query ("asdkjh") → below threshold → `[]`.
- **R4** `answer.py` + citation validator: unretrieved `clause_id` in output → raise → test asserts rejection.
- **R5** wire touch points 1–2 (cheap, high demo value: agent's "why" becomes legal-grounded) + cached answers for offline demo.
- **R6** (only if time) `POST /ask` + one app screen. Frontend visual design still deferred — plain chat list.

**Cut rule:** R6 → R5 → R4 (keep ingest+retrieve, mention on slide). Never cut: real doc corpus (fake citations = instant credibility loss with judges).

## 6. Cut list (if behind schedule — cut in this order)
1. PDF report → JSON on screen
2. GPS/timestamp → timestamp only
3. Loading/retry polish
4. 4th evidence slot → 3
5. Multi-image report → single verified image + report JSON

**Never cut:** signature verify PASS/FAIL, agent next_action, E2E on device, backup video.

## 7. Risks
| Risk | Trigger | Mitigation |
|---|---|---|
| No native module for signing | CryptoKit needs iOS bridge | Ed25519 JS lib (T7) — zero native |
| VLM latency/network in demo | venue wifi | cached fixtures `USE_CACHED_VLM=1` (T8, T16) |
| iOS provisioning on D-1 | UDID not registered | test dev-client D-2 (T17); Android APK primary |
| Android cleartext HTTP blocked | LAN backend | `usesCleartextTraffic` in app config or reverse-proxy via tunnel |
| Scope creep into P2 | "add blockchain" | struct says OUT; pitch slide states why (hash+signature is the trust primitive) |
| RAG hallucinated clause | LLM paraphrases điều number | citation validator (R4) rejects unretrieved ids; answers omit citations rather than guess |
| Vietnamese legal PDF = scan, no text layer | pypdf yields empty | check on R1; if scan → OCR one doc only (`pytesseract` vietnamese lang) or pick text-native docs |
| RAG eats P0 time | wiring before demo works | R-tasks gated on P0 green; cut order R6→R5→R4 |

## 8. Open questions
1. Event date exact (assumed D = Fri 2026-11-20)?
2. VLM provider/key available? (Gemini/OpenAI/Claude vision) — same provider should have embeddings, else TF-IDF fallback.
3. Real team members per area, or solo build for all 4?
4. Domain confirm = damage inspection claim?
5. RAG corpus: which documents (nghị định/thông tư cụ thể, quy trình nội bộ của đơn vị nào)? Có sẵn file chưa, hay cần tìm?
6. RAG ai dùng: cả hai bên chung một endpoint (demo) — có cần phân quyền/tách view không?

---

## 9. B2B + B2C plan

**One engine, two packages.** Core (capture → signed evidence → report → verify API) is identical. B2B adds console + private RAG corpus + API/audit; B2C ships app only.

### 9.1 Segment table

| | **B2C — cá nhân** | **B2B — tổ chức** |
|---|---|---|
| Who pays | người bán/thuê/người mua đồ cũ, freelancer sửa chữa, người khiếu nại bảo hiểm | insurer (xe/nhà), giám định viên, ngân hàng thẩm định, cho thuê xe/fleet, logistics, BĐS bàn giao, nhà thầu |
| Pain | "sự cố xảy ra rồi mới đi tìm bằng chứng" — ảnh không chứng minh được thời điểm/toàn vẹn | điều tra viên chụp ảnh thiếu/không nhất quán, hồ sơ bị sửa, tranh chấp với khách, thời gian xử lý claim cao |
| Job to be done | chứng minh tình trạng tài sản tại thời điểm T, một lần, rẻ | chuẩn hoá bằng chứng theo quy trình nội bộ + chế tài, nhiều lần, có audit |
| Product surface | Expo app, report link verify công khai | app + web console (session list, report export) + REST API + corpus RAG riêng |
| Pricing | free 3 report/tháng → credit $2–4/report hoặc $6/tháng | $12–20/seat/tháng + $0.50–2/report qua API; on-prem/gói riêng cho enterprise |
| GTM | store listing + group Facebook/Chợ Tốt + SEO "biên bản bàn giao nhà/xe", referral khi report được share | pilot 1 đơn vị (1 phòng giám định, 5–10 điều tra viên), tích hợp qua verify API, bán bằng case study giảm thời gian xử lý |
| Value metric | % tranh chấp có report được đối phương chấp nhận | giây/claim giảm, % hồ sơ phải chụp lại giảm, % claim gian lận bị chặn |
| Revenue thật | nhỏ — $1–3k MRR ở 1k user trả tiền; chủ yếu là kênh phân phối + dữ liệu niềm tin | $10–20k MRR với 5 khách × 100 seat; đây là doanh thu chính |
| Moat | network: report verify được → bên nhận tin tưởng | corpus chế tài/quy trình riêng của khách (khoá switching cost) + audit trail + tích hợp |

**Chiến lược pitch:** B2C = phễu (tạo chuẩn "report có chữ ký" phổ cập) → B2B = doanh thu. RAG là đòn bán B2B: B2C dùng corpus công khai, B2B nạp corpus nội bộ (chế tài, SLA, quy trình) — không có corpus thì RAG vô nghĩa với họ.

### 9.2 Build delta (không phá P0)

| Item | B2C | B2B | Khi nào |
|---|---|---|---|
| Session/report core | ✅ P0 | ✅ P0 | D-5→D-3 (giống nhau) |
| Verify API công khai | link verify | API key + rate limit | D-2 nếu dư thời gian |
| Console web | ❌ (làm sau) | 1 trang list session + export JSON | **cắt trước** — slide-only |
| RAG corpus | docs công khai | corpus khách + tag `tenant` | chỉ thêm cột `tenant_id` vào chunk (rẻ, làm luôn ở R2) |
| Audit trail | log cơ bản | log bất biến (append-only file/SQLite) | D-2, 20 dòng |
| Auth | device key | org account + device key | **cắt** — demo 1 org |

**Quy tắc:** chỉ thêm `tenant_id` + append-only log vào P0 (rẻ, mở đường B2B). Không build console, không build billing.

### 9.3 Demo: 1 luồng, 2 cách kể

- **B2C track (40s):** "Tôi trả nhà, chủ nhà nói tôi làm hỏng." → chụp 4 ảnh, agent đòi ảnh cận cảnh ổ khoá → report ký số → gửi link, bên kia bấm verify PASS. Ảnh bị sửa → FAIL.
- **B2B track (60s):** "Điều tra viên của công ty X, quy trình nội bộ yêu cầu 4 loại ảnh theo Điều Y." → agent đòi đúng slot + trích dẫn quy trình (RAG) → hồ sơ đủ, report + audit → trưởng phòng verify. Slide số: thời gian xử lý hồ sơ, % chụp lại.
- Cùng app, khác narration + khác corpus. Đừng build 2 app.

### 9.4 Slide deck (7 slide, tiếng Việt)
1. Vấn đề: ảnh không phải bằng chứng (sửa được, không rõ thời điểm)
2. Insight: tin cậy = toàn vẹn + quy trình, không phải blockchain
3. Sản phẩm: 1 vòng lặp, 1 ảnh chụp màn hình luồng agent đòi ảnh
4. Công nghệ: SHA-256 + Ed25519 + VLM + RAG (1 sơ đồ, không chữ)
5. Demo: PASS / FAIL cạnh nhau
6. Thị trường: B2B doanh thu, B2C phễu + pricing table
7. Hỏi & đáp trước: "khác gì C2PA?" (C2PA = provenance của thiết bị/phần mềm; ta = quy trình + chế tài + verify độc lập), "khác gì blockchain?" (struct P2 out; chữ ký đủ, không cần consensus)

### 9.5 Rủi ro pháp lý — phải kiểm tra trước khi lên sân khấu
- Giá trị pháp lý của chữ ký điện tử: tham chiếu Luật Giao dịch điện tử 2023 (20/2023/QH15) — **đọc lại điều khoản, không trích số điều nếu chưa mở văn bản**.
- Dữ liệu cá nhân (ảnh, GPS): Nghị định 13/2023/NĐ-CP — kiểm tra xem đã có văn bản thay thế chưa tại thời điểm thi.
- Không hứa "có giá trị pháp lý tuyệt đối" trên slide. Nói: "bằng chứng kỹ thuật có thể kiểm chứng độc lập" — đúng và không bị hỏi khó.

### 9.6 Open questions (business)
7. Ban tổ chức chấm theo track nào (B2B hay B2C)? Ảnh hưởng thứ tự slide + demo nào quay video.
8. Khách B2B để nêu tên trong pitch: có đầu mối thật (công ty bảo hiểm/ngân hàng/cho thuê xe) không? Có thì xin 1 câu quote.
9. Pricing có ai phản biện chưa — cần 1 người ngoài ngành đọc thử slide 6 trước D-1.

---

## 10. Mobile — Expo React Native (confirmed stack)

**SDK pin: 58 (58.0.25, RN 0.88.1, react 19.3.0).** Greenfield → no migration cost, latest stable, node 26.13.1 inside `engines` (`^22.13 || ^24.3 || ^26`). Do not bump mid-event; the SDK is frozen at D-5.

**Init (D-5, T0 before backend tasks):**
```bash
cd ~/Project/trustcam && npx create-expo-app@latest app --template blank-typescript
cd app && npx expo install expo-camera expo-crypto expo-file-system expo-image-manipulator expo-secure-store expo-dev-client
npm i @noble/ed25519@3 @noble/hashes@2
npx expo run:android        # dev-client build once, proves native pipeline D-5 not D-1
```

| Need | Package (SDK 58 pin) | Why this one |
|---|---|---|
| camera | `expo-camera ~58.0.14` | works in Expo Go for UI; dev-client for build |
| bytes + base64 | `expo-file-system ~58.0.13` (`new File(uri).bytes()`) | one API gives `Uint8Array` for hashing and base64 for upload — no extra base64 lib |
| hash | `expo-crypto ~58.0.8` (`digest(SHA256, Uint8Array)`) | hashes the real bytes; `digestStringAsync` would hash base64 text — wrong |
| compress | `expo-image-manipulator ~58.0.16` | resize max 1600px / JPEG 0.8 before upload (upload time is the demo risk) |
| key storage | `expo-secure-store ~58.0.3` | seed as base64, generated once on first launch |
| sign | `@noble/ed25519 3.2.0` + `@noble/hashes 2.4.0` | pure JS, zero native module, backend verifies with `pynacl` |
| nav | **none** — `useState` screen switch | 4 screens (Capture / Session / Report / Verify). Add `expo-router ~58.0.31` only past ~6 screens |

**Signing wiring (the one place that must be exact):**
```ts
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import * as Crypto from 'expo-crypto';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const bytes  = new File(uri).bytes();                       // exact bytes uploaded
const hex    = [...await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)]
                 .map(b => b.toString(16).padStart(2, '0')).join('');
const seed   = await SecureStore.getItemAsync('device_seed');   // or generate + save once
const priv   = ed.utils.randomPrivateKey();                    // first run only
const pub    = ed.getPublicKey(priv);
const payload = canonicalJson({ sha256: hex, captured_at, device_id, gps, slot }); // sort_keys, no spaces
const sig    = await ed.signAsync(await Crypto.digest(SHA256, new TextEncoder().encode(payload)), priv);
```
Canonical JSON on device must match backend `json.dumps(sort_keys=True, separators=(",",":"))` — no Vietnamese-safe escaping differences (`ensure_ascii=False` both sides, UTF-8).

**Screen scope (default Expo styling, no design work — visual pass after demo):**
1. `Capture` — camera preview, slot label, shutter, upload state
2. `Session` — list of captured slots + `next_action` banner ("chụp thêm: cận cảnh hư hỏng — Quy trình A, Điều 4.2")
3. `Report` — hashes, timestamps, verdict, share/verify button (JSON list, not PDF on device — PDF server-side)
4. `Verify` — pick image from library → PASS/FAIL + reason

**Mobile tasks**
- **M1** init + dev-client build on real device, screen 1 renders camera preview. Verify: `npx expo run:android` installs, shutter triggers console log.
- **M2** capture → `File.bytes()` → SHA-256 hex printed on screen; same file hashed by backend → identical hex. Verify: two hex strings equal, proven on device.
- **M3** key generate+store, sign, backend verify PASS; flip one byte → FAIL. **Acceptance criterion #2 satisfied here (D-4, not D-1).**
- **M4** POST `/evidence` per slot + render `next_action`; loop until `finalize`.
- **M5** Report + Verify screens against live backend over LAN.

**Mobile risks specific to Expo**
- LAN HTTP: dev-client debug builds allow cleartext; if not, tunnel (`npx expo start --tunnel`) — test M4 on D-4, never D-1.
- `expo-camera` in Expo Go ≠ dev-client behavior for permissions — always test in dev-client.
- Node 26 + Metro: if a plugin chokes, fall back to Node 24 via `nvm` for the `app/` dir only; do not "fix" it by bumping packages.
- Do **not** hand-bump `react-native`/`react`; `npx expo install --fix` owns that mapping.

**Frontend design (deferred, per request):** no Figma-driven implementation before E2E passes. D-3 wireframe only; real visual pass = post-demo / D-1 fill if spare time. Priority stays: verify PASS/FAIL > agent loop > aesthetics.
