import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as Localization from 'expo-localization';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { slots, type Slot, canonicalManifest, checkImageSize, normalizeApiUrl } from './src/core';
import { hex, publicKeyHex, signBytes } from './src/signing';
import { messages, type Language, type MessageKey } from './src/locale';
import { request as apiRequest } from './src/api';
import { checkPhotoDimensions, selectPictureSize } from './src/capture';
import { localForEvidence, matchPendingEvidence, type LocalPhoto } from './src/localPhotos';
import { createLocalPhoto, saveLocalPhoto, listLocalPhotos, deleteLocalPhotos, ownedFile, photoFile, type OwnedPhoto } from './src/photoStorage';

import { object, parseSession, parseReport, parseHealth, parseAnalysis, parseNextAction, canFinalize, captureTarget, type Evidence, type Session, type Finalized } from './src/responses';
import { parsePreferences, savePreferences, dossiersForBase, MAX_DOSSIERS, type Credentials, type Preferences } from './src/dossiers';
import { TrustcamShell, DossierListScreen, SessionScreen, CameraScreen, ChecklistScreen, ReportScreen, VerifyScreen, SettingsScreen, AdvisoryCard, LocalPhotosCard, type EvidenceView } from './src/ui/screens';
import { palettes, type Screen, type ThemeMode } from './src/ui/theme';
import { appCopy } from './src/ui/copy';
const STORE = 'trustcam.preferences.v1';
const SEED = 'trustcam.device-seed.v1';
const LANG = 'trustcam.language.v1';
const THEME = 'trustcam.theme.v1';
const storeOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const configuredBase = (() => {
  try { return normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://localhost:8000' : '')); }
  catch { return ''; }
})();
function destinationError(apiBase: string) {
  return __DEV__ ? '' : !configuredBase ? 'server_unconfigured' : apiBase !== configuredBase ? 'server_mismatch' : '';
}
// All app network paths share this guard, including startup and authenticated retries.
async function request<T>(...args: Parameters<typeof apiRequest>): Promise<T> {
  const error = destinationError(args[0]);
  if (error) throw new Error(error);
  return apiRequest<T>(...args);
}

export default function App() {
  const [lang, setLang] = useState<Language>('vi');
  const [systemLanguage] = useState(() => Localization.getLocales()[0]?.languageTag ?? 'vi-VN');
  const t = (key: string): string => messages[lang][key as MessageKey] ?? messages[lang].request_failed;
  const [base, setBase] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [seed, setSeed] = useState('');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [report, setReport] = useState<Finalized | null>(null);
  const [selected, setSelected] = useState('');
  const [verification, setVerification] = useState<{ result: 'PASS' | 'FAIL'; reason: string } | null>(null);
  const [localImages, setLocalImages] = useState<LocalPhoto[]>([]);
  const [ownedPhotos, setOwnedPhotos] = useState<OwnedPhoto[]>([]);
  const [retakeId, setRetakeId] = useState<string | null>(null);
  const [pictureSize, setPictureSize] = useState<string>();
  const cameraGeneration = useRef(0);
  const [screen, setScreen] = useState<Screen>('session');
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [connection, setConnection] = useState<'unknown' | 'checking' | 'online' | 'offline'>('unknown');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [vlmConfigured, setVlmConfigured] = useState<boolean | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const lock = useRef(false);
  const healthRequest = useRef(0);
  const camera = useRef<CameraView>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [dossierDetail, setDossierDetail] = useState(false);
  const [additionalSlot, setAdditionalSlot] = useState<Slot | null>(null);
  const [cachedSummaries, setCachedSummaries] = useState<Record<string, { count: number; required: number; status: Session['status'] }>>({});
  const [enterpriseShare, setEnterpriseShare] = useState<{ base: string; id: string; shared: boolean; sharedAt?: string } | null>(null);
  const [permission, requestPermission, getPermission] = useCameraPermissions({ get: false });

  useEffect(() => {
    let wasActive = AppState.currentState === 'active';
    void getPermission().catch(() => setError('permission_denied'));
    const listener = AppState.addEventListener('change', state => {
      const isActive = state === 'active';
      if (isActive === wasActive) return; // Duplicate active events must not strand an already-mounted preview.
      wasActive = isActive;
      cameraGeneration.current++; setReady(false); setPictureSize(undefined); setActive(isActive);
      if (isActive) void getPermission().catch(() => setError('permission_denied'));
    });
    return () => listener.remove();
  }, [getPermission]);
  useEffect(() => { cameraGeneration.current++; setReady(false); setPictureSize(undefined); }, [screen, permission?.granted]);

  async function cameraReady(instance: CameraView | null) {
    const generation = cameraGeneration.current;
    if (!instance || !active || screen !== 'camera') return;
    if (pictureSize) { setReady(true); return; }
    try {
      const chosen = selectPictureSize(await instance.getAvailablePictureSizesAsync());
      if (cameraGeneration.current === generation && camera.current === instance) setPictureSize(chosen);
      // Changing key remounts preview at chosen size; only second onCameraReady enables shutter.
    } catch (err) {
      if (cameraGeneration.current === generation) { setReady(false); setError(err instanceof Error && err.message === 'camera_resolution' ? 'camera_resolution' : 'camera_error'); }
    }
  }
  function reloadLocalPhotos() {
    const result = listLocalPhotos();
    setLocalImages(result.photos); setOwnedPhotos(result.files);
    if (result.corrupt) setError('storage_error');
    return result.photos;
  }
  async function sharePhoto(uri: string) {
    if (!await Sharing.isAvailableAsync()) throw new Error('request_failed');
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: t('shareOriginal') });
  }
  async function removeLocalPhotos() {
    if (!await confirm('deleteLocal', 'deleteLocalConfirm')) return;
    const failed = deleteLocalPhotos();
    reloadLocalPhotos();
    if (failed) throw new Error('local_delete_failed');
  }

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (err) { setError(err instanceof Error && err.message in messages.vi ? err.message : 'request_failed'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function confirm(title: MessageKey, message: MessageKey, scope = '', accept: MessageKey = 'continueAction'): Promise<boolean> {
    return new Promise(resolve => Alert.alert(t(title), t(message) + (scope ? `\n\n${scope}` : ''), [
      { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: t(accept), onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }));
  }
  async function enterpriseAccess(grant = false) {
    const auth = credentials;
    if (!auth || session?.session_id !== auth.session_id || preferences?.base !== base || preferences.credentials?.session_id !== auth.session_id || preferences.credentials.token !== auth.token || preferences.credentials.device_id !== auth.device_id || !preferences.dossiers.some(item => item.base === base && item.session_id === auth.session_id && item.token === auth.token && item.device_id === auth.device_id)) throw new Error('not_ready');
    if (grant && !await confirm('shareEnterprise', 'enterprisePrivacy', `${__DEV__ ? base : t('configuredService')}\n${auth.session_id}`, 'confirmEnterprise')) return;
    setEnterpriseShare(null); // A failed/ambiguous request must not leave an old success on screen.
    try {
      const data = object(await request<unknown>(base, `/session/${encodeURIComponent(auth.session_id)}/share-enterprise`, auth.token, grant ? {consent:true} : undefined));
      if (data.shared !== false && data.shared !== true || (grant && data.shared !== true) || (data.shared === true && (typeof data.shared_at !== 'string' || !Number.isFinite(Date.parse(data.shared_at))))) throw new Error('invalid_response');
      setEnterpriseShare({base, id:auth.session_id, shared:data.shared, sharedAt:data.shared === true ? data.shared_at as string : undefined});
    } catch (err) {
      if (err instanceof Error && err.message === 'unauthorized') throw new Error('enterprise_auth_unavailable');
      if (err instanceof Error && err.message === 'request_failed') throw new Error('enterprise_unavailable');
      throw err;
    }
  }
  async function loadHealth(apiBase = base) {
    const id = ++healthRequest.current;
    setConnection('checking');
    try { const health = parseHealth(await request<unknown>(apiBase, '/health')); if (id === healthRequest.current) { setVlmConfigured(health.vlm_configured); setConnection('online'); } }
    catch { if (id === healthRequest.current) { setVlmConfigured(null); setConnection('offline'); } } // Optional capability failure never blocks checklist collection.
  }
  async function startup() {
    // Vietnamese remains the default regardless of OS; native dialogs follow OS locale.
    let saved: Preferences;
    try {
      const storedTheme = await SecureStore.getItemAsync(THEME);
      if (storedTheme === 'dark' || storedTheme === 'light') setMode(storedTheme);
      const storedLang = await SecureStore.getItemAsync(LANG);
      if (storedLang === 'vi' || storedLang === 'en') setLang(storedLang);
      let storedSeed = await SecureStore.getItemAsync(SEED);
      if (storedSeed === null) {
        storedSeed = hex(await Crypto.getRandomBytesAsync(32));
        await SecureStore.setItemAsync(SEED, storedSeed, storeOptions);
      }
      publicKeyHex(storedSeed); // Fail closed on corrupted key; never replace silently.
      setSeed(storedSeed);
      const raw = await SecureStore.getItemAsync(STORE);
      if (!raw && !configuredBase) throw new Error('server_unconfigured');
      const fallback = configuredBase;
      saved = parsePreferences(raw, fallback, publicKeyHex(storedSeed));
      // Persist legacy migration before exposing switch/create actions; never silently repair/drop entries.
      await SecureStore.setItemAsync(STORE, JSON.stringify(saved), storeOptions);
      setPreferences(saved); setBase(saved.base); setUrlInput(saved.base); setCredentials(saved.credentials); setLoaded(true);
    } catch (err) {
      if (err instanceof Error && ['key_corrupt', 'invalid_url', 'server_unconfigured'].includes(err.message)) throw err;
      throw new Error('storage_error');
    }
    reloadLocalPhotos();
    if (destinationError(saved.base)) return;
    // Network errors leave saved credentials usable, with Refresh available for retry.
    void loadHealth(saved.base);
    if (saved.credentials) await loadSession(saved.credentials, saved.base);
  }
  useEffect(() => { void run(startup); }, []);

  async function persist(nextBase: string, nextCredentials: Credentials | null, createdAt?: string) {
    if (!preferences) throw new Error('storage_error');
    const saved = await savePreferences(preferences, nextBase, nextCredentials, publicKeyHex(seed), value => SecureStore.setItemAsync(STORE, value, storeOptions), createdAt);
    setPreferences(saved);
  }
  async function openDossier(id: string) {
    const entry = preferences && dossiersForBase(preferences, base).find(item => item.session_id === id);
    if (!entry) throw new Error('not_ready');
    const auth = { session_id: entry.session_id, token: entry.token, device_id: entry.device_id };
    await persist(base, auth);
    setCredentials(auth); setSession(null); setSelected(''); setRetakeId(null); setAdditionalSlot(null); setReport(null); setVerification(null);
    setDossierDetail(true); // Network failure keeps chosen reference and retry reachable.
    await loadSession(auth, base);
  }
  function openDetail(next: Screen) { setDossierDetail(true); setScreen(next); }

  async function loadSession(auth = credentials, apiBase = base) {
    if (!auth) throw new Error('not_ready');
    const knownReport = report?.report.session_id === auth.session_id ? report : null;
    const data = parseSession(await request<unknown>(apiBase, `/session/${encodeURIComponent(auth.session_id)}`, auth.token), auth.session_id, knownReport?.report_id);
    const all = [...data.evidence, ...data.evidence_history];
    if (all.some(item => item.public_key !== auth.device_id)) throw new Error('invalid_response');
    // Resolve ambiguous timeout by matching original signed hash, never uploading a new replacement implicitly.
    const local = reloadLocalPhotos();
    for (const pending of local.filter(item => item.base === apiBase && item.session_id === auth.session_id && item.evidence_id === null)) {
      const found = matchPendingEvidence(pending, apiBase, auth.session_id, all);
      if (found) await saveLocalPhoto({ ...pending, evidence_id: found.evidence_id });
    }
    reloadLocalPhotos();
    setVerification(null);
    setCachedSummaries(previous => ({...previous, [JSON.stringify([apiBase, auth.session_id])]: {count:data.evidence.length, required:slots.filter(slot => data.evidence.some(item => item.slot === slot)).length, status:data.status}}));
    setSession(data); setSelected(previous => all.some(item => item.evidence_id === previous) ? previous : data.evidence[0]?.evidence_id ?? '');
    setRetakeId(previous => previous && data.status === 'collecting' && data.evidence.some(item => item.evidence_id === previous) ? previous : null);
    if (data.status === 'finalized') {
      const restored = knownReport?.report_id === data.report_id ? knownReport : parseReport(await request<unknown>(apiBase, `/session/${encodeURIComponent(auth.session_id)}/report`, auth.token), auth.session_id);
      if (restored.report_id !== data.report_id || restored.report.device_id !== auth.device_id) throw new Error('invalid_response');
      setReport(restored);
    } else setReport(null);
    return data;
  }
  async function createSession() {
    if (credentials && !await confirm('createSession', 'replaceSessionConfirm')) return;
    if (!preferences || preferences.dossiers.length >= MAX_DOSSIERS) throw new Error('dossier_limit');
    const data = object(await request<unknown>(base, '/session', undefined, { public_key: publicKeyHex(seed) }));
    const nextAction = parseNextAction(data.next_action);
    if (typeof data.session_id !== 'string' || !data.session_id || typeof data.token !== 'string' || !data.token || data.device_id !== publicKeyHex(seed) || nextAction.type !== 'capture') throw new Error('invalid_response');
    const next = { session_id: data.session_id, token: data.token, device_id: data.device_id };
    const createdAt = new Date().toISOString();
    await persist(base, next, createdAt); setCredentials(next); setReport(null); setVerification(null); setRetakeId(null); setAdditionalSlot(null);
    setSelected('');
    setSession({ session_id: data.session_id, evidence: [], evidence_history: [], next_action: nextAction, analysis_mode: 'checklist', status: 'collecting', report_id: null });
    setScreen('camera');
    await loadSession(next, base); // Negotiate optional 20-photo capability; legacy server remains four-only.
  }
  async function beginRetake(item: Evidence) {
    if (!captureTarget(session, item.evidence_id)) throw new Error('not_ready');
    if (!await confirm('retake', 'retakeConfirm')) return;
    setAdditionalSlot(null); setRetakeId(item.evidence_id); setScreen('camera'); setReady(false); setPictureSize(undefined);
  }
  async function capture() {
    const target = captureTarget(session, retakeId, additionalSlot);
    if (!ready || !pictureSize || !camera.current || !credentials || !target || !permission?.granted || !active || screen !== 'camera') throw new Error('not_ready');
    let photo;
    try { photo = await camera.current.takePictureAsync({ quality: 0.85, exif: false }); }
    catch { throw new Error('camera_error'); }
    if (!photo?.uri) throw new Error('camera_error');
    const capturedAt = new Date().toISOString();
    const name = `trustcam-${Crypto.randomUUID()}.jpg`;
    const copy = createLocalPhoto(name, new File(photo.uri)); // Own bytes before any validation/signing/network failure.
    reloadLocalPhotos();
    checkPhotoDimensions(photo.width, photo.height);
    checkImageSize(copy.size);
    const bytes = await copy.bytes();
    checkImageSize(bytes.byteLength);
    const sha256 = hex(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)));
    const pending: LocalPhoto = { version: 1, name, base, session_id: credentials.session_id, evidence_id: null, slot: target.slot, sha256, captured_at: capturedAt };
    await saveLocalPhoto(pending); reloadLocalPhotos();
    const manifest = canonicalManifest({ version: '1', session_id: credentials.session_id, device_id: credentials.device_id, captured_at: capturedAt, slot: target.slot, sha256 });
    const signature = signBytes(new TextEncoder().encode(manifest), seed);
    const form = new FormData();
    form.append('session_id', credentials.session_id); form.append('manifest', manifest); form.append('signature', signature); form.append('image', copy);
    if (target.is_additional) form.append('additional', 'true');
    if (target.replaces_evidence_id) form.append('replaces_evidence_id', target.replaces_evidence_id);
    let result;
    try { result = object(await request<unknown>(base, '/evidence', credentials.token, form, 45000)); }
    catch (err) {
      if (err instanceof Error && ['stale_evidence', 'evidence_superseded'].includes(err.message)) {
        setRetakeId(null);
        try { await loadSession(); } catch { /* Keep original localized stale prompt; pending bytes remain shareable. */ }
      }
      throw err;
    }
    if (typeof result.evidence_id !== 'string' || !result.evidence_id || result.sha256 !== sha256 || (result.replaces_evidence_id != null && result.replaces_evidence_id !== target.replaces_evidence_id)) throw new Error('invalid_response');
    await saveLocalPhoto({ ...pending, evidence_id: result.evidence_id }); reloadLocalPhotos();
    setRetakeId(null); setAdditionalSlot(null);
    await loadSession(); openDetail('checklist');
  }
  async function finalize() {
    if (!credentials || !canFinalize(session)) throw new Error('not_ready');
    const result = parseReport(await request<unknown>(base, `/session/${encodeURIComponent(credentials.session_id)}/finalize`, credentials.token, {}), credentials.session_id);
    if (result.report.device_id !== credentials.device_id) throw new Error('invalid_response');
    setSession(previous => previous && ({ ...previous, status: 'finalized', report_id: result.report_id }));
    setReport(result); openDetail('report');
  }
  async function analyze(item: Evidence) {
    if (!credentials || !vlmConfigured || session?.status !== 'collecting' || !session.evidence.some(entry => entry.evidence_id === item.evidence_id)) throw new Error('not_ready');
    // Consent requested for every transmission; never auto-send sensitive evidence.
    if (!await confirm('analyze', 'analysisPrivacy')) return;
    const data = object(await request<unknown>(base, `/evidence/${encodeURIComponent(item.evidence_id)}/analyze`, credentials.token, { language: lang }, 60000));
    if (data.evidence_id !== item.evidence_id) throw new Error('invalid_response');
    const analysis = parseAnalysis(data.analysis, item.slot);
    parseNextAction(data.next_action); // Advisory never gates checklist or starts retake without consent.
    setSession(previous => previous && ({ ...previous, evidence: previous.evidence.map(entry => entry.evidence_id === item.evidence_id ? { ...entry, analysis } : entry) }));
  }
  async function refresh() { if (credentials) { void loadHealth(); await loadSession(); } else await loadHealth(); }
  async function saveUrl() {
    if (!__DEV__) throw new Error('not_ready');
    const next = normalizeApiUrl(urlInput);
    if (next !== base) {
      if (!await confirm('save', 'changeApiConfirm')) return;
      // Persist URL and auth atomically before clearing any app references.
      await persist(next, null);
      setBase(next); setCredentials(null); setSession(null); setReport(null); setVerification(null); setRetakeId(null); setAdditionalSlot(null); setDossierDetail(false); setSelected(''); setVlmConfigured(null);
      void loadHealth(next);
    }
    setUrlInput(next); setScreen('session');
  }
  async function pickVerify() {
    if (!credentials || !selected || ![...(session?.evidence ?? []), ...(session?.evidence_history ?? [])].some(item => item.evidence_id === selected)) throw new Error('not_ready');
    setVerification(null);
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current });
    if (picked.canceled) return;
    const image = new File(picked.assets[0].uri);
    checkImageSize(image.size);
    const form = new FormData();
    form.append('session_id', credentials.session_id); form.append('evidence_id', selected); form.append('image', image);
    const result = object(await request<unknown>(base, '/verify', credentials.token, form, 45000));
    if (!((result.result === 'PASS' && result.reason === 'integrity_verified') || (result.result === 'FAIL' && (result.reason === 'image_modified' || result.reason === 'signature_invalid')))) throw new Error('invalid_response');
    setVerification({ result: result.result, reason: result.reason });
  }
  const target = captureTarget(session, retakeId, additionalSlot);
  const trustError = destinationError(base);
  const disabled = busy || !loaded || !!trustError;
  const copy = appCopy[lang];
  const p = palettes[mode];
  const page = { mode, copy, busy, error: trustError ? t(trustError) : error ? t(error) : null };
  const progress = (count: number, required: number) => `${count}/20 ${t('photoCount')} · ${required}/4 ${t('requiredCategories')}`;
  const progressLabel = session ? progress(session.evidence.length, slots.filter(slot => session.evidence.some(item => item.slot === slot)).length) : t('summaryUnknown');
  const dossierTab = ['checklist', 'report', 'verify'].includes(screen);
  const dossierCards = (preferences ? dossiersForBase(preferences, base) : []).map(item => {
    const cached = cachedSummaries[JSON.stringify([base,item.session_id])];
    return { id:item.session_id, label:`${t('dossier')} ${item.session_id.slice(0,8)}`, createdLabel:item.created_at ?? t('unknownCreatedAt'),
      detail:cached ? `${t(cached.status === 'finalized' ? 'finalizedStatus' : 'collectingStatus')} · ${progress(cached.count,cached.required)} · ${t('cachedSummary')}` : t('summaryUnknown') };
  });
  const statusLabel = session ? t(session.status === 'finalized' ? 'finalizedStatus' : 'collectingStatus') : copy.noSession;
  const summary = credentials ? { id: credentials.session_id, statusLabel, progressLabel } : null;
  const evidenceView = (item: Evidence): EvidenceView => {
    let imageUri: string | undefined;
    const local = credentials ? localForEvidence(localImages, base, credentials.session_id, item.evidence_id) : null;
    try { const file = local ? photoFile(local.name) : null; if (file?.exists) imageUri = file.uri; }
    catch { /* Missing or unreadable originals do not block evidence review/verification. */ }
    return {
      id: item.evidence_id, label: `${t(item.slot)} · ${item.evidence_id}`, timestampLabel: item.captured_at,
      hash: item.sha256, signature: item.signature, publicKey: item.public_key, imageUri,
      canRetake: !!captureTarget(session, item.evidence_id), canShareOriginal: !!imageUri,
    };
  };
  const analysisItem = session?.evidence.find(item => item.evidence_id === selected);
  const nextTarget = captureTarget(session, null);
  const current = session?.evidence.map(evidenceView) ?? [];
  const history = session?.evidence_history.map(evidenceView) ?? [];
  // ponytail: SDK58 exposes enableTorch but no hardware torch-capability probe; omit optional action until support can be detected.
  const cameraActive = !!target && !!permission?.granted && active && screen === 'camera';
  const perform = (action: () => Promise<void>) => () => { if (!disabled) void run(action); };
  const shareOriginal = (id: string) => { void run(async () => {
    if (!credentials) throw new Error('not_ready');
    const local = localForEvidence(localImages, base, credentials.session_id, id);
    if (!local || !photoFile(local.name).exists) throw new Error('not_ready');
    await sharePhoto(photoFile(local.name).uri);
  }); };
  return <SafeAreaProvider><View style={styles.root} accessibilityLanguage={lang === 'vi' ? 'vi-VN' : systemLanguage.startsWith('en') ? systemLanguage : 'en-US'}>
    <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    <TrustcamShell mode={mode} copy={copy} subtitle={t('checklist')} activeScreen={screen} navigationDisabled={busy}
      onNavigate={next => { if (!busy) { if (['checklist','report','verify'].includes(next)) setDossierDetail(false); setScreen(next); } }}>
      {dossierTab && !dossierDetail && <DossierListScreen {...page} title={t('dossiers')} help={t('dossiersHelp')} emptyLabel={t('noDossiers')}
        dossiers={dossierCards} onOpen={id => { if (!disabled) void run(() => openDossier(id)); }} />}
      {dossierTab && dossierDetail && <Pressable accessibilityRole="button" accessibilityLabel={t('backDossiers')} disabled={busy}
        style={[styles.action, {borderColor:p.border}]} onPress={() => { if (!busy) setDossierDetail(false); }}><Text style={{color:p.blue}}>{t('backDossiers')}</Text></Pressable>}
      {dossierTab && dossierDetail && credentials && <View style={[styles.action, {borderColor:p.border}]}>
        <Text style={{color:p.text}}>{t('enterprisePrivacy')}</Text>
        <Text style={{color:p.muted}}>{__DEV__ ? base : t('configuredService')}{'\n'}{credentials.session_id}</Text>
        <Text accessibilityLiveRegion="polite" style={{color:p.text}}>{enterpriseShare?.base === base && enterpriseShare.id === credentials.session_id ? `${t(enterpriseShare.shared ? 'enterpriseShared' : 'enterpriseNotShared')}${enterpriseShare.sharedAt ? ' · ' + enterpriseShare.sharedAt : ''}` : t('enterpriseUnknown')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('shareEnterprise')} accessibilityState={{disabled:disabled || session?.session_id !== credentials.session_id}}
          disabled={disabled || session?.session_id !== credentials.session_id} style={styles.action} onPress={perform(() => enterpriseAccess(true))}><Text style={{color:p.blue}}>{t('shareEnterprise')}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('enterpriseStatus')} accessibilityState={{disabled:disabled || session?.session_id !== credentials.session_id}}
          disabled={disabled || session?.session_id !== credentials.session_id} style={styles.action} onPress={perform(() => enterpriseAccess())}><Text style={{color:p.blue}}>{t('enterpriseStatus')}</Text></Pressable>
      </View>}
      {!loaded && !busy && <Pressable accessibilityRole="button" accessibilityLabel={t('retry')}
        style={[styles.action, { borderColor: p.border }]} onPress={() => void run(startup)}><Text style={{ color: p.blue }}>{t('retry')}</Text></Pressable>}
      {screen === 'session' && <SessionScreen {...page} connection={connection} serverLabel={base} session={summary}
        onOpenCamera={() => { if (!busy) setScreen('camera'); }} onRefresh={perform(refresh)} onOpenSettings={() => { if (!busy) setScreen('settings'); }}
        onResume={perform(async () => { const data = await loadSession(); openDetail(data.status === 'finalized' ? 'report' : captureTarget(data, null) ? 'camera' : 'checklist'); })} />}
      {screen === 'camera' && <CameraScreen {...page} session={summary}
        canCreate={!disabled && /^[0-9a-f]{64}$/.test(seed)} onCreate={perform(createSession)}
        hasCaptureTarget={!!target} onRefresh={credentials ? perform(refresh) : undefined}
        reviewLabel={session?.status === 'finalized' ? copy.reportTab : copy.checklistTab}
        onReview={session && !target ? () => { if (!busy) openDetail(session.status === 'finalized' ? 'report' : 'checklist'); } : undefined}
        targetLabel={target ? `${retakeId ? t('retaking') + ': ' : ''}${t(target.slot)}${retakeId ? ' · ' + retakeId : ''}` : session ? canFinalize(session) ? t('readyFinalize') : statusLabel : copy.noSession}
        cameraActive={cameraActive} canCapture={!disabled && cameraActive && ready && !!pictureSize}
        permissionMessage={target ? permission?.granted ? copy.cameraInactive : t(permission?.canAskAgain === false ? 'permissionDenied' : 'permissionIntro') : session ? canFinalize(session) ? t('readyFinalize') : statusLabel : copy.noSession}
        onRequestPermission={target && !permission?.granted && permission?.canAskAgain !== false ? perform(async () => { const result = await requestPermission(); if (!result.granted) throw new Error('permission_denied'); }) : undefined}
        onOpenSettings={target && !permission?.granted ? perform(async () => { await Linking.openSettings(); }) : undefined}
        additionalLabel={t('addPhoto')} additionalOptions={!retakeId && session && captureTarget(session, null, slots[0]) ? slots.map(slot => ({id:slot,label:t(slot)})) : []}
        onAdditional={slot => { if (!disabled && slots.includes(slot as Slot) && captureTarget(session,null,slot as Slot)) { setRetakeId(null); setAdditionalSlot(slot as Slot); cameraGeneration.current++; setReady(false); setPictureSize(undefined); } }}
        flashEnabled={false} onCapture={perform(capture)}
        onCancelRetake={retakeId || additionalSlot ? perform(async () => { setRetakeId(null); setAdditionalSlot(null); }) : undefined}
        preview={cameraActive ? <CameraView key={pictureSize ?? 'discover'} ref={camera} pictureSize={pictureSize}
          style={styles.camera} facing="back" mode="picture" accessibilityLabel={t('cameraPreview')}
          onCameraReady={() => { void cameraReady(camera.current); }}
          onMountError={() => { setReady(false); setError('camera_error'); }} /> : null} />}
      {screen === 'checklist' && dossierDetail && <ChecklistScreen {...page} progressLabel={progressLabel} statusLabel={statusLabel}
        requiredCategories={slots.map(slot => ({label:t(slot),complete:!!session?.evidence.some(item => item.slot === slot)}))}
        selectedId={selected} onSelect={id => { if (!disabled && current.some(item => item.id === id)) { setSelected(id); setVerification(null); } }}
        current={current} history={history} canFinalize={!disabled && canFinalize(session)} onFinalize={perform(finalize)}
        onRefresh={perform(refresh)} onShareOriginal={shareOriginal}
        nextLabel={nextTarget ? t(nextTarget.slot) : undefined}
        onContinue={nextTarget ? () => { if (!busy) { setRetakeId(null); setScreen('camera'); } } : undefined}
        onRetake={id => { void run(async () => { const item = session?.evidence.find(entry => entry.evidence_id === id); if (!item) throw new Error('not_ready'); await beginRetake(item); }); }}>
        <AdvisoryCard mode={mode} copy={copy} busy={busy}
          photoLabel={analysisItem ? `${t(analysisItem.slot)} · ${analysisItem.evidence_id}` : copy.chooseCurrentPhoto}
          emptyMessage={analysisItem ? copy.noPhotoReview : copy.chooseCurrentPhoto} actionLabel={copy.analyzePhoto}
          capabilityLabel={t(vlmConfigured === null ? 'analysisUnknown' : vlmConfigured ? 'analysisAvailable' : 'analysisDisabled')}
          canRequestAnalysis={!disabled && !!vlmConfigured && !!analysisItem && session?.status === 'collecting'}
          onRequestAnalysisConsent={perform(async () => { if (!analysisItem) throw new Error('not_ready'); await analyze(analysisItem); })}
          onRefreshCapabilities={perform(async () => { await loadHealth(); })}
          advisory={analysisItem?.analysis ? { statusLabel: t(analysisItem.analysis.status === 'accepted' ? 'analysisAccepted' : analysisItem.analysis.status === 'retake' ? 'analysisRetake' : 'analysisUncertain'), originalText: analysisItem.analysis.reasons?.[lang] ?? analysisItem.analysis.reason, isOriginalLanguage: !analysisItem.analysis.reasons } : null} />
        {analysisItem?.analysis && analysisItem.analysis.status !== 'accepted' && <Text style={{ color: p.muted }}>{t('additionalGuidance')}</Text>}
      </ChecklistScreen>}
      {screen === 'report' && dossierDetail && <ReportScreen {...page} summary={summary} reportText={report ? JSON.stringify(report, null, 2) : null}
        onRefresh={perform(refresh)} onShare={perform(async () => { if (!report) throw new Error('not_ready'); await Share.share({ title: t('report'), message: JSON.stringify(report, null, 2) }); })} />}
      {screen === 'verify' && dossierDetail && <VerifyScreen {...page} current={current} history={history}
        selection={selected ? { source: current.some(item => item.id === selected) ? 'current' : 'history', id: selected } : null}
        onSelect={selection => { if (!disabled && (selection.source === 'current' ? current : history).some(item => item.id === selection.id)) { setSelected(selection.id); setVerification(null); } }}
        canVerify={!disabled && !!credentials && [...current, ...history].some(item => item.id === selected)} onPickAndVerify={perform(pickVerify)}
        result={verification ? { label: t(verification.result === 'PASS' ? 'pass' : 'fail'), detail: t(verification.reason), tone: verification.result === 'PASS' ? 'emerald' : 'danger' } : null}
        onRefresh={perform(refresh)} canRefresh={!disabled && !!credentials}
        onOpenSettings={perform(async () => { await Linking.openSettings(); })} />}
      {screen === 'settings' && <SettingsScreen {...page} language={lang}
        onLanguageChange={next => { void run(async () => {
          try { await SecureStore.setItemAsync(LANG, next, storeOptions); } catch { throw new Error('storage_error'); }
          setLang(next);
        }); }}
        onThemeChange={next => { void run(async () => {
          try { await SecureStore.setItemAsync(THEME, next, storeOptions); } catch { throw new Error('storage_error'); }
          setMode(next);
        }); }}
        apiUrlDraft={urlInput} onApiUrlDraftChange={setUrlInput} canSaveApiUrl={!disabled} onRequestSaveApiUrl={perform(saveUrl)}>
        <LocalPhotosCard mode={mode} copy={copy} busy={busy} photos={ownedPhotos.map(item => ({
          id: `${item.legacy}:${item.name}`, label: item.name,
          statusLabel: t(!item.metadata ? 'orphanPhoto' : item.metadata.evidence_id ? 'savedLocal' : 'pendingLocal'),
          detail: item.metadata ? `${__DEV__ ? item.metadata.base + ' · ' : ''}${item.metadata.session_id} · ${t(item.metadata.slot)} · ${item.metadata.evidence_id ?? ''}` : '',
          canShare: ownedFile(item).exists,
        }))} onRefresh={perform(async () => { reloadLocalPhotos(); })} onRequestDelete={perform(removeLocalPhotos)}
          onShare={id => { void run(async () => { const item = ownedPhotos.find(entry => `${entry.legacy}:${entry.name}` === id); if (!item || !ownedFile(item).exists) throw new Error('not_ready'); await sharePhoto(ownedFile(item).uri); }); }} />
      </SettingsScreen>}
    </TrustcamShell>
  </View></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, camera: { flex: 1, width: '100%', height: '100%' },
  action: { minHeight: 48, padding: 12, borderWidth: 1, borderRadius: 10, margin: 16 },
});
