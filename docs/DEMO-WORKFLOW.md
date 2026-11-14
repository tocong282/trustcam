# TRUSTCAM — live demo workflow

## Selected demo domain: automobile insurance claim intake

User selected car insurance. Working scenario: voluntary own-damage insurance (bảo hiểm vật chất xe), one parked/stationary car with a minor bumper scratch; not a demonstration of compulsory third-party liability benefits. This is an illustrative claim-intake workflow, not an actual insurer's approved procedure or a coverage decision.

- Customer creates one dossier in Camera and captures vehicle/scene overview, damage close-up, test plate/VIN, and a synthetic insurance/vehicle document. Never use real identity or policy data for public rehearsal. Capture only when safely stationary.
- Explicitly request optional VLM review of one selected photo. If suitability is poor, retake while preserving original history; never stage a model response as live inference.
- Customer explicitly grants enterprise access. Dossier-first lists, 20-photo capacity, dashboard API/static integration and mobile consent are implemented and pass automated checks. Native phone-to-dashboard rehearsal remains pending; running LAN server may still have older code.
- Verify exact original PASS and edited image FAIL; explain byte integrity only. FAIL is not a fraud finding. Neither result determines policy coverage, fault or compensation.
- Existing legal corpus concerns general electronic evidence/civil rules. It does not contain an approved insurance policy or insurer procedure; coverage/exclusions/deadlines are unavailable until relevant sourced documents are added and reviewed. Do not invent them.
- Pitch workflow/video must use this scenario, replacing the earlier property-handover example. Recorded illustration is labelled, not presented as live app footage.

## Gate 0: phone actually reaches API

- Current host LAN at last check: `172.20.10.18` (recheck after network changes).
- Expo Go: `exp://172.20.10.18:8081`.
- API Settings: `http://172.20.10.18:8000`.
- Phone and computer must share reachable network. A Metro bundle download proves only Metro access, not API access.
- A saved API URL overrides the new environment default. Inspect current Settings; never silently reset tokens to fix network changes. Changing server URL currently drops remembered session reference with explicit confirmation; server data remains.
- Press server/session refresh in Home. Observe API log `GET /health` from phone IP with status200. Local host checks do not count as phone proof.
- If no request reaches API: open `http://172.20.10.18:8000/health` in phone browser to isolate routing/firewall from app preferences. Browser should show status ok and vlm_configured true. A successful browser call proves reachability, not app upload.

## Live workflow

1. Open Camera, then choose Create session there. Home provides overview and navigation/continue, not session creation. Creating another session requires explicit replacement confirmation; opening Camera alone must not create anything. Expected server log after confirmation: `POST /session` 200; real session ID appears. UI relocation implemented; typecheck, self-check, config-check and Metro bundle verified. Phone interaction still requires rehearsal.
2. Capture wide-context photo. Grant camera permission if requested. Expected `POST /evidence` 200 then session refresh200; next checklist slot appears.
3. Request optional model analysis for that current image. Explicitly consent to external provider transfer. Expected `/evidence/{id}/analyze`200; actual model reason shown. Do not promise retake for every photo; model may accept it.
4. If model recommends retake, use Retake action, capture improved photo, confirm current photo updates and original remains in history. If model accepts, demonstrate manual retake only if useful and label it manual, not model-requested.
5. Collect remaining prototype slots. Use synthetic/test document, not real ID for public demo. Checklist counts four current slots, history counted separately.
6. Finalize. Server checks hash/signature/bindings for current and historical records. Expected finalize200 and real report loaded. Capture/retake/further analysis disabled for finalized session.
7. Verify current or historical original using exact original file. Sharing/picker can re-encode images; exact byte preservation must be rehearsed on target phone. Original should PASS; intentionally edited valid JPEG/PNG should FAIL `image_modified`.
8. Show report/session recovery by reopening app only after rehearsing SecureStore/camera lifecycle on target device. Do not claim immutable full-report signature: only individual image manifests are signed.

## Honesty boundaries

- Checklist completeness is not AI visual approval; VLM advisory does not gate finalization.
- PASS proves byte integrity and signature relative to stored device key, not scene authenticity, trusted time or legal admissibility.
- Source corpora exist: general laws and selected Bảo Việt motor own-damage clauses/forms, with provenance/hash checks. Dashboard retrieval returns excerpts, not generated legal answers. Current applicability/customer contract remains unverified; no coverage conclusion.
- Fallback video must be labelled recorded, not live inference. No simulated results substituted for outages.

## Rehearsal exit checks

- Phone API log shows health, session, upload, model analysis, retake, finalize and verify from actual phone.
- VI/EN and light/dark work without losing session.
- Original file PASS path confirmed on phone; modified file FAIL path confirmed.
- Connection failure gives retry path and does not discard original/pending photo.
- No VLM secret printed in UI/log or placed in Expo public env.

Updated log evidence (2026-11-14): LAN clients `172.20.10.17` and `172.20.10.19` reached API; logs contain session creation, signed evidence upload, session/report retrieval and analysis with HTTP 200. Not every stage is proven from each device. Backend restarted with bilingual advisory code after consistent SQLite backup; health returned 200 with VLM configured, provider status not_checked. New bilingual generation passes 50 backend tests using local HTTP stubs; real provider language accuracy still needs rehearsal. Existing cached assessments remain unchanged.
