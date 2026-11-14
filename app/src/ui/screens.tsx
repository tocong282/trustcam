import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palettes, type Copy, type Language, type Screen, type ThemeMode } from './theme';

export type Appearance = { mode: ThemeMode; copy: Copy };
type PageProps = Appearance & { busy: boolean; error?: string | null };
type Tone = 'muted' | 'emerald' | 'blue' | 'danger' | 'warning';

function Label({ mode, children, tone, heading = false, selectable = false }: Pick<Appearance, 'mode'> & {
  children: ReactNode; tone?: Tone; heading?: boolean; selectable?: boolean;
}) {
  return <Text selectable={selectable} accessibilityRole={heading ? 'header' : undefined}
    style={[heading ? styles.heading : styles.text, { color: palettes[mode][tone ?? 'text'] }]}>{children}</Text>;
}

function Card({ mode, title, children }: Pick<Appearance, 'mode'> & { title?: string; children: ReactNode }) {
  const p = palettes[mode];
  return <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
    {title ? <Label mode={mode} heading>{title}</Label> : null}{children}
  </View>;
}

const ReducedMotion = createContext(true);
type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Unknown preference stays still; failed queries never enable unsolicited motion.
function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let live = true, changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      if (live) setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (live && !changed) setReduced(value);
    }).catch(() => {});
    return () => { live = false; listener.remove(); };
  }, []);
  return reduced;
}

function Action({ mode, label, onPress, disabled = false, selected, tone = 'emerald', primary = false,
  icon, compact = false, inline = false, role, children }: Pick<Appearance, 'mode'> & {
  label: string; onPress: () => void; disabled?: boolean; selected?: boolean; tone?: Tone;
  primary?: boolean; icon?: IconName; compact?: boolean; inline?: boolean; role?: 'button' | 'tab'; children?: ReactNode;
}) {
  const p = palettes[mode];
  const reduced = useContext(ReducedMotion);
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => { if (reduced || disabled) { scale.stopAnimation(); scale.setValue(1); }
    return () => scale.stopAnimation(); }, [scale, reduced, disabled]);
  const pressScale = (value: number) => {
    scale.stopAnimation();
    if (reduced || disabled) scale.setValue(1);
    else Animated.timing(scale, { toValue: value, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };
  const color = primary ? p.onPrimary : selected ? p.emerald : p[tone];
  return <Animated.View style={[compact && styles.navItem, inline && { flexShrink: 1 }, { transform: [{ scale }] }]}>
    <Pressable accessibilityRole={role ?? (selected === undefined ? 'button' : 'tab')} accessibilityLabel={label}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      disabled={disabled} onPress={() => { if (!disabled) onPress(); }} onPressIn={() => pressScale(0.98)} onPressOut={() => pressScale(1)}
      style={({ pressed }) => [styles.action, compact && styles.navAction, inline && styles.inlineAction, {
        borderColor: primary ? p.primary : selected ? p.emerald : compact ? 'transparent' : p.border,
        backgroundColor: primary ? p.primary : selected ? p.inset : compact ? 'transparent' : p.surface,
        opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
      }]}>
      {children}
      {icon ? <Ionicons name={icon} size={compact ? primary ? 28 : 23 : 20} color={color} accessible={false} importantForAccessibility="no" /> : null}
      <Text style={[styles.actionText, compact && styles.navLabel, compact && selected && { textDecorationLine: 'underline' }, { color }]}>{label}</Text>
    </Pressable>
  </Animated.View>;
}

function Page({ mode, copy, busy, error, children }: PageProps & { children: ReactNode }) {
  return <ScrollView style={{ flex: 1, backgroundColor: palettes[mode].background }}
    contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
    {busy ? <View accessibilityLiveRegion="polite" style={styles.busy}>
      <ActivityIndicator color={palettes[mode].emerald} /><Label mode={mode}>{copy.busy}</Label>
    </View> : null}
    {error ? <View accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Card mode={mode} title={copy.error}><Label mode={mode} tone="danger" selectable>{error}</Label></Card>
    </View> : null}
    {children}
  </ScrollView>;
}

export function TrustcamShell({ mode, copy, activeScreen, onNavigate, navigationDisabled = false, children }: Appearance & {
  subtitle: string; activeScreen: Screen; onNavigate: (screen: Screen) => void; navigationDisabled?: boolean; children: ReactNode;
}) {
  const p = palettes[mode];
  const reduced = useReducedMotion();
  const entrance = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    entrance.stopAnimation();
    if (reduced) { entrance.setValue(1); return; }
    entrance.setValue(0);
    const animation = Animated.timing(entrance, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [activeScreen, reduced, entrance]);
  const tabs: readonly [Screen, string, IconName][] = [
    ['session', copy.sessionTab, 'home-outline'], ['checklist', copy.checklistTab, 'list-outline'],
    ['camera', copy.captureTab, 'camera'], ['report', copy.reportTab, 'document-text-outline'], ['verify', copy.verifyTab, 'shield-checkmark-outline'],
  ];
  return <ReducedMotion.Provider value={reduced}>
    <SafeAreaView style={[styles.shell, { backgroundColor: p.background }]} edges={['top', 'bottom', 'left', 'right']}>
      <View style={[styles.header, { backgroundColor: p.surface, borderColor: p.border }]}>
        <View style={styles.brand}><View style={styles.brandLine}><Ionicons name="scan-outline" size={20} color={p.emerald} accessible={false} />
          <Label mode={mode} heading>TRUSTCAM</Label></View></View>
        <Action inline mode={mode} label={copy.settings} icon="settings-outline" role="button" selected={activeScreen === 'settings'}
          disabled={navigationDisabled} onPress={() => onNavigate('settings')} />
      </View>
      <Animated.View style={[styles.body, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>{children}</Animated.View>
      <View style={[styles.navigation, { backgroundColor: p.surface, borderColor: p.border }]}>
        {tabs.map(([screen, label, icon]) => <Action key={screen} compact mode={mode} label={label} icon={icon} primary={screen === 'camera'}
          selected={screen === activeScreen} disabled={navigationDisabled} onPress={() => onNavigate(screen)} />)}
      </View>
    </SafeAreaView>
  </ReducedMotion.Provider>;
}

export function DossierListScreen(props: PageProps & {
  title: string; help: string; emptyLabel: string;
  dossiers: readonly { id: string; label: string; detail: string; createdLabel: string }[];
  onOpen: (id: string) => void;
}) {
  const { mode, busy } = props;
  return <Page {...props}>
    <Card mode={mode} title={props.title}><Label mode={mode} tone="muted">{props.help}</Label></Card>
    {!props.dossiers.length ? <Label mode={mode} tone="muted">{props.emptyLabel}</Label> : null}
    {props.dossiers.map(item => <Card key={item.id} mode={mode}>
      <Action mode={mode} label={item.label} disabled={busy} onPress={() => props.onOpen(item.id)} />
      <Label mode={mode}>{item.detail}</Label><Label mode={mode} tone="muted">{item.createdLabel}</Label>
      <Label mode={mode} selectable>{item.id}</Label>
    </Card>)}
  </Page>;
}

export type SessionSummary = { id: string; statusLabel: string; progressLabel: string };
export function SessionScreen(props: PageProps & {
  connection: 'unknown' | 'checking' | 'online' | 'offline'; serverLabel: string;
  session: SessionSummary | null; onOpenCamera: () => void; onResume: () => void; onRefresh: () => void; onOpenSettings?: () => void;
}) {
  const { mode, copy: c, busy, connection, session } = props;
  return <Page {...props}>
    <View style={[styles.hero, { backgroundColor: palettes[mode].inset }]}>
      <Ionicons name={session ? 'images-outline' : 'camera-outline'} size={36} color={palettes[mode].emerald} accessible={false} />
      <Text accessibilityRole="header" style={[styles.heroTitle, { color: palettes[mode].text }]}>{session ? c.sessionTab : c.homeTitle}</Text>
      <Label mode={mode} tone="muted">{session ? c.continueHelp : c.startHelp}</Label>
      {session ? <>
        <Label mode={mode}>{c.sessionStatus}: {session.statusLabel}</Label><Label mode={mode} tone="emerald">{session.progressLabel}</Label>
        <Action mode={mode} label={c.resume} primary icon="arrow-forward" disabled={busy} onPress={props.onResume} />
        <Label mode={mode} tone="muted">{c.session}</Label><Label mode={mode} selectable>{session.id}</Label>
      </> : <Action mode={mode} label={c.captureTab} primary icon="camera" disabled={busy} onPress={props.onOpenCamera} />}
    </View>
    <Card mode={mode} title={c.connection}>
      <View style={styles.brandLine}><Ionicons name={connection === 'online' ? 'checkmark-circle-outline' : 'cloud-outline'} size={22}
        color={palettes[mode][connection === 'online' ? 'emerald' : connection === 'offline' ? 'danger' : 'muted']} accessible={false} />
        <Label mode={mode} tone={connection === 'online' ? 'emerald' : connection === 'offline' ? 'danger' : 'muted'}>{c[connection]}</Label>
      </View>
      <Label mode={mode} selectable>{props.serverLabel}</Label>
      <Label mode={mode} tone="muted">{c.serverHelp}</Label>
      <Action mode={mode} label={c.refresh} icon="refresh-outline" disabled={busy} onPress={props.onRefresh} />
      {props.onOpenSettings ? <Action mode={mode} label={c.settings} icon="settings-outline" disabled={busy} onPress={props.onOpenSettings} /> : null}
    </Card>
    <Card mode={mode}><Label mode={mode} tone="muted">{c.integrityNotice}</Label></Card>
  </Page>;
}

export function CameraScreen(props: PageProps & {
  session: SessionSummary | null; canCreate: boolean; onCreate: () => void;
  hasCaptureTarget: boolean; reviewLabel?: string; onReview?: () => void; onRefresh?: () => void;
  targetLabel: string; preview: ReactNode; cameraActive: boolean; canCapture: boolean;
  permissionMessage?: string; onRequestPermission?: () => void; onOpenSettings?: () => void;
  additionalLabel?: string; additionalOptions?: readonly { id: string; label: string }[]; onAdditional?: (id: string) => void;
  flashEnabled: boolean; onToggleFlash?: () => void; onCapture: () => void; onCancelRetake?: () => void;
}) {
  const { mode, copy: c, busy } = props;
  if (!props.session) return <Page {...props}>
    <Card mode={mode} title={c.captureTab}>
      <Label mode={mode}>{c.noSession}</Label><Label mode={mode} tone="muted">{c.cameraStartHelp}</Label>
      <Action mode={mode} label={c.createSession} primary icon="add-circle-outline" disabled={busy || !props.canCreate} onPress={props.onCreate} />
    </Card>
  </Page>;
  return <Page {...props}>
    <Card mode={mode} title={c.sessionStatus}>
      <Label mode={mode}>{props.session.statusLabel}</Label><Label mode={mode} tone="emerald">{props.session.progressLabel}</Label>
      <Label mode={mode} selectable>{c.session}: {props.session.id}</Label>
      <Action mode={mode} label={c.createSession} disabled={busy || !props.canCreate} onPress={props.onCreate} />
    </Card>
    {props.additionalOptions?.length && props.onAdditional ? <Card mode={mode} title={props.additionalLabel}>
      {props.additionalOptions.map(item => <Action key={item.id} mode={mode} label={`${props.additionalLabel}: ${item.label}`}
        disabled={busy} onPress={() => props.onAdditional?.(item.id)} />)}
    </Card> : null}
    {props.hasCaptureTarget ? <>
    <Card mode={mode} title={c.next}><Label mode={mode}>{props.targetLabel}</Label></Card>
    {props.cameraActive ? <View accessibilityLabel={c.cameraPreview}
      style={[styles.preview, { borderColor: palettes[mode].border }]}>{props.preview}</View> :
      <Card mode={mode}><Label mode={mode}>{props.permissionMessage ?? c.cameraInactive}</Label>
        {props.onRequestPermission ? <Action mode={mode} label={c.grantCamera} disabled={busy} onPress={props.onRequestPermission} /> : null}
        {props.onOpenSettings ? <Action mode={mode} label={c.openSettings} disabled={busy} onPress={props.onOpenSettings} /> : null}
      </Card>}
    {props.onToggleFlash ? <Action mode={mode} label={props.flashEnabled ? c.flashOn : c.flashOff}
      disabled={busy || !props.cameraActive} onPress={props.onToggleFlash} /> : null}
    <Action mode={mode} primary icon="camera" label={c.shutter} disabled={busy || !props.cameraActive || !props.canCapture} onPress={props.onCapture} />
    {props.onCancelRetake ? <Action mode={mode} label={c.cancelRetake} disabled={busy} onPress={props.onCancelRetake} /> : null}
    </> : <Card mode={mode}>
      <Label mode={mode}>{props.targetLabel}</Label>
      {props.onReview && props.reviewLabel ? <Action mode={mode} primary icon="arrow-forward" label={props.reviewLabel} disabled={busy} onPress={props.onReview} /> : null}
      {props.onRefresh ? <Action mode={mode} label={c.refresh} disabled={busy} onPress={props.onRefresh} /> : null}
    </Card>}
  </Page>;
}

/** Parent supplies validated server values and localized display text, never tokens/private keys. */
export type EvidenceView = {
  id: string; label: string; timestampLabel: string; hash: string;
  signature?: string; publicKey?: string; canRetake: boolean; canShareOriginal: boolean; imageUri?: string;
};
function PhotoPreview({ mode, copy, item }: Appearance & { item: EvidenceView }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [item.imageUri]);
  return item.imageUri && !failed ? <Image source={{ uri: item.imageUri }} resizeMode="contain" style={styles.photo}
    accessible accessibilityLabel={`${copy.photoPreview}: ${item.label}`} onError={() => setFailed(true)} /> :
    <Label mode={mode} tone="muted">{copy.photoUnavailable}</Label>;
}
function EvidenceCard({ mode, copy: c, busy, item, archived, onRetake, onShareOriginal, selectedId, onSelect }: Appearance & {
  busy: boolean; item: EvidenceView; archived: boolean;
  onRetake?: (id: string) => void; onShareOriginal?: (id: string) => void; selectedId?: string; onSelect?: (id: string) => void;
}) {
  const [details, setDetails] = useState(false);
  return <Card mode={mode} title={item.label}>
    <Label mode={mode} tone={archived ? 'muted' : 'emerald'}>{archived ? c.archived : c.currentPhoto}</Label>
    {!archived && onSelect ? <Action mode={mode} role="button" label={`${c.choosePhoto}: ${item.label}`}
      selected={selectedId === item.id} disabled={busy} onPress={() => onSelect(item.id)}>
      <PhotoPreview mode={mode} copy={c} item={item} />
    </Action> : <PhotoPreview mode={mode} copy={c} item={item} />}
    <Label mode={mode}>{c.timestamp}: {item.timestampLabel}</Label>
    <Pressable accessibilityRole="button" accessibilityLabel={details ? c.hideDetails : c.showDetails}
      accessibilityState={{ expanded: details }} onPress={() => setDetails(value => !value)} style={styles.details}>
      <Text style={[styles.text, { color: palettes[mode].blue }]}>{details ? c.hideDetails : c.showDetails}</Text>
      <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color={palettes[mode].blue} accessible={false} />
    </Pressable>
    {details ? <View style={styles.group}>
      <Label mode={mode} selectable>SHA-256: {item.hash}</Label>
      {item.signature ? <Label mode={mode} selectable>{c.signature}: {item.signature}</Label> : null}
      {item.publicKey ? <Label mode={mode} selectable>{c.publicKey}: {item.publicKey}</Label> : null}
    </View> : null}
    {!archived && item.canRetake && onRetake ? <Action mode={mode} label={c.retake} disabled={busy} onPress={() => onRetake(item.id)} /> : null}
    {item.canShareOriginal && onShareOriginal ? <Action mode={mode} label={c.shareOriginal} tone="blue" disabled={busy}
      onPress={() => onShareOriginal(item.id)} /> : null}
  </Card>;
}

export function ChecklistScreen(props: PageProps & {
  progressLabel: string; statusLabel: string; current: readonly EvidenceView[]; history: readonly EvidenceView[];
  canFinalize: boolean; onFinalize: () => void; onRefresh: () => void;
  onRetake: (id: string) => void; onShareOriginal: (id: string) => void; children?: ReactNode;
  requiredCategories?: readonly { label: string; complete: boolean }[];
  nextLabel?: string; onContinue?: () => void; selectedId?: string; onSelect?: (id: string) => void;
}) {
  const { mode, copy: c, busy } = props;
  return <Page {...props}>
    <Card mode={mode} title={c.progress}><Label mode={mode} tone="emerald">{props.progressLabel}</Label>
      <Label mode={mode}>{props.statusLabel}</Label>
      {props.requiredCategories?.map(item => <Label key={item.label} mode={mode} tone={item.complete ? 'emerald' : 'muted'}>{item.complete ? '✓' : '—'} {item.label}</Label>)}
      {props.nextLabel && props.onContinue ? <>
        <Label mode={mode} tone="muted">{c.next}: {props.nextLabel}</Label>
        <Action mode={mode} primary icon="camera" label={c.captureTab} disabled={busy} onPress={props.onContinue} />
      </> : null}
      <Action mode={mode} label={c.refresh} disabled={busy} onPress={props.onRefresh} />
    </Card>
    {props.current.length ? props.current.map(item => <EvidenceCard key={item.id} {...props} item={item} archived={false} />) :
      <Label mode={mode} tone="muted">{c.noEvidence}</Label>}
    {props.history.length ? <Label mode={mode} heading>{c.evidenceHistory}</Label> : null}
    {props.history.map(item => <EvidenceCard key={item.id} {...props} item={item} archived />)}
    <Action mode={mode} primary icon="document-text-outline" label={c.finalize} disabled={busy || !props.canFinalize} onPress={props.onFinalize} />
    {props.children}
  </Page>;
}

export function AdvisoryCard({ mode, copy: c, busy, capabilityLabel, canRequestAnalysis, onRequestAnalysisConsent,
  onRefreshCapabilities, advisory, photoLabel, emptyMessage, actionLabel }: Appearance & {
  busy: boolean; capabilityLabel: string; canRequestAnalysis: boolean;
  onRequestAnalysisConsent: () => void; onRefreshCapabilities: () => void;
  advisory?: { statusLabel: string; originalText: string; isOriginalLanguage?: boolean } | null;
  photoLabel?: string; emptyMessage?: string; actionLabel?: string;
}) {
  return <Card mode={mode} title={c.advisoryTitle}>
    {photoLabel ? <Label mode={mode} heading>{photoLabel}</Label> : null}
    <Label mode={mode}>{capabilityLabel}</Label><Label mode={mode} tone="muted">{c.analysisPrivacy}</Label>
    <Action mode={mode} label={c.refreshCapabilities} disabled={busy} onPress={onRefreshCapabilities} />
    <Action mode={mode} label={actionLabel ?? c.analyze} tone="blue" disabled={busy || !canRequestAnalysis} onPress={onRequestAnalysisConsent} />
    {advisory ? <>
      <Label mode={mode} tone="warning">{advisory.statusLabel}</Label>
      <Label mode={mode}>{advisory.isOriginalLanguage === false ? c.assessmentText : c.modelResponse}</Label>
      {advisory.isOriginalLanguage !== false ? <Label mode={mode} tone="muted">{c.legacyAnalysis}</Label> : null}
      <Label mode={mode} selectable>{advisory.originalText}</Label>
    </> : emptyMessage ? <Label mode={mode} tone="muted">{emptyMessage}</Label> : null}
    <Label mode={mode} tone="muted">{c.advisoryNotice}</Label>
  </Card>;
}

export function ReportScreen(props: PageProps & {
  summary: SessionSummary | null; reportText: string | null; onRefresh: () => void; onShare: () => void;
}) {
  const { mode, copy: c, busy, summary } = props;
  return <Page {...props}>
    <Card mode={mode} title={c.report}>
      {summary ? <><Label mode={mode} selectable>{c.session}: {summary.id}</Label>
        <Label mode={mode}>{summary.statusLabel}</Label><Label mode={mode}>{summary.progressLabel}</Label></> : null}
      <Action mode={mode} label={c.refresh} disabled={busy || !summary} onPress={props.onRefresh} />
      {props.reportText !== null ? <Label mode={mode} selectable>{props.reportText}</Label> : <Label mode={mode} tone="muted">{c.noReport}</Label>}
      <Action mode={mode} label={c.share} tone="blue" disabled={busy || props.reportText === null} onPress={props.onShare} />
    </Card>
    <Card mode={mode}><Label mode={mode} tone="muted">{c.integrityNotice}</Label><Label mode={mode} tone="muted">{c.ragUnavailable}</Label></Card>
  </Page>;
}

export type VerifySelection = { source: 'current' | 'history'; id: string };
export function VerifyScreen(props: PageProps & {
  current: readonly EvidenceView[]; history: readonly EvidenceView[]; selection: VerifySelection | null;
  onSelect: (selection: VerifySelection) => void; onPickAndVerify: () => void; canVerify: boolean;
  result: { label: string; detail: string; tone: Tone } | null;
  onRefresh?: () => void; canRefresh?: boolean; onOpenSettings?: () => void;
}) {
  const { mode, copy: c, busy } = props;
  const groups = [ ['current', c.currentPhoto, props.current], ['history', c.evidenceHistory, props.history] ] as const;
  return <Page {...props}>
    <Card mode={mode} title={c.selectEvidence}>
      {props.onRefresh ? <Action mode={mode} label={c.refresh} disabled={busy || !props.canRefresh} onPress={props.onRefresh} /> : null}
      {props.onOpenSettings ? <Action mode={mode} label={c.openSettings} disabled={busy} onPress={props.onOpenSettings} /> : null}
      {!props.current.length && !props.history.length ? <Label mode={mode} tone="muted">{c.noEvidence}</Label> : null}
      {groups.map(([source, title, items]) => items.length ? <View key={source} style={styles.group}>
        <Label mode={mode} heading>{title}</Label>
        {items.map(item => <Action key={item.id} mode={mode} label={`${item.label} — ${item.timestampLabel}`}
          selected={props.selection?.source === source && props.selection.id === item.id} disabled={busy}
          onPress={() => props.onSelect({ source, id: item.id })}>
          <PhotoPreview mode={mode} copy={c} item={item} />
        </Action>)}
      </View> : null)}
      <Action mode={mode} primary icon="shield-checkmark-outline" label={c.pickVerify} tone="blue" disabled={busy || !props.canVerify || !props.selection} onPress={props.onPickAndVerify} />
      <Label mode={mode} tone="muted">{c.verifyHelp}</Label>
    </Card>
    {props.result ? <View accessibilityLiveRegion="polite"><Card mode={mode} title={props.result.label}>
      <Label mode={mode} tone={props.result.tone} selectable>{props.result.detail}</Label>
    </Card></View> : null}
    <Card mode={mode}><Label mode={mode} tone="muted">{c.integrityNotice}</Label></Card>
  </Page>;
}

export type LocalPhotoView = { id: string; label: string; statusLabel: string; detail: string; canShare: boolean };
export function LocalPhotosCard({ mode, copy: c, busy, photos, onRefresh, onShare, onRequestDelete }: Appearance & {
  busy: boolean; photos: readonly LocalPhotoView[]; onRefresh: () => void;
  onShare: (id: string) => void; onRequestDelete: () => void;
}) {
  return <Card mode={mode} title={c.localPhotos}>
    <Label mode={mode} tone="muted">{c.localHelp}</Label>
    <Action mode={mode} label={c.refreshLocal} disabled={busy} onPress={onRefresh} />
    {!photos.length ? <Label mode={mode} tone="muted">{c.noLocalPhotos}</Label> : null}
    {photos.map(photo => <View key={photo.id} style={styles.group}>
      <Label mode={mode} heading>{photo.label}</Label><Label mode={mode}>{photo.statusLabel}</Label>
      <Label mode={mode} selectable>{photo.detail}</Label>
      <Action mode={mode} label={c.shareOriginal} tone="blue" disabled={busy || !photo.canShare} onPress={() => onShare(photo.id)} />
    </View>)}
    <Action mode={mode} label={c.deleteLocal} tone="danger" disabled={busy || !photos.length} onPress={onRequestDelete} />
  </Card>;
}

export function SettingsScreen(props: PageProps & {
  language: Language; onLanguageChange: (language: Language) => void; onThemeChange: (mode: ThemeMode) => void;
  apiUrlDraft: string; onApiUrlDraftChange: (value: string) => void; canSaveApiUrl: boolean; onRequestSaveApiUrl: () => void;
  children?: ReactNode;
}) {
  const { mode, copy: c, busy } = props;
  const p = palettes[mode];
  return <Page {...props}>
    <Card mode={mode} title={c.language}>
      <View style={styles.options}>{(['vi', 'en'] as const).map(language => <Action key={language} mode={mode}
        label={language === 'vi' ? 'Tiếng Việt (VI)' : 'English (EN)'} selected={props.language === language}
        disabled={busy} onPress={() => props.onLanguageChange(language)} />)}</View>
    </Card>
    <Card mode={mode} title={c.themeMode}>
      <View style={styles.options}>{(['dark', 'light'] as const).map(theme => <Action key={theme} mode={mode} label={c[theme]}
        selected={mode === theme} disabled={busy} onPress={() => props.onThemeChange(theme)} />)}</View>
    </Card>
    <Card mode={mode} title={c.apiUrl}>
      <Label mode={mode} tone="muted">{c.apiHelp}</Label>
      <TextInput accessibilityLabel={c.apiUrl} value={props.apiUrlDraft} onChangeText={props.onApiUrlDraftChange}
        autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="URL" editable={!busy}
        style={[styles.input, { backgroundColor: p.inset, borderColor: p.border, color: p.text }]} />
      <Action mode={mode} label={c.save} disabled={busy || !props.canSaveApiUrl} onPress={props.onRequestSaveApiUrl} />
    </Card>
    {props.children}
    <Card mode={mode}><Label mode={mode} tone="muted">{c.ragUnavailable}</Label></Card>
  </Page>;
}

const styles = StyleSheet.create({
  shell: { flex: 1 }, body: { flex: 1 },
  header: { paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  brand: { flex: 1, minWidth: 120 }, brandLine: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  hero: { padding: 24, borderRadius: 24, gap: 16 }, heroTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  details: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  navigation: { borderTopWidth: 1, paddingHorizontal: 4, paddingVertical: 8, flexDirection: 'row', gap: 2, alignItems: 'stretch' },
  navItem: { flex: 1, minWidth: 48 }, navAction: { flex: 1, paddingHorizontal: 2, paddingVertical: 8, gap: 4, alignItems: 'center', borderRadius: 16, minHeight: 64 },
  navLabel: { fontSize: 11, lineHeight: 16 },
  content: { padding: 16, paddingBottom: 32, gap: 16, flexGrow: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', flexShrink: 1 }, text: { fontSize: 15, flexShrink: 1 },
  action: { minHeight: 48, minWidth: 48, padding: 12, borderWidth: 1, borderRadius: 10, justifyContent: 'center', alignItems: 'center', gap: 6 },
  inlineAction: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 6 },
  actionText: { fontSize: 15, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  busy: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  photo: { width: '100%', height: 200 },
  preview: { minHeight: 280, aspectRatio: 3 / 4, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  group: { gap: 10 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
});
