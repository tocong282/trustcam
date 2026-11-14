import { normalizeApiUrl } from './core.ts';
export type Credentials = { session_id: string; token: string; device_id: string };
export type Dossier = Credentials & { base: string; created_at: string | null };
export type Preferences = { base: string; credentials: Credentials | null; dossiers: Dossier[] };
// ponytail: one atomic SecureStore value; 4 refs + 2000 UTF-8 bytes avoid historical iOS ~2048-byte rejection. Shard with transactional migration before raising cap.
export const MAX_DOSSIERS = 4;
const MAX_BYTES = 2000;
function fail(): never { throw new Error('storage_error'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function keys(value: object, expected: string[]) { if (Object.keys(value).sort().join(',') !== expected.sort().join(',')) fail(); }
function credentials(value: unknown, deviceId: string): Credentials {
  const data = record(value);
  keys(data, ['session_id', 'token', 'device_id']);
  if (typeof data.session_id !== 'string' || !data.session_id || data.session_id.length > 200 || typeof data.token !== 'string' || !data.token || data.token.length > 4096 || data.device_id !== deviceId) return fail();
  return {session_id: data.session_id, token: data.token, device_id: deviceId};
}
export function parsePreferences(raw: string | null, fallback: string, deviceId: string): Preferences {
  try {
    const data = raw === null ? {base: fallback, credentials: null} : record(JSON.parse(raw));
    keys(data, 'dossiers' in data ? ['base','credentials','dossiers'] : ['base','credentials']);
    if (typeof data.base !== 'string' || !/^[a-f0-9]{64}$/.test(deviceId)) return fail();
    const base = normalizeApiUrl(data.base);
    const auth = data.credentials === null ? null : credentials(data.credentials, deviceId);
    const entries = 'dossiers' in data ? data.dossiers : auth ? [{...auth, base, created_at: null}] : [];
    if (!Array.isArray(entries) || entries.length > MAX_DOSSIERS) return fail();
    const dossiers = entries.map(value => {
      const item = record(value);
      keys(item, ['base','session_id','token','device_id','created_at']);
      if (typeof item.base !== 'string' || normalizeApiUrl(item.base) !== item.base || (item.created_at !== null && (typeof item.created_at !== 'string' || new Date(item.created_at).toISOString() !== item.created_at))) return fail();
      return {...credentials({session_id:item.session_id, token:item.token, device_id:item.device_id}, deviceId), base:item.base, created_at:item.created_at as string | null};
    });
    if (new Set(dossiers.map(item => JSON.stringify([item.base,item.session_id]))).size !== dossiers.length || (auth && !dossiers.some(item => item.base === base && item.session_id === auth.session_id && item.token === auth.token))) return fail();
    return {base, credentials:auth, dossiers};
  } catch { return fail(); }
}
export function dossiersForBase(value: Preferences, base: string): Dossier[] { return value.dossiers.filter(item => item.base === base); }
export async function savePreferences(previous: Preferences, base: string, auth: Credentials | null, deviceId: string, write: (value: string) => Promise<void>, createdAt?: string): Promise<Preferences> {
  const dossiers = [...previous.dossiers];
  if (auth && !dossiers.some(item => item.base === base && item.session_id === auth.session_id && item.token === auth.token && item.device_id === auth.device_id)) {
    if (!createdAt) return fail(); // Selecting requires an existing host-scoped reference.
    if (dossiers.length >= MAX_DOSSIERS) throw new Error('dossier_limit');
    dossiers.push({...auth, base, created_at:createdAt});
  }
  const next = parsePreferences(JSON.stringify({base, credentials:auth, dossiers}), base, deviceId);
  const serialized = JSON.stringify(next);
  if (new TextEncoder().encode(serialized).length > MAX_BYTES) throw new Error('dossier_limit');
  try { await write(serialized); } catch { return fail(); }
  return next;
}
