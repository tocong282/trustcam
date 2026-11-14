"""Run: python -m unittest discover -s tests -p test_dashboard.py -v"""
import hashlib
import importlib
import io
import json
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from nacl.signing import SigningKey
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def photo(color='red', fmt='JPEG'):
    output = io.BytesIO()
    Image.new('RGB', (16, 16), color).save(output, format=fmt)
    return output.getvalue()


class DashboardTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.password = secrets.token_urlsafe(24)
        config = patch.dict(os.environ, {'TRUSTCAM_DATA_DIR': self.directory.name,
            'TRUSTCAM_DASHBOARD_PASSWORD': self.password, 'TRUSTCAM_DASHBOARD_ALLOW_HTTP': '',
            'VLM_BASE_URL': '', 'VLM_API_KEY': '', 'VLM_MODEL': ''})
        config.start()
        self.addCleanup(config.stop)
        self.backend = importlib.import_module('backend.app')
        self.key = SigningKey.generate()

    def make_client(self, base_url='https://testserver'):
        self.app = self.backend.create_app(self.directory.name)
        self.dashboard = importlib.import_module('backend.dashboard')
        client = TestClient(self.app, base_url=base_url)
        self.addCleanup(client.close)
        return client

    def test_create_app_installs_dashboard_api_before_native_static(self):
        client = self.make_client()
        response = client.get('/dashboard/api/me')
        self.assertEqual(response.status_code, 401, response.text)
        self.login(client)
        self.assertEqual(client.get('/dashboard/api/sessions').json(), {'sessions': []})
        paths = [route.path for route in self.app.routes]
        self.assertEqual(paths[-1], '/dashboard')
        self.assertLess(paths.index('/dashboard/api/login'), paths.index('/dashboard'))
        from starlette.staticfiles import StaticFiles
        self.assertIsInstance(self.app.routes[-1].app, StaticFiles)
        response = client.get('/dashboard/')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.content, (ROOT / 'dashboard/index.html').read_bytes())
        self.assertEqual(response.headers.get('cache-control'), 'no-store')
        for name in ('app.js', 'styles.css'):
            response = client.get('/dashboard/' + name)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.content, (ROOT / 'dashboard' / name).read_bytes())
        response = client.get('/dashboard/api/unknown')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {'detail': 'not_found'})

    def login(self, client):
        response = client.post('/dashboard/api/login', json={'password': self.password})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['csrf_token']

    def test_cookie_csrf_origin_logout_expiry_and_restart(self):
        client = self.make_client()
        self.assertEqual(client.get('/dashboard/api/me').status_code, 401)
        self.assertEqual(client.post('/dashboard/api/login', json={'password': 'wrong'}).status_code, 401)
        self.assertEqual(client.post('/dashboard/api/login', json={'password': self.password},
                                    headers={'Origin': 'https://other.test'}).status_code, 403)
        response = client.post('/dashboard/api/login', json={'password': self.password})
        self.assertEqual(response.status_code, 200, response.text)
        csrf = response.json()['csrf_token']
        cookie = response.headers['set-cookie']
        for attribute in ('HttpOnly', 'Secure', 'SameSite=strict', 'Path=/dashboard', 'Max-Age=3600'):
            self.assertIn(attribute, cookie)
        self.assertEqual(client.get('/dashboard/api/me').json(), {'authenticated': True, 'csrf_token': csrf})
        self.assertEqual(client.post('/dashboard/api/logout').status_code, 403)
        self.assertEqual(client.post('/dashboard/api/logout', headers={'X-CSRF-Token': csrf,
            'Origin': 'https://other.test'}).status_code, 403)
        old_cookie = client.cookies.get('trustcam_dashboard')
        assert old_cookie is not None
        response = client.post('/dashboard/api/logout', headers={'X-CSRF-Token': csrf})
        self.assertEqual(response.status_code, 200)
        client.cookies.set('trustcam_dashboard', old_cookie, path='/dashboard')
        self.assertEqual(client.get('/dashboard/api/me').status_code, 401)
        client.cookies.clear()
        self.login(client)
        with patch.object(self.dashboard.time, 'monotonic', return_value=self.dashboard.time.monotonic() + 3601):
            self.assertEqual(client.get('/dashboard/api/me').status_code, 401)
        client.cookies.clear()
        self.login(client)
        restarted = self.make_client()
        restarted.cookies.update(client.cookies)
        self.assertEqual(restarted.get('/dashboard/api/me').status_code, 401)

    def test_login_wire_bounds_limiter_and_explicit_http(self):
        client = self.make_client()
        response = client.post('/dashboard/api/login', content=b'x' * 4097)
        self.assertEqual(response.status_code, 413)
        response = client.post('/dashboard/api/login', content=iter([b'x' * 2048] * 3))
        self.assertEqual(response.status_code, 413)
        for body in ({}, {'password': 42}, {'password': self.password, 'extra': True}):
            self.assertEqual(client.post('/dashboard/api/login', json=body).status_code, 400)
        client = self.make_client()
        for _ in range(5):
            self.assertEqual(client.post('/dashboard/api/login', json={'password': 'bad'}).status_code, 401)
        self.assertEqual(client.post('/dashboard/api/login', json={'password': self.password}).status_code, 429)
        with patch.object(self.dashboard.time, 'monotonic', return_value=self.dashboard.time.monotonic() + 61):
            self.login(client)
        with patch.dict(os.environ, {'TRUSTCAM_DASHBOARD_ALLOW_HTTP': '1'}):
            client = self.make_client('http://testserver')
        response = client.post('/dashboard/api/login', json={'password': self.password})
        self.assertNotIn('Secure;', response.headers['set-cookie'])
        self.assertEqual(client.get('/dashboard/api/me').status_code, 200)
        response = client.post('/dashboard/api/logout', headers=[(b'X-CSRF-Token', b'\xff')])
        self.assertEqual(response.status_code, 403)

    def session(self, client):
        response = client.post('/session', json={'public_key': self.key.verify_key.encode().hex()})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def auth(self, session):
        return {'Authorization': 'Bearer ' + session['token']}

    def test_explicit_grants_isolate_unshared_and_preserve_legacy(self):
        client = self.make_client()
        owner, other = self.session(client), self.session(client)
        url = '/session/' + owner['session_id'] + '/share-enterprise'
        path = '/dashboard/api/sessions/' + owner['session_id']
        self.assertEqual(client.get('/dashboard/api/sessions').status_code, 401)
        self.login(client)
        self.assertEqual(client.get('/dashboard/api/sessions').json(), {'sessions': []})
        for suffix in ('', '/report', '/evidence/unknown/image'):
            self.assertEqual(client.get(path + suffix).status_code, 404)
        self.assertEqual(client.post(url, json={'consent': True}).status_code, 401)
        self.assertEqual(client.post(url, json={'consent': True}, headers=self.auth(other)).status_code, 403)
        for body in ({'consent': False}, {'consent': 1}, {'consent': True, 'extra': 1}, {}):
            self.assertEqual(client.post(url, json=body, headers=self.auth(owner)).status_code, 400)
        db_path = Path(self.directory.name) / 'trustcam.sqlite3'
        with sqlite3.connect(db_path) as db:
            before = db.execute('SELECT * FROM sessions ORDER BY session_id').fetchall()
        response = client.post(url, json={'consent': True}, headers=self.auth(owner))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()['shared'])
        self.assertEqual(client.post(url, json={'consent': True}, headers=self.auth(owner)).json(), response.json())
        listing = client.get('/dashboard/api/sessions').json()['sessions']
        self.assertEqual(len(listing), 1)
        self.assertEqual(listing[0], {'session_id': owner['session_id'], 'status': 'collecting',
            'evidence_count': 0, 'history_count': 0, 'report_id': None, 'shared_at': response.json()['shared_at']})
        detail = client.get(path).json()
        expected = client.get('/session/' + owner['session_id'], headers=self.auth(owner)).json()
        self.assertEqual(detail, dict(expected, shared_at=response.json()['shared_at']))
        self.assertEqual(client.get('/dashboard/api/sessions/' + other['session_id']).status_code, 404)
        self.assertEqual(client.get(url, headers=self.auth(owner)).json(), response.json())
        restarted = self.make_client()
        self.login(restarted)
        self.assertEqual(restarted.get('/dashboard/api/sessions').json()['sessions'], listing)
        with sqlite3.connect(db_path) as db:
            self.assertEqual(db.execute('SELECT * FROM sessions ORDER BY session_id').fetchall(), before)
            self.assertEqual(db.execute('SELECT count(*) FROM dashboard_grants').fetchone()[0], 1)

    def upload(self, client, session, color='red', slot='wide_context', replaces=None, fmt='JPEG'):
        content = photo(color, fmt)
        manifest = {'version': '1', 'session_id': session['session_id'], 'device_id': session['device_id'],
            'captured_at': '2026-11-14T08:09:10Z', 'slot': slot, 'sha256': hashlib.sha256(content).hexdigest()}
        text = json.dumps(manifest, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
        data = {'session_id': session['session_id'], 'manifest': text,
                'signature': self.key.sign(text.encode()).signature.hex()}
        if replaces:
            data['replaces_evidence_id'] = replaces
        response = client.post('/evidence', headers=self.auth(session), data=data,
                               files={'image': ('photo', content, 'application/octet-stream')})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['evidence_id'], content

    def grant(self, client, session):
        response = client.post('/session/' + session['session_id'] + '/share-enterprise',
                               json={'consent': True}, headers=self.auth(session))
        self.assertEqual(response.status_code, 200, response.text)

    def test_images_reports_history_analysis_and_tampering(self):
        client = self.make_client()
        owner, other = self.session(client), self.session(client)
        archived, original = self.upload(client, owner)
        current, changed = self.upload(client, owner, color='blue', replaces=archived, fmt='PNG')
        foreign, _ = self.upload(client, other)
        self.grant(client, owner)
        self.login(client)
        path = '/dashboard/api/sessions/' + owner['session_id']
        self.assertEqual(client.get(path + '/report').status_code, 404)
        for eid, content, media in ((archived, original, 'image/jpeg'), (current, changed, 'image/png')):
            response = client.get(path + '/evidence/' + eid + '/image')
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.content, content)
            self.assertEqual(response.headers['content-type'], media)
            self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertEqual(client.get(path + '/evidence/' + foreign + '/image').status_code, 404)
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        analysis = {'status': 'accepted', 'reason': 'Stored advisory only'}
        with sqlite3.connect(database) as db:
            db.execute('UPDATE evidence SET analysis=? WHERE evidence_id=?', (json.dumps(analysis), current))
        detail = client.get(path).json()
        self.assertEqual(detail['evidence'][0]['analysis'], analysis)
        self.assertEqual(len(detail['evidence_history']), 1)
        for slot in ('damage_closeup', 'serial_or_plate', 'identifier_doc'):
            self.upload(client, owner, slot=slot)
        report = client.post('/session/' + owner['session_id'] + '/finalize', headers=self.auth(owner)).json()
        self.assertEqual(client.get(path + '/report').json(), report)
        listing = client.get('/dashboard/api/sessions').json()['sessions'][0]
        self.assertEqual((listing['evidence_count'], listing['history_count'], listing['status']), (4, 1, 'finalized'))
        with sqlite3.connect(database) as db:
            before = db.execute('SELECT * FROM reports').fetchall()
            db.execute('UPDATE evidence SET signature=? WHERE evidence_id=?', ('00' * 64, current))
        response = client.get(path + '/evidence/' + current + '/image')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'detail': 'signature_invalid'})
        with sqlite3.connect(database) as db:
            self.assertEqual(db.execute('SELECT * FROM reports').fetchall(), before)
        self.assertEqual(client.get('/session/' + owner['session_id']).status_code, 401)

    def test_verify_exact_edited_archived_corrupt_and_bounds_without_mutation(self):
        client = self.make_client()
        session, other = self.session(client), self.session(client)
        archived, original = self.upload(client, session)
        current, changed = self.upload(client, session, color='blue', replaces=archived)
        foreign, _ = self.upload(client, other)
        self.grant(client, session)
        path = '/dashboard/api/sessions/' + session['session_id'] + '/verify'
        def verify(eid, content, headers=None):
            return client.post(path, data={'evidence_id': eid}, files={'image': ('verify.jpg', content)},
                               headers=headers or {})
        self.assertEqual(verify(current, changed).status_code, 401)
        csrf = self.login(client)
        self.assertEqual(verify(current, changed).status_code, 403)
        headers = {'X-CSRF-Token': csrf}
        self.assertEqual(verify(foreign, original, headers).status_code, 404)
        with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
            before = db.execute('SELECT * FROM evidence').fetchall(), db.execute('SELECT * FROM evidence_history').fetchall()
        for eid, content, result in ((current, changed, {'result': 'PASS', 'reason': 'integrity_verified'}),
            (archived, original, {'result': 'PASS', 'reason': 'integrity_verified'}),
            (current, original, {'result': 'FAIL', 'reason': 'image_modified'})):
            response = verify(eid, content, headers)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), result)
        self.assertEqual(verify(current, b'not an image', headers).status_code, 400)
        self.assertEqual(verify(current, b'x' * (10 * 1024 * 1024 + 1), headers).status_code, 413)
        with patch.object(self.dashboard.Image, 'open', side_effect=Image.DecompressionBombError):
            self.assertEqual(verify(current, changed, headers).status_code, 400)
        with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
            self.assertEqual((db.execute('SELECT * FROM evidence').fetchall(), db.execute('SELECT * FROM evidence_history').fetchall()), before)
            db.execute('UPDATE evidence SET signature=? WHERE evidence_id=?', ('00' * 64, current))
        self.assertEqual(verify(current, changed, headers).json(), {'result': 'FAIL', 'reason': 'signature_invalid'})

    def test_legal_retrieval_fixed_public_corpus_and_unavailable(self):
        client = self.make_client()
        self.assertEqual(client.get('/dashboard/api/legal?q=chứng').status_code, 401)
        self.login(client)
        response = client.get('/dashboard/api/legal', params={'q': 'hình ảnh cá nhân'})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body['mode'], 'retrieval_only')
        self.assertIn('không', body['notice'].lower())
        self.assertIn('RAG', body['notice'])
        self.assertTrue(body['results'])
        for row in body['results']:
            self.assertTrue({'id', 'document_title', 'article', 'text', 'source_url', 'legal_status',
                             'label', 'sha256', 'document_type', 'current_validity_verified'} <= set(row))
            self.assertTrue(row['document_title'])
            self.assertFalse(row['current_validity_verified'])
            self.assertEqual(hashlib.sha256(row['text'].encode()).hexdigest(), row['sha256'])
            self.assertTrue(row['source_url'].startswith(('https://', 'http://')))
            if row['document_type'] == 'law':
                self.assertTrue(row['article'].startswith('Điều '))
                self.assertIn('not fully verified', row['legal_status'])
        self.assertEqual(client.get('/dashboard/api/legal?q=zzzznotfound').json()['results'], [])
        self.assertEqual(client.get('/dashboard/api/legal').json()['results'], [])
        self.assertEqual(client.get('/dashboard/api/legal', params={'q': 'x' * 513}).status_code, 400)
        with patch.object(self.dashboard.Path, 'open', side_effect=FileNotFoundError):
            body = client.get('/dashboard/api/legal?q=chứng').json()
        self.assertEqual(body['results'], [])
        self.assertIn('unavailable', body['notice'])

    def test_insurance_retrieval_exact_quote_clause_and_no_coverage_claim(self):
        client = self.make_client()
        self.login(client)
        corpus = ROOT / 'corpus' / 'motor-insurance-demo'
        chunks = [json.loads(line) for line in (corpus / 'chunks.jsonl').read_text().splitlines()]
        expected = next(row for row in chunks if row['article'] == '5.2.6')
        with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')):
            body = client.get('/dashboard/api/legal', params={'q': '5.2.6'}).json()
        row = next(row for row in body['results'] if row['id'] == expected['id'])
        self.assertEqual(row['article'], '5.2.6')
        self.assertEqual(row['label'], expected['label'])
        self.assertEqual(row['text'], expected['text'])
        self.assertEqual(row['sha256'], expected['sha256'])
        self.assertEqual(row['source_url'], expected['source_url'])
        self.assertEqual(row['document_title'], 'Quy tắc bảo hiểm vật chất xe ô tô')
        self.assertEqual(row['document_type'], 'insurer_policy')
        self.assertEqual(row['legal_status'], 'insurer_contractual_terms_example_not_legislation')
        self.assertFalse(row['current_validity_verified'])
        self.assertEqual(body['mode'], 'retrieval_only')
        self.assertNotIn('answer', body)
        self.assertNotIn('coverage', body)
        self.assertIn('không phải luật', body['notice'])
        self.assertIn('PASS không đồng nghĩa được bồi thường', body['notice'])
        quoted = client.get('/dashboard/api/legal', params={'q': 'Thông báo ngay và bảo vệ hiện trường'}).json()
        self.assertIn(expected['id'], [row['id'] for row in quoted['results']])
        coverage = client.get('/dashboard/api/legal', params={'q': 'PASS xe xước được bồi thường không?'}).json()
        self.assertEqual(coverage['mode'], 'retrieval_only')
        self.assertNotIn('answer', coverage)
        self.assertNotIn('coverage', coverage)
        self.assertIn('không kết luận phạm vi bảo hiểm', coverage['notice'])
        originals = {row['id']: row for row in chunks}
        for row in coverage['results']:
            if row['document_type'] != 'law':
                self.assertEqual(row['text'], originals[row['id']]['text'])

    def test_malformed_login_and_corrupt_storage_return_stable_errors(self):
        client = self.make_client()
        for body in ('{"password":"\\ud800"}', '{"password":"bad","password":"' + self.password + '"}'):
            response = client.post('/dashboard/api/login', content=body, headers={'Content-Type': 'application/json'})
            self.assertEqual(response.status_code, 400, response.text)
        self.login(client)
        session = self.session(client)
        self.grant(client, session)
        with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
            db.execute('INSERT INTO reports VALUES (?, ?, ?)', ('invalid', session['session_id'], '{broken'))
        response = client.get('/dashboard/api/sessions/' + session['session_id'] + '/report')
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {'detail': 'dashboard_unavailable'})
        self.assertEqual(response.headers['cache-control'], 'no-store')
        response = client.get('/session/' + session['session_id'] + '/share-enterprise', headers=self.auth(session))
        self.assertEqual(response.headers.get('cache-control'), 'no-store')

    def test_outer_wire_limit_only_exempts_exact_upload_paths(self):
        self.make_client()
        # Isolate actual outer limiter: dashboard auth/4 KiB guard would mask its ceiling.
        limiter = next(m for m in self.app.user_middleware
                       if m.kwargs.get('dispatch').__name__ == 'bound_request')
        from starlette.responses import Response
        probe = FastAPI()
        @probe.post('/{path:path}')
        async def accept(path: str):
            return Response(status_code=204)
        probe.add_middleware(limiter.cls, **limiter.kwargs)
        client = TestClient(probe)
        self.addCleanup(client.close)
        large = 10 * 1024 * 1024 + 64 * 1024
        for path in ('/evidence', '/verify', '/dashboard/api/sessions/case-1/verify',
                     '/dashboard/api/sessions/case-1/verify?test=1'):
            with self.subTest(path=path):
                self.assertEqual(client.post(path, content=b'x' * large).status_code, 204)
                response = client.post(path, content=iter([b'x' * large, b'x']),
                                       headers={'Content-Length': '1'})
                self.assertEqual(response.status_code, 413)
                self.assertEqual(response.json(), {'detail': 'request_too_large'})
        for path in ('/health', '/session', '/verify/extra', '/evidence/extra',
                     '/other/dashboard/api/sessions/case-1/verify',
                     '/dashboard/api/login', '/dashboard/api/sessions/case-1',
                     '/dashboard/api/sessions//verify', '/dashboard/api/sessions/case-1/verify/',
                     '/dashboard/api/sessions/case-1/nested/verify',
                     '/dashboard/api/sessions/case-1/verify/extra',
                     '/dashboard/api/sessions/case-1%2Fnested/verify',
                     '/dashboard/api/sessions/case-1/verify%0A',
                     '/dashboard/api/sessions/case-1/verify-extra'):
            with self.subTest(path=path):
                self.assertEqual(client.post(path, content=b'x' * (16 * 1024),
                                             follow_redirects=False).status_code, 204)
                for body in (b'x' * (16 * 1024 + 1), iter([b'x' * (16 * 1024), b'x'])):
                    response = client.post(path, content=body, follow_redirects=False)
                    self.assertEqual(response.status_code, 413)
                    self.assertEqual(response.json(), {'detail': 'request_too_large'})

    def test_large_verify_wire_limits_pixels_and_multipart(self):
        # Exercise both request bounds through create_app, not standalone installer.
        client = self.make_client()
        session = self.session(client)
        eid, content = self.upload(client, session)
        self.grant(client, session)
        csrf = self.login(client)
        path = '/dashboard/api/sessions/' + session['session_id'] + '/verify'
        headers = {'X-CSRF-Token': csrf}
        # Valid JPEG trailing bytes: decoded pixels same, exact bytes differ.
        response = client.post(path, data={'evidence_id': eid}, files={'image': ('photo.jpg', content + b'x' * 20000)}, headers=headers)
        self.assertEqual(response.json(), {'result': 'FAIL', 'reason': 'image_modified'})
        response = client.post(path, data={'evidence_id': eid}, files={'image': ('photo.jpg', content + b'x' * (10 * 1024 * 1024))}, headers=headers)
        self.assertEqual(response.status_code, 413)
        response = client.post(path, content=iter([b'x' * 1024 * 1024] * 11), headers=headers)
        self.assertEqual(response.status_code, 413)
        output = io.BytesIO()
        Image.new('1', (5000, 4001)).save(output, format='PNG')
        response = client.post(path, data={'evidence_id': eid}, files={'image': ('photo.png', output.getvalue())}, headers=headers)
        self.assertEqual(response.status_code, 400)
        response = client.post(path, data={'evidence_id': eid, 'unexpected': 'value'}, files={'image': ('photo.jpg', content)}, headers=headers)
        self.assertEqual(response.status_code, 400)
        response = client.post(path, content=b'broken', headers=dict(headers, **{'Content-Type': 'multipart/form-data'}))
        self.assertEqual(response.status_code, 400)

    def test_additive_install_preserves_existing_signed_rows_report_and_rolls_back(self):
        # Existing data predates dashboard installation; only grants schema may be added.
        with patch.object(self.backend, 'install_dashboard'):
            app = self.backend.create_app(self.directory.name)
        client = TestClient(app)
        self.addCleanup(client.close)
        session = self.session(client)
        for slot in ('wide_context', 'damage_closeup', 'serial_or_plate', 'identifier_doc'):
            self.upload(client, session, slot=slot)
        response = client.post('/session/' + session['session_id'] + '/finalize', headers=self.auth(session))
        self.assertEqual(response.status_code, 200, response.text)
        path = Path(self.directory.name) / 'trustcam.sqlite3'
        tables = ('sessions', 'evidence', 'evidence_history', 'reports')
        with sqlite3.connect(path) as db:
            before = {table: db.execute(f'SELECT * FROM {table}').fetchall() for table in tables}
        self.make_client()
        with sqlite3.connect(path) as db:
            self.assertEqual({table: db.execute(f'SELECT * FROM {table}').fetchall() for table in tables}, before)
        from contextlib import contextmanager
        @contextmanager
        def forbidden_connect():
            db = sqlite3.connect(':memory:')
            db.set_authorizer(lambda action, *args: sqlite3.SQLITE_DENY if action == sqlite3.SQLITE_CREATE_TABLE else sqlite3.SQLITE_OK)
            try:
                with db:
                    yield db
            finally:
                self.assertFalse(db.in_transaction)
                db.close()
        with self.assertRaises(sqlite3.DatabaseError):
            self.dashboard.install_dashboard(FastAPI(), forbidden_connect, None, None, None)

    def test_absent_or_weak_password_disables_dashboard(self):
        for password in (None, '', 'short'):
            with self.subTest(password=password), patch.dict(os.environ):
                if password is None:
                    os.environ.pop('TRUSTCAM_DASHBOARD_PASSWORD', None)
                else:
                    os.environ['TRUSTCAM_DASHBOARD_PASSWORD'] = password
                client = self.make_client()
                response = client.post('/dashboard/api/login', json={'password': self.password})
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json(), {'detail': 'dashboard_disabled'})
                for path in ('/dashboard', '/dashboard/', '/dashboard/app.js',
                             '/dashboard/api/me', '/dashboard/api/unknown'):
                    response = client.get(path)
                    self.assertEqual(response.status_code, 503)
                    self.assertEqual(response.json(), {'detail': 'dashboard_disabled'})
                    self.assertEqual(response.headers.get('cache-control'), 'no-store')


if __name__ == '__main__':
    unittest.main()
