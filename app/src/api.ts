import { errorCode, normalizeApiUrl } from './core.ts';
export async function request<T>(base: string, path: string, token?: string, body?: object | FormData, timeoutMs = 20000): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) throw new Error('invalid_request');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const multipart = body instanceof FormData;
    const url = normalizeApiUrl(base) + path;
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET', signal: controller.signal, redirect: 'error',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    }).catch(() => { throw new Error('network_error'); }); // All fetch rejections are transport-only; never inspect error names/messages.
    let data: unknown;
    try { data = await response.json(); } catch { throw new Error('invalid_response'); }
    if (!response.ok) throw new Error(errorCode(data));
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('timeout');
    if (error instanceof TypeError) throw new Error('network_error');
    throw error;
  } finally { clearTimeout(timer); }
}
