import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
const core = await import('../src/core.ts').catch(() => ({})) as Record<string, any>;
assert.equal(typeof core.canonicalManifest, 'function', 'canonicalManifest missing');
const manifest = {version:'1',session_id:'session-fixture',device_id:'d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',captured_at:'2026-11-14T00:00:00.000Z',slot:'wide_context',sha256:'ab'.repeat(32)};
const expected = '{"captured_at":"2026-11-14T00:00:00.000Z","device_id":"d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a","session_id":"session-fixture","sha256":"'+ 'ab'.repeat(32)+'","slot":"wide_context","version":"1"}';
assert.equal(core.canonicalManifest(manifest), expected);
// Same fixture independently checked using Python json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False).
assert.equal(core.canonicalManifest(Object.fromEntries(Object.entries(manifest).reverse())), expected);
assert.throws(() => core.canonicalManifest({...manifest,extra:'not signed'}));
assert.throws(() => core.canonicalManifest({...manifest,slot:'unknown'}));
assert.throws(() => core.canonicalManifest({...manifest,session_id:42}));
assert.throws(() => core.canonicalManifest({...manifest,captured_at:'2026-11-14'}));
console.log('PASS canonical UTF-8 fixture, sorted exact fields, validation');
assert.equal(typeof core.normalizeApiUrl, 'function', 'URL validation missing');
assert.equal(core.normalizeApiUrl(' http://localhost:8000/ '), 'http://localhost:8000');
assert.equal(core.normalizeApiUrl('https://example.com/api/'), 'https://example.com/api');
for (const url of ['ftp://example.com', 'https://u:p@example.com','https://example.com?a=b','https://example.com#x', 'bad', 'https://example.com?', 'https://example.com#']) assert.throws(() => core.normalizeApiUrl(url));
assert.equal(core.checkImageSize(10 * 1024 * 1024), undefined);
for (const size of [0, -1, 10 * 1024 * 1024 + 1, NaN]) assert.throws(() => core.checkImageSize(size));
assert.equal(core.errorCode({detail:[{msg:'bad'}]}), 'invalid_request');
assert.equal(core.errorCode({detail:'signature_invalid'}), 'signature_invalid');
for (const [backend, mobile] of Object.entries({auth_required:'unauthorized',invalid_token:'unauthorized',session_forbidden:'unauthorized',image_hash_mismatch:'hash_mismatch',slot_already_collected:'slot_already_filled',checklist_incomplete:'incomplete_checklist',request_too_large:'image_too_large',invalid_multipart_fields:'invalid_request',invalid_multipart:'invalid_request'})) assert.equal(core.errorCode({detail:backend}), mobile);
assert.equal(core.errorCode({detail:'<untrusted>'}), 'request_failed');
console.log('PASS URL trust boundary, exact 10 MiB limit, safe API errors');
const signing = await import('../src/signing.ts').catch(() => ({})) as Record<string, any>;
assert.equal(typeof signing.signBytes, 'function', 'Ed25519 signing missing');
const seed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
assert.equal(signing.publicKeyHex(seed), manifest.device_id);
assert.equal(signing.signBytes(new Uint8Array(), seed), 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b');
const message = new TextEncoder().encode(expected);
const signature = signing.signBytes(message, seed);
const publicKey = createPublicKey({key:Buffer.from('302a300506032b6570032100'+manifest.device_id,'hex'),format:'der',type:'spki'});
assert.equal(verify(null, message, publicKey, Buffer.from(signature,'hex')), true);
assert.equal(verify(null, new TextEncoder().encode(expected+' '), publicKey, Buffer.from(signature,'hex')), false);
assert.throws(() => signing.publicKeyHex('bad'));
console.log('PASS RFC 8032 vector 1 + OpenSSL independent verification of raw canonical bytes');
const locale = await import('../src/locale.ts').catch(() => ({})) as Record<string, any>;
assert.ok(locale.messages, 'bilingual messages missing');
assert.deepEqual(Object.keys(locale.messages.vi).sort(), Object.keys(locale.messages.en).sort());
for (const lang of ['vi','en']) {
 for (const key of [...core.slots,...core.errorCodes]) assert.ok(locale.messages[lang][key], lang+': '+key);
 for (const value of Object.values(locale.messages[lang])) assert.ok(typeof value === 'string' && value.length > 0);
 assert.ok(locale.messages[lang].integrityNotice.includes(lang === 'vi' ? 'không' : 'not'));
}
console.log('PASS VI/EN key parity, all slots and error codes translated, integrity disclaimer');
const api = await import('../src/api.ts').catch(() => ({})) as Record<string, any>;
assert.equal(typeof api.request, 'function', 'HTTP transport missing');
const {createServer} = await import('node:http');
const server = createServer((req, res) => {
 if (req.url === '/slow') return;
 if (req.url === '/redirect') {res.statusCode=302;res.setHeader('Location','/health');res.end();return;}
 res.setHeader('Content-Type','application/json');
 if (req.url === '/bad') {res.statusCode=422;res.end(JSON.stringify({detail:[{msg:'bad'}]}));return;}
 if (req.url === '/secret') {res.statusCode=400;res.end(JSON.stringify({detail:'internal secret'}));return;}
 res.end(JSON.stringify({authorization:req.headers.authorization ?? null}));
});
await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
const address = server.address() as import('node:net').AddressInfo;
const base = 'http://127.0.0.1:'+address.port;
try {
 assert.deepEqual(await api.request(base,'/health'), {authorization:null});
 assert.deepEqual(await api.request(base,'/session/a','token'), {authorization:'Bearer token'});
 await assert.rejects(api.request(base,'/bad'), /invalid_request/);
 await assert.rejects(api.request(base,'/secret'), /request_failed/);
 await assert.rejects(api.request(base,'/slow',undefined,undefined,20), /timeout/);
 await assert.rejects(api.request(base,'/redirect','token'), /network_error/);
 await assert.rejects(api.request(base,'https://other.example/path','token'), /invalid_request/);
} finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
console.log('PASS HTTP bearer auth, safe errors, timeout, no absolute endpoint token leak');
const responses = await import('../src/responses.ts').catch(() => ({})) as Record<string, any>;
assert.equal(typeof responses.parseSession, 'function', 'session response validation missing');
const entry = { evidence_id: 'e1', slot: manifest.slot, sha256: manifest.sha256, captured_at: manifest.captured_at, manifest, signature, public_key: manifest.device_id };
const collected = { session_id: manifest.session_id, evidence: [entry], next_action: { type: 'capture', slot: 'damage_closeup' }, analysis_mode: 'checklist' };
assert.equal(responses.parseSession(collected, manifest.session_id).status, 'collecting');
assert.equal(responses.parseSession(collected, manifest.session_id).report_id, null);
assert.equal(responses.parseSession(collected, manifest.session_id).evidence[0].analysis, null);
const closed = { ...collected, status: 'finalized', report_id: 'r1', next_action: { type: 'finalize' } };
assert.equal(responses.parseSession(closed, manifest.session_id).status, 'finalized');
for (const value of [null, [], {}, {...collected, session_id:'other'}, {...collected, evidence:[null]}, {...collected, evidence:[{...entry, captured_at:42}]}, {...collected, evidence:[{...entry, manifest:null}]}, {...collected, status:'broken'}, {...closed, report_id:null}, {...collected, next_action:{type:'capture',slot:'bad'}}]) {
 assert.throws(() => responses.parseSession(value, manifest.session_id), /invalid_response/);
}
console.log('PASS session validator: legacy fields, finalized state, malformed nested evidence');
assert.equal(typeof responses.parseReport, 'function', 'report response validation missing');
const reportData = { report_id:'r1', report:{version:'1', session_id:manifest.session_id, device_id:manifest.device_id, evidence:[entry], analysis_mode:'checklist', integrity_notice:'Integrity only'} };
assert.equal(responses.parseReport(reportData, manifest.session_id).report_id, 'r1');
for (const value of [null, {}, {...reportData,report_id:42}, {...reportData,report:{...reportData.report,session_id:'other'}}, {...reportData,report:{...reportData.report,evidence:[null]}}]) assert.throws(() => responses.parseReport(value, manifest.session_id), /invalid_response/);
console.log('PASS report envelope and nested evidence validation');
assert.equal(typeof responses.parseAnalysis, 'function', 'VLM response validation missing');
const advisory = {mode:'vlm',status:'retake',slot:manifest.slot,reason:'<untrusted model text>',model:'test-model'};
assert.deepEqual(responses.parseAnalysis(advisory, manifest.slot), advisory);
for (const status of ['accepted','retake','uncertain']) assert.equal(responses.parseAnalysis({...advisory,status},manifest.slot).status,status);
for (const value of [null, {...advisory,status:'PASS'}, {...advisory,slot:'damage_closeup'}, {...advisory,reason:[]}, {...advisory,model:null}, {...advisory,reason:''}]) assert.throws(() => responses.parseAnalysis(value,manifest.slot), /invalid_response/);
assert.equal(responses.parseSession({...collected,evidence:[{...entry,analysis:advisory}]},manifest.session_id).evidence[0].analysis.reason, advisory.reason);
assert.equal(responses.parseHealth({status:'ok',analysis_mode:'checklist'}).vlm_configured,false);
assert.equal(responses.parseHealth({status:'ok',analysis_mode:'checklist',vlm_configured:true}).vlm_configured,true);
for (const value of [null, {}, {status:'ok',analysis_mode:'vlm',vlm_configured:true}, {status:'ok',analysis_mode:'checklist',vlm_configured:'true'}]) assert.throws(() => responses.parseHealth(value), /invalid_response/);
for (const code of ['vlm_not_configured','vlm_unavailable','invalid_analysis']) assert.equal(core.errorCode({detail:code}),code);
console.log('PASS VLM advisory, untrusted reason, health gating and error codes');
assert.equal(typeof responses.canCapture, 'function', 'finalized capture guard missing');
assert.equal(responses.canCapture(responses.parseSession(collected,manifest.session_id)),true);
assert.equal(responses.canCapture(responses.parseSession(closed,manifest.session_id)),false);
assert.equal(responses.canFinalize(responses.parseSession(closed,manifest.session_id)),false);
assert.equal(responses.canFinalize(responses.parseSession({...collected,next_action:{type:'finalize'}},manifest.session_id)),false, 'Four required categories must be present');
assert.equal(responses.canCapture(null),false);
assert.equal(responses.canFinalize(null),false);
console.log('PASS finalized capture/finalize guards');
// Local copy and token changes are deliberately deferred until native persistence succeeds.
const { readFile } = await import('node:fs/promises');
const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
const saveSource = appSource.slice(appSource.indexOf('  async function saveUrl()'), appSource.indexOf('  async function pickVerify()'));
assert.ok(saveSource.indexOf("confirm('save', 'changeApiConfirm')") < saveSource.indexOf('await persist(next, null)'));
assert.ok(saveSource.indexOf('await persist(next, null)') < saveSource.indexOf('setCredentials(null)'));
assert.ok(!saveSource.includes('setLocalImages({})'), 'API switch retains local photos across all sessions');
const createSource = appSource.slice(appSource.indexOf('  async function createSession()'), appSource.indexOf('  async function capture()'));
assert.ok(createSource.indexOf("confirm('createSession', 'replaceSessionConfirm')") < createSource.indexOf("'/session'"));
assert.ok(createSource.indexOf('await persist(base, next, createdAt)') < createSource.indexOf('setCredentials(next)'));
const analysisSource = appSource.slice(appSource.indexOf('  async function analyze('), appSource.indexOf('  async function refresh()'));
assert.ok(analysisSource.indexOf("confirm('analyze', 'analysisPrivacy')") < analysisSource.indexOf('/analyze`'));
console.log('PASS source wiring guards: confirmation before request, persistence before reference reset');
assert.throws(() => responses.parseSession({...collected,next_action:{type:'capture',slot:'wide_context'}},manifest.session_id), /invalid_response/);
assert.throws(() => responses.parseReport({...reportData,report:{...reportData.report,evidence:[entry,entry]}},manifest.session_id), /invalid_response/);
console.log('PASS reject occupied next capture slot and duplicate report evidence');
assert.equal(responses.parseSession({...collected,next_action:{type:'finalize'}},manifest.session_id,'known-report').status,'finalized');
assert.equal(responses.parseSession({...collected,next_action:{type:'finalize'}},manifest.session_id,'known-report').report_id,'known-report');
console.log('PASS legacy refresh preserves locally known finalized report');
