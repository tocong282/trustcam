# TRUSTCAM backend

## Milestone 2 API contract (optional VLM)

Collection stays `analysis_mode:"checklist"`; no automatic analysis on upload.
Optional `POST /evidence/{id}/analyze` uses session bearer and **only stored signed
image bytes**, never client image, prompt, URL, model or provider overrides. Response:

```json
{"evidence_id":"uuid","analysis":{"mode":"vlm","status":"accepted","slot":"wide_context","reason":"Chi tiết nhìn rõ.","model":"configured-model","language":"vi","reasons":{"vi":"Chi tiết nhìn rõ.","en":"Detail is visible."}},"next_action":{"type":"capture","slot":"damage_closeup"}}
```

`status` is `accepted`, `retake` or `uncertain`; `slot` must match signed slot.
Accepted advances advisory action to first missing checklist slot, then
`{type:"finalize"}`. Retake/uncertain advises capture of same current slot; intentional
replacement uses `replaces_evidence_id` below. Unmarked duplicate-slot uploads still fail. Model judgment never
changes signed bytes, checklist completeness, verification or finalization rules.
Accepted means visual advice only, not authenticity, identity, legal acceptance,
fraud detection or sanctions. Failed analysis never erases stored valid analysis.
Successful analysis is cached, including retake/uncertain; no automatic retries or
reassessment endpoint. Finalized sessions reject analysis with 409
`session_finalized`, including finalization during a provider request; no late
result commits. Existing report snapshots stay immutable. Archived IDs reject analysis with 409
`evidence_superseded` before provider access. Replacement during provider access
also rejects late analysis; archived analysis remains exactly as committed before replacement.

`GET /session/{id}` adds `status:"collecting"|"finalized"`, `report_id:null|"uuid"`;
evidence records optionally include `analysis` with shape above. Authenticated
`GET /session/{id}/report` returns existing `{report_id,report}` or 404
`report_not_found` before finalization. All prior fields and errors remain.

Analysis errors: 503 `vlm_not_configured`; 502 `vlm_unavailable` (network, timeout,
provider HTTP failure); 502 `invalid_analysis` (invalid/bounded output). Authentication
precedes evidence lookup and provider access. Provider error bodies and credentials
are never returned or logged. Raw upload works when VLM is unavailable.
Analyze accepts no body or `{}` (default `vi`), or exactly `{"language":"vi"}` /
`{"language":"en"}`, with no query parameters. Invalid language/type, extra fields,
duplicate keys, malformed JSON or other bodies return 400 `invalid_analysis_request`.
Authentication precedes request-language validation. One inference generates both
`reasons.vi` (Vietnamese) and `reasons.en` (English) for the same assessment. New
analysis stores both plus `language`; primary `reason` equals `reasons[language]`.
Changing request language on a cached result returns that original analysis unchanged,
including original primary reason/language, without another photo transfer or inference.
Clients select `reasons[appLanguage]` for presentation; never change status or assessment.
Legacy single-language cache stays unchanged: no invented translation/language tag,
re-inference, migration or report rewrite. Clients should label it as original-language
text when no matching reason exists. Reasons/language are server metadata in existing
analysis JSON, not signed manifest fields.
Stored signature/bindings and image hash are rechecked
before provider access; corruption returns existing 400 `signature_invalid` or
`image_hash_mismatch`.

### Explicit provider setup

Set server environment before startup (no mobile key, no credential discovery):

```sh
export VLM_BASE_URL=https://api.openai.com/v1
export VLM_MODEL=gpt-4o-mini
export VLM_API_KEY='<provider key>'
```

Model is an example, not an endorsed or tested deployment. Base URL must be an
absolute HTTP(S) API root without credentials, query or fragment; server appends
`/chat/completions`. HTTP intended only for trusted local tests; use HTTPS for real
photos/secrets. Config captured at app startup. Missing/invalid settings disable
analysis without blocking server or collection. Health reports configuration only,
never provider reachability: `vlm_configured` and `vlm_status:"not_configured"|"not_checked"`.
No startup/provider request, key, URL or error details in health.

Provider must support OpenAI-compatible vision chat completions with JSON-object
response format. Request contains original JPEG/PNG as data URL, fixed safety
instructions and signed slot; no tools. Output JSON must contain **exactly**
`status`, `slot`, `reason`, `confidence`, `reasons`: finite numeric confidence in [0,1],
known machine status and matching signed slot. `reasons` must be an object with exactly
`vi` and `en`; both reasons must be 1–500 characters, nonblank, without controls or
surrogates. Primary `reason` must equal the requested language's entry. Missing
bilingual output fails closed for every new provider response, even though legacy
stored analyses remain readable. Requested language comes from the server allowlist
in trusted system instructions, not caller-supplied prompt text. Protocol validation
does not establish linguistic accuracy or semantic equivalence.
Confidence validates protocol only; it is not calibrated and is not exposed as a
score. Unknown keys, duplicate JSON keys, truncated/tool outputs and malformed
responses fail closed. Images, visible text and model output are untrusted data;
no instructions/tools/code from these data execute.

Bounds: 20-second overall deadline, 5-second connect and 15-second read/write
limits, no redirects/retries/environment proxies, uncompressed responses only
(`Accept-Encoding: identity`, compressed replies rejected before decoding), 32 KiB provider response,
24 KiB content, 2048 output tokens (room for two reasons plus primary copy). Provider network happens outside SQLite write
transactions; valid analysis commits atomically. Local HTTP stub tests verify
protocol, **not real model semantics**. Real provider/key and privacy/retention
approval required before external-image tests. No RAG without approved corpus.

From `/home/rcong/Project/trustcam` (Python 3.12+):

```sh
uv venv .venv
uv pip install --python .venv/bin/python -r backend/requirements.txt
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python tests/live_smoke.py
.venv/bin/python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

`TRUSTCAM_DATA_DIR` selects private SQLite storage; default `backend/data/`.
Image bytes live in SQLite BLOBs under server UUIDs, so evidence and bytes commit
atomically without orphan files. Ignore `.venv/`, `backend/data/`,
`.test-data-*/`, and `__pycache__/`. Tests create temporary directories in repo,
never `/tmp`. All runtime dependencies and test dependency `httpx` pinned in
`backend/requirements.txt`; Starlette 0.52.1 retains httpx TestClient support.

## Actual API (overrides unsafe snippets in docs/plan.md)

- `GET /health`: `{status:"ok",analysis_mode:"checklist",vlm_configured:boolean,vlm_status}`;
  configuration only, never a claim of provider connectivity.
- `POST /session`, JSON `{public_key}`: `{session_id,token,device_id,next_action}`.
  Public key = 64 lowercase Ed25519 hex characters; device ID = public key.
- `POST /evidence`, multipart `session_id`, `manifest`, `signature`, `image`, optional
  `replaces_evidence_id` (canonical UUID):
  `{evidence_id,sha256,slot,next_action,analysis_mode:"checklist",replaces_evidence_id?}`.
  Replacement response includes exact replaced ID; normal upload omits it.
- `GET /session/{id}`: `{session_id,evidence:[record],evidence_history:[record],next_action,analysis_mode,status,report_id}`.
  `evidence` contains current records only. `evidence_history` contains archived
  records oldest archive first; empty array for sessions without revisions.
- `POST /evidence/{id}/analyze`: optional advisory; contract above.
- `GET /session/{id}/report`: persisted finalized report or 404 `report_not_found`.
- `POST /session/{id}/finalize`: `{report_id,report}`; 409 until four slots
  collected; before creating report, revalidates every included current/history
  manifest, signature, session/device/slot/hash/timestamp binding and stored image
  SHA-256 within same SQLite write transaction. Failure returns 400
  `signature_invalid` or `image_hash_mismatch`; no partial report. Repeated calls
  return same persisted report unchanged, including legacy report snapshots.
  Finalized sessions immutable.
- `GET /report/{id}`: same `{report_id,report}` envelope.
- `POST /verify`, multipart `session_id`, `evidence_id`, `image`:
  `{result:"PASS"|"FAIL",reason:"integrity_verified"|"image_modified"|"signature_invalid"}`.
  Uses stored manifest/key/signature, never client-supplied verification metadata.

All session, evidence, finalize, report, verify requests require
`Authorization: Bearer <session token>`. Only token SHA-256 stored. Missing or
invalid credentials: 401; another session's credentials: 403; unknown authorized
records: 404. Session creation and health public. This is session isolation,
not user/organization authentication or multitenancy. Use HTTPS beyond local LAN;
keep token private. Public session creation has no rate limiting; do not expose
prototype directly to public internet.

Record shape: `{evidence_id,slot,sha256,captured_at,manifest,signature,public_key,analysis?,replaces_evidence_id}`;
`replaces_evidence_id` is null on initial evidence, predecessor UUID on revisions;
`manifest` is JSON object in responses, canonical JSON string in upload.
Report: `{version:"1",session_id,device_id,evidence:[record],evidence_history:[record],analysis_mode:"checklist",integrity_notice}`.
Report is server snapshot, **not signed as a whole**. Only six-field v1 manifests
are device-signed; revision IDs/links, history ordering, analysis, and report metadata
are not cryptographically attested by device. Do not treat revision links as signed chain.

## Signing and limits

Manifest has **exactly six string fields**:
`version:"1"`, `session_id`, `device_id`, `captured_at`, `slot`, `sha256`.
Canonical UTF-8 JSON uses sorted keys, compact separators, `ensure_ascii=False`.
Ed25519 signs **raw canonical bytes**, not their digest. SHA-256 covers original
uploaded photo bytes. Signature = 128 lowercase hex; hash = 64 lowercase hex.
No post-sign resize/re-encode. Timestamp accepts RFC3339 UTC `Z` or `+00:00`,
optional 1–9 fractional digits; calendar dates validated, not trusted clock time.

Slots in checklist order: `wide_context`, `damage_closeup`, `serial_or_plate`,
`identifier_doc`. Signed slots can arrive out of order; next action asks first
missing slot, then `{type:"finalize"}`. One **current** photo per slot (four current maximum).
Unmarked duplicate: 409 `slot_already_collected`. Manual retake allowed for any current
slot while collecting, without VLM prerequisite. Send new image, newly signed same
six-field manifest, and exact current `replaces_evidence_id` as separate multipart
metadata. Server creates new immutable evidence ID, archives old record/image/analysis
without rewriting signed bytes, then inserts replacement atomically. Old ID remains
verifiable with same session bearer, before/after restart and finalization.

Malformed/empty/noncanonical UUID, unknown ID, another session's ID, or wrong slot:
400 `invalid_replacement`. Previously current ID from same session/slot:
409 `stale_evidence`; refetch session before retrying, never silently replace newer evidence.
Maximum **five revisions per slot including initial** (four retakes):
409 `revision_limit_reached`. Failed replacement leaves current and history unchanged.
Finalized upload/retake/analyze: 409 `session_finalized`.
Upload and session `next_action` remain collection-only; mobile may use analysis
retake/uncertain to offer same-slot recapture. Advisory acceptance never gates finalize.

Startup migration adds nullable predecessor column and separate archive table inside
single transaction; no old image, manifest, signature, token, or report rewrite.
Keep database backup before deployment; migration failure rolls back schema changes.

JPEG/PNG actual content checked with Pillow verify + decode, max 20,000,000 pixels.
Image file streamed in 64 KiB reads and capped at 10 MiB. Whole wire request
bounded before multipart parsing at 10 MiB + 64 KiB; other request bodies 16 KiB.
Prototype buffers bounded request in memory; add streaming ASGI storage when load
requires it. Upload handles close on failure/cancellation; no permanent image data
written until signature/hash/image validation succeeds. SQLite write transactions
serialize slot insertion, intentional replacement, revision limits, and finalization.
Provider calls remain outside write transactions; late results cannot alter archived evidence.

Errors use `{detail:"machine_code"}`: `auth_required`, `invalid_token`,
`session_forbidden`, `session_not_found`, `report_not_found`, `evidence_not_found`,
`invalid_manifest`, `invalid_signature`, `signature_invalid`, `session_mismatch`,
`device_mismatch`, `image_hash_mismatch`, `invalid_image`, `image_too_large`,
`request_too_large`, `invalid_multipart_fields`, `invalid_multipart`,
`slot_already_collected`, `checklist_incomplete`, `session_finalized`,
`invalid_replacement` (400), `stale_evidence`, `revision_limit_reached`,
`evidence_superseded` (409).
Missing/type/length schema validation may return standard FastAPI 422 detail list.
A valid edited JPEG/PNG returns 200 FAIL `image_modified`; corrupt/non-image
uploads return 400 `invalid_image` instead.

## Trust boundary

Collection/finalization stays checklist mode; optional explicitly requested VLM
advisory is separate. No canned visual judgments, RAG, legal citations, PDF,
org auth, public share links, or automated sanctions. PASS establishes byte
integrity and registered key signature only—not scene truth, actual capture time,
identity, hardware-backed provenance, or legal validity. Cryptographic FAIL does
not establish fraud. Reports repeat this notice.
