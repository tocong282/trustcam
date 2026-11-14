export function normalizeApiUrl(input: string): string {
  const value = input.trim();
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('invalid_url'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || value.includes('?') || value.includes('#')) throw new Error('invalid_url');
  return url.toString().replace(/\/+$/, '');
}
export function checkImageSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0) throw new Error('invalid_image');
  if (size > 10 * 1024 * 1024) throw new Error('image_too_large');
}
export const errorCodes = ['camera_resolution', 'local_delete_failed', 'stale_evidence', 'revision_limit_reached', 'invalid_replacement', 'evidence_superseded', 'vlm_not_configured', 'vlm_unavailable', 'invalid_analysis', 'invalid_request', 'invalid_url', 'invalid_image', 'image_too_large', 'network_error', 'timeout', 'request_failed', 'unauthorized', 'session_not_found', 'evidence_not_found', 'report_not_found', 'invalid_manifest', 'invalid_signature', 'signature_invalid', 'hash_mismatch', 'session_mismatch', 'device_mismatch', 'slot_already_filled', 'incomplete_checklist', 'session_finalized', 'storage_error', 'camera_error', 'permission_denied', 'key_corrupt', 'invalid_response', 'not_ready', 'image_modified', 'integrity_verified'] as const;
export function errorCode(body: unknown): string {
  const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : null;
  if (Array.isArray(detail)) return 'invalid_request';
  const aliases: Record<string, string> = { auth_required: 'unauthorized', invalid_token: 'unauthorized', session_forbidden: 'unauthorized', image_hash_mismatch: 'hash_mismatch', slot_already_collected: 'slot_already_filled', checklist_incomplete: 'incomplete_checklist', request_too_large: 'image_too_large', invalid_multipart_fields: 'invalid_request', invalid_multipart: 'invalid_request' };
  if (typeof detail !== 'string') return 'request_failed';
  return Object.hasOwn(aliases, detail) ? aliases[detail] : (errorCodes as readonly string[]).includes(detail) ? detail : 'request_failed';
}
export const slots = ['wide_context', 'damage_closeup', 'serial_or_plate', 'identifier_doc'] as const;
export type Slot = typeof slots[number];
export type Manifest = { version: '1'; session_id: string; device_id: string; captured_at: string; slot: Slot; sha256: string };
export function canonicalManifest(value: Manifest): string {
  const keys = ['captured_at', 'device_id', 'session_id', 'sha256', 'slot', 'version'];
  if (Object.keys(value).sort().join() !== keys.join() || value.version !== '1' ||
    !/^[a-f0-9]{64}$/.test(value.device_id) || !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !slots.includes(value.slot) || !keys.every(key => typeof value[key as keyof Manifest] === 'string') || !value.session_id || !Number.isFinite(Date.parse(value.captured_at)) || new Date(value.captured_at).toISOString() !== value.captured_at) throw new Error('invalid_request');
  return JSON.stringify(Object.fromEntries(keys.map(key => [key, value[key as keyof Manifest]])));
}
