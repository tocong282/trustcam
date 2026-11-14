"""Real HTTP + TypeScript signer/Python verifier check. Run from repo root."""
import base64
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CLIENT = r"""
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalManifest, slots } from './src/core.ts';
import { publicKeyHex, signBytes } from './src/signing.ts';
import { request } from './src/api.ts';
let input = ''; for await (const part of process.stdin) input += part;
const { base, original, modified } = JSON.parse(input);
const bytes = Buffer.from(original, 'base64');
const seed = '01'.repeat(32);
const key = publicKeyHex(seed);
const health = await request(base, '/health');
assert.equal(health.analysis_mode, 'checklist');
assert.equal(health.vlm_configured, false);
assert.equal(health.vlm_status, 'not_configured');
const session = await request(base, '/session', undefined, {public_key: key});
assert.equal(session.max_evidence, 20);
assert.equal(session.max_history, 80);
let first;
let extra;
for (const slot of slots) {
  const manifest = canonicalManifest({version:'1', session_id:session.session_id,
    device_id:key, captured_at:'2026-11-14T05:00:00.000Z', slot,
    sha256:createHash('sha256').update(bytes).digest('hex')});
  const form = new FormData();
  form.set('session_id', session.session_id);
  form.set('manifest', manifest);
  form.set('signature', signBytes(new TextEncoder().encode(manifest), seed));
  form.set('image', new Blob([bytes], {type:'image/jpeg'}), 'original.jpg');
  const evidence = await request(base, '/evidence', session.token, form);
  first ??= evidence.evidence_id;
}
const extraManifest = canonicalManifest({version:'1', session_id:session.session_id,
  device_id:key, captured_at:'2026-11-14T05:00:30.000Z', slot:slots[0],
  sha256:createHash('sha256').update(bytes).digest('hex')});
const extraForm = new FormData();
extraForm.set('session_id', session.session_id);
extraForm.set('manifest', extraManifest);
extraForm.set('signature', signBytes(new TextEncoder().encode(extraManifest), seed));
extraForm.set('image', new Blob([bytes], {type:'image/jpeg'}), 'additional.jpg');
extraForm.set('additional', 'true');
extra = await request(base, '/evidence', session.token, extraForm);
assert.equal(extra.is_additional, true);
assert.deepEqual(extra.next_action, {type:'finalize'});
const revisedBytes = Buffer.from(modified, 'base64');
const revisedManifest = canonicalManifest({version:'1', session_id:session.session_id,
  device_id:key, captured_at:'2026-11-14T05:01:00.000Z', slot:slots[0],
  sha256:createHash('sha256').update(revisedBytes).digest('hex')});
const retakeForm = new FormData();
retakeForm.set('session_id', session.session_id);
retakeForm.set('manifest', revisedManifest);
retakeForm.set('signature', signBytes(new TextEncoder().encode(revisedManifest), seed));
retakeForm.set('image', new Blob([revisedBytes], {type:'image/jpeg'}), 'retake.jpg');
retakeForm.set('replaces_evidence_id', first);
const revised = await request(base, '/evidence', session.token, retakeForm);
assert.equal(revised.replaces_evidence_id, first);
assert.notEqual(revised.evidence_id, first);
assert.equal(revised.is_additional, false);
const extraRetake = new FormData();
extraRetake.set('session_id', session.session_id);
extraRetake.set('manifest', revisedManifest);
extraRetake.set('signature', signBytes(new TextEncoder().encode(revisedManifest), seed));
extraRetake.set('image', new Blob([revisedBytes], {type:'image/jpeg'}), 'additional-retake.jpg');
extraRetake.set('replaces_evidence_id', extra.evidence_id);
const revisedExtra = await request(base, '/evidence', session.token, extraRetake);
assert.equal(revisedExtra.is_additional, true);
assert.equal(revisedExtra.replaces_evidence_id, extra.evidence_id);
const staleExtra = await fetch(`${base}/evidence`, {
  method:'POST', headers:{Authorization:`Bearer ${session.token}`}, body:extraRetake});
assert.equal(staleExtra.status, 409);
assert.deepEqual(await staleExtra.json(), {detail:'stale_evidence'});
const stale = await fetch(`${base}/evidence`, {
  method:'POST', headers:{Authorization:`Bearer ${session.token}`}, body:retakeForm});
assert.equal(stale.status, 409);
assert.deepEqual(await stale.json(), {detail:'stale_evidence'});
const superseded = await fetch(`${base}/evidence/${first}/analyze`, {
  method:'POST', headers:{Authorization:`Bearer ${session.token}`}});
assert.equal(superseded.status, 409);
assert.deepEqual(await superseded.json(), {detail:'evidence_superseded'});
const collecting = await request(base, `/session/${session.session_id}`, session.token);
assert.equal(collecting.evidence.length, 5);
assert.equal(collecting.evidence_history.length, 2);
assert.equal(collecting.evidence_history[1].evidence_id, extra.evidence_id);
assert.equal(collecting.evidence_history[1].is_additional, true);
assert.equal(collecting.evidence_history[0].evidence_id, first);
assert.equal(collecting.status, 'collecting');
assert.equal(collecting.report_id, null);
const unavailable = await fetch(`${base}/evidence/${revised.evidence_id}/analyze`, {
  method:'POST', headers:{Authorization:`Bearer ${session.token}`}});
assert.equal(unavailable.status, 503);
assert.deepEqual(await unavailable.json(), {detail:'vlm_not_configured'});
const report = await request(base, `/session/${session.session_id}/finalize`, session.token, {});
const resumed = await request(base, `/session/${session.session_id}`, session.token);
assert.equal(resumed.status, 'finalized');
assert.equal(resumed.report_id, report.report_id);
assert.deepEqual(await request(base, `/session/${session.session_id}/report`, session.token), report);
assert.equal(report.report.evidence.length, 5);
assert.equal(report.report.evidence_history.length, 2);
assert.equal(report.report.evidence.find(record => record.evidence_id === revisedExtra.evidence_id).is_additional, true);
assert.equal(report.report.evidence_history[0].evidence_id, first);
assert.equal(report.report.evidence.find(record => record.slot === slots[0]).evidence_id, revised.evidence_id);
for (const [image, expected, reason] of [[original,'PASS','integrity_verified'],[modified,'FAIL','image_modified']]) {
  const form = new FormData();
  form.set('session_id', session.session_id); form.set('evidence_id', first);
  form.set('image', new Blob([Buffer.from(image,'base64')], {type:'image/jpeg'}), 'verify.jpg');
  const result = await request(base, '/verify', session.token, form);
  assert.equal(result.result, expected); assert.equal(result.reason, reason);
  console.log(`Live HTTP: ${expected} ${reason}`);
}
const revisedVerify = new FormData();
revisedVerify.set('session_id', session.session_id);
revisedVerify.set('evidence_id', revised.evidence_id);
revisedVerify.set('image', new Blob([revisedBytes], {type:'image/jpeg'}), 'retake.jpg');
assert.deepEqual(await request(base, '/verify', session.token, revisedVerify),
  {result:'PASS',reason:'integrity_verified'});
for (const [evidenceId, imageBytes] of [[extra.evidence_id, bytes], [revisedExtra.evidence_id, revisedBytes]]) {
  const form = new FormData();
  form.set('session_id', session.session_id);
  form.set('evidence_id', evidenceId);
  form.set('image', new Blob([imageBytes], {type:'image/jpeg'}), 'additional-verify.jpg');
  assert.deepEqual(await request(base, '/verify', session.token, form),
    {result:'PASS',reason:'integrity_verified'});
}
assert.deepEqual(await request(base, `/session/${session.session_id}/finalize`, session.token, {}), report);
console.log('PASS TypeScript canonical/signing + Python verification + retake/history/stale rejection + fifth additional photo and independent same-slot chains + 5-image report over real HTTP');
"""


def jpeg(color):
    stream = io.BytesIO()
    Image.new('RGB', (24, 24), color).save(stream, format='JPEG')
    return base64.b64encode(stream.getvalue()).decode('ascii')


def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='.test-data-live-', dir=ROOT) as data:
        env = dict(os.environ, TRUSTCAM_DATA_DIR=data, VLM_BASE_URL='', VLM_API_KEY='', VLM_MODEL='')
        with open(Path(data) / 'server.log', 'w+') as log:
            server = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.app:app',
                                       '--host', '127.0.0.1', '--port', str(port)],
                                      cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                for _ in range(100):
                    if server.poll() is not None:
                        raise RuntimeError('uvicorn exited before startup')
                    try:
                        with urllib.request.urlopen(base + '/health', timeout=1) as response:
                            assert response.status == 200
                        break
                    except urllib.error.URLError:
                        time.sleep(0.1)
                else:
                    raise RuntimeError('uvicorn startup timed out')
                result = subprocess.run(['node', '--experimental-strip-types', '--input-type=module', '-e', CLIENT],
                                        input=json.dumps({'base': base, 'original': jpeg('red'), 'modified': jpeg('blue')}),
                                        text=True, cwd=ROOT / 'app', timeout=60)
                if result.returncode:
                    raise RuntimeError(f'Live integration failed ({result.returncode})')
            except Exception:
                log.flush(); log.seek(0); print(log.read(), file=sys.stderr)
                raise
            finally:
                server.terminate()
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server.kill(); server.wait()


if __name__ == '__main__':
    main()
