"""Local HTTP protocol checks only; no actual VLM semantic assessment."""
import base64
import gzip
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib
import json
import os
from pathlib import Path
import sqlite3
import threading
import tempfile
import time
import unittest
from typing import Any
from unittest.mock import patch

import test_backend as existing


class VLMTest(unittest.TestCase):
    setUp = existing.BackendTest.setUp
    session = existing.BackendTest.session
    auth = existing.BackendTest.auth
    upload = existing.BackendTest.upload
    verify = existing.BackendTest.verify

    client: existing.TestClient
    directory: tempfile.TemporaryDirectory

    def provider(self):
        self.requests = []
        self.provider_status = 200
        self.provider_delay = 0
        self.provider_hook = None
        self.provider_body = self.reply()
        self.provider_encoding = None
        test = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                test.requests.append((self.path, self.headers['Authorization'], body))
                # Real SQLite write proves no lock spans provider call.
                with sqlite3.connect(Path(test.directory.name) / 'trustcam.sqlite3', timeout=0.1) as db:
                    db.execute('BEGIN IMMEDIATE')
                if test.provider_hook:
                    test.provider_hook()
                time.sleep(test.provider_delay)
                self.send_response(test.provider_status)
                self.send_header('Content-Type', 'application/json')
                if test.provider_encoding:
                    self.send_header('Content-Encoding', test.provider_encoding)
                self.end_headers()
                try:
                    self.wfile.write(test.provider_body)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            def log_message(self, format, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        env = {'VLM_BASE_URL': f'http://127.0.0.1:{server.server_port}/v1',
               'VLM_API_KEY': 'test-provider-secret', 'VLM_MODEL': 'test-vision-model'}
        with patch.dict(os.environ, env):
            client = existing.TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
        self.addCleanup(client.close)
        self.client = client
        return env

    def reply(self, language='vi', **changes):
        # Protocol fixtures do not test linguistic accuracy.
        reasons = {'vi': 'Local protocol fixture, not visual assessment.',
                   'en': 'Local protocol fixture, not visual assessment.'}
        if 'reason' in changes:
            reasons[language] = changes['reason']
        value = {'status': 'accepted', 'slot': existing.SLOTS[0],
                 'reason': reasons[language], 'confidence': 0.8, 'reasons': reasons}
        value.update(changes)
        return json.dumps({'choices': [{'finish_reason': 'stop', 'message':
                          {'role': 'assistant', 'content': json.dumps(value)}}]}).encode()

    def analyze(self, session, evidence_id):
        return self.client.post('/evidence/' + evidence_id + '/analyze', headers=self.auth(session))

    def test_real_http_provider_signed_bytes_and_atomic_cache(self):
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        self.provider()
        health = self.client.get('/health').json()
        self.assertTrue(health['vlm_configured'])
        self.assertEqual(health['vlm_status'], 'not_checked')
        self.assertEqual(self.requests, [])
        response = self.analyze(session, evidence_id)
        self.assertEqual(response.status_code, 200, response.text)
        value = response.json()
        self.assertEqual(value, {'evidence_id': evidence_id, 'analysis': {
            'mode': 'vlm', 'status': 'accepted', 'slot': existing.SLOTS[0],
            'reason': 'Local protocol fixture, not visual assessment.', 'model': 'test-vision-model',
            'language': 'vi', 'reasons': {
                'vi': 'Local protocol fixture, not visual assessment.',
                'en': 'Local protocol fixture, not visual assessment.'}},
            'next_action': {'type': 'capture', 'slot': existing.SLOTS[1]}})
        path, auth, body = self.requests[0]
        self.assertEqual(path, '/v1/chat/completions')
        self.assertEqual(auth, 'Bearer test-provider-secret')
        self.assertEqual(body['model'], 'test-vision-model')
        self.assertNotIn('tools', body)
        self.assertEqual(body['response_format'], {'type': 'json_object'})
        self.assertGreater(body['max_tokens'], 400)
        self.assertLessEqual(body['max_tokens'], 2048)
        prompt = body['messages'][0]['content']
        self.assertIn('Vietnamese', prompt)
        self.assertIn('English', prompt)
        self.assertIn('reason must equal reasons["vi"]', prompt)
        image = body['messages'][1]['content'][1]['image_url']['url']
        self.assertEqual(image, 'data:image/jpeg;base64,' + base64.b64encode(existing.photo()).decode())
        self.assertIn('untrusted', body['messages'][0]['content'])
        url = '/session/' + session['session_id']
        listing = self.client.get(url, headers=self.auth(session)).json()
        self.assertEqual(listing['evidence'][0]['analysis'], value['analysis'])
        self.assertEqual(listing['analysis_mode'], 'checklist')
        self.assertEqual(self.verify(session, evidence_id).json()['result'], 'PASS')
        self.provider_status = 500
        self.assertEqual(self.analyze(session, evidence_id).json(), value)
        self.assertEqual(len(self.requests), 1)
        restarted = existing.TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
        self.addCleanup(restarted.close)
        self.assertEqual(restarted.get(url, headers=self.auth(session)).json(), listing)
        with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
            stored = db.execute('SELECT image, analysis FROM evidence').fetchone()
        self.assertEqual(stored[0], existing.photo())
        self.assertEqual(json.loads(stored[1]), value['analysis'])

    def test_requested_language_bilingual_result_and_alternate_cache(self):
        self.provider()
        reasons = {'vi': 'Chi tiết nhìn rõ.', 'en': 'Detail is visible.'}
        for language, alternate in (('vi', 'en'), ('en', 'vi')):
            with self.subTest(language=language):
                session = self.session()
                evidence_id = self.upload(session).json()['evidence_id']
                url = '/evidence/' + evidence_id + '/analyze'
                self.provider_body = self.reply(
                    language=language, reasons=reasons, reason=reasons[language])
                response = self.client.post(url, headers=self.auth(session), json={'language': language})
                self.assertEqual(response.status_code, 200, response.text)
                value = response.json()
                self.assertEqual(value['analysis']['language'], language)
                self.assertEqual(value['analysis']['reason'], reasons[language])
                self.assertEqual(value['analysis']['reasons'], reasons)
                prompt = self.requests[-1][2]['messages'][0]['content']
                self.assertIn('reason must equal reasons["' + language + '"]', prompt)
                self.assertEqual(self.client.post(url, headers=self.auth(session),
                    json={'language': alternate}).json(), value)
                listing = self.client.get('/session/' + session['session_id'],
                                          headers=self.auth(session)).json()
                self.assertEqual(listing['evidence'][0]['analysis'], value['analysis'])
                self.assertEqual(self.verify(session, evidence_id).json()['result'], 'PASS')
        self.assertEqual(len(self.requests), 2)

    def test_retake_archives_analysis_and_rejects_superseded_without_provider(self):
        self.provider()
        self.provider_body = self.reply(status='retake')
        session = self.session()
        url = '/session/' + session['session_id']
        first = self.upload(session).json()['evidence_id']
        analysis = self.analyze(session, first).json()['analysis']
        before = self.client.get(url, headers=self.auth(session)).json()['evidence'][0]
        revised = self.upload(session, image=existing.photo('blue'), replaces=first).json()['evidence_id']
        response = self.analyze(session, first)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json(), {'detail': 'evidence_superseded'})
        stranger = self.session()
        self.assertEqual(self.analyze(stranger, first).status_code, 403)
        self.assertEqual(self.client.post('/evidence/' + first + '/analyze').status_code, 401)
        self.assertEqual(len(self.requests), 1)
        listing = self.client.get(url, headers=self.auth(session)).json()
        self.assertEqual(listing['evidence_history'], [before])
        self.assertEqual(listing['evidence_history'][0]['analysis'], analysis)
        self.assertNotIn('analysis', listing['evidence'][0])
        self.provider_body = self.reply()
        self.assertEqual(self.analyze(session, revised).status_code, 200)

    def test_analysis_superseded_during_provider_call_never_commits_late_result(self):
        self.provider()
        session = self.session()
        first = self.upload(session).json()['evidence_id']
        replacements = []
        self.provider_hook = lambda: replacements.append(self.upload(session, replaces=first))
        response = self.analyze(session, first)
        self.assertEqual(replacements[0].status_code, 200, replacements[0].text)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json(), {'detail': 'evidence_superseded'})
        listing = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
        self.assertTrue(all('analysis' not in r for r in listing['evidence'] + listing['evidence_history']))

    def test_invalid_provider_settings_disable_without_network(self):
        base = {'VLM_BASE_URL': 'https://provider.example/v1', 'VLM_API_KEY': 'secret',
                'VLM_MODEL': 'model'}
        changes = [{'VLM_BASE_URL': value} for value in (
            'file:///etc/passwd', 'ftp://host/v1', '//host/v1', 'http://',
            'http://host:bad/v1', 'http://user:secret@host/v1', 'http://host/v1?key=secret',
            'http://host/v1#fragment', 'http://host/\\evil', ' http://host',
            'http://host/\nheader')]
        changes += [{'VLM_API_KEY': value} for value in ('', 'key\nsecret', 'é', ' ')]
        changes += [{'VLM_MODEL': value} for value in ('', ' ', 'm\nsecret', 'm' * 201)]
        for change in changes:
            with self.subTest(change=change), patch.dict(os.environ, base | change):
                client = existing.TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
                with client:
                    health = client.get('/health').json()
                    self.assertFalse(health['vlm_configured'])
                    self.assertNotIn('secret', json.dumps(health))

    def test_malformed_model_output_rejected_without_persistence(self):
        self.provider()
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        changes: list[dict[str, Any]] = [
            {'status': 'approved'}, {'status': []}, {'slot': 'unknown'},
            {'slot': existing.SLOTS[1]}, {'reason': ''}, {'reason': '   '},
            {'reason': 123}, {'reason': 'x' * 501}, {'reason': 'x\nsecret'},
            {'reason': '\ud800'}, {'confidence': -0.01}, {'confidence': 1.01},
            {'confidence': True}, {'confidence': '0.8'}, {'confidence': float('nan')},
            {'confidence': float('inf')}, {'unknown': 'not allowed'}]
        invalid = [self.reply(**change) for change in changes]
        invalid += [b'not json', b'null', b'{}', b'[]', b'\xff', b'x' * 32769]
        good = json.loads(self.reply())
        for content in ('[]', '{}', 'null', '```json\n{}\n```', 'x' * 24577,
                        '{"status":"retake","status":"accepted","slot":"wide_context",'
                        '"reason":"x","confidence":0.8}'):
            envelope = json.loads(self.reply())
            envelope['choices'][0]['message']['content'] = content
            invalid.append(json.dumps(envelope).encode())
        for change in ({'finish_reason': 'length'}, {'finish_reason': 'tool_calls'},
                       {'message': {'content': '{}', 'tool_calls': [{'function': 'ignored'}]}},
                       {'message': {'content': '{}', 'refusal': 'cannot assess'}}):
            envelope = json.loads(self.reply())
            envelope['choices'][0].update(change)
            invalid.append(json.dumps(envelope).encode())
        good['choices'].append(good['choices'][0])
        invalid.append(json.dumps(good).encode())
        for body in invalid:
            with self.subTest(body=body[:120]):
                self.provider_body = body
                response = self.analyze(session, evidence_id)
                self.assertEqual(response.status_code, 502, response.text)
                self.assertEqual(response.json(), {'detail': 'invalid_analysis'})
                listing = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
                self.assertNotIn('analysis', listing['evidence'][0])
        self.provider_body = self.reply()
        self.assertEqual(self.analyze(session, evidence_id).status_code, 200)

    def test_bilingual_output_required_and_both_reasons_validated(self):
        self.provider()
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        good = json.loads(json.loads(self.reply())['choices'][0]['message']['content'])
        invalid = [dict(good, reasons=value) for value in (
            None, [], 'vi', {}, {'vi': 'x'}, {'en': 'x'},
            {'vi': 'x', 'en': 'y', 'fr': 'z'})]
        legacy = dict(good)
        del legacy['reasons']
        invalid.append(legacy)
        for language in ('vi', 'en'):
            for reason in ('', ' ', None, 1, [], 'x' * 501, 'x\n', '\x00',
                           '\x7f', '\ud800', '\u200b'):
                invalid.append(dict(good, reasons=dict(good['reasons'], **{language: reason})))
        invalid.append(dict(good, reason='Different from selected language'))
        contents = [json.dumps(value) for value in invalid]
        contents += [json.dumps(good).replace('"reasons": {', '"reasons": {"vi":"duplicate",'),
                     json.dumps(good)[:-1] + ',"reason":"duplicate"}']
        for content in contents:
            with self.subTest(content=repr(content)):
                envelope = json.loads(self.reply())
                envelope['choices'][0]['message']['content'] = content
                self.provider_body = json.dumps(envelope).encode()
                response = self.analyze(session, evidence_id)
                self.assertEqual(response.status_code, 502, response.text)
                self.assertEqual(response.json(), {'detail': 'invalid_analysis'})
                with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
                    self.assertIsNone(db.execute('SELECT analysis FROM evidence WHERE evidence_id=?',
                                                (evidence_id,)).fetchone()[0])
        self.provider_body = self.reply()
        self.assertEqual(self.analyze(session, evidence_id).status_code, 200)

    def test_bilingual_reason_bounds_and_default_parser_compatibility(self):
        from backend.vlm import parse_analysis
        for reason in ('x', 'ế' * 500, '😀' * 500):
            reasons = {'vi': reason, 'en': reason}
            result = parse_analysis(self.reply(reason=reason, reasons=reasons),
                                    existing.SLOTS[0], 'test-vision-model')
            self.assertEqual(result['language'], 'vi')
            self.assertEqual(result['reasons'], reasons)
            self.assertEqual(result['reason'], reason)

    def test_legacy_cache_language_request_preserves_original_and_report_bytes(self):
        self.provider()
        session = self.session()
        ids = [self.upload(session, slot).json()['evidence_id'] for slot in existing.SLOTS]
        legacy = {'mode': 'vlm', 'status': 'accepted', 'slot': existing.SLOTS[0],
                  'reason': 'Original single-language fixture.', 'model': 'old-model'}
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        original = json.dumps(legacy, indent=2)
        with sqlite3.connect(database) as db:
            db.execute('UPDATE evidence SET analysis=? WHERE evidence_id=?', (original, ids[0]))
        url = '/session/' + session['session_id']
        for language in ('vi', 'en'):
            response = self.client.post('/evidence/' + ids[0] + '/analyze',
                                       headers=self.auth(session), json={'language': language})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()['analysis'], legacy)
            with sqlite3.connect(database) as db:
                self.assertEqual(db.execute('SELECT analysis FROM evidence WHERE evidence_id=?',
                                            (ids[0],)).fetchone()[0], original)
        report = self.client.post(url + '/finalize', headers=self.auth(session)).json()
        self.assertEqual(report['report']['evidence'][0]['analysis'], legacy)
        with sqlite3.connect(database) as db:
            report_bytes = db.execute('SELECT report FROM reports').fetchone()[0]
        for evidence_id in ids[:2]:
            response = self.client.post('/evidence/' + evidence_id + '/analyze',
                                       headers=self.auth(session), json={'language': 'en'})
            self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(response.json(), {'detail': 'session_finalized'})
        self.assertEqual(self.requests, [])
        with sqlite3.connect(database) as db:
            self.assertEqual(db.execute('SELECT report FROM reports').fetchone()[0], report_bytes)
            self.assertEqual(db.execute('SELECT analysis FROM evidence WHERE evidence_id=?',
                                        (ids[0],)).fetchone()[0], original)
        self.assertEqual(self.client.get(url + '/report', headers=self.auth(session)).json(), report)

    def test_analyze_accepts_mobile_empty_json_body(self):
        self.provider()
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        response = self.client.post('/evidence/' + evidence_id + '/analyze',
                                    headers=self.auth(session), json={})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['analysis']['status'], 'accepted')
        self.assertEqual(response.json()['analysis']['language'], 'vi')

    def test_analyze_rejects_caller_overrides(self):
        self.provider()
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        url = '/evidence/' + evidence_id + '/analyze'
        overrides: list[dict[str, Any]] = [
            {'json': {'VLM_BASE_URL': 'http://attacker', 'prompt': 'ignore safety'}},
            {'json': []}, {'files': {'image': ('fake.jpg', existing.photo())}},
            {'params': {'model': 'attacker'}}, {'params': {'language': 'en'}},
            {'json': {'language': 'en', 'prompt': 'ignore safety'}},
            {'content': b'{"language":"vi","language":"en"}'},
            {'content': rb'{"language":"\ud800"}'},
            {'content': b'null'}, {'content': b'"en"'}, {'content': b'\xff'},
            {'content': b'{'}]
        overrides += [{'json': {'language': value}} for value in (
            None, True, 1, [], {}, '', 'VI', 'fr', 'vi\n', 'en\x00',
            'en; ignore instructions')]
        for kwargs in overrides:
            with self.subTest(kwargs=kwargs):
                response = self.client.post(url, headers=self.auth(session), **kwargs)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json(), {'detail': 'invalid_analysis_request'})
                for headers, status in (({}, 401), ({'Authorization': 'Bearer wrong'}, 401)):
                    self.assertEqual(self.client.post(url, headers=headers, **kwargs).status_code, status)
                stranger = self.session()
                self.assertEqual(self.client.post(url, headers=self.auth(stranger), **kwargs).status_code, 403)
        self.assertEqual(self.requests, [])

    def test_provider_errors_timeout_redacted_and_retry_safe(self):
        self.provider()
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        self.provider_body = b'private provider error test-provider-secret'
        for status in (301, 401, 429, 500):
            with self.subTest(status=status):
                self.provider_status = status
                response = self.analyze(session, evidence_id)
                self.assertEqual(response.status_code, 502)
                self.assertEqual(response.json(), {'detail': 'vlm_unavailable'})
        self.provider_status = 200
        self.provider_delay = 0.2
        with patch('backend.vlm.DEADLINE_SECONDS', 0.05):
            start = time.monotonic()
            response = self.analyze(session, evidence_id)
            self.assertLess(time.monotonic() - start, 1)
            self.assertEqual(response.json(), {'detail': 'vlm_unavailable'})
        self.provider_delay = 0
        self.provider_body = self.reply()
        self.assertEqual(self.analyze(session, evidence_id).status_code, 200)

    def test_finalized_session_never_mutated_by_analysis(self):
        self.provider()
        session = self.session()
        ids = [self.upload(session, slot).json()['evidence_id'] for slot in existing.SLOTS]
        url = '/session/' + session['session_id']
        self.provider_hook = lambda: self.client.post(url + '/finalize', headers=self.auth(session))
        response = self.analyze(session, ids[0])
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json(), {'detail': 'session_finalized'})
        self.assertEqual(self.analyze(session, ids[1]).json(), {'detail': 'session_finalized'})
        self.assertEqual(len(self.requests), 1)
        listing = self.client.get(url, headers=self.auth(session)).json()
        self.assertEqual(listing['status'], 'finalized')
        self.assertTrue(all('analysis' not in r for r in listing['evidence']))
        report = self.client.get(url + '/report', headers=self.auth(session)).json()
        self.assertEqual(self.client.post(url + '/finalize', headers=self.auth(session)).json(), report)

    def test_stored_signed_binding_checked_before_provider(self):
        self.provider()
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
            original: dict[str, Any] = dict(zip(('image', 'signature', 'manifest', 'public_key', 'sha256', 'captured_at'),
                                db.execute('SELECT image, signature, manifest, public_key, sha256, captured_at '
                                           'FROM evidence WHERE evidence_id=?', (evidence_id,)).fetchone()))
        for field, value, code in (
                ('image', existing.photo('blue'), 'image_hash_mismatch'),
                ('signature', '00' * 64, 'signature_invalid'),
                ('manifest', '{}', 'signature_invalid'),
                ('public_key', '00' * 32, 'signature_invalid'),
                ('sha256', '00' * 32, 'signature_invalid'),
                ('captured_at', '2025-01-01T00:00:00Z', 'signature_invalid')):
            with self.subTest(field=field):
                with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
                    db.execute(f'UPDATE evidence SET {field}=? WHERE evidence_id=?', (value, evidence_id))
                response = self.analyze(session, evidence_id)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json(), {'detail': code})
                with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
                    db.execute(f'UPDATE evidence SET {field}=? WHERE evidence_id=?', (original[field], evidence_id))
        self.assertEqual(self.requests, [])

    def test_advisory_retake_uncertain_preserves_checklist_finalization(self):
        self.provider()
        session = self.session()
        url = '/session/' + session['session_id']
        for slot, status in zip(existing.SLOTS, ('retake', 'uncertain', 'accepted', 'accepted')):
            evidence_id = self.upload(session, slot, image=existing.photo(fmt='PNG')).json()['evidence_id']
            self.provider_body = self.reply(slot=slot, status=status)
            response = self.analyze(session, evidence_id)
            self.assertEqual(response.status_code, 200, response.text)
            action = response.json()['next_action']
            if status != 'accepted':
                self.assertEqual(action, {'type': 'capture', 'slot': slot})
            if slot == existing.SLOTS[-1]:
                self.assertEqual(action, {'type': 'finalize'})
        self.assertTrue(self.requests[0][2]['messages'][1]['content'][1]['image_url']['url'].startswith(
            'data:image/png;base64,'))
        self.assertEqual(self.upload(session).json(), {'detail': 'slot_already_collected'})
        report = self.client.post(url + '/finalize', headers=self.auth(session)).json()
        self.assertEqual(report['report']['analysis_mode'], 'checklist')
        self.assertEqual(report['report']['evidence'][0]['analysis']['status'], 'retake')
        self.assertIn('advisory', report['report']['integrity_notice'])

    def test_legacy_database_migration_preserves_images_tokens_reports(self):
        session = self.session()
        ids = [self.upload(session, slot).json()['evidence_id'] for slot in existing.SLOTS]
        url = '/session/' + session['session_id']
        report = self.client.post(url + '/finalize', headers=self.auth(session)).json()
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        with sqlite3.connect(database) as db:
            db.execute('ALTER TABLE evidence DROP COLUMN analysis')
            before = db.execute('SELECT * FROM evidence').fetchall()
            tokens = db.execute('SELECT * FROM sessions').fetchall()
            reports = db.execute('SELECT * FROM reports').fetchall()
        restarted = existing.TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
        self.addCleanup(restarted.close)
        self.assertEqual(restarted.get(url + '/report', headers=self.auth(session)).json(), report)
        self.assertEqual(self.verify(session, ids[0], client=restarted).json()['result'], 'PASS')
        with sqlite3.connect(database) as db:
            self.assertEqual(db.execute('SELECT * FROM sessions').fetchall(), tokens)
            self.assertEqual(db.execute('SELECT * FROM reports').fetchall(), reports)
            self.assertEqual([r[:-1] for r in db.execute('SELECT * FROM evidence')], before)
            self.assertEqual(db.execute('SELECT analysis FROM evidence').fetchall(), [(None,)] * 4)

    def test_configured_auth_isolation_never_contacts_provider(self):
        self.provider()
        owner = self.session()
        evidence_id = self.upload(owner).json()['evidence_id']
        stranger = self.session()
        url = '/evidence/' + evidence_id + '/analyze'
        for headers, status in (({}, 401), ({'Authorization': 'Bearer wrong'}, 401),
                                (self.auth(stranger), 403)):
            self.assertEqual(self.client.post(url, headers=headers).status_code, status)
        self.assertEqual(self.requests, [])
        listing = self.client.get('/session/' + owner['session_id'], headers=self.auth(owner)).json()
        self.assertNotIn('analysis', listing['evidence'][0])

    def test_concurrent_valid_result_never_overwrites_first_commit(self):
        self.provider()
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        first = {'mode': 'vlm', 'status': 'uncertain', 'slot': existing.SLOTS[0],
                 'reason': 'First committed protocol fixture.', 'model': 'test-vision-model'}

        def commit_first():
            with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
                db.execute('UPDATE evidence SET analysis=? WHERE evidence_id=?',
                           (json.dumps(first), evidence_id))

        self.provider_hook = commit_first
        response = self.analyze(session, evidence_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['analysis'], first)
        self.assertEqual(response.json()['next_action'], {'type': 'capture', 'slot': existing.SLOTS[0]})

    def test_connection_failure_is_safe(self):
        import socket
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            base = f'http://127.0.0.1:{sock.getsockname()[1]}/v1'
            with patch.dict(os.environ, {'VLM_BASE_URL': base, 'VLM_API_KEY': 'test-secret',
                                        'VLM_MODEL': 'test-model'}):
                self.client = existing.TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
            self.addCleanup(self.client.close)
            session = self.session()
            evidence_id = self.upload(session).json()['evidence_id']
            response = self.analyze(session, evidence_id)
            self.assertEqual(response.status_code, 502)
            self.assertEqual(response.json(), {'detail': 'vlm_unavailable'})
            self.assertEqual(self.verify(session, evidence_id).json()['result'], 'PASS')

    def test_compressed_provider_response_rejected_before_expansion(self):
        self.provider()
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        self.provider_encoding = 'gzip'
        self.provider_body = gzip.compress(self.reply())
        response = self.analyze(session, evidence_id)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {'detail': 'invalid_analysis'})

    def test_optional_configuration_missing_and_auth_first(self):
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        url = '/evidence/' + evidence_id + '/analyze'
        self.assertEqual(self.client.post(url).status_code, 401)
        self.assertEqual(self.client.post('/evidence/unknown/analyze',
                         headers={'Authorization': 'Bearer wrong'}).status_code, 401)
        stranger = self.session()
        self.assertEqual(self.client.post(url, headers=self.auth(stranger)).status_code, 403)
        self.assertEqual(self.client.post('/evidence/unknown/analyze',
                         headers=self.auth(session)).status_code, 404)
        response = self.client.post(url, headers=self.auth(session))
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(response.json(), {'detail': 'vlm_not_configured'})
        self.assertEqual(self.client.get('/health').json()['vlm_status'], 'not_configured')
        self.assertEqual(self.verify(session, evidence_id).json()['result'], 'PASS')
        self.assertEqual(self.upload(session, existing.SLOTS[1]).status_code, 200)

    def test_resume_report_authenticated_before_lookup(self):
        session = self.session()
        url = '/session/' + session['session_id']
        listing = self.client.get(url, headers=self.auth(session)).json()
        self.assertEqual(listing['status'], 'collecting')
        self.assertIsNone(listing['report_id'])
        self.assertEqual(self.client.get(url + '/report', headers=self.auth(session)).json(),
                         {'detail': 'report_not_found'})
        self.assertEqual(self.client.get('/session/unknown/report').status_code, 401)
        self.assertEqual(self.client.get('/session/unknown/report',
                         headers={'Authorization': 'Bearer wrong'}).status_code, 401)
        stranger = self.session()
        self.assertEqual(self.client.get(url + '/report', headers=self.auth(stranger)).status_code, 403)
        for slot in existing.SLOTS:
            self.assertEqual(self.upload(session, slot).status_code, 200)
        report = self.client.post(url + '/finalize', headers=self.auth(session)).json()
        self.assertEqual(self.client.get(url + '/report', headers=self.auth(session)).json(), report)
        listing = self.client.get(url, headers=self.auth(session)).json()
        self.assertEqual(listing['status'], 'finalized')
        self.assertEqual(listing['report_id'], report['report_id'])
        restarted = existing.TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
        self.addCleanup(restarted.close)
        self.assertEqual(restarted.get(url + '/report', headers=self.auth(session)).json(), report)
