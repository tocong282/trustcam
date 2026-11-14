import { normalizeApiUrl, slots, type Slot } from './core.ts';
export type LocalPhoto = { version: 1; name: string; base: string; session_id: string; evidence_id: string | null; sha256: string; slot: Slot; captured_at: string };
export function ownedPhotoName(name: string): boolean {
  return /^trustcam-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/.test(name);
}
export function parseLocalPhoto(value: unknown): LocalPhoto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('storage_error');
  const data = value as LocalPhoto;
  const keys = ['version','name','base','session_id','evidence_id','sha256','slot','captured_at'];
  try {
    if (Object.keys(data).length !== keys.length || !keys.every(key => Object.hasOwn(data, key)) || data.version !== 1 || typeof data.name !== 'string' || !ownedPhotoName(data.name) || typeof data.base !== 'string' || normalizeApiUrl(data.base) !== data.base || typeof data.session_id !== 'string' || !data.session_id || data.session_id.length > 200 || (data.evidence_id !== null && (typeof data.evidence_id !== 'string' || !data.evidence_id || data.evidence_id.length > 200)) || typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256) || !slots.includes(data.slot) || typeof data.captured_at !== 'string' || new Date(data.captured_at).toISOString() !== data.captured_at) throw new Error();
  } catch { throw new Error('storage_error'); }
  return data;
}
export function ownedNamesFromEntries(names: string[]): string[] {
  return [...new Set(names.map(name => name.replace(/\.(?:linked\.)?json(?:\.tmp)?$/, '')).filter(ownedPhotoName))];
}
export function matchPendingEvidence<T extends { evidence_id: string; sha256: string; slot: string; captured_at: string }>(pending: LocalPhoto, base: string, sessionId: string, evidence: T[]): T | null {
  if (pending.evidence_id !== null || pending.base !== base || pending.session_id !== sessionId) return null;
  return evidence.find(item => item.sha256 === pending.sha256 && item.slot === pending.slot && item.captured_at === pending.captured_at) ?? null;
}
export function localForEvidence(entries: LocalPhoto[], base: string, sessionId: string, evidenceId: string): LocalPhoto | null {
  return entries.find(item => item.base === base && item.session_id === sessionId && item.evidence_id === evidenceId) ?? null;
}
export function deleteOwnedPhotos<T>(entries: T[], remove: (entry: T) => void): { remaining: T[]; failed: number } {
  const remaining = entries.filter(entry => { try { remove(entry); return false; } catch { return true; } });
  return { remaining, failed: remaining.length };
}
