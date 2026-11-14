import { slots, type Manifest, type Slot } from './core.ts';

export type NextAction = { type: 'capture'; slot: Slot } | { type: 'finalize' };
export type Evidence = { evidence_id: string; slot: Slot; sha256: string; captured_at: string; manifest: Manifest; signature: string; public_key: string; analysis: Analysis | null; replaces_evidence_id: string | null; is_additional?: boolean };
export type Analysis = { mode: 'vlm'; status: 'accepted' | 'retake' | 'uncertain'; slot: Slot; reason: string; model: string; language?: 'vi' | 'en'; reasons?: { vi: string; en: string } };
export type Session = { session_id: string; evidence: Evidence[]; evidence_history: Evidence[]; next_action: NextAction; analysis_mode: 'checklist'; status: 'collecting' | 'finalized'; report_id: string | null; max_evidence?: number };
export type Finalized = { report_id: string; report: { version: string; session_id: string; device_id: string; evidence: Evidence[]; evidence_history: Evidence[]; analysis_mode: 'checklist'; integrity_notice: string } };

export function captureTarget(session: Session | null, replacementId: string | null, additionalSlot: Slot | null = null): { slot: Slot; replaces_evidence_id: string | null; is_additional?: boolean } | null {
  if (session?.status !== 'collecting') return null;
  if (replacementId !== null) {
    const current = session.evidence.find(item => item.evidence_id === replacementId);
    if (!current || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(current.evidence_id)) return null;
    const seen = new Set([current.evidence_id]);
    let cursor = current;
    while (cursor.replaces_evidence_id) {
      const parent = session.evidence_history.find(item => item.evidence_id === cursor.replaces_evidence_id);
      if (!parent || parent.slot !== current.slot || seen.has(parent.evidence_id)) return null;
      seen.add(parent.evidence_id); cursor = parent;
      if (seen.size >= 5) return null;
    }
    return { slot: current.slot, replaces_evidence_id: current.evidence_id };
  }
  if (additionalSlot !== null) return session.max_evidence === 20 && session.evidence.length < 20 && canFinalize(session) && slots.includes(additionalSlot) ? { slot: additionalSlot, replaces_evidence_id: null, is_additional: true } : null;
  return session.next_action.type === 'capture' ? { slot: session.next_action.slot, replaces_evidence_id: null } : null;
}
export function canCapture(session: Session | null): session is Session & { next_action: { type: 'capture'; slot: Slot } } {
  return session?.status === 'collecting' && session.next_action.type === 'capture';
}
export function canFinalize(session: Session | null): boolean {
  return session?.status === 'collecting' && session.next_action.type === 'finalize' && slots.every(slot => session.evidence.some(item => item.slot === slot));
}
function invalid(): never { throw new Error('invalid_response'); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function slot(value: unknown): value is Slot { return slots.includes(value as Slot); }
function hash(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export function parseNextAction(value: unknown): NextAction {
  const data = object(value);
  if (data.type === 'finalize') return { type: 'finalize' };
  if (data.type === 'capture' && slot(data.slot)) return { type: 'capture', slot: data.slot };
  return invalid();
}
export function parseHealth(value: unknown): { vlm_configured: boolean } {
  const data = object(value);
  if (data.status !== 'ok' || data.analysis_mode !== 'checklist' || (data.vlm_configured !== undefined && typeof data.vlm_configured !== 'boolean')) return invalid();
  return { vlm_configured: data.vlm_configured === true };
}
export function parseAnalysis(value: unknown, expectedSlot: Slot): Analysis {
  const data = object(value);
  if (data.mode !== 'vlm' || !['accepted', 'retake', 'uncertain'].includes(data.status as string) || data.slot !== expectedSlot || !text(data.reason) || data.reason.length > 8000 || !text(data.model) || data.model.length > 500) return invalid();
  let localized: Pick<Analysis, 'language' | 'reasons'> = {};
  if ('language' in data || 'reasons' in data) {
    const reasons = object(data.reasons);
    if ((data.language !== 'vi' && data.language !== 'en') || Object.keys(reasons).sort().join(',') !== 'en,vi' ||
      ![reasons.vi, reasons.en].every(value => typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= 500 && !/[\p{C}]/u.test(value)) ||
      data.reason !== reasons[data.language]) return invalid();
    localized = { language: data.language, reasons: { vi: reasons.vi as string, en: reasons.en as string } };
  }
  return { mode: 'vlm', status: data.status as Analysis['status'], slot: expectedSlot, reason: data.reason, model: data.model, ...localized };
}
function parseEvidence(value: unknown, sessionId: string): Evidence {
  const data = object(value), manifest = object(data.manifest);
  if (!text(data.evidence_id) || !slot(data.slot) || !hash(data.sha256) || !text(data.captured_at) || !Number.isFinite(Date.parse(data.captured_at)) || !hash(data.public_key) || typeof data.signature !== 'string' || !/^[a-f0-9]{128}$/.test(data.signature) ||
    manifest.version !== '1' || manifest.session_id !== sessionId || manifest.device_id !== data.public_key || manifest.slot !== data.slot || manifest.sha256 !== data.sha256 || manifest.captured_at !== data.captured_at) return invalid();
  if (data.replaces_evidence_id != null && (typeof data.replaces_evidence_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.replaces_evidence_id) || data.replaces_evidence_id === data.evidence_id)) return invalid();
  if (data.is_additional !== undefined && typeof data.is_additional !== 'boolean') return invalid();
  return { ...(data.is_additional === undefined ? {} : { is_additional: data.is_additional }), replaces_evidence_id: data.replaces_evidence_id as string ?? null, evidence_id: data.evidence_id, slot: data.slot, sha256: data.sha256, captured_at: data.captured_at, manifest: manifest as Manifest, signature: data.signature, public_key: data.public_key, analysis: data.analysis == null ? null : parseAnalysis(data.analysis, data.slot) };
}
function parseHistory(value: unknown, evidence: Evidence[], sessionId: string): Evidence[] {
  if (value !== undefined && !Array.isArray(value)) return invalid();
  const history = (value ?? []) as unknown[];
  if (history.length > 80) return invalid();
  const parsed = history.map(entry => parseEvidence(entry, sessionId));
  const all = [...evidence, ...parsed];
  if (new Set(all.map(entry => entry.evidence_id)).size !== all.length) return invalid();
  return parsed;
}
export function parseReport(value: unknown, sessionId: string): Finalized {
  const data = object(value), report = object(data.report);
  if (!text(data.report_id) || report.version !== '1' || report.session_id !== sessionId || !hash(report.device_id) || report.analysis_mode !== 'checklist' || !text(report.integrity_notice) || !Array.isArray(report.evidence) || report.evidence.length > 20) return invalid();
  const evidence = report.evidence.map(entry => parseEvidence(entry, sessionId));
  const history = parseHistory(report.evidence_history, evidence, sessionId);
  if ([...evidence, ...history].some(entry => entry.public_key !== report.device_id) || new Set(evidence.filter(entry => !entry.is_additional).map(entry => entry.slot)).size !== evidence.filter(entry => !entry.is_additional).length || new Set(evidence.map(entry => entry.evidence_id)).size !== evidence.length) return invalid();
  return { report_id: data.report_id, report: { version: '1', session_id: sessionId, device_id: report.device_id, evidence, evidence_history: history, analysis_mode: 'checklist', integrity_notice: report.integrity_notice } };
}
export function parseSession(value: unknown, sessionId: string, knownReportId: string | null = null): Session {
  const data = object(value);
  if (data.session_id !== sessionId || data.analysis_mode !== 'checklist' || !Array.isArray(data.evidence) || data.evidence.length > 20) return invalid();
  if (data.max_evidence !== undefined && data.max_evidence !== 20) return invalid();
  const status = data.status === undefined ? (knownReportId ? 'finalized' : 'collecting') : data.status;
  const reportId = data.report_id === undefined ? (data.status === undefined ? knownReportId : null) : data.report_id;
  if (!['collecting', 'finalized'].includes(status as string) || (reportId !== null && !text(reportId)) || (status === 'finalized' && !text(reportId)) || (status === 'collecting' && reportId !== null)) return invalid();
  const evidence = data.evidence.map(entry => parseEvidence(entry, sessionId));
  if (new Set(evidence.filter(entry => !entry.is_additional).map(entry => entry.slot)).size !== evidence.filter(entry => !entry.is_additional).length || new Set(evidence.map(entry => entry.evidence_id)).size !== evidence.length) return invalid();
  const history = parseHistory(data.evidence_history, evidence, sessionId);
  const nextAction = parseNextAction(data.next_action);
  if (nextAction.type === 'capture' && evidence.some(entry => entry.slot === nextAction.slot)) return invalid();
  return { ...(data.max_evidence === undefined ? {} : { max_evidence: 20 }), session_id: sessionId, evidence, evidence_history: history, next_action: nextAction, analysis_mode: 'checklist', status: status as Session['status'], report_id: reportId as string | null };
}
