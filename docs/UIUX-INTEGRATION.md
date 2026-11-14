# UI/UX component handoff — integration notes

Source supplied by user: `/home/rcong/Project/trustcam/trustcam_react_native_components`.
Production Expo app: `/home/rcong/Project/trustcam/app`.

Status: inspected; supplied source untouched, not integrated. Functional audit remediation is running first; do not overwrite app/App.tsx while mobile task modifies it.

## Reuse

- Dark/light slate surfaces, emerald capture/checklist emphasis, blue report actions, card layouts.
- S01 home, S02 camera, S03 checklist, S04 report, S05 verify, S06 settings visual structure.
- VI/EN content direction; retain existing app locale keys, complete both languages and persistence.
- Theme toggle is a new feature compared with existing app; persist preference if implemented.

## Replace mock behavior with real existing app functionality

| Supplied component | Production wiring |
|---|---|
| S01 session generated with Math.random | POST /session, SecureStore credentials, confirmation and resume |
| S01 connected badge always green | Actual health request; pending/offline/available states |
| S02 mock viewfinder / fabricated hash and signature | CameraView permissions/lifecycle, exact captured bytes SHA-256 + Ed25519, real multipart upload |
| S03 local finalized status | Backend finalize, corruption checks, persisted status; keep retake/history functionality |
| S03 fake copy success timer | Real platform clipboard or omit action; never show copy success without copying |
| S04 fake copied export | Share actual persisted server report; no local session object pretending to be report |
| S05 simulated PASS/FAIL buttons | Actual file selection and /verify results with stored record binding |
| S06 in-memory preferences | Persist language/theme, validate API URL, confirm session change and preserve state on write failure |
| Future VLM placeholder | Real optional analysis + consent, advisory labels; not planned-only when actual adapter available |
| Future RAG sample law | Remove unverified legal citation, show unavailable/planned until corpus retrieval exists |

## Fix before compiling

- Several style values incorrectly use `color: isDark => ...` / `borderColor: isDark => ...`; replace functions with actual theme color strings.
- `lucide-react-native` is imported but not installed by supplied folder. Check existing icon options first; if exact Lucide icons needed, install compatible SVG dependency through Expo and verify Expo Go.
- Supplied folder lacks package manifest / build setup; it is component source, not another runnable application.
- Avoid deprecated core SafeAreaView; reuse existing safe-area-context provider.
- No hardcoded English-only labels or VI-only modal buttons. Retain complete VI/EN translations, accessibility labels and large-font handling.
- Six bottom navigation actions require small-screen/large-font validation; no labels clipped to fit screenshots.

## Integration order after functional fixes land

1. Freeze working core, response validators, storage and retake contracts; baseline all tests.
2. Apply source visual styles and screen layout to real state/actions, never copy mocked business logic.
3. Preserve history verification, pending local originals, cleanup confirmation and finalized guards.
4. Run typecheck, locale/self-check, Expo doctor, Android/iOS export and cross-language HTTP smoke.
5. Test on Expo Go: camera permissions including return from Settings, retake, restore session/report, photo picker, original PASS/modified FAIL, VI/EN and sharing. Node/export checks do not prove native operation.

Visual integration remains pending. No fake hash/signature, fabricated verification result, always-connected badge or unverified legal clause may reach production flow.
