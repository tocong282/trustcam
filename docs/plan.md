# TRUSTCAM — implementation plan

## Confirmed requirements

- Independent project: `/home/rcong/Project/trustcam`. Do not modify drl-cam-app.
- Mobile: Expo + React Native + TypeScript. Vietnamese default, English switch; persist preference. All interface labels, permission/error states and integrity notices must support both languages.
- Frontend visual design deferred. Build accessible functional screens first.
- Source: `/home/rcong/Downloads/struct` (Excalidraw).
- Target workflow: capture, agent requests additional evidence, sign, generate report, verify.
- Shared core for B2B/B2C; later RAG for procedure and sanctions documents supporting both parties.

## Milestone 1 — functional integrity prototype (code + local integration verified)

Verified: backend 19 tests, mobile typecheck/self-check/config-check, Expo doctor 20/20, Android/iOS Hermes export; real HTTP TypeScript signing/Python verification with four-image report, original PASS and edited FAIL. Expo Go Metro and local API started for phone testing. Physical-device validation remains pending.

1. Initialize Expo mobile app; install SDK-compatible camera, file, crypto and secure-storage packages. Use published registry versions; do not copy unverified versions or obsolete crypto snippets from previous drafts.
2. Implement VI/EN dictionary with identical keys, language toggle and saved preference. Machine identifiers remain language-independent. Missing strings cannot silently expose internal errors.
3. Device generates Ed25519 seed with secure random source, stores seed in SecureStore. Device ID is public key hex. No custom native CryptoKit bridge yet.
4. Capture original image bytes. SHA-256 those exact bytes; sign canonical manifest with Ed25519. No transformation after signing.
5. FastAPI backend: validate image, signature, manifest, ownership and bounded upload; persist sessions/evidence/reports with SQLite. Session bearer tokens hashed at rest. Protect evidence/report/verify endpoints; no public photo links.
6. Advance explicit checklist of `wide_context`, `damage_closeup`, `serial_or_plate`, `identifier_doc`. This checks collection only; it is not VLM quality assessment. Label `analysis_mode=checklist` until actual VLM integration exists.
7. Finalize only complete signed evidence; return JSON report. Verify original image PASS and valid altered image FAIL. Handle unknown records, invalid input and network failures without leaking sensitive content.
8. Test pure logic first, then real Ed25519/backend integration, full-session persistence and auth isolation. Typecheck and export Expo bundle. Test real device only when device/toolchain exists.

### Signing contract

Manifest has exactly these string fields:

- `version`: `1`
- `session_id`: server-issued ID
- `device_id`: device public key, lowercase 64-character hex
- `captured_at`: RFC3339 UTC timestamp, client-supplied (not trusted time)
- `slot`: one required checklist slot
- `sha256`: original uploaded file SHA-256, lowercase hex

Canonical form: UTF-8 JSON, keys sorted, compact separators, no ASCII escaping. Ed25519 signs these raw canonical bytes, not an extra digest or hex string. Signature uses lowercase hex. Validate round-trip between TypeScript and Python with shared test vector.

PASS establishes byte integrity relative to registered key and signed manifest only. It does not prove scene authenticity, trustworthy capture time, identity of person holding device, absence of pre-capture editing, or legal admissibility. Self-registered software keys are not certified identities or hardware attestation.

### Validation gates

- Backend tests: signed capture, changed image, wrong key/signature, session isolation, input limits, incomplete finalize, persistence across restart.
- Mobile: key/manifest/locale assert checks, TypeScript, Expo doctor, Android export.
- Cross-language: TypeScript signs manifest; Python verifies signature and canonical bytes.
- Live local HTTP smoke, separate from test client.
- Physical-device camera/permissions/SecureStore/network remain explicitly unverified until run on hardware.

## Milestone 2 — optional VLM advisory + functional mobile completion (code and real provider smoke verified)

Integration gate: backend 35 tests PASS, cross-language live HTTP smoke PASS, mobile typecheck/self-check/config-check PASS, Expo doctor 20/20, Android/iOS 1.8 MB exports. Mobile empty JSON analysis request matched with backend acceptance regression test. Session/report resume, finalized guards and bilingual confirmation/analysis consent implemented. API restarted with new endpoints. Provider configured through private server environment, model `analysis`; endpoint omitted from public documentation. Real synthetic-image call succeeded in 4.66 seconds; live authenticated signed upload/analyze/persist also passed and returned retake advice for a blank graphic. This proves provider wiring, not general model accuracy. Physical-phone UI remains unverified.

Current tasks:

- Backend: additive session `status` / `report_id`, authenticated existing-report retrieval; optional OpenAI-compatible VLM adapter with strict response validation, safe failures and persisted advisory analysis. Never send photo during ordinary upload automatically.
- Mobile: resume saved session/report, finalized state, confirmation before replacing local session reference or API endpoint; VI/EN optional model-analysis action and disclosure before external photo transfer.
- Model analysis is advisory, separate from byte integrity and checklist collection. Initial adapter does not enable replacement of already signed slots; full retake evidence history remains a later task.
- Provider configured and synthetic-image live smoke passed. Broader visual-accuracy/latency evaluation and device testing remain pending.

- Choose provider and obtain key server-side only; no provider secret inside Expo bundle.
- Validate structured model output; enforce bounded confidence and known slot identifiers. Image text/model output are untrusted data.
- Ask for additional captures using observations, not user-selected slot alone. Record model/version and reasons.
- Missing key/provider outage returns explicit unavailable state; no fabricated observations.
- Recorded fixtures, if used, must be labelled replay/demo, never presented as live analysis.

## Functional audit remediation — code verified, native-device checks pending

Implemented and rerun by parent: 46 backend tests PASS, live HTTP retake/history/stale rejection plus original PASS/modified FAIL, mobile typecheck/self-check/config-check PASS and Expo doctor 20/20. Production API restarted after private SQLite backup; native device behavior not yet personally verified. Pending originals retained/shareable/reconciled; retry-upload button still not implemented. User-supplied design is being prepared in isolated `ui-ready/`, not yet connected to app.

Authorized after `docs/FUNCTIONAL-AUDIT.md` review:

- Refresh camera permission on foreground; normalize Expo native network errors; bound camera resolution before hashing/signing.
- Before finalization, validate stored canonical manifests, ownership bindings, signatures and original-image hashes for every record included in report. Reject corruption atomically; existing reports remain unchanged.
- Versioned retake: `/evidence` accepts optional `replaces_evidence_id` targeting current same-session/same-slot record. Preserve immutable old evidence and original bytes as history; default duplicate upload still conflicts. Limit revisions and reject stale replacement. Verify historical evidence by original ID. Retake/advisory does not imply fraud or legal conclusion.
- Mobile shows current/history, allows intentional retake while collecting, and preserves original signed bytes. Finalized sessions remain immutable. Replacement relation is server metadata, not part of v1 device signature; do not claim independently attested revision chain.
- Persist local-photo references across restart; retain pending originals on upload failure/timeout. Add explicit confirmed deletion of app-owned local copies only, server unaffected. No silent retention cleanup or arbitrary path deletion.
- Gate completion on regression tests, cross-language HTTP retake/history/verify flow, Expo checks and real provider smoke when needed. Native-device behavior remains unverified until exercised on phone.

## Milestone 3 — RAG support for both parties

Use cases: explain evidence requirements, processing steps, dispute/escalation procedure and potentially applicable sanctions with sources. Do not infer wrongdoing from a hash/signature mismatch.

- Start with a small corpus supplied or approved by user. No invented rules, clause numbers or legal documents.
- Preserve document title, exact section, page, source, version, effective dates, jurisdiction and access scope. Chunk by section where possible; fixed-size fallback only.
- Select retrieval approach after corpus inspection. Small corpus can use lexical search; embedding provider need not match VLM provider. No vector DB unless scale requires it.
- Answers cite retrieved passages and distinguish quotes from interpretation. A matching citation ID alone does not prove claim support; evaluate passage support and applicability too.
- Unknown facts, insufficient evidence, expired/conflicting rules: abstain or ask clarifying question. Do not promise calibrated confidence thresholds without evaluation.
- Document contents are untrusted, never instructions. No execution or tools based on retrieved text.
- Enforce authenticated organization/document access before retrieval; `tenant_id` tags alone are not authorization. Public corpus and private tenant corpus remain isolated.
- VI/EN answers follow selected language, retaining original source text and marking translation. Legal interpretation remains advisory, not automated sanction decision.
- Never remove citation validation as a time-saving cut. If unsafe/incomplete, disable answer generation instead.

## B2B/B2C — one engine, staged delivery

### B2C hypothesis

Initial candidate: individual property handover/condition record. Capture checklist, signed report, consent-controlled sharing and independent integrity verification. Validate need and willingness to pay with interviews before pricing. App/report UI VI/EN.

### B2B hypothesis

Initial candidate: inspection/property handover teams. Same capture flow, later organization membership, role-based permissions, private procedure corpus, reviewer workflow, audit and export/API integration. Build a pilot with one actual team before console/billing expansion.

### Deliberate exclusions for first milestone

- No billing, separate B2B/B2C apps, enterprise console, multi-tenant production claim or legal compliance claim.
- No revenue/customer forecasts presented as facts. Earlier pricing/revenue figures were unvalidated examples and are withdrawn.
- SQLite append-only application logs are not immutable or tamper-proof. Stronger audit guarantees require separate design/storage controls.
- No automatic fraud detection, fake-image detection, blockchain, multi-agent or general workflows.
- No exact event date assumed: confirm deadline and team size before mapping tasks to calendar days.

## Build order / cuts

Integrity and safe input handling; bilingual capture/session/report/verify; live device check; VLM; grounded RAG; then visual design and business surfaces. Cut PDF, extra UI polish, console and billing before cutting signatures, ownership checks, citations or honest mode labels.

## Pre-demo cleanup task — DEMO-01 (pending, required before rehearsal)

Added by user: hide developer-facing configuration and displays before demo; record task now, do not silently remove troubleshooting capabilities during active integration.

Scope:

- Move API URL editing, full server address, raw health/capability output and developer diagnostics out of primary demo screens into an explicit advanced/developer section. Configure the approved reachable API before rehearsal; do not hardcode a stale LAN IP or expose provider keys in Expo variables.
- Show user-relevant connection status and actionable retry, not developer payloads. Keep a reachable recovery path if venue network changes.
- Replace full UUID/hash/signature/public-key blocks and raw JSON on primary screens with human-readable session/report summaries. Keep full values under technical details and preserve real JSON export/verification.
- Remove test buttons, sample labels, mock data, debug overlays inside app and speculative/future feature panels from demo flow. Do not claim Expo Go developer menu/host UI can be removed by changing app screens.
- Keep VI/EN and theme settings if useful; move destructive local-copy cleanup away from main demo path without removing its confirmation or retention controls.
- Preserve permission prompts, honest checklist/advisory labels, external-VLM consent, integrity limitations, actual errors, retake/history and finalized guards. Never hide failures or replace live results with simulated success.
- Rehearse one clear path: connect, create session, capture, analyze, retake when appropriate, complete checklist, report, original PASS / edited FAIL. Use real test data without personal IDs.

Likely files: `app/App.tsx`, `app/src/ui/screens.tsx`, `app/src/ui/theme.ts`, `app/src/ui/copy.ts`, `app/src/locale.ts`, `app/test/ui-check.cjs`; demo script `docs/DEMO-WORKFLOW.md`.

Acceptance: default demo screens contain no editable API field or raw technical dump; advanced diagnostics remain deliberately accessible; native VI/EN rehearsal and app checks pass; server logs confirm actual phone requests through the workflow. No fresh session/token loss solely to simplify display.

## Open decisions

1. Actual event date and available team.
2. Primary Android/iOS device; iOS signing/provisioning account if needed. Linux cannot locally compile iOS.
3. VLM provider/model/key.
4. Concrete inspection domain and actual required evidence slots. Current four slots are prototype assumptions.
5. Real RAG documents, effective jurisdiction and permission to use them.
6. B2B pilot organization/roles; B2C sharing/consent policy and retention period.
