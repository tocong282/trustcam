export async function request(path, { method = 'GET', body, csrf, signal } = {}) {
  const origin = globalThis.location?.origin || 'http://localhost';
  const url = new URL(path, origin);
  if (!path.startsWith('/dashboard/api/') || url.origin !== origin || !url.pathname.startsWith('/dashboard/api/')) throw new Error('invalid_request');
  const headers = new Headers({ Accept: 'application/json' });
  method = method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && url.pathname !== apiPath('login')) {
    if (!csrf) throw new Error('csrf_expired');
    headers.set('X-CSRF-Token', csrf);
  }
  if (body != null && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  let response;
  try { response = await fetch(path, { method, headers, body, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: signal || AbortSignal.timeout(30000) }); }
  catch (error) { throw new Error(error.name === 'AbortError' ? 'cancelled' : 'network_error'); }
  if (!response.ok) {
    if (response.status === 401) throw new Error('unauthorized');
    if (response.status === 403) throw new Error('csrf_expired');
    if (response.status === 503) throw new Error('disabled');
    if (response.status === 404) throw new Error('not_found');
    if (response.status === 413) throw new Error('image_too_large');
    if (response.status === 400 || response.status === 422) throw new Error('invalid_request');
    if (response.status === 429) throw new Error('rate_limited');
    throw new Error('request_failed');
  }
  if (response.status === 204) return {};
  try { return await response.json(); } catch { throw new Error('invalid_response'); }
}

const slots = ['wide_context', 'damage_closeup', 'serial_or_plate', 'identifier_doc'];
const string = value => typeof value === 'string' && value.length > 0;
const validTime = value => string(value) && Number.isFinite(Date.parse(value));
const invalid = () => { throw new Error('invalid_response'); };

export function parseSessions(data) {
  if (!Array.isArray(data?.sessions)) return invalid();
  for (const entry of data.sessions) {
    if (!string(entry.session_id) || !['collecting', 'finalized'].includes(entry.status) || !Number.isInteger(entry.evidence_count) || entry.evidence_count < 0 || entry.evidence_count > 20 || !Number.isInteger(entry.history_count) || entry.history_count < 0 || entry.history_count > 80 || !(entry.report_id === null || string(entry.report_id)) || !validTime(entry.shared_at)) return invalid();
  }
  if (new Set(data.sessions.map(entry => entry.session_id)).size !== data.sessions.length) return invalid();
  if (data.sessions.some(entry => (entry.status === 'finalized' && !string(entry.report_id)) || (entry.status === 'collecting' && entry.report_id !== null))) return invalid();
  return data.sessions;
}

export function parseSession(data, id) {
  if (!data || data.session_id !== id || data.analysis_mode !== 'checklist' || !['collecting', 'finalized'].includes(data.status) || !(data.report_id === null || string(data.report_id)) || !Array.isArray(data.evidence) || !Array.isArray(data.evidence_history) || data.evidence.length > 20 || data.evidence_history.length > 80) return invalid();
  if ((data.status === 'finalized' && !string(data.report_id)) || (data.status === 'collecting' && data.report_id !== null)) return invalid();
  const all = [...data.evidence, ...data.evidence_history];
  for (const entry of all) {
    if (!entry || !string(entry.evidence_id) || (entry.is_additional !== undefined && typeof entry.is_additional !== 'boolean') || !slots.includes(entry.slot) || !validTime(entry.captured_at) || !/^[a-f0-9]{64}$/i.test(entry.sha256) || !/^[a-f0-9]{128}$/i.test(entry.signature) || !/^[a-f0-9]{64}$/i.test(entry.public_key)) return invalid();
  }
  if (new Set(all.map(entry => entry.evidence_id)).size !== all.length) return invalid();
  return data;
}

export function parseReport(data, id, reportID) {
  if (!string(data?.report_id) || data.report_id !== reportID || data.report?.version !== '1') return invalid();
  parseSession({ ...data.report, status: 'finalized', report_id: reportID }, id);
  return data;
}

export function assessment(analysis, locale) {
  if (!analysis || !string(analysis.reason)) return null;
  const translated = analysis.reasons?.[locale];
  return { text: string(translated) ? translated : analysis.reason, legacy: !string(translated), status: ['accepted', 'retake', 'uncertain'].includes(analysis.status) ? analysis.status : 'uncertain' };
}

export function parseVerification(data) {
  if (data?.result === 'PASS' && data.reason === 'integrity_verified') return data;
  if (data?.result === 'FAIL' && ['image_modified', 'signature_invalid'].includes(data.reason)) return data;
  return invalid();
}

export function apiPath(...segments) {
  return '/dashboard/api/' + segments.map(value => encodeURIComponent(String(value))).join('/');
}

export function safeSourceURL(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const english = {
  skip: 'Skip to main content', language: 'Language', logout: 'Sign out', reviewDesk: 'INSURANCE LOSS ADJUSTER', loginTitle: 'Review the photo. Compare the original.', loginHelp: 'For insurance loss adjusters: review granted motor claim dossiers. No mobile token required.', password: 'Dashboard password', passwordHelp: 'Dashboard does not store your password. Server manages access with an HttpOnly cookie.', login: 'Sign in', retry: 'Retry', accessNotice: 'Read-only review and file verification. No case creation, record editing or requests for more photos.', workspaceTitle: 'Claim dossier', readonly: 'Read only · Original-file verification', cases: 'Cases', detail: 'Details', legal: 'Legal sources', queue: 'Shared cases', refresh: 'Refresh', searchSessions: 'Search case ID', filter: 'Filter status', all: 'All statuses', collecting: 'Collecting', finalized: 'Report finalized', queueNote: 'Only granted cases appear here. Photo counts are not verification results.', caseReview: 'EVIDENCE REVIEW', chooseCase: 'Choose a case', progress: 'Required photo categories', currentPhotos: 'Current photos', history: 'Evidence history', historyHelp: 'Archived photos are separate and do not count toward current category coverage.', choosePhoto: 'Choose a photo to view and verify.', reloadPhoto: 'Reload photo', metadata: 'Signature & identity data', byteCheck: 'BYTE COMPARISON', verifyTitle: 'Verify file integrity', verifyHelp: 'Choose the exact original uploaded file. Transcoded files can FAIL even when visually identical. Dashboard sends original bytes, never redraws the image.', fileLabel: 'Image file to compare', fileHelp: 'JPEG or PNG, up to 10 MiB. Result applies only to the selected photo and file.', verify: 'Verify file', integrityNotice: 'PASS only confirms unchanged image bytes against signed data; it does not prove a true scene, true time or legal validity. FAIL is not a finding of wrongdoing.', advisoryTitle: 'Saved model advisory', advisoryNotice: 'Advisory for the selected photo only. Not cryptographic proof, factual verification or a legal conclusion. Dashboard does not send photos to a model.', report: 'Finalized report', loadReport: 'Open report', download: 'Download JSON', retrievalOnly: 'RETRIEVAL ONLY · NO GENERATED ANSWERS', legalTitle: 'Search retrieved excerpts', legalHelp: 'Look up evidence sources in the existing corpus, not insurance policy terms. Shows full excerpts and sources; no inference of coverage from photos or FAIL results.', legalQuery: 'Keywords or article', searchLegal: 'Search', legalNotice: 'Not legal advice or confirmation of coverage. Voluntary motor own-damage insurance differs from compulsory third-party liability insurance. Check original documents and actual policy; adjusters and insurers make decisions. No automatic payout calculation or approval.', footer: 'Original photos · Revision trail · Independent comparison'
};
const copy = {
  loading: ['Đang tải…', 'Loading…'], checking: ['Đang kiểm tra phiên đăng nhập…', 'Checking sign-in session…'], loginReady: ['Đăng nhập bằng mật khẩu dashboard.', 'Sign in with your dashboard password.'], emptyQueue: ['Chưa có hồ sơ được cấp quyền. Tải lại sau khi được chia sẻ.', 'No granted cases yet. Refresh after a case is shared.'], noMatches: ['Không có hồ sơ khớp bộ lọc.', 'No cases match these filters.'], chooseHelp: ['Chọn hồ sơ bên trái để xem ảnh hiện tại, lịch sử và báo cáo.', 'Select a case on the left to review photos, history and report.'], noPhotos: ['Hồ sơ chưa có ảnh hiện tại.', 'No current photos in this case.'], noHistory: ['Chưa có ảnh trong lịch sử.', 'No archived photos.'], noAnalysis: ['Ảnh này chưa có nhận xét đã lưu.', 'No saved advisory for this photo.'], legacy: ['Nhận xét gốc; chưa có bản dịch theo ngôn ngữ đã chọn.', 'Original assessment; no translation in the selected language.'], localized: ['Nhận xét theo ngôn ngữ đã chọn.', 'Assessment in the selected language.'], accepted: ['Tham khảo: đạt yêu cầu ảnh', 'Advisory: photo accepted'], retake: ['Tham khảo: cần ảnh rõ hơn', 'Advisory: retake suggested'], uncertain: ['Tham khảo: chưa chắc chắn', 'Advisory: uncertain'], notVerified: ['Chưa kiểm tra tệp. Ảnh hiển thị không đồng nghĩa PASS.', 'File not verified. Displaying a photo does not mean PASS.'], imageLoading: ['Đang tải ảnh gốc…', 'Loading original photo…'], imageUnavailable: ['Không tải được ảnh. Có thể quyền truy cập đã hết hạn; thử tải lại hoặc đăng nhập lại. Vẫn có thể chọn tệp để kiểm tra.', 'Photo unavailable. Access may have expired; retry or sign in again. You can still select a file for verification.'], current: ['Hiện tại', 'Current'], archived: ['Lịch sử', 'Archived'], additional: ['Ảnh bổ sung', 'Additional photo'], wide_context: ['Toàn cảnh xe / hiện trường', 'Vehicle / scene overview'], damage_closeup: ['Cận cảnh hư hại', 'Damage close-up'], serial_or_plate: ['Biển số / VIN', 'Plate / VIN'], identifier_doc: ['Giấy tờ định danh / bảo hiểm', 'Identification / insurance document'], caseLabel: ['Hồ sơ', 'Case'], photoCount: ['ảnh hiện tại', 'current photos'], historyCount: ['ảnh lịch sử', 'archived photos'], categoryCount: ['nhóm bắt buộc', 'required categories'], sharedAt: ['Chia sẻ', 'Shared'], capturedAt: ['Thời điểm ghi nhận', 'Recorded time'], evidenceID: ['Mã bằng chứng', 'Evidence ID'], slot: ['Nhóm ảnh', 'Photo category'], signature: ['Chữ ký', 'Signature'], publicKey: ['Khoá công khai', 'Public key'], replaces: ['Thay thế ảnh', 'Replaces photo'], reportID: ['Mã báo cáo', 'Report ID'], version: ['Phiên bản', 'Version'], noReport: ['Hồ sơ chưa có báo cáo đã chốt. Dashboard không lập báo cáo mới.', 'No finalized report for this case. Dashboard cannot create reports.'], reportNotLoaded: ['Báo cáo đã có trên máy chủ; mở để xem tóm tắt và tải JSON.', 'Report exists on server; open it for summary and JSON download.'], reportLoaded: ['Đã tải báo cáo đã chốt từ máy chủ. Tải JSON chứa ảnh hiện tại và lịch sử.', 'Existing finalized report loaded from server. JSON includes current and archived records.'], reportNotice: ['Số ảnh là dữ liệu báo cáo, không phải kết quả kiểm tra mật mã.', 'Photo counts are report data, not cryptographic verification.'], integrity_verified: ['PASS · Byte ảnh khớp dữ liệu đã ký.', 'PASS · Image bytes match signed data.'], image_modified: ['FAIL · Byte tệp khác ảnh đã ký.', 'FAIL · File bytes differ from signed image.'], signature_invalid: ['FAIL · Chữ ký không hợp lệ.', 'FAIL · Signature invalid.'], invalid_image: ['Chọn tệp JPEG hoặc PNG không rỗng, tối đa 10 MiB.', 'Choose a non-empty JPEG or PNG file, up to 10 MiB.'], legalReady: ['Nhập từ khóa để tra cứu đoạn trích đã có trong kho.', 'Enter keywords to retrieve existing excerpts.'], legalEmpty: ['Không có đoạn trích phù hợp trong kho hiện có. Không có câu trả lời được sinh ra.', 'No matching excerpts in the current corpus. No answer was generated.'], source: ['Mở văn bản nguồn', 'Open source document'], noSource: ['Nguồn không có URL HTTP(S) hợp lệ.', 'Source has no valid HTTP(S) URL.'], legalStatus: ['Tình trạng pháp lý do nguồn cung cấp', 'Legal status supplied by source'], unknownStatus: ['Chưa xác định; kiểm tra văn bản gốc.', 'Unknown; check original document.'], article: ['Điều / khoản', 'Article / clause'], found: ['Đoạn trích tìm thấy', 'Retrieved excerpts'], authorizedCount: ['hồ sơ được cấp quyền', 'granted cases'], signedOut: ['Đã đăng xuất.', 'Signed out.'], unauthorized: ['Sai mật khẩu hoặc phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', 'Incorrect password or expired session. Please sign in again.'], csrf_expired: ['Mã bảo vệ phiên đã hết hạn hoặc không hợp lệ. Đăng nhập lại trước khi gửi.', 'Session protection token expired or invalid. Sign in again before submitting.'], disabled: ['Dashboard hoặc dịch vụ đang tạm ngưng (503). Thử lại hoặc liên hệ quản trị viên.', 'Dashboard or service unavailable (503). Retry or contact your administrator.'], not_found: ['Dữ liệu không còn có sẵn hoặc bạn chưa được cấp quyền. Tải lại hồ sơ.', 'Data unavailable or not granted. Refresh cases.'], image_too_large: ['Tệp vượt giới hạn 10 MiB.', 'File exceeds 10 MiB limit.'], invalid_request: ['Yêu cầu không hợp lệ. Kiểm tra tệp hoặc nội dung rồi thử lại.', 'Invalid request. Check file or input and retry.'], rate_limited: ['Quá nhiều yêu cầu. Chờ một lúc rồi thử lại.', 'Too many requests. Wait and retry.'], request_failed: ['Không thực hiện được yêu cầu. Thử lại sau.', 'Request failed. Please retry.'], network_error: ['Không kết nối được máy chủ hoặc yêu cầu quá thời gian. Kiểm tra mạng và thử lại.', 'Server unreachable or request timed out. Check connection and retry.'], invalid_response: ['Máy chủ trả dữ liệu không đúng định dạng. Tải lại hoặc liên hệ quản trị viên.', 'Server returned an unexpected format. Retry or contact your administrator.']
};

if (typeof document !== 'undefined') startDashboard();

function startDashboard() {
  const $ = id => document.getElementById(id);
  const vietnamese = new Map([...document.querySelectorAll('[data-i18n]')].map(node => [node.dataset.i18n, node.textContent]));
  let locale = 'vi';
  try { if (localStorage.getItem('trustcam.dashboard.locale') === 'en') locale = 'en'; } catch { /* Storage may be disabled. */ }
  const state = { authenticated: false, csrf: null, sessions: [], session: null, selectedID: null, photo: null, archived: false, report: null, verification: null, listStatus: 'idle', detailStatus: 'idle', legalStatus: 'idle', legalData: null, legalQuery: '', error: null, tab: 'cases', epoch: 0, detailEpoch: 0, verifyEpoch: 0, legalEpoch: 0 };
  const text = key => copy[key]?.[locale === 'en' ? 1 : 0] || (locale === 'en' ? english[key] : vietnamese.get(key)) || (locale === 'en' ? 'Unavailable' : 'Chưa có');
  const set = (id, value) => { $(id).textContent = value; };
  const node = (tag, value, className) => { const element = document.createElement(tag); if (value != null) element.textContent = value; if (className) element.className = className; return element; };
  const date = value => validTime(value) ? new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
  const message = (id, key) => { $(id).dataset.message = key || ''; set(id, key ? text(key) : ''); };
  const errorKey = error => Object.hasOwn(copy, error?.message) ? error.message : 'request_failed';
  const clearNode = id => $(id).replaceChildren();
  const api = (path, options = {}) => request(path, { ...options, csrf: state.csrf });
  const sessionPath = (...parts) => apiPath('sessions', state.selectedID, ...parts);
  const definition = (target, label, value) => { target.append(node('dt', label), node('dd', String(value ?? '—'))); };

  function clearVerification() {
    state.verifyEpoch++;
    state.verification = null;
    $('verify-file').value = '';
    $('verify-submit').disabled = true;
    $('verify-result').className = 'verify-result';
    message('verify-result', 'notVerified');
  }
  function clearDetail() {
    state.detailEpoch++;
    state.session = null; state.photo = null; state.report = null; state.detailStatus = 'idle';
    clearVerification();
    $('selected-photo').removeAttribute('src'); $('selected-photo').hidden = true; $('selected-photo').alt = '';
    set('photo-caption', ''); $('photo-retry').hidden = true;
    document.querySelector('.metadata').open = false; document.querySelector('.history').open = false;
    $('detail-content').hidden = true;
    $('session-status').hidden = true;
    $('detail-retry').hidden = true;
    clearNode('current-gallery'); clearNode('history-gallery'); clearNode('report-summary'); clearNode('metadata-list');
    $('report-download').disabled = true;
    set('detail-title', text('chooseCase'));
    message('detail-message', 'chooseHelp');
  }
  function showLogin(key, focus = false) {
    state.epoch++; state.legalEpoch++;
    state.authenticated = false; state.csrf = null; state.sessions = []; state.selectedID = null;
    state.legalData = null; state.legalQuery = ''; state.legalStatus = 'idle';
    clearDetail(); clearNode('session-list'); clearNode('legal-results');
    $('legal-query').value = ''; $('legal-submit').disabled = false; $('legal-retry').hidden = true; $('workspace').hidden = true; $('login-panel').hidden = false; $('logout').hidden = true;
    $('password').value = ''; $('login-submit').disabled = false; $('auth-retry').hidden = !['disabled', 'network_error', 'not_found', 'invalid_response', 'request_failed'].includes(key);
    message('login-message', key || 'loginReady');
    if (focus) $('password').focus();
  }
  function handleError(error, target) {
    if (['unauthorized', 'csrf_expired'].includes(error.message)) { showLogin(error.message, true); return; }
    message(target, errorKey(error));
  }
  function applyLocale() {
    document.documentElement.lang = locale;
    document.title = 'TRUSTCAM · ' + (locale === 'vi' ? 'Hồ sơ' : 'Cases');
    $('locale').value = locale;
    for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = locale === 'en' ? english[element.dataset.i18n] || vietnamese.get(element.dataset.i18n) : vietnamese.get(element.dataset.i18n);
    for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = text(element.dataset.i18nPlaceholder);
    for (const element of document.querySelectorAll('[data-message]')) if (element.dataset.message) element.textContent = text(element.dataset.message);
    $('progress').setAttribute('aria-label', text('progress'));
    renderQueue();
    if (state.session) { renderSession(false); renderAdvisory(); renderMetadata(); renderReport(); }
    else set('detail-title', text('chooseCase'));
    if (state.verification) renderVerification();
    renderLegal();
  }
  function selectTab(tab, focus = false) {
    state.tab = tab;
    for (const button of document.querySelectorAll('[data-tab]')) { const selected = button.dataset.tab === tab; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; }
    $('cases-panel').hidden = tab === 'legal'; $('legal-panel').hidden = tab !== 'legal';
    $('cases-panel').setAttribute('aria-labelledby', tab === 'detail' ? 'tab-detail' : 'tab-cases');
    if (focus && tab === 'detail') $('case-detail').focus();
    if (focus && tab === 'cases') $('case-search').focus();
    if (focus && tab === 'legal') $('legal-query').focus();
  }
  function renderQueue() {
    clearNode('session-list');
    const filter = $('case-filter').value, query = $('case-search').value.trim().toLowerCase();
    const entries = state.sessions.filter(entry => (filter === 'all' || entry.status === filter) && entry.session_id.toLowerCase().includes(query));
    if (state.listStatus === 'loading') message('queue-message', 'loading');
    else if (state.listStatus === 'ready') {
      $('queue-message').dataset.message = '';
      set('queue-message', !state.sessions.length ? text('emptyQueue') : !entries.length ? text('noMatches') : `${entries.length} / ${state.sessions.length} ${text('authorizedCount')}`);
    }
    for (const entry of entries) {
      const li = node('li'), button = node('button', null, 'case-row');
      button.type = 'button'; button.setAttribute('aria-pressed', String(state.selectedID === entry.session_id));
      button.append(node('span', `${text('caseLabel')} · ${entry.session_id}`, 'row-title mono'), node('span', text(entry.status), 'badge ' + entry.status), node('span', `${entry.evidence_count} ${text('photoCount')} · ${entry.history_count} ${text('historyCount')}`, 'row-meta'), node('span', `${text('sharedAt')}: ${date(entry.shared_at)}`, 'row-meta'));
      button.addEventListener('click', () => { selectTab('detail'); loadSession(entry.session_id, true); });
      li.append(button); $('session-list').append(li);
    }
  }
  async function loadSessions() {
    const epoch = state.epoch;
    state.listStatus = 'loading'; $('refresh').disabled = true; renderQueue();
    try {
      const entries = parseSessions(await api(apiPath('sessions')));
      if (epoch !== state.epoch || !state.authenticated) return;
      state.sessions = entries; state.listStatus = 'ready'; renderQueue();
      if (state.selectedID && !entries.some(entry => entry.session_id === state.selectedID)) { state.selectedID = null; clearDetail(); }
      else if (state.selectedID) await loadSession(state.selectedID);
    } catch (error) { if (epoch === state.epoch) { state.listStatus = 'error'; state.sessions = []; state.selectedID = null; clearDetail(); renderQueue(); handleError(error, 'queue-message'); } }
    finally { $('refresh').disabled = false; }
  }
  async function enterWorkspace(token) {
    if (!string(token)) throw new Error('invalid_response');
    state.csrf = token; state.authenticated = true; state.epoch++;
    $('password').value = ''; $('login-panel').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
    message('global-message', null); selectTab('cases');
    $('case-search').focus(); await loadSessions();
  }
  async function checkAuth() {
    message('login-message', 'checking'); $('login-submit').disabled = true; $('auth-retry').hidden = true;
    try { const data = await api(apiPath('me')); if (data.authenticated !== true) throw new Error('invalid_response'); await enterWorkspace(data.csrf_token); }
    catch (error) { showLogin(error.message === 'unauthorized' ? 'loginReady' : errorKey(error)); }
    finally { $('login-submit').disabled = false; }
  }
  async function loadSession(id, focus = false) {
    clearDetail(); state.selectedID = id; state.detailStatus = 'loading';
    const epoch = state.epoch, detailEpoch = state.detailEpoch;
    message('detail-message', 'loading'); set('detail-title', `${text('caseLabel')} · ${id}`); renderQueue();
    if (focus) $('case-detail').focus();
    try {
      const data = parseSession(await api(apiPath('sessions', id)), id);
      if (epoch !== state.epoch || detailEpoch !== state.detailEpoch || !state.authenticated) return;
      state.session = data; state.detailStatus = 'ready'; message('detail-message', null); renderSession(true);
    } catch (error) { if (epoch === state.epoch && detailEpoch === state.detailEpoch) { state.detailStatus = 'error'; $('detail-retry').hidden = false; handleError(error, 'detail-message'); } }
  }
  function gallery(id, entries, archived) {
    clearNode(id);
    for (const entry of entries) {
      const button = node('button', null, 'thumbnail'), image = node('img');
      button.type = 'button'; button.setAttribute('aria-pressed', String(state.photo?.evidence_id === entry.evidence_id));
      button.setAttribute('aria-label', `${text(archived ? 'archived' : 'current')}: ${text(entry.slot)} · ${entry.evidence_id}`);
      image.loading = 'lazy'; image.decoding = 'async'; image.alt = text(entry.slot);
      image.src = apiPath('sessions', state.selectedID, 'evidence', entry.evidence_id, 'image');
      image.addEventListener('error', () => { image.hidden = true; });
      button.append(image, node('span', `${text(entry.slot)}${entry.is_additional ? ' · ' + text('additional') : ''}`));
      button.addEventListener('click', () => selectPhoto(entry, archived));
      $(id).append(button);
    }
    if (!entries.length) $(id).append(node('p', text(archived ? 'noHistory' : 'noPhotos'), 'help'));
  }
  function renderSession(initial) {
    const data = state.session;
    $('detail-content').hidden = false; $('session-status').hidden = false; set('session-status', text(data.status)); $('session-status').className = 'badge ' + data.status;
    set('detail-title', `${text('caseLabel')} · ${data.session_id}`);
    const coverage = new Set(data.evidence.map(entry => entry.slot)).size;
    set('progress-text', `${coverage} / ${slots.length}`); $('progress').value = coverage;
    set('collection-help', `${data.evidence.length} ${text('photoCount')} · ${coverage} / ${slots.length} ${text('categoryCount')}. ${text('queueNote')}`);
    set('current-count', String(data.evidence.length)); set('history-count', String(data.evidence_history.length));
    gallery('current-gallery', data.evidence, false); gallery('history-gallery', data.evidence_history, true);
    $('report-load').disabled = !data.report_id;
    if (initial) { state.report = null; renderReport(); const first = data.evidence[0] || data.evidence_history[0]; if (first) selectPhoto(first, !data.evidence.length); else { $('photo-placeholder').hidden = false; message('photo-placeholder', 'choosePhoto'); renderAdvisory(); } }
    else if (state.photo) { set('photo-caption', `${text(state.archived ? 'archived' : 'current')} · ${text(state.photo.slot)} · ${date(state.photo.captured_at)}`); $('selected-photo').alt = `${text(state.archived ? 'archived' : 'current')} · ${text(state.photo.slot)}`; }
  }
  async function checkImageAccess(expectedID) {
    const epoch = state.epoch;
    try { await api(apiPath('me')); }
    catch (error) { if (epoch === state.epoch && state.photo?.evidence_id === expectedID && ['unauthorized', 'csrf_expired'].includes(error.message)) handleError(error, 'detail-message'); }
  }
  function selectPhoto(entry, archived) {
    state.photo = entry; state.archived = archived; clearVerification();
    for (const button of document.querySelectorAll('.thumbnail')) button.setAttribute('aria-pressed', String(button.getAttribute('aria-label').endsWith(' · ' + entry.evidence_id)));
    $('photo-retry').hidden = true; $('selected-photo').hidden = true; $('photo-placeholder').hidden = false; message('photo-placeholder', 'imageLoading');
    const image = $('selected-photo'), expectedID = entry.evidence_id;
    image.onload = () => { if (state.photo?.evidence_id !== expectedID) return; image.hidden = false; $('photo-placeholder').hidden = true; };
    image.onerror = () => { if (state.photo?.evidence_id !== expectedID) return; image.hidden = true; $('photo-placeholder').hidden = false; message('photo-placeholder', 'imageUnavailable'); $('photo-retry').hidden = false; checkImageAccess(expectedID); };
    image.alt = `${text(archived ? 'archived' : 'current')} · ${text(entry.slot)}`;
    image.src = apiPath('sessions', state.selectedID, 'evidence', entry.evidence_id, 'image');
    set('photo-caption', `${text(archived ? 'archived' : 'current')} · ${text(entry.slot)} · ${date(entry.captured_at)}`);
    renderAdvisory(); renderMetadata();
  }
  function renderAdvisory() {
    const review = assessment(state.photo?.analysis, locale);
    $('advisory-status').hidden = !review;
    if (!review) { set('advisory-language', ''); message('advisory-text', state.photo ? 'noAnalysis' : 'choosePhoto'); return; }
    set('advisory-status', text(review.status)); message('advisory-language', review.legacy ? 'legacy' : 'localized');
    $('advisory-text').dataset.message = ''; set('advisory-text', review.text);
  }
  function renderMetadata() {
    clearNode('metadata-list'); const entry = state.photo; if (!entry) return;
    const list = $('metadata-list');
    for (const [label, value] of [['evidenceID', entry.evidence_id], ['caseLabel', state.selectedID], ['slot', text(entry.slot)], ['capturedAt', entry.captured_at], ['SHA-256', entry.sha256], ['signature', entry.signature], ['publicKey', entry.public_key], ['replaces', entry.replaces_evidence_id || '—']]) definition(list, label === 'SHA-256' ? label : text(label), value);
  }
  function renderVerification() {
    if (!state.verification) return;
    $('verify-result').className = 'verify-result ' + (state.verification.result === 'PASS' ? 'pass' : 'fail');
    message('verify-result', state.verification.reason);
  }
  function renderReport() {
    clearNode('report-summary'); $('report-download').disabled = !state.report;
    if (!state.report) { message('report-message', state.session?.report_id ? 'reportNotLoaded' : 'noReport'); return; }
    message('report-message', 'reportLoaded'); const report = state.report.report, list = node('dl');
    for (const [label, value] of [['reportID', state.report.report_id], ['caseLabel', report.session_id], ['version', report.version], ['photoCount', report.evidence.length], ['historyCount', report.evidence_history?.length || 0]]) definition(list, text(label), value);
    $('report-summary').append(list, node('p', text('reportNotice'), 'help'));
  }
  async function loadReport() {
    if (!state.session?.report_id) return;
    const epoch = state.epoch, detailEpoch = state.detailEpoch, id = state.selectedID;
    $('report-load').disabled = true; state.report = null; $('report-download').disabled = true; clearNode('report-summary'); message('report-message', 'loading');
    try {
      const data = await api(sessionPath('report'));
      if (epoch !== state.epoch || detailEpoch !== state.detailEpoch) return;
      state.report = parseReport(data, id, state.session.report_id); renderReport();
    } catch (error) { if (epoch === state.epoch && detailEpoch === state.detailEpoch) handleError(error, 'report-message'); }
    finally { if (epoch === state.epoch && detailEpoch === state.detailEpoch) $('report-load').disabled = false; }
  }
  async function verify(event) {
    event.preventDefault();
    state.verifyEpoch++; state.verification = null; $('verify-result').className = 'verify-result';
    const file = $('verify-file').files[0];
    if (!state.photo) return;
    if (!file || !file.size || file.size > 10 * 1024 * 1024 || !/\.(jpe?g|png)$/i.test(file.name)) { message('verify-result', file?.size > 10 * 1024 * 1024 ? 'image_too_large' : 'invalid_image'); return; }
    const epoch = state.epoch, detailEpoch = state.detailEpoch, verifyEpoch = state.verifyEpoch;
    const form = new FormData(); form.append('evidence_id', state.photo.evidence_id); form.append('image', file, file.name);
    $('verify-submit').disabled = true; message('verify-result', 'loading');
    try {
      const data = parseVerification(await api(sessionPath('verify'), { method: 'POST', body: form }));
      if (epoch !== state.epoch || detailEpoch !== state.detailEpoch || verifyEpoch !== state.verifyEpoch) return;
      state.verification = data; renderVerification();
    } catch (error) { if (epoch === state.epoch && detailEpoch === state.detailEpoch && verifyEpoch === state.verifyEpoch) handleError(error, 'verify-result'); }
    finally { if (epoch === state.epoch && detailEpoch === state.detailEpoch && verifyEpoch === state.verifyEpoch) $('verify-submit').disabled = !state.photo; }
  }
  function renderLegal() {
    clearNode('legal-results');
    if (state.legalStatus === 'idle') { message('legal-message', 'legalReady'); return; }
    if (state.legalStatus !== 'ready' || !state.legalData) return;
    const data = state.legalData;
    $('legal-message').dataset.message = '';
    set('legal-message', data.results.length ? `${text('found')}: ${data.results.length}` : text('legalEmpty'));
    if (string(data.notice)) $('legal-results').append(node('p', data.notice, 'help preline'));
    for (const result of data.results) {
      const article = node('article', null, 'legal-result');
      article.append(node('h3', result.document_title), node('p', `${text('article')}: ${result.article}`, 'help'), node('blockquote', result.text));
      article.append(node('p', `${text('legalStatus')}: ${string(result.legal_status) ? result.legal_status : text('unknownStatus')}`, 'help'));
      const url = safeSourceURL(result.source_url);
      if (url) { const link = node('a', text('source') + ' · ' + new URL(url).hostname, 'source'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; article.append(link); }
      else article.append(node('p', text('noSource'), 'help'));
      $('legal-results').append(article);
    }
  }
  async function searchLegal(event) {
    event?.preventDefault(); const query = $('legal-query').value.trim(); if (!query) { $('legal-query').focus(); return; }
    const epoch = state.epoch, legalEpoch = ++state.legalEpoch;
    state.legalStatus = 'loading'; state.legalData = null; state.legalQuery = query;
    clearNode('legal-results'); message('legal-message', 'loading'); $('legal-submit').disabled = true; $('legal-retry').hidden = true;
    try {
      const data = await api(apiPath('legal') + '?q=' + encodeURIComponent(query));
      if (epoch !== state.epoch || legalEpoch !== state.legalEpoch) return;
      if (data.mode !== 'retrieval_only' || !Array.isArray(data.results) || data.results.some(result => !result || !['id', 'document_title', 'article', 'text'].every(key => typeof result[key] === 'string'))) throw new Error('invalid_response');
      state.legalStatus = 'ready'; state.legalData = data; renderLegal();
    } catch (error) { if (epoch === state.epoch && legalEpoch === state.legalEpoch) { state.legalStatus = 'error'; $('legal-retry').hidden = false; handleError(error, 'legal-message'); } }
    finally { if (epoch === state.epoch && legalEpoch === state.legalEpoch) $('legal-submit').disabled = false; }
  }

  $('locale').addEventListener('change', () => { locale = $('locale').value === 'en' ? 'en' : 'vi'; try { localStorage.setItem('trustcam.dashboard.locale', locale); } catch { /* Locale still works without persistence. */ } applyLocale(); });
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); $('login-submit').disabled = true; message('login-message', 'loading');
    const password = $('password').value; $('password').value = '';
    try { const data = await request(apiPath('login'), { method: 'POST', body: { password } }); await enterWorkspace(data.csrf_token); }
    catch (error) { showLogin(errorKey(error), true); }
    finally { $('login-submit').disabled = false; }
  });
  $('logout').addEventListener('click', async () => {
    $('logout').disabled = true;
    try { await api(apiPath('logout'), { method: 'POST' }); showLogin('signedOut', true); }
    catch (error) { handleError(error, 'global-message'); }
    finally { $('logout').disabled = false; }
  });
  $('auth-retry').addEventListener('click', checkAuth);
  $('refresh').addEventListener('click', loadSessions);
  $('case-search').addEventListener('input', renderQueue); $('case-filter').addEventListener('change', renderQueue);
  $('detail-retry').addEventListener('click', () => { if (state.selectedID) loadSession(state.selectedID); });
  $('photo-retry').addEventListener('click', () => { if (state.photo) selectPhoto(state.photo, state.archived); });
  $('verify-file').addEventListener('change', () => { state.verifyEpoch++; state.verification = null; $('verify-result').className = 'verify-result'; message('verify-result', 'notVerified'); $('verify-submit').disabled = !state.photo || !$('verify-file').files.length; });
  $('verify-form').addEventListener('submit', verify);
  $('report-load').addEventListener('click', loadReport);
  $('report-download').addEventListener('click', () => {
    if (!state.report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.report, null, 2)], { type: 'application/json' }));
    const link = node('a'); link.href = url; link.download = 'trustcam-report.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('legal-form').addEventListener('submit', searchLegal); $('legal-retry').addEventListener('click', searchLegal);
  for (const button of document.querySelectorAll('[data-tab]')) {
    button.addEventListener('click', () => selectTab(button.dataset.tab, true));
    button.addEventListener('keydown', event => {
      const tabs = [...document.querySelectorAll('[data-tab]')], index = tabs.indexOf(button);
      let next; if (event.key === 'ArrowRight') next = (index + 1) % tabs.length; if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length; if (event.key === 'Home') next = 0; if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectTab(tabs[next].dataset.tab); tabs[next].focus(); }
    });
  }
  clearDetail(); applyLocale(); checkAuth();
}
