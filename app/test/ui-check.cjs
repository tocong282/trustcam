// Node-only type and presentation contract check; not a native renderer/device test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const appRequire = Module.createRequire(path.resolve(__dirname, '../package.json'));
const ts = appRequire('typescript');
const React = appRequire('react');
const appSource = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
// Exercise actual App response guard before verification state can be published.
const verificationGuard = appSource.match(/async function pickVerify\(\)[\s\S]*?const result = .*;\n([\s\S]*?)    setVerification/);
assert.ok(verificationGuard, 'Verification response guard must precede state update');
const validateVerification = new Function('result', verificationGuard[1]);
for (const result of ['PASS', 'FAIL']) for (const reason of ['integrity_verified', 'image_modified', 'signature_invalid']) {
  const response = {result, reason};
  if ((result === 'PASS') === (reason === 'integrity_verified')) assert.doesNotThrow(() => validateVerification(response));
  else assert.throws(() => validateVerification(response), /invalid_response/, `Reject contradictory ${result}/${reason}`);
}
for (const response of [{}, {result: 'OTHER', reason: 'integrity_verified'}, {result: 'PASS', reason: 'unknown'}, {result: 'FAIL', reason: null}]) {
  assert.throws(() => validateVerification(response), /invalid_response/);
}
for (const name of ['TrustcamShell', 'SessionScreen', 'CameraScreen', 'ChecklistScreen', 'ReportScreen', 'VerifyScreen', 'SettingsScreen', 'AdvisoryCard', 'LocalPhotosCard']) assert.match(appSource, new RegExp('<' + name + '\\b'), name + ' must be wired in actual App');
assert.match(appSource, /const THEME = 'trustcam.theme.v1'/);
assert.match(appSource, /SecureStore.getItemAsync\(THEME\)/);
assert.match(appSource, /SecureStore.setItemAsync\(THEME, next, storeOptions\)/);
assert.match(appSource, /setConnection\('checking'\)/);
assert.match(appSource, /setConnection\('online'\)/);
assert.match(appSource, /setConnection\('offline'\)/);
const configPath = path.join(__dirname, '../tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.resolve(__dirname, '..'));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => __dirname, getNewLine: () => '\n',
  }));
  process.exit(1);
}
console.log(`TypeScript ${ts.version}: ${parsed.fileNames.length} source files, 0 diagnostics`);

const native = Object.fromEntries(['ActivityIndicator', 'Image', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(n => [n, n]));
native.StyleSheet = { create: value => value, hairlineWidth: 0.5 };
const effects = [], stateUpdates = [], timings = [];
let contextReduced = true, motionListener, resolveMotion, removedMotion = 0, stateOverride;
const uiHooks = {...React,
  useState: initial => [stateOverride === undefined ? typeof initial === 'function' ? initial() : initial : stateOverride, next => stateUpdates.push(next)],
  useRef: current => ({current}), useEffect: effect => effects.push(effect), useContext: () => contextReduced,
};
native.AccessibilityInfo = {
  isReduceMotionEnabled: () => new Promise(resolve => {resolveMotion = resolve;}),
  addEventListener: (event, listener) => {assert.equal(event, 'reduceMotionChanged'); motionListener = listener; return {remove: () => removedMotion++};},
};
native.Easing = {quad: 'quad', out: value => value};
native.Animated = { View: 'Animated.View', Value: class {
  constructor(value) {this.value = value;} setValue(value) {this.value = value;} stopAnimation() {}
  interpolate(value) {return value;}
}, timing: (value, options) => {timings.push(options); return {start() {value.value = options.toValue;}, stop() {}};} };
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.join(__dirname, '../src/ui', name);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.require = id => id === 'react' ? uiHooks : id === '@expo/vector-icons/Ionicons' ? {__esModule: true, default: 'Ionicons'} : id === 'react-native' ? native : id === 'react-native-safe-area-context'
    ? { SafeAreaView: 'SafeAreaView' } : id === './theme' ? load('theme.ts') : id === '../locale' ? load('../locale.ts') : id === './core.ts' ? load('../core.ts') : appRequire(id);
  mod._compile(compiled, filename);
  cache.set(name, mod.exports);
  return mod.exports;
}
function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!React.isValidElement(element)) return [];
  if (typeof element.type === 'function') return nodes(element.type(element.props));
  return [element, ...nodes(element.props.children)];
}
function text(element) {
  if (Array.isArray(element)) return element.map(text).join('');
  if (React.isValidElement(element)) return text(element.props.children);
  return typeof element === 'string' || typeof element === 'number' ? String(element) : '';
}
assert.ok(fs.existsSync(path.join(__dirname, '../src/ui/copy.ts')), 'merged app copy missing');
const ui = load('screens.tsx');
assert.equal(typeof ui.DossierListScreen, 'function', 'Dossier-first list missing');
{
  const copy = load('copy.ts').appCopy.vi, opens = [];
  const props = {mode:'dark',copy,busy:false,title:'Hồ sơ',help:'Chỉ hồ sơ lưu trên thiết bị',emptyLabel:'Chưa có hồ sơ',dossiers:[{id:'s1',label:'Hồ sơ s1',detail:'Chưa tải',createdLabel:'Không rõ thời gian'},{id:'s2',label:'Hồ sơ s2',detail:'4/20',createdLabel:'TEST time'}],onOpen:id=>opens.push(id)};
  const tree = nodes(ui.DossierListScreen(props));
  assert.equal(opens.length,0,'List render does not fetch');
  tree.filter(n=>n.type==='Pressable').forEach(n=>n.props.onPress());
  assert.deepEqual(opens,['s1','s2']);
  assert.ok(tree.some(n=>n.type==='Text' && text(n)==='Chưa tải'),'Unknown counts stay unknown');
  nodes(ui.DossierListScreen({...props,busy:true})).filter(n=>n.type==='Pressable').forEach(n=>{assert.equal(n.props.disabled,true);n.props.onPress();});
  assert.equal(opens.length,2);
  const selections=[];
  const camera = nodes(ui.CameraScreen({mode:'dark',copy,busy:false,session:{id:'s',statusLabel:'',progressLabel:'4/20'},canCreate:false,onCreate:()=>{},hasCaptureTarget:false,targetLabel:'',cameraActive:false,canCapture:false,onCapture:()=>{},preview:null,flashEnabled:false,additionalLabel:'Thêm ảnh',additionalOptions:[{id:'wide_context',label:'Toàn cảnh'},{id:'damage_closeup',label:'Cận cảnh'}],onAdditional:id=>selections.push(id)}));
  camera.filter(n=>n.type==='Pressable' && n.props.accessibilityLabel.startsWith('Thêm ảnh:')).forEach(n=>n.props.onPress());
  assert.deepEqual(selections,['wide_context','damage_closeup']);
  const categories=nodes(ui.ChecklistScreen({mode:'dark',copy,busy:false,progressLabel:'5/20 · 4/4',statusLabel:'',current:[],history:[],canFinalize:true,onFinalize:()=>{},onRefresh:()=>{},onRetake:()=>{},onShareOriginal:()=>{},requiredCategories:[{label:'Toàn cảnh',complete:true},{label:'Cận cảnh',complete:false}]}));
  assert.ok(categories.some(n=>n.type==='Text' && text(n)==='✓ Toàn cảnh'));
  assert.ok(categories.some(n=>n.type==='Text' && text(n)==='— Cận cảnh'));
}
{
  const copy = load('copy.ts').appCopy.vi;
  let healthRefresh = 0;
  const home = nodes(ui.SessionScreen({mode: 'dark', copy, busy: false, connection: 'offline', serverLabel: '', session: null, onOpenCamera: () => {}, onResume: () => {}, onRefresh: () => healthRefresh++}));
  const refresh = home.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.refresh);
  assert.equal(refresh.props.disabled, false, 'Health retry must work without session');
  refresh.props.onPress(); assert.equal(healthRefresh, 1);
  const local = nodes(ui.LocalPhotosCard({mode: 'dark', copy, busy: false, photos: [], onRefresh: () => {}, onShare: () => {}, onRequestDelete: () => {}}));
  assert.equal(local.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.deleteLocal).props.disabled, true, 'No deletion action without owned photos');
}
// Preserved refresh and permission recovery actions must exist on Verify.
{
  const copy = load('copy.ts').appCopy.vi;
  let refreshes = 0, settings = 0;
  const tree = nodes(ui.VerifyScreen({mode: 'dark', copy, busy: false, current: [], history: [], selection: null, canVerify: false, result: null, onSelect: () => {}, onPickAndVerify: () => {}, onRefresh: () => refreshes++, canRefresh: true, onOpenSettings: () => settings++}));
  const refresh = tree.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.refresh);
  assert.ok(refresh, 'Verify refresh action lost'); refresh.props.onPress();
  const open = tree.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.openSettings);
  assert.ok(open, 'Verify Settings recovery lost'); open.props.onPress();
  assert.equal(refreshes, 1); assert.equal(settings, 1);
}
const { uiCopy } = load('theme.ts');
const { appCopy } = load('copy.ts');
const { messages } = load('../locale.ts');
for (const language of ['vi', 'en']) {
  for (const key of Object.keys(uiCopy[language])) assert.ok(appCopy[language][key]?.trim(), language + ': ' + key);
  for (const key of Object.keys(messages[language])) assert.equal(appCopy[language][key], messages[language][key], 'existing meaning must win: ' + key);
  assert.equal(appCopy[language].dark, uiCopy[language].dark);
  assert.equal(appCopy[language].light, uiCopy[language].light);
  assert.equal(appCopy[language].modelResponse, messages[language].modelResponse);
}
assert.deepEqual(Object.keys(appCopy.vi).sort(), Object.keys(appCopy.en).sort());
assert.match(appSource, /copy = appCopy\[lang\]/);
assert.deepEqual(Object.keys(uiCopy.vi).sort(), Object.keys(uiCopy.en).sort());
for (const copy of Object.values(uiCopy)) for (const value of Object.values(copy)) assert.ok(value.trim());
const noop = () => {};
// Compact top header preserves native safe areas, readable Settings and touch size.
for (const mode of ['dark', 'light']) for (const language of ['vi', 'en']) {
  const copy = appCopy[language], navigations = [];
  const tree = nodes(ui.TrustcamShell({mode, copy, subtitle: 'TEST_DUPLICATE_SUBTITLE', activeScreen: 'session', onNavigate: value => navigations.push(value), children: null}));
  assert.deepEqual(tree.find(n => n.type === 'SafeAreaView').props.edges, ['top', 'bottom', 'left', 'right']);
  assert.equal(tree.some(n => n.type === 'Text' && text(n) === 'TEST_DUPLICATE_SUBTITLE'), false, 'Top header omits redundant subtitle');
  assert.ok(tree.some(n => n.type === 'Text' && text(n) === 'TRUSTCAM'));
  const settings = tree.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.settings);
  assert.equal(settings.props.accessibilityRole, 'button');
  const style = Object.assign({}, ...settings.props.style({pressed: false}).filter(Boolean));
  assert.ok(style.minWidth >= 44 && style.minHeight >= 44, 'Settings retains touch minimum');
  assert.equal(style.flexDirection, 'row', 'Settings icon and label stay in one compact row');
  assert.ok(nodes(settings).some(n => n.type === 'Text' && text(n) === copy.settings));
  settings.props.onPress(); assert.deepEqual(navigations, ['settings']);
  const header = tree.find(n => n.type === 'View' && Array.isArray(n.props.style) && n.props.style[0]?.borderBottomWidth !== undefined);
  const headerStyle = header.props.style[0];
  assert.ok(headerStyle.paddingVertical <= 8);
  assert.equal(headerStyle.height, undefined, 'Allow large-text wrap, not fixed clipped header');
  assert.equal(headerStyle.flexWrap, 'wrap');
}

// Explicit test fixtures only; never shipped as session/evidence state.
const item = { id: 'TEST_CURRENT', label: 'TEST item', timestampLabel: 'TEST timestamp', hash: 'TEST_HASH', canRetake: true, canShareOriginal: true };
const old = { ...item, id: 'TEST_ARCHIVED' };
// Checklist photo choice changes selected ID, never starts model analysis.
for (const language of ['vi', 'en']) {
  const copy = appCopy[language], selected = [];
  const props = {mode: 'dark', copy, busy: false, progressLabel: '', statusLabel: '', current: [item, {...item, id: 'TEST_SECOND'}], history: [old], selectedId: item.id, onSelect: id => selected.push(id), canFinalize: false, onFinalize: noop, onRefresh: noop, onRetake: noop, onShareOriginal: noop};
  const choices = nodes(ui.ChecklistScreen(props)).filter(n => n.type === 'Pressable' && n.props.accessibilityState?.selected !== undefined);
  assert.equal(choices.length, 2, 'Only current evidence selectable for model review');
  assert.equal(choices.filter(n => n.props.accessibilityState.selected).length, 1);
  choices.forEach(choice => choice.props.onPress());
  assert.deepEqual(selected, [item.id, 'TEST_SECOND'], 'Same-label photos selected by exact ID');
  const locked = nodes(ui.ChecklistScreen({...props, busy: true})).filter(n => n.type === 'Pressable' && n.props.accessibilityState?.selected !== undefined);
  locked.forEach(choice => {assert.equal(choice.props.disabled, true); choice.props.onPress();});
  assert.equal(selected.length, 2);
}
// Missing/deleted/unreadable copies stay selectable and never prevent picker verification.
for (const language of ['vi', 'en']) {
  const copy = appCopy[language];
  const base = {mode: 'dark', copy, busy: false};
  const verifyProps = {...base, current: [item], history: [old], selection: {source: 'current', id: item.id}, canVerify: true, result: null, onSelect: noop, onPickAndVerify: noop};
  const checklistProps = {...base, progressLabel: '', statusLabel: '', current: [item], history: [old], canFinalize: false, onFinalize: noop, onRefresh: noop, onRetake: noop, onShareOriginal: noop};
  for (const tree of [nodes(ui.VerifyScreen(verifyProps)), nodes(ui.ChecklistScreen(checklistProps))]) {
    assert.equal(tree.filter(n => n.type === 'Image').length, 0);
    assert.equal(tree.filter(n => n.type === 'Text' && text(n) === copy.photoUnavailable).length, 2, 'Missing copies need explicit localized fallback');
  }
  const tree = nodes(ui.VerifyScreen(verifyProps));
  assert.equal(tree.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.pickVerify).props.disabled, false);
  const withUri = {...verifyProps, current: [{...item, imageUri: 'file:///owned/current.jpg'}], history: []};
  const image = nodes(ui.VerifyScreen(withUri)).find(n => n.type === 'Image');
  stateUpdates.length = 0;
  image.props.onError();
  assert.deepEqual(stateUpdates, [true], 'Image failure must update fallback state');
  stateOverride = true; effects.length = 0;
  const failed = nodes(ui.VerifyScreen(withUri));
  assert.equal(failed.filter(n => n.type === 'Image').length, 0);
  assert.ok(failed.some(n => n.type === 'Text' && text(n) === copy.photoUnavailable));
  stateUpdates.length = 0;
  effects.forEach(effect => effect());
  assert.ok(stateUpdates.includes(false), 'URI effect resets failure state for new image');
  stateOverride = undefined;
}
// Real photo previews share selection targets; same-label rows still select by ID.
for (const language of ['vi', 'en']) {
  const copy = appCopy[language];
  const base = {mode: 'dark', copy, busy: false};
  const current = {...item, imageUri: 'file:///owned/current.jpg'};
  const archived = {...old, imageUri: 'file:///owned/history.jpg'};
  let selections = [], picks = 0;
  const verifyProps = {...base, current: [current], history: [archived], selection: {source: 'history', id: old.id}, canVerify: true, result: null, onSelect: value => selections.push(value), onPickAndVerify: () => picks++};
  for (const tree of [
    nodes(ui.VerifyScreen(verifyProps)),
    nodes(ui.ChecklistScreen({...base, progressLabel: '', statusLabel: '', current: [current], history: [archived], canFinalize: false, onFinalize: noop, onRefresh: noop, onRetake: noop, onShareOriginal: noop})),
  ]) {
    const images = tree.filter(n => n.type === 'Image');
    assert.deepEqual(images.map(n => n.props.source), [{uri: current.imageUri}, {uri: archived.imageUri}], 'Current and history must display local photo bytes');
    for (const image of images) {
      assert.equal(image.props.accessible, true);
      assert.equal(image.props.accessibilityLabel, `${copy.photoPreview}: ${item.label}`);
      assert.equal(image.props.resizeMode, 'contain');
      assert.equal(image.props.style.width, '100%');
      assert.ok(image.props.style.height > 0 && image.props.style.height <= 240);
    }
  }
  const tree = nodes(ui.VerifyScreen(verifyProps));
  const choices = tree.filter(n => n.type === 'Pressable' && n.props.accessibilityState?.selected !== undefined);
  assert.equal(choices.length, 2);
  assert.equal(choices.filter(n => n.props.accessibilityState.selected).length, 1);
  for (const choice of choices) {
    assert.equal(nodes(choice).filter(n => n.type === 'Image').length, 1, 'Preview must be inside selection target');
    assert.equal(choice.props.accessibilityLabel, `${item.label} — ${item.timestampLabel}`);
    choice.props.onPress();
  }
  assert.deepEqual(selections, [{source: 'current', id: item.id}, {source: 'history', id: old.id}]);
  assert.equal(picks, 0, 'Render and selection must not pick or verify');
  const locked = nodes(ui.VerifyScreen({...verifyProps, busy: true})).filter(n => n.type === 'Pressable' && n.props.accessibilityState?.selected !== undefined);
  for (const choice of locked) { assert.equal(choice.props.disabled, true); choice.props.onPress(); }
  assert.equal(selections.length, 2, 'Busy selection callback must be guarded');
}

for (const mode of ['dark', 'light']) for (const language of ['vi', 'en']) {
  const copy = appCopy[language];
  const base = { mode, copy, busy: false };
  const lockedShell = nodes(ui.TrustcamShell({ ...base, subtitle: '', activeScreen: 'session', navigationDisabled: true, onNavigate: noop, children: null }));
  assert.ok(lockedShell.filter(n => n.type === 'Pressable' && n.props.accessibilityRole === 'tab').every(n => n.props.disabled), 'Busy shell must expose disabled navigation');
  const cases = [
    ['SessionScreen', { connection: 'unknown', serverLabel: '', session: null, onOpenCamera: noop, onResume: noop, onRefresh: noop }],
    ['CameraScreen', { hasCaptureTarget: false, session: null, canCreate: true, onCreate: noop, targetLabel: '', preview: null, cameraActive: false, canCapture: false, flashEnabled: false, onCapture: noop }],
    ['ChecklistScreen', { progressLabel: '', statusLabel: '', current: [], history: [], canFinalize: false, onFinalize: noop, onRefresh: noop, onRetake: noop, onShareOriginal: noop }],
    ['ReportScreen', { summary: null, reportText: null, onRefresh: noop, onShare: noop }],
    ['VerifyScreen', { current: [], history: [], selection: null, canVerify: false, result: null, onSelect: noop, onPickAndVerify: noop }],
    ['SettingsScreen', { language, apiUrlDraft: '', canSaveApiUrl: false, onLanguageChange: noop, onThemeChange: noop, onApiUrlDraftChange: noop, onRequestSaveApiUrl: noop }],
  ];
  for (const [name, props] of cases) assert.ok(nodes(ui[name]({ ...base, ...props })).length, name);
  const shell = nodes(ui.TrustcamShell({ ...base, subtitle: '', activeScreen: 'session', onNavigate: noop, children: null }));
  const bottomTabs = shell.filter(n => n.type === 'Pressable' && n.props.accessibilityRole === 'tab');
  assert.equal(bottomTabs.length, 5, 'Five fixed bottom destinations; Settings belongs in header');
  assert.equal(shell.some(n => n.type === 'ScrollView' && n.props.horizontal), false);
  const destinations = ['session', 'checklist', 'camera', 'report', 'verify'];
  const labels = [copy.sessionTab, copy.checklistTab, copy.captureTab, copy.reportTab, copy.verifyTab];
  for (const activeScreen of [...destinations, 'settings']) {
    const calls = [];
    const navTree = nodes(ui.TrustcamShell({...base, subtitle: '', activeScreen, onNavigate: value => calls.push(value), children: null}));
    const tabs = navTree.filter(n => n.type === 'Pressable' && n.props.accessibilityRole === 'tab');
    tabs.forEach((tab, i) => {
      assert.equal(tab.props.accessibilityLabel, labels[i]);
      assert.equal(tab.props.accessibilityState.selected, activeScreen === destinations[i]);
      if (activeScreen === destinations[i]) {
        const labelText = nodes(tab).find(n => n.type === 'Text');
        assert.ok(JSON.stringify(labelText.props.style).includes('underline'), 'Selected destination needs visible marker including Capture');
      }
      tab.props.onPress();
    });
    const gear = navTree.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.settings);
    assert.equal(gear.props.accessibilityRole, 'button');
    assert.equal(gear.props.accessibilityState.selected, activeScreen === 'settings');
    gear.props.onPress();
    assert.deepEqual(calls, [...destinations, 'settings']);
  }
  assert.equal(lockedShell.filter(n => n.type === 'Pressable').length, 6);
  assert.ok(lockedShell.filter(n => n.type === 'Pressable').every(n => n.props.disabled));
  assert.equal(shell.filter(n => n.type === 'Ionicons').length >= 6, true, 'Bundled icons required');
  let openedCamera = 0;
  const hero = nodes(ui.SessionScreen({...base, connection: 'unknown', serverLabel: '', session: null, onOpenCamera: () => openedCamera++, onResume: noop, onRefresh: noop}));
  assert.equal(hero.some(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.createSession), false, 'Home must not create sessions');
  hero.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.captureTab).props.onPress();
  assert.equal(openedCamera, 1, 'Home opens Camera without creating');
  assert.ok(hero.some(n => n.type === 'Text' && text(n).includes(copy.startHelp)), 'Empty session needs friendly next step');
  let nextSteps = 0, settingsOpened = 0;
  const readyHome = nodes(ui.SessionScreen({...base, connection: 'offline', serverLabel: 'https://test.invalid', session: {id: 'TEST', statusLabel: 'TEST collecting', progressLabel: 'TEST 1 / 3'}, onOpenCamera: noop, onResume: () => nextSteps++, onRefresh: noop, onOpenSettings: () => settingsOpened++}));
  readyHome.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.resume).props.onPress();
  const homeSettings = readyHome.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.settings);
  assert.ok(homeSettings, 'Home connection recovery needs direct Settings callback'); homeSettings.props.onPress();
  assert.equal(nextSteps, 1); assert.equal(settingsOpened, 1);
  const nextChecklist = nodes(ui.ChecklistScreen({...base, progressLabel: 'TEST 1 / 3', statusLabel: '', current: [], history: [], canFinalize: false, onFinalize: noop, onRefresh: noop, onRetake: noop, onShareOriginal: noop, nextLabel: 'TEST next required photo', onContinue: () => nextSteps++}));
  assert.ok(nextChecklist.some(n => n.type === 'Text' && text(n).includes('TEST next required photo')));
  nextChecklist.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.captureTab).props.onPress();
  assert.equal(nextSteps, 2);
  const primary = hero.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.captureTab);
  assert.ok(JSON.stringify(primary.props.style({pressed: false})).includes(load('theme.ts').palettes[mode].primary), 'Open Camera action must be filled');
  let creates = 0, permissions = 0;
  const emptyCamera = { ...base, hasCaptureTarget: false, session: null, canCreate: true, onCreate: () => creates++, targetLabel: '', preview: null, cameraActive: false, canCapture: false, flashEnabled: false, onCapture: noop, onRequestPermission: () => permissions++ };
  const camera = nodes(ui.CameraScreen(emptyCamera));
  assert.equal(creates + permissions, 0, 'Rendering Camera must not create or ask permission');
  const create = camera.filter(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.createSession);
  assert.equal(create.length, 1, 'Empty Camera owns one create action, before permission');
  assert.equal(create[0].props.disabled, false);
  assert.ok(JSON.stringify(create[0].props.style({pressed: false})).includes(load('theme.ts').palettes[mode].primary));
  create[0].props.onPress(); assert.equal(creates, 1); assert.equal(permissions, 0);
  assert.ok(camera.some(n => n.type === 'Text' && text(n).includes(copy.cameraStartHelp)));
  assert.equal(camera.some(n => n.props.accessibilityLabel === copy.shutter || n.props.accessibilityLabel === copy.cameraPreview || n.props.accessibilityLabel === copy.grantCamera), false, 'No inactive camera controls before creating');
  for (const blocked of [{busy: true}, {canCreate: false}]) {
    const tree = nodes(ui.CameraScreen({...emptyCamera, ...blocked}));
    const action = tree.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.createSession);
    assert.equal(action.props.disabled, true); action.props.onPress(); assert.equal(creates, 1);
  }
  let reviewed = 0, restored = 0;
  const sessionCamera = { ...emptyCamera, hasCaptureTarget: true, session: {id: 'TEST', statusLabel: 'TEST collecting', progressLabel: 'TEST 1/4'} };
  const collecting = nodes(ui.CameraScreen(sessionCamera));
  const newSession = collecting.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.createSession);
  assert.ok(newSession, 'Camera must retain explicit new-session action for existing session');
  assert.ok(!JSON.stringify(newSession.props.style({pressed: false})).includes(load('theme.ts').palettes[mode].primary), 'Replacement is secondary');
  newSession.props.onPress(); assert.equal(creates, 2);
  assert.ok(collecting.some(n => n.type === 'Text' && text(n) === 'TEST 1/4'));
  assert.ok(collecting.some(n => n.type === 'Text' && text(n).includes('TEST collecting')));
  let captures = 0;
  const readyCamera = nodes(ui.CameraScreen({...sessionCamera, cameraActive: true, canCapture: true, preview: React.createElement('TEST_PREVIEW'), onCapture: () => captures++}));
  assert.equal(captures, 0);
  assert.ok(readyCamera.some(n => n.type === 'TEST_PREVIEW'));
  readyCamera.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.shutter).props.onPress(); assert.equal(captures, 1);
  const permissionAction = collecting.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.grantCamera);
  permissionAction.props.onPress(); assert.equal(permissions, 1, 'Permission recovery remains available for real target');
  assert.equal(readyHome.some(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.createSession), false);
  for (const reviewLabel of [copy.checklistTab, copy.reportTab]) {
    const reviewTree = nodes(ui.CameraScreen({...sessionCamera, hasCaptureTarget: false, reviewLabel, onReview: () => reviewed++}));
    assert.equal(reviewTree.some(n => n.props.accessibilityLabel === copy.shutter || n.props.accessibilityLabel === copy.cameraPreview), false, 'Complete/finalized Camera must not dead-end at disabled shutter');
    reviewTree.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === reviewLabel).props.onPress();
    const lockedReview = nodes(ui.CameraScreen({...sessionCamera, busy: true, hasCaptureTarget: false, reviewLabel, onReview: () => reviewed++}));
    lockedReview.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === reviewLabel).props.onPress();
  }
  assert.equal(reviewed, 2);
  const restoreTree = nodes(ui.CameraScreen({...sessionCamera, hasCaptureTarget: false, onRefresh: () => restored++, error: 'TEST load error'}));
  assert.ok(restoreTree.some(n => n.type === 'Text' && text(n).includes('TEST load error')));
  restoreTree.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.refresh).props.onPress(); assert.equal(restored, 1);
  const progress = nodes(ui.ChecklistScreen({...base, progressLabel: 'TEST 1 / 3', statusLabel: 'TEST collecting', current: [item], history: [], canFinalize: false, onFinalize: noop, onRefresh: noop, onRetake: noop, onShareOriginal: noop}));
  assert.ok(progress.some(n => n.type === 'Text' && text(n) === 'TEST 1 / 3'), 'Use real supplied progress, not invented counters');
  assert.ok(progress.some(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.showDetails), 'Long proof metadata collapsible');
  assert.ok(!progress.some(n => n.type === 'Text' && text(n).includes('TEST_HASH')), 'Long hash hidden until detail expansion');
  assert.ok(shell.filter(n => n.type === 'Pressable').every(n => n.props.accessibilityLabel));
  const verify = nodes(ui.VerifyScreen({ ...base, current: [item], history: [old], selection: { source: 'history', id: old.id }, canVerify: true, result: null, onSelect: noop, onPickAndVerify: noop }));
  assert.equal(verify.filter(n => n.type === 'Pressable' && n.props.accessibilityState.selected).length, 1);
  const disabled = nodes(ui.CameraScreen({ ...base, hasCaptureTarget: true, session: {id: 'TEST', statusLabel: '', progressLabel: ''}, canCreate: true, onCreate: noop, targetLabel: '', preview: null, cameraActive: false, canCapture: true, flashEnabled: false, onCapture: noop }));
  assert.equal(disabled.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.shutter).props.disabled, true);
  const composition = nodes(ui.ChecklistScreen({ ...base, progressLabel: '', statusLabel: '', current: [], history: [], canFinalize: false, onFinalize: noop, onRefresh: noop, onRetake: noop, onShareOriginal: noop, children: React.createElement('AdvisorySlot', { marker: 'TEST_ADVISORY' }) }));
  assert.ok(composition.some(n => n.type === 'AdvisorySlot'), 'Checklist must render parent advisory slot');
  let retakeId;
  const checklist = nodes(ui.ChecklistScreen({ ...base, progressLabel: '', statusLabel: '', current: [item], history: [old], canFinalize: false, onFinalize: noop, onRefresh: noop, onRetake: id => { retakeId = id; }, onShareOriginal: noop }));
  const retakes = checklist.filter(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.retake);
  assert.equal(retakes.length, 1);
  retakes[0].props.onPress();
  assert.equal(retakeId, item.id);
  let requests = 0;
  const advisory = nodes(ui.AdvisoryCard({ ...base, capabilityLabel: '', canRequestAnalysis: true, onRequestAnalysisConsent: () => requests++, onRefreshCapabilities: noop }));
  advisory.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.analyze).props.onPress();
  assert.equal(requests, 1);
  const legacyAdvisory = nodes(ui.AdvisoryCard({...base, capabilityLabel: '', canRequestAnalysis: true, onRequestAnalysisConsent: noop, onRefreshCapabilities: noop, advisory: {statusLabel: 'TEST status', originalText: 'TEST legacy reason'}}));
  assert.ok(legacyAdvisory.some(n => n.type === 'Text' && text(n) === copy.legacyAnalysis), 'Legacy reason must be marked as not translated');
  const bilingualAdvisory = nodes(ui.AdvisoryCard({...base, capabilityLabel: '', canRequestAnalysis: true, onRequestAnalysisConsent: noop, onRefreshCapabilities: noop, advisory: {statusLabel: 'TEST status', originalText: 'TEST localized reason', isOriginalLanguage: false}}));
  assert.equal(bilingualAdvisory.some(n => n.type === 'Text' && text(n) === copy.legacyAnalysis), false, 'Bilingual reason must not be marked original-only');
  assert.ok(bilingualAdvisory.some(n => n.type === 'Text' && text(n) === copy.assessmentText));
  assert.equal(bilingualAdvisory.some(n => n.type === 'Text' && text(n) === copy.modelResponse), false, 'Generated bilingual text must not claim raw original');
  let shares = 0, deletes = 0;
  const local = nodes(ui.LocalPhotosCard({ ...base, photos: [{ id: 'TEST_LOCAL', label: '', statusLabel: '', detail: '', canShare: true }], onRefresh: noop, onShare: id => { assert.equal(id, 'TEST_LOCAL'); shares++; }, onRequestDelete: () => deletes++ }));
  assert.equal(shares + deletes, 0, 'Rendering must not perform local actions');
  local.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.shareOriginal).props.onPress();
  local.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.deleteLocal).props.onPress();
  assert.equal(shares, 1);
  assert.equal(deletes, 1);
  const report = nodes(ui.ReportScreen({ ...base, summary: null, reportText: null, onRefresh: noop, onShare: noop }));
  assert.ok(report.some(n => n.type === 'Text' && text(n).includes(copy.ragUnavailable)));
}
// Run actual motion hook/effect/press callbacks with host doubles, not native animation frames.
async function checkMotion() {
  const copy = appCopy.en;
  for (const reduced of [true, false]) {
    contextReduced = reduced; stateOverride = reduced; effects.length = 0; timings.length = 0;
    const tree = nodes(ui.TrustcamShell({mode: 'dark', copy, subtitle: '', activeScreen: 'camera', onNavigate: noop, children: null}));
    const cleanups = effects.map(effect => effect());
    const capture = tree.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === copy.captureTab);
    capture.props.onPressIn(); capture.props.onPressOut();
    if (reduced) assert.equal(timings.length, 0, 'Reduced motion must change immediately without timing');
    else {
      assert.ok(timings.some(timing => timing.toValue === 0.98 && timing.duration === 150));
      assert.ok(timings.some(timing => timing.toValue === 1 && timing.duration === 180), 'Screen entrance should fade over 180ms');
      assert.ok(timings.every(timing => timing.useNativeDriver === true && timing.duration <= 200));
    }
    stateUpdates.length = 0;
    motionListener(true); resolveMotion(false); await Promise.resolve();
    assert.deepEqual(stateUpdates, [true], 'Late initial promise must not override newer preference change');
    stateUpdates.length = 0;
    const removed = removedMotion;
    cleanups.forEach(cleanup => cleanup?.());
    assert.equal(removedMotion, removed + 1, 'Motion subscription cleanup required');
    motionListener(false); await Promise.resolve();
    assert.deepEqual(stateUpdates, [], 'Unmounted listeners must not update state');
  }
  contextReduced = true; stateOverride = undefined;
  console.log('PASS reduced motion: immediate stillness, enabled press scale, native driver, preference event/promise race, unmount cleanup (host mocks)');
}
checkMotion().catch(error => {console.error(error); process.exitCode = 1;});
// Exercise actual App JSX composition with explicit state fixtures; effects/native IO do not run.
// This is structural Node checking, not a React/native renderer.
const { appCopy: mergedCopy } = load('copy.ts');
const entries = [
  { evidence_id: '00000000-0000-4000-8000-000000000001', slot: 'wide_context', captured_at: '2026-11-14T00:00:00.000Z', sha256: 'ab'.repeat(32), signature: 'cd'.repeat(64), public_key: 'ef'.repeat(32), analysis: {status: 'retake', reason: 'TEST original model reason'} },
  { evidence_id: '00000000-0000-4000-8000-000000000002', slot: 'wide_context', captured_at: '2026-11-13T00:00:00.000Z', sha256: '12'.repeat(32), signature: '34'.repeat(64), public_key: 'ef'.repeat(32), analysis: null },
];
const screenNames = {session: ui.SessionScreen, camera: ui.CameraScreen, checklist: ui.ChecklistScreen, report: ui.ReportScreen, verify: ui.VerifyScreen, settings: ui.SettingsScreen};
function fixtureApp(screen, language, mode, finalized = false, options = {}) {
  let index = 0;
  const updates = [];
  const session = {session_id: 'TEST_SESSION', status: finalized ? 'finalized' : 'collecting', next_action: {type: 'capture', slot: 'damage_closeup'}, evidence: [entries[0]], evidence_history: [entries[1]]};
  const states = [language, 'vi-VN', 'https://example.com', 'https://example.com', '', {session_id: 'TEST_SESSION', token: 'TEST_TOKEN', device_id: entries[0].public_key}, session, null, screen === 'checklist' ? entries[0].evidence_id : entries[1].evidence_id, null, [], [], null, '1920x1080', screen, mode, 'offline', false, true, '', true, true, true];
  states.push({base:'https://example.com',credentials:states[5],dossiers:[{...states[5],base:'https://example.com',created_at:null}]}, true, null, {});
  for (const [index, value] of Object.entries(options.states ?? {})) states[index] = value;
  const hooks = {
    useState: initial => { const i = index++; const value = i < states.length ? states[i] : typeof initial === 'function' ? initial() : initial; return [value, next => updates.push([i, next])]; },
    useRef: current => ({current}), useEffect: () => {},
  };
  const filename = path.join(__dirname, '../App.tsx');
  const compiled = ts.transpileModule(appSource, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.require = id => {
    if (id === 'react') return hooks;
    if (id === 'react-native') return {...native, Alert: {alert: options.alert ?? ((title,message,buttons)=>buttons.find(button=>button.text===mergedCopy[language].continueAction)?.onPress())}, AppState: {currentState: 'active'}};
    if (id === 'react-native-safe-area-context') return {SafeAreaProvider: 'SafeAreaProvider'};
    if (id === 'expo-status-bar') return {StatusBar: 'StatusBar'};
    if (id === 'expo-camera') return {CameraView: 'CameraView', useCameraPermissions: () => [options.permission ?? {granted: true}, noop, noop]};
    if (id === 'expo-localization') return {getLocales: () => []};
    if (id === 'expo-secure-store') return options.secureStore ?? {};
    if (id.startsWith('expo-')) return {};
    if (id === './src/signing') return options.signing ?? {};
    if (id === './src/api') return options.api ?? {};
    if (id === './src/ui/screens') return ui;
    if (id === './src/ui/theme') return load('theme.ts');
    if (id === './src/ui/copy') return {appCopy: mergedCopy};
    if (id === './src/locale') return load('../locale.ts');
    if (id === './src/responses') return load('../responses.ts');
    if (id === './src/dossiers') return load('../dossiers.ts');
    if (id === './src/core') return load('../core.ts');
    if (id === './src/localPhotos') return load('../localPhotos.ts');
    if (id === './src/photoStorage') return {photoFile: name => {
      assert.equal(load('../localPhotos.ts').ownedPhotoName(name), true, 'Only owned filenames reach local preview lookup');
      if (options.fileError) throw new Error('storage_error');
      return {exists: options.existingNames?.includes(name) ?? false, uri: 'file:///owned/' + name};
    }};
    if (id.startsWith('./src/')) return {};
    return appRequire(id);
  };
  mod._compile(compiled, filename);
  const element = mod.exports.default();
  function rawNodes(value) {
    if (Array.isArray(value)) return value.flatMap(rawNodes);
    return React.isValidElement(value) ? [value, ...rawNodes(value.props.children)] : [];
  }
  return {tree: rawNodes(element), updates};
}
// Canonical SecureStore mutation is exercised through real App callbacks with failing native IO.
async function checkDossierActions() {
  const base='https://example.com', key=entries[0].public_key;
  const old={session_id:'TEST_SESSION',token:'TEST_TOKEN',device_id:key};
  const second={session_id:'TEST_SECOND',token:'TEST_SECOND_TOKEN',device_id:key};
  const preferences={base,credentials:old,dossiers:[{...old,base,created_at:null},{...second,base,created_at:null}]};
  const flush=async()=>{for(let n=0;n<30;n++) await Promise.resolve();};
  for (const fail of [true,false]) {
    const events=[];
    const {tree,updates}=fixtureApp('checklist','vi','dark',false,{states:{4:'ab'.repeat(32),23:preferences,24:false},
      secureStore:{setItemAsync:async(name,value)=>{events.push(['persist',JSON.parse(value)]);if(fail)throw new Error('native failure');}},
      signing:{publicKeyHex:()=>key}, api:{request:async(host,path,token)=>{events.push(['request',host,path,token]);throw new Error('network_error');}}});
    tree.find(n=>n.type===ui.DossierListScreen).props.onOpen(second.session_id); await flush();
    assert.equal(events[0][0],'persist');
    assert.equal(events[0][1].dossiers.length,2,'Select retains old credentials');
    if(fail) {
      assert.equal(events.length,1,'No request if secure persist fails');
      assert.equal(updates.some(([i])=>[5,6,7,8,9,12,24,25].includes(i)),false,'No reference reset on save failure');
    } else {
      assert.deepEqual(events[1],['request',base,'/session/TEST_SECOND',second.token]);
      assert.ok(updates.some(([i,v])=>i===5 && v.session_id===second.session_id));
      assert.ok(updates.some(([i,v])=>i===24 && v===true),'Load failure retains chosen detail/retry');
    }
  }
  for(const action of ['create','host']) for(const fail of [true,false]) {
    const events=[];
    const start={...preferences,dossiers:[preferences.dossiers[0]]};
    const {tree,updates}=fixtureApp(action==='create'?'camera':'settings','vi','dark',false,{states:{3:'https://other.example',4:'ab'.repeat(32),23:start},
      secureStore:{setItemAsync:async(name,value)=>{events.push(['persist',JSON.parse(value)]);if(fail)throw new Error('native failure');}},signing:{publicKeyHex:()=>key},
      api:{request:async(host,path,token)=>{events.push(['request',host,path,token]);if(path==='/session')return {...second,next_action:{type:'capture',slot:'wide_context'}};throw new Error('network_error');}}});
    if(action==='create')tree.find(n=>n.type===ui.CameraScreen).props.onCreate();
    else tree.find(n=>n.type===ui.SettingsScreen).props.onRequestSaveApiUrl();
    await flush();
    const persisted=events.find(event=>event[0]==='persist')[1];
    assert.equal(persisted.dossiers[0].token,old.token,'Old bearer retained when creating/changing host');
    if(fail) assert.equal(updates.some(([i])=>[2,5,6,7,8,9,12,24,25].includes(i)),false,'Failed storage never resets working session');
    else if(action==='host') {
      assert.equal(persisted.credentials,null);
      assert.equal(persisted.base,'https://other.example');
      assert.equal(events.some(event=>event[0]==='request' && event[1]==='https://other.example' && event[3]),false,'Host check has no bearer');
    } else {
      assert.equal(persisted.dossiers.length,2);
      assert.equal(persisted.credentials.session_id,second.session_id);
      assert.ok(updates.some(([i,v])=>i===5 && v.session_id===second.session_id));
    }
  }
  console.log('PASS actual App dossier selection/create/API-save persistence failures, retained old references, chosen retry state, host isolation (native IO doubles)');
}
checkDossierActions().catch(error=>{console.error(error);process.exitCode=1;});
// Enterprise consent belongs to selected dossier detail; rendering never grants access.
for (const language of ['vi','en']) {
  const {tree,updates} = fixtureApp('checklist',language,'dark');
  const share = tree.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === load('../locale.ts').messages[language].shareEnterprise);
  assert.ok(share, 'Explicit enterprise share action missing from selected dossier detail');
  assert.equal(updates.length,0,'Opening detail never shares');
}
async function checkEnterpriseConsent() {
  const {createServer} = require('node:http');
  const wire = [];
  let outcome = 'ok';
  const server = createServer(async (req,res) => {
    const chunks=[]; for await (const chunk of req) chunks.push(chunk);
    wire.push({method:req.method,path:req.url,token:req.headers.authorization,body:Buffer.concat(chunks).toString(),contentType:req.headers['content-type']});
    res.setHeader('Content-Type','application/json');
    if (outcome === 'unauthorized') {res.statusCode=401;res.end(JSON.stringify({detail:'invalid_token'}));return;}
    if (outcome === 'unavailable') {res.statusCode=503;res.end(JSON.stringify({detail:'dashboard_disabled'}));return;}
    if (outcome === 'invalid') {res.end(JSON.stringify({shared:true}));return;}
    res.end(JSON.stringify(req.method==='POST' ? {shared:true,shared_at:'2026-11-14T00:00:00Z'} : {shared:false}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const auth={session_id:'selected/id',token:'fixture-selected-token',device_id:entries[0].public_key};
  const other={...auth,session_id:'other',token:'fixture-other-token'};
  const preferences={base,credentials:auth,dossiers:[{...auth,base,created_at:null},{...other,base,created_at:null}]};
  const original=JSON.stringify(preferences);
  const session={session_id:auth.session_id,status:'collecting',next_action:{type:'capture',slot:'wide_context'},evidence:[],evidence_history:[]};
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));for(let n=0;n<60;n++)await new Promise(resolve=>setTimeout(resolve,2));};
  try {
    for (const language of ['vi','en']) {
      const messages=load('../locale.ts').messages[language];
      for(const word of language==='vi' ? ['ảnh','lịch sử','báo cáo','chưa hỗ trợ thu hồi'] : ['images','history','report','does not support revoking']) assert.ok(messages.enterprisePrivacy.includes(word));
      let answer='cancel', dialogs=0;
      const options={states:{2:base,5:auth,6:session,23:preferences},api:load('../api.ts'),alert:(title,message,buttons,config)=>{
        dialogs++; assert.equal(title,messages.shareEnterprise); assert.ok(message.includes(messages.enterprisePrivacy)); assert.ok(message.includes(base+'\n'+auth.session_id)); assert.equal(message.includes(auth.token),false);
        if(answer==='dismiss')config.onDismiss(); else buttons.find(b=>b.text===messages[answer==='cancel'?'cancel':'confirmEnterprise']).onPress();
      }};
      const {tree,updates}=fixtureApp('checklist',language,'dark',false,options);
      const action=tree.find(n=>n.type==='Pressable' && n.props.accessibilityLabel===messages.shareEnterprise);
      const status=tree.find(n=>n.type==='Pressable' && n.props.accessibilityLabel===messages.enterpriseStatus);
      let count=wire.length;
      assert.equal(dialogs,0,'Render cannot ask consent or share');
      action.props.onPress(); await flush(); assert.equal(wire.length,count,'Cancel sends nothing');
      answer='dismiss';action.props.onPress();await flush();assert.equal(wire.length,count,'Dismiss sends nothing');
      answer='agree'; outcome='ok'; action.props.onPress(); action.props.onPress(); await flush();
      assert.equal(wire.length,count+1,'Busy lock prevents double grant');
      assert.deepEqual(wire.at(-1),{method:'POST',path:'/session/selected%2Fid/share-enterprise',token:'Bearer '+auth.token,body:'{"consent":true}',contentType:'application/json'});
      assert.ok(updates.some(([i,v])=>i===27 && v?.shared===true),'Only server response marks shared');
      count=wire.length; const beforeDialogs=dialogs; status.props.onPress();await flush();
      assert.equal(dialogs,beforeDialogs,'GET does not ask consent'); assert.equal(wire.length,count+1); assert.equal(wire.at(-1).method,'GET');assert.equal(wire.at(-1).body,'');assert.equal(wire.at(-1).token,'Bearer '+auth.token);
      for(const [failure,expected] of [['unauthorized','enterprise_auth_unavailable'],['unavailable','enterprise_unavailable'],['invalid','invalid_response']]) {
        outcome=failure;updates.length=0;action.props.onPress();await flush();assert.ok(updates.some(([i,v])=>i===19 && v===expected));assert.equal(updates.some(([i,v])=>i===27 && v?.shared),false);
        outcome='ok';updates.length=0;action.props.onPress();await flush();assert.ok(updates.some(([i,v])=>i===27 && v?.shared),'Explicit retry succeeds');
      }
      const retryApi={request:async()=>{throw new Error('network_error');}};
      const transport=fixtureApp('checklist',language,'dark',false,{...options,api:retryApi});
      const retry=transport.tree.find(n=>n.type==='Pressable' && n.props.accessibilityLabel===messages.shareEnterprise);
      retry.props.onPress();await flush();assert.ok(transport.updates.some(([i,v])=>i===19 && v==='network_error'));
      retryApi.request=async()=>({shared:true,shared_at:'2026-11-14T00:00:00Z'});
      transport.updates.length=0;retry.props.onPress();await flush();assert.ok(transport.updates.some(([i,v])=>i===27 && v?.shared),'Transport failure unlocks explicit retry');
      assert.equal(JSON.stringify(preferences),original,'Consent never rewrites saved dossiers');
      for(const states of [{23:{...preferences,credentials:other}},{23:{...preferences,dossiers:preferences.dossiers.map(d=>({...d,base:'https://other.example'}))}},{6:{...session,session_id:'wrong'}}]) {
        count=wire.length;const fixture=fixtureApp('checklist',language,'dark',false,{...options,states:{...options.states,...states}});
        fixture.tree.find(n=>n.type==='Pressable' && n.props.accessibilityLabel===messages.shareEnterprise).props.onPress();await flush();
        assert.equal(wire.length,count,'Wrong selected server/session credentials never reach transport');
        assert.ok(fixture.updates.some(([i,v])=>i===19 && v==='not_ready'));
      }
      for (const screen of ['session','camera','settings']) assert.equal(fixtureApp(screen,language,'dark').tree.some(n=>n.type==='Pressable' && n.props.accessibilityLabel===messages.shareEnterprise),false,'Share only in selected dossier detail');
    }
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  console.log('PASS App enterprise VI/EN consent cancel/dismiss, exact POST JSON and selected bearer scope, GET status, busy lock, auth/unavailable/malformed errors and explicit retry; real HTTP against isolated Node test server, not live backend/native');
}
checkEnterpriseConsent().catch(error=>{console.error(error);process.exitCode=1;});
// Tab entry always lists local dossiers; detail Back retains working credentials/session.
for (const screen of ['checklist','report','verify']) {
  const {tree,updates} = fixtureApp(screen,'vi','dark',false,{states:{24:false}});
  const list = tree.find(n=>n.type===ui.DossierListScreen);
  assert.ok(list,'Tab must show dossier list before detail: '+screen);
  assert.equal(tree.some(n=>n.type===screenNames[screen]),false);
  assert.equal(list.props.dossiers.length,1);
  assert.equal(JSON.stringify(list.props).includes('TEST_TOKEN'),false,'List props never expose token');
  assert.equal(updates.length,0,'No requests/state mutation while listing');
  const detail = fixtureApp(screen,'vi','dark');
  const back = detail.tree.find(n=>n.type==='Pressable' && n.props.accessibilityLabel==='Về danh sách hồ sơ');
  assert.ok(back); back.props.onPress();
  assert.deepEqual(detail.updates,[[24,false]],'Back keeps working session');
  detail.updates.length=0;
  detail.tree.find(n=>n.type===ui.TrustcamShell).props.onNavigate(screen);
  assert.deepEqual(detail.updates,[[24,false],[14,screen]],'Tab tap returns list without creating');
}
// One selected current photo owns model review; historical/stale selection never falls back.
for (const language of ['vi', 'en']) {
  const second = {...entries[0], evidence_id: '00000000-0000-4000-8000-000000000003', analysis: {status: 'accepted', reason: 'TEST second review'}};
  const session = {session_id: 'TEST_SESSION', status: 'collecting', next_action: {type: 'capture', slot: 'damage_closeup'}, evidence: [entries[0], second], evidence_history: [entries[1]]};
  for (const id of [entries[0].evidence_id, second.evidence_id, entries[1].evidence_id, 'TEST_STALE', '']) {
    const {tree, updates} = fixtureApp('checklist', language, 'dark', false, {states: {6: session, 8: id}});
    const page = tree.find(n => n.type === ui.ChecklistScreen);
    assert.equal(page.props.selectedId, id);
    assert.equal(typeof page.props.onSelect, 'function');
    const panels = tree.filter(n => n.type === ui.AdvisoryCard);
    assert.equal(panels.length, 1, 'Only selected-photo model panel, not one per photo');
    const panel = panels[0], chosen = session.evidence.find(entry => entry.evidence_id === id);
    assert.equal(panel.props.canRequestAnalysis, !!chosen);
    assert.equal(panel.props.advisory?.originalText, chosen?.analysis?.reason);
    const rendered = nodes(panel);
    assert.ok(rendered.some(n => n.type === 'Text' && text(n).includes(chosen ? chosen.evidence_id : appCopy[language].chooseCurrentPhoto)));
    assert.equal(updates.length, 0, 'Display cannot trigger model calls or change selection');
    page.props.onSelect(second.evidence_id);
    assert.deepEqual(updates, [[8, second.evidence_id], [9, null]], 'Selection changes only selected ID and clears verification');
    updates.length = 0;
    page.props.onSelect(entries[1].evidence_id); page.props.onSelect('TEST_STALE');
    assert.equal(updates.length, 0, 'Current-only selector must validate exact ID');
  }
  for (const states of [{17: true}, {21: false}, {6: {...session, status: 'finalized'}}, {8: 'TEST_STALE'}]) {
    const {tree, updates} = fixtureApp('checklist', language, 'dark', false, {states: {6: session, ...states}});
    const panel = tree.find(n => n.type === ui.AdvisoryCard);
    assert.equal(panel.props.canRequestAnalysis, false);
    const action = nodes(panel).find(n => n.type === 'Pressable' && n.props.accessibilityLabel === appCopy[language].analyzePhoto);
    assert.ok(action, 'Selected review action needs explicit photo-specific label');
    assert.equal(action.props.disabled, true);
    if (states[17]) { tree.find(n => n.type === ui.ChecklistScreen).props.onSelect(second.evidence_id); assert.equal(updates.length, 0); }
  }
  const fresh = fixtureApp('checklist', language, 'dark', false, {states: {6: {...session, evidence: [{...entries[0], analysis: null}]}}});
  assert.ok(nodes(fresh.tree.find(n => n.type === ui.AdvisoryCard)).some(n => n.type === 'Text' && text(n) === appCopy[language].noPhotoReview));
}
// Actual App uses scoped local metadata only, never server image URI or guessed path.
for (const screen of ['verify', 'checklist']) {
  const currentName = 'trustcam-00000000-0000-4000-8000-000000000001.jpg';
  const historyName = 'trustcam-00000000-0000-4000-8000-000000000002.jpg';
  const local = entries.map((entry, i) => ({version: 1, name: [currentName, historyName][i], base: 'https://example.com', session_id: 'TEST_SESSION', evidence_id: entry.evidence_id, sha256: entry.sha256, slot: entry.slot, captured_at: entry.captured_at}));
  const pageFor = options => fixtureApp(screen, 'vi', 'dark', false, options).tree.find(n => n.type === screenNames[screen]);
  const present = pageFor({states: {10: local}, existingNames: [currentName, historyName]});
  assert.equal(present.props.current[0].imageUri, 'file:///owned/' + currentName);
  assert.equal(present.props.history[0].imageUri, 'file:///owned/' + historyName);
  for (const options of [
    {states: {10: local}}, // Deleted originals.
    {states: {10: local.map(entry => ({...entry, base: 'https://other.example'}))}, existingNames: [currentName, historyName]},
    {states: {10: local.map(entry => ({...entry, session_id: 'OTHER_SESSION'}))}, existingNames: [currentName, historyName]},
    {states: {10: local, 5: null}, existingNames: [currentName, historyName]},
    {states: {10: local}, fileError: true},
  ]) {
    const page = pageFor(options);
    for (const entry of [...page.props.current, ...page.props.history]) {
      assert.equal(entry.imageUri, undefined, 'No preview outside active server/session or absent local file');
      assert.equal(entry.canShareOriginal, false);
    }
  }
}
for (const mode of ['dark', 'light']) for (const language of ['vi', 'en']) for (const screen of Object.keys(screenNames)) {
  const {tree, updates} = fixtureApp(screen, language, mode);
  const shell = tree.find(n => n.type === ui.TrustcamShell);
  assert.equal(shell.props.activeScreen, screen);
  assert.equal(shell.props.copy, mergedCopy[language]);
  assert.equal(shell.props.mode, mode);
  const page = tree.find(n => n.type === screenNames[screen]);
  assert.ok(page, 'actual App missing ' + screen);
  for (const [key, value] of Object.entries(page.props)) if (key.startsWith('on') && value !== undefined) assert.equal(typeof value, 'function', screen + '.' + key);
  if (screen === 'session') {
    assert.equal(page.props.connection, 'offline'); page.props.onOpenSettings();
    assert.ok(updates.some(([index, value]) => index === 14 && value === 'settings'));
  }
  if (screen === 'camera') { assert.equal(page.props.preview.type, 'CameraView'); assert.equal(page.props.preview.props.pictureSize, '1920x1080'); assert.equal(page.props.onToggleFlash, undefined); }
  if (screen === 'checklist') {
    assert.equal(page.props.current[0].id, entries[0].evidence_id);
    assert.ok(page.props.nextLabel); page.props.onContinue();
    assert.ok(updates.some(([index, value]) => index === 14 && value === 'camera'));
    assert.ok(updates.some(([index, value]) => index === 12 && value === null));
    assert.equal(page.props.history[0].id, entries[1].evidence_id);
    const advisory = tree.find(n => n.type === ui.AdvisoryCard);
    assert.equal(advisory.props.advisory.originalText, entries[0].analysis.reason);
    assert.equal(advisory.props.copy.modelResponse, mergedCopy[language].modelResponse);
  }
  if (screen === 'report') assert.equal(page.props.reportText, null, 'unloaded report must not serialize session');
  if (screen === 'verify') {
    assert.deepEqual(page.props.selection, {source: 'history', id: entries[1].evidence_id});
    page.props.onSelect({source: 'current', id: entries[0].evidence_id});
    assert.ok(updates.some(([index, value]) => index === 8 && value === entries[0].evidence_id));
    assert.ok(updates.some(([index, value]) => index === 9 && value === null));
  }
}
for (const screen of ['camera', 'checklist']) {
  const {tree} = fixtureApp(screen, 'vi', 'dark', true);
  const page = tree.find(n => n.type === screenNames[screen]);
  if (screen === 'camera') assert.equal(page.props.cameraActive, false);
  else { assert.equal(page.props.onContinue, undefined); assert.equal(page.props.current[0].canRetake, false); assert.equal(tree.find(n => n.type === ui.AdvisoryCard).props.canRequestAnalysis, false); }
}
// Parent callback contracts: explicit fixtures only, no startup effects or real network.
for (const language of ['vi', 'en']) {
  for (const [seed, busy, loaded, expected] of [['ab'.repeat(32), false, true, true], ['', false, true, false], ['AB'.repeat(32), false, true, false], ['ab'.repeat(32), true, true, false], ['ab'.repeat(32), false, false, false]]) {
    const {tree, updates} = fixtureApp('camera', language, 'dark', false, {states: {4: seed, 5: null, 6: null, 17: busy, 18: loaded}, permission: {granted: false, canAskAgain: true}});
    const camera = tree.find(n => n.type === ui.CameraScreen);
    assert.equal(updates.length, 0, 'Rendering must not create or mutate');
    assert.equal(camera.props.canCreate, expected, 'Parent must disable creation until loaded with valid signing seed and idle');
    assert.equal(camera.props.session, null);
    assert.equal(camera.props.hasCaptureTarget, false);
    assert.equal(camera.props.onRequestPermission, undefined);
    assert.equal(camera.props.onOpenSettings, undefined);
    assert.equal(camera.props.preview, null);
  }
  const restored = fixtureApp('camera', language, 'dark', false, {states: {4: 'ab'.repeat(32), 6: null, 19: 'request_failed'}});
  const restoredCamera = restored.tree.find(n => n.type === ui.CameraScreen);
  assert.equal(restoredCamera.props.session.id, 'TEST_SESSION');
  assert.equal(typeof restoredCamera.props.onRefresh, 'function');
  assert.equal(restoredCamera.props.onReview, undefined, 'Unknown server session must retry, not invent review state');
  assert.ok(restoredCamera.props.error);
  for (const finalized of [false, true]) {
    const complete = {session_id: 'TEST_SESSION', status: finalized ? 'finalized' : 'collecting', next_action: {type: 'finalize'}, evidence: [], evidence_history: []};
    const {tree, updates} = fixtureApp('camera', language, 'dark', finalized, {states: {6: complete}});
    const camera = tree.find(n => n.type === ui.CameraScreen);
    assert.equal(camera.props.hasCaptureTarget, false);
    assert.equal(camera.props.reviewLabel, mergedCopy[language][finalized ? 'reportTab' : 'checklistTab']);
    camera.props.onReview();
    assert.deepEqual(updates, [[24,true],[14, finalized ? 'report' : 'checklist']]);
  }
  const {tree, updates} = fixtureApp('session', language, 'dark', false, {states: {5: null, 6: null}});
  const home = tree.find(n => n.type === ui.SessionScreen);
  assert.equal(home.props.onCreate, undefined);
  home.props.onOpenCamera();
  tree.find(n => n.type === ui.TrustcamShell).props.onNavigate('camera');
  assert.deepEqual(updates, [[14, 'camera'], [14, 'camera']], 'Home/Camera tab navigation must not mutate API/session');
}
for (const language of ['vi', 'en']) {
  const session = {session_id: 'TEST_SESSION', status: 'collecting', next_action: {type: 'capture', slot: 'damage_closeup'}, evidence: [{...entries[0], analysis: {...entries[0].analysis, reasons: {vi: 'TEST nhận xét VI', en: 'TEST assessment EN'}, language: 'vi'}}], evidence_history: []};
  const {tree, updates} = fixtureApp('checklist', language, 'dark', false, {states: {6: session}});
  const advisory = tree.find(n => n.type === ui.AdvisoryCard);
  assert.equal(advisory.props.advisory.originalText, session.evidence[0].analysis.reasons[language], 'Language selects cached model reason');
  assert.equal(advisory.props.advisory.isOriginalLanguage, false);
  assert.equal(updates.length, 0, 'Language display cannot resend evidence or request translations');
  const legacy = fixtureApp('checklist', language, 'dark').tree.find(n => n.type === ui.AdvisoryCard);
  assert.equal(legacy.props.advisory.originalText, entries[0].analysis.reason);
  assert.equal(legacy.props.advisory.isOriginalLanguage, true);
}
assert.match(appSource, /\/analyze`[^;]*\{ language: lang \}/, 'Explicit analysis request must include selected language');
const createSource = appSource.slice(appSource.indexOf('  async function createSession()'), appSource.indexOf('  async function beginRetake'));
assert.match(createSource, /if \(credentials && !await confirm\('createSession', 'replaceSessionConfirm'\)\) return;/);
assert.ok(createSource.indexOf('await persist(base, next, createdAt)') < createSource.indexOf('setCredentials(next)'), 'Persist before replacing credentials');
assert.match(appSource, /if \(lock.current\) return;/);
assert.match(appSource, /const perform = .*if \(!disabled\) void run\(action\)/);
assert.equal((appSource.match(/onCreate=\{perform\(createSession\)\}/g) ?? []).length, 1, 'Only Camera owns session creation');
console.log('Presentation + actual App composition: 6 screens × 2 themes × 2 locales; scoped local previews + missing/load-error fallbacks; exact-ID current/history selection; single selected-photo advisory + cached VI/EN/legacy reviews + stale/busy/finalized guards; compact accessible safe-area header; Camera-only creation and callbacks: PASS (Node structural checks, not native renderer)');
