import importlib
import io
import json
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from nacl.signing import SigningKey
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SLOTS = ['wide_context', 'damage_closeup', 'serial_or_plate', 'identifier_doc']


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def photo(color='red', fmt='JPEG'):
    output = io.BytesIO()
    Image.new('RGB', (16, 16), color).save(output, format=fmt)
    return output.getvalue()


class BackendTest(unittest.TestCase):
    def setUp(self):
        self.assertTrue((ROOT / 'backend/app.py').exists(), 'Backend missing')
        self.directory = tempfile.TemporaryDirectory(dir=ROOT, prefix='.test-data-')
        self.addCleanup(self.directory.cleanup)
        config = patch.dict(os.environ, {'VLM_BASE_URL': '', 'VLM_API_KEY': '', 'VLM_MODEL': '',
                                         'TRUSTCAM_DATA_DIR': self.directory.name})
        config.start()
        self.addCleanup(config.stop)
        module = importlib.import_module('backend.app')
        self.app = module.create_app(self.directory.name)
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.key = SigningKey.generate()
        self.public_key = self.key.verify_key.encode().hex()

    def session(self, key=None):
        key = key or self.key
        response = self.client.post('/session', json={'public_key': key.verify_key.encode().hex()})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def auth(self, session):
        return {'Authorization': f"Bearer {session['token']}"}

    def upload(self, session, slot=SLOTS[0], image=None, changes=None, signature=None, key=None, replaces=None, additional=None):
        image = image if image is not None else photo()
        manifest = {'version': '1', 'session_id': session['session_id'],
                    'device_id': session['device_id'], 'captured_at': '2026-11-14T08:09:10.123Z',
                    'slot': slot, 'sha256': hashlib.sha256(image).hexdigest()}
        manifest.update(changes or {})
        text = canonical(manifest)
        signature = signature or (key or self.key).sign(text.encode()).signature.hex()
        data = {'session_id': session['session_id'], 'manifest': text, 'signature': signature}
        if replaces is not None:
            data['replaces_evidence_id'] = replaces
        if additional is not None:
            data['additional'] = additional
        return self.client.post('/evidence', headers=self.auth(session), data=data,
                                files={'image': ('../../untrusted.jpg', image, 'image/jpeg')})

    def test_additional_photo_requires_complete_checklist_and_preserves_manifest(self):
        session = self.session()
        first = self.upload(session)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(self.upload(session, additional='true').json(), {'detail': 'checklist_incomplete'})
        for slot in SLOTS[1:]:
            self.assertEqual(self.upload(session, slot).status_code, 200)
        self.assertEqual(self.upload(session).json(), {'detail': 'slot_already_collected'})
        extra = self.upload(session, additional='true')
        self.assertEqual(extra.status_code, 200, extra.text)
        self.assertTrue(extra.json()['is_additional'])
        self.assertFalse(first.json()['is_additional'])
        self.assertEqual(extra.json()['next_action'], {'type': 'finalize'})
        listing = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
        self.assertEqual(listing['max_evidence'], 20)
        self.assertEqual(listing['max_history'], 80)
        self.assertEqual(len(listing['evidence']), 5)
        self.assertEqual([r['is_additional'] for r in listing['evidence']], [False] * 4 + [True])
        self.assertEqual(listing['evidence'][0]['manifest'], listing['evidence'][-1]['manifest'])
        self.key.verify_key.verify(canonical(listing['evidence'][-1]['manifest']).encode(),
                                   bytes.fromhex(listing['evidence'][-1]['signature']))

    def test_current_limit_twenty_allows_retake_at_capacity(self):
        session = self.session()
        ids = [self.upload(session, slot).json()['evidence_id'] for slot in SLOTS]
        for _ in range(16):
            response = self.upload(session, additional='true')
            self.assertEqual(response.status_code, 200, response.text)
            ids.append(response.json()['evidence_id'])
        response = self.upload(session, additional='true')
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json(), {'detail': 'evidence_limit_reached'})
        replacement = self.upload(session, replaces=ids[0])
        self.assertEqual(replacement.status_code, 200, replacement.text)
        self.assertFalse(replacement.json()['is_additional'])
        listing = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
        self.assertEqual(len(listing['evidence']), 20)
        self.assertEqual([r['evidence_id'] for r in listing['evidence_history']], [ids[0]])
        report = self.client.post('/session/' + session['session_id'] + '/finalize',
                                  headers=self.auth(session))
        self.assertEqual(report.status_code, 200, report.text)
        self.assertEqual(report.json()['report']['evidence'], listing['evidence'])
        self.assertIn('is_additional is unsigned server metadata.', report.json()['report']['integrity_notice'])

    def test_revisions_bounded_per_capture_chain_not_category(self):
        session = self.session()
        primary = [self.upload(session, slot).json()['evidence_id'] for slot in SLOTS]
        extras = [self.upload(session, additional='true').json()['evidence_id'] for _ in range(16)]
        url = '/session/' + session['session_id']
        originals = primary + extras
        for index, original in enumerate(originals):
            current = original
            for _ in range(4):
                response = self.upload(session, SLOTS[index] if index < 4 else SLOTS[0], replaces=current)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()['is_additional'], index >= 4)
                current = response.json()['evidence_id']
            slot = SLOTS[index] if index < 4 else SLOTS[0]
            self.assertEqual(self.upload(session, slot, replaces=current).json(),
                             {'detail': 'revision_limit_reached'})
            stale = self.upload(session, slot, replaces=original)
            self.assertEqual(stale.status_code, 409, stale.text)
            self.assertEqual(stale.json(), {'detail': 'stale_evidence'})
        listing = self.client.get(url, headers=self.auth(session)).json()
        self.assertEqual(len(listing['evidence']), 20)
        self.assertEqual(len(listing['evidence_history']), 80)
        for original in originals:
            self.assertEqual(self.verify(session, original).json()['result'], 'PASS')
        report = self.client.post(url + '/finalize', headers=self.auth(session))
        self.assertEqual(report.status_code, 200, report.text)
        self.assertEqual(report.json()['report']['evidence_history'], listing['evidence_history'])

    def test_additional_flag_is_exact_and_cannot_mix_with_replacement(self):
        session = self.session()
        first = self.upload(session).json()['evidence_id']
        url = '/session/' + session['session_id']
        before = self.client.get(url, headers=self.auth(session)).json()
        for flag in ('', 'false', 'True', 'TRUE', '1', ' true', 'true '):
            with self.subTest(flag=flag):
                response = self.upload(session, additional=flag)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json(), {'detail': 'invalid_additional'})
        response = self.upload(session, additional='true', replaces=first)
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(response.json(), {'detail': 'invalid_replacement'})
        self.assertEqual(self.client.get(url, headers=self.auth(session)).json(), before)

    def test_concurrent_additional_uploads_enforce_twenty_without_partial_writes(self):
        import threading
        from concurrent.futures import ThreadPoolExecutor
        session = self.session()
        for slot in SLOTS:
            self.assertEqual(self.upload(session, slot).status_code, 200)
        for _ in range(15):
            self.assertEqual(self.upload(session, additional='true').status_code, 200)
        manifest = {'version': '1', 'session_id': session['session_id'], 'device_id': self.public_key,
                    'captured_at': '2026-11-14T08:00:00Z', 'slot': SLOTS[0],
                    'sha256': hashlib.sha256(photo()).hexdigest()}
        text = canonical(manifest)
        barrier = threading.Barrier(4)
        def upload_extra(_):
            with TestClient(self.app) as client:
                barrier.wait(timeout=5)
                return client.post('/evidence', headers=self.auth(session),
                    data={'session_id': session['session_id'], 'manifest': text, 'additional': 'true',
                          'signature': self.key.sign(text.encode()).signature.hex()},
                    files={'image': ('extra.jpg', photo())})
        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(upload_extra, range(4)))
        self.assertEqual(sorted(r.status_code for r in responses), [200, 409, 409, 409])
        for response in responses:
            if response.status_code == 409:
                self.assertEqual(response.json(), {'detail': 'evidence_limit_reached'})
        listing = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
        self.assertEqual(len(listing['evidence']), 20)
        self.assertEqual(listing['evidence_history'], [])

    def test_finalize_rejects_current_and_history_over_capacity(self):
        import sqlite3
        import uuid
        session = self.session()
        for slot in SLOTS:
            self.assertEqual(self.upload(session, slot).status_code, 200)
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        module = importlib.import_module('backend.app')
        for table, count, error in (('evidence', 17, 'evidence_limit_reached'),
                                     ('evidence_history', 81, 'history_limit_reached')):
            with self.subTest(table=table):
                with sqlite3.connect(database) as db:
                    for _ in range(count):
                        db.execute(f'INSERT INTO {table} ({module.EVIDENCE_COLUMNS}) '
                                   'SELECT ?, session_id, slot, sha256, captured_at, manifest, signature, '
                                   'public_key, image, analysis, replaces_evidence_id, 1 FROM evidence LIMIT 1',
                                   (str(uuid.uuid4()),))
                response = self.client.post('/session/' + session['session_id'] + '/finalize',
                                            headers=self.auth(session))
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(response.json(), {'detail': error})
                with sqlite3.connect(database) as db:
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM reports').fetchone()[0], 0)
                    db.execute(f'DELETE FROM {table} WHERE is_additional=1')

    def test_retake_rejects_broken_server_lineage_without_archive(self):
        import sqlite3
        session = self.session()
        first = self.upload(session).json()['evidence_id']
        current = self.upload(session, replaces=first).json()['evidence_id']
        foreign = self.session()
        foreign_id = self.upload(foreign).json()['evidence_id']
        self.assertEqual(self.upload(foreign, replaces=foreign_id).status_code, 200)
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        url = '/session/' + session['session_id']
        for predecessor in (current, foreign_id):
            with self.subTest(predecessor=predecessor):
                with sqlite3.connect(database) as db:
                    db.execute('UPDATE evidence SET replaces_evidence_id=? WHERE evidence_id=?',
                               (predecessor, current))
                before = self.client.get(url, headers=self.auth(session)).json()
                response = self.upload(session, replaces=current)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json(), {'detail': 'invalid_replacement'})
                self.assertEqual(self.client.get(url, headers=self.auth(session)).json(), before)

    def legacy_unique_schema(self):
        import sqlite3
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        with sqlite3.connect(database) as db:
            db.execute('ALTER TABLE evidence DROP COLUMN is_additional')
            db.execute('ALTER TABLE evidence_history DROP COLUMN is_additional')
            columns = db.execute("SELECT sql FROM sqlite_master WHERE name='evidence'").fetchone()[0]
            db.execute(columns.replace('CREATE TABLE evidence', 'CREATE TABLE evidence_old').rstrip()[:-1] +
                       ', UNIQUE(session_id, slot))')
            db.execute('INSERT INTO evidence_old SELECT * FROM evidence ORDER BY rowid')
            db.execute('DROP TABLE evidence')
            db.execute('ALTER TABLE evidence_old RENAME TO evidence')
        return database

    def test_multi_photo_migration_preserves_bytes_links_tokens_reports_and_rolls_back(self):
        import sqlite3
        session = self.session()
        first = self.upload(session).json()['evidence_id']
        self.assertEqual(self.upload(session, replaces=first).status_code, 200)
        for slot in SLOTS[1:]:
            self.assertEqual(self.upload(session, slot).status_code, 200)
        finalized = self.session()
        for slot in SLOTS:
            self.assertEqual(self.upload(finalized, slot).status_code, 200)
        old_report = self.client.post('/session/' + finalized['session_id'] + '/finalize',
                                      headers=self.auth(finalized)).json()
        database = self.legacy_unique_schema()
        native_connect = sqlite3.connect
        with native_connect(database) as db:
            snapshots = {table: db.execute(f'SELECT * FROM {table} ORDER BY rowid').fetchall()
                         for table in ('sessions', 'evidence', 'evidence_history', 'reports')}
            schema = db.execute('SELECT name, sql FROM sqlite_master ORDER BY name').fetchall()
        def deny_rebuild(*args, **kwargs):
            db = native_connect(*args, **kwargs)
            db.set_authorizer(lambda operation, name, *_: sqlite3.SQLITE_DENY
                              if operation == sqlite3.SQLITE_CREATE_TABLE and name == 'evidence_new'
                              else sqlite3.SQLITE_OK)
            return db
        with patch('backend.app.sqlite3.connect', side_effect=deny_rebuild):
            with self.assertRaises(sqlite3.DatabaseError):
                importlib.import_module('backend.app').create_app(self.directory.name)
        with native_connect(database) as db:
            self.assertEqual(db.execute('SELECT name, sql FROM sqlite_master ORDER BY name').fetchall(), schema)
            for table, rows in snapshots.items():
                self.assertEqual(db.execute(f'SELECT * FROM {table} ORDER BY rowid').fetchall(), rows)
        restarted = TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
        self.addCleanup(restarted.close)
        with native_connect(database) as db:
            for table, rows in snapshots.items():
                after = db.execute(f'SELECT * FROM {table} ORDER BY rowid').fetchall()
                self.assertEqual([r[:-1] for r in after] if table.startswith('evidence') else after, rows)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertEqual(self.verify(session, first, client=restarted).json()['result'], 'PASS')
        self.assertEqual(self.upload(session, additional='true').status_code, 200)
        self.assertEqual(self.upload(session).json(), {'detail': 'slot_already_collected'})
        self.assertEqual(restarted.get('/report/' + old_report['report_id'],
                                       headers=self.auth(finalized)).json(), old_report)
        # Second startup must not rebuild or change bytes.
        importlib.import_module('backend.app').create_app(self.directory.name)

    def test_signed_upload_advances_checklist(self):
        session = self.session()
        response = self.upload(session)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data['sha256'], hashlib.sha256(photo()).hexdigest())
        self.assertEqual(data['slot'], SLOTS[0])
        self.assertEqual(data['analysis_mode'], 'checklist')
        self.assertEqual(data['next_action'], {'type': 'capture', 'slot': SLOTS[1]})
        listing = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
        record = listing['evidence'][0]
        self.assertEqual(record['evidence_id'], data['evidence_id'])
        self.assertEqual(record['public_key'], self.public_key)
        self.assertEqual(record['manifest']['session_id'], session['session_id'])
        self.key.verify_key.verify(canonical(record['manifest']).encode(), bytes.fromhex(record['signature']))
        self.assertEqual(listing['next_action'], data['next_action'])

    def test_invalid_signature_and_hash_never_store(self):
        session = self.session()
        for kwargs, error in (({'signature': '00' * 64}, 'signature_invalid'),
                              ({'key': SigningKey.generate()}, 'signature_invalid'),
                              ({'changes': {'sha256': '00' * 32}}, 'image_hash_mismatch'),
                              ({'changes': {'device_id': '00' * 32}}, 'device_mismatch'),
                              ({'changes': {'session_id': 'another'}}, 'session_mismatch')):
            with self.subTest(error=error):
                response = self.upload(session, **kwargs)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json(), {'detail': error})
        listing = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
        self.assertEqual(listing['evidence'], [])
        self.assertEqual(listing['next_action'], session['next_action'])

    def verify(self, session, evidence_id, image=None, client=None):
        return (client or self.client).post('/verify', headers=self.auth(session),
                                data={'session_id': session['session_id'], 'evidence_id': evidence_id},
                                files={'image': ('verify.png', image if image is not None else photo(), 'image/png')})

    def test_full_session_finalize_verify_restart(self):
        session = self.session()
        url = '/session/' + session['session_id'] + '/finalize'
        self.assertEqual(self.client.post(url, headers=self.auth(session)).json(), {'detail': 'checklist_incomplete'})
        uploads = []
        for slot in SLOTS:
            response = self.upload(session, slot)
            self.assertEqual(response.status_code, 200, response.text)
            uploads.append(response.json())
        self.assertEqual(uploads[-1]['next_action'], {'type': 'finalize'})
        response = self.client.post(url, headers=self.auth(session))
        self.assertEqual(response.status_code, 200, response.text)
        report = response.json()
        self.assertEqual(report['report']['version'], '1')
        self.assertEqual(report['report']['device_id'], self.public_key)
        self.assertEqual(report['report']['analysis_mode'], 'checklist')
        self.assertEqual(len(report['report']['evidence']), 4)
        self.assertIn('integrity_notice', report['report'])
        self.assertEqual(self.client.post(url, headers=self.auth(session)).json(), report)
        report_url = '/report/' + report['report_id']
        self.assertEqual(self.client.get(report_url).status_code, 401)
        stranger = self.session(SigningKey.generate())
        self.assertEqual(self.client.get(report_url, headers=self.auth(stranger)).status_code, 403)
        self.assertEqual(self.client.get('/report/unknown', headers=self.auth(session)).status_code, 404)
        self.assertEqual(self.client.get(report_url, headers=self.auth(session)).json(), report)
        restarted = TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
        self.addCleanup(restarted.close)
        self.assertEqual(restarted.get(report_url, headers=self.auth(session)).json(), report)
        self.assertEqual(restarted.post(url, headers=self.auth(session)).json(), report)
        for item in uploads:
            self.assertEqual(self.verify(session, item['evidence_id'], client=restarted).json(),
                             {'result': 'PASS', 'reason': 'integrity_verified'})
        self.assertEqual(self.verify(session, uploads[0]['evidence_id'], photo('blue', 'PNG')).json(),
                         {'result': 'FAIL', 'reason': 'image_modified'})
        self.assertEqual(self.upload(session).json(), {'detail': 'session_finalized'})

    def test_finalize_revalidates_all_stored_evidence_atomically(self):
        import sqlite3
        session = self.session()
        ids = [self.upload(session, slot).json()['evidence_id'] for slot in SLOTS]
        url = '/session/' + session['session_id'] + '/finalize'
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        with sqlite3.connect(database) as db:
            db.row_factory = sqlite3.Row
            original = dict(db.execute('SELECT * FROM evidence WHERE evidence_id=?', (ids[-1],)).fetchone())
        for field, value, code in (
                ('signature', '00' * 64, 'signature_invalid'),
                ('manifest', '{}', 'signature_invalid'),
                ('manifest', '{', 'signature_invalid'),
                ('public_key', '00' * 32, 'signature_invalid'),
                ('sha256', '00' * 32, 'signature_invalid'),
                ('captured_at', '2025-01-01T00:00:00Z', 'signature_invalid'),
                ('slot', 'invalid', 'signature_invalid'),
                ('image', photo('blue'), 'image_hash_mismatch')):
            with self.subTest(field=field, value=value):
                with sqlite3.connect(database) as db:
                    db.execute(f'UPDATE evidence SET {field}=? WHERE evidence_id=?', (value, ids[-1]))
                response = self.client.post(url, headers=self.auth(session))
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json(), {'detail': code})
                with sqlite3.connect(database) as db:
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM reports').fetchone()[0], 0)
                    db.execute(f'UPDATE evidence SET {field}=? WHERE evidence_id=?', (original[field], ids[-1]))
        report = self.client.post(url, headers=self.auth(session))
        self.assertEqual(report.status_code, 200, report.text)
        self.assertIn('not signed as a whole', report.json()['report']['integrity_notice'])
        self.assertIn('Revision links and analysis are server metadata, not device-signed.',
                      report.json()['report']['integrity_notice'])

    def test_verify_signature_invalid_uses_stored_record(self):
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        import sqlite3
        with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
            db.execute('UPDATE evidence SET signature=? WHERE evidence_id=?', ('00' * 64, evidence_id))
        response = self.verify(session, evidence_id)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {'result': 'FAIL', 'reason': 'signature_invalid'})

    def test_verify_auth_isolation(self):
        owner = self.session()
        evidence_id = self.upload(owner).json()['evidence_id']
        stranger = self.session(SigningKey.generate())
        self.assertEqual(self.verify(stranger, evidence_id).status_code, 404)
        self.assertEqual(self.verify(owner, 'unknown').status_code, 404)
        data = {'session_id': owner['session_id'], 'evidence_id': evidence_id}
        self.assertEqual(self.client.post('/verify', data=data, files={'image': ('a.jpg', photo())}).status_code, 401)
        self.assertEqual(self.client.post('/verify', data=data, files={'image': ('a.jpg', photo())},
                                         headers=self.auth(stranger)).status_code, 403)

    def test_invalid_image_and_size_limits(self):
        session = self.session()
        corrupt_png = bytearray(photo(fmt='PNG'))
        corrupt_png[-5] ^= 1  # Break IEND CRC; still recognized as PNG.
        for image in (b'', b'not an image', photo(fmt='GIF'), photo()[:100], bytes(corrupt_png)):
            with self.subTest(size=len(image)):
                response = self.upload(session, image=image)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json(), {'detail': 'invalid_image'})
        oversized = photo() + b'\0' * (10 * 1024 * 1024)
        response = self.upload(session, image=oversized)
        self.assertEqual(response.status_code, 413, response.text)
        self.assertEqual(response.json(), {'detail': 'image_too_large'})
        response = self.upload(session, image=oversized + b'\0' * (128 * 1024))
        self.assertEqual(response.status_code, 413, response.text)
        self.assertEqual(response.json(), {'detail': 'request_too_large'})
        pixels = io.BytesIO()
        Image.new('1', (5000, 4001)).save(pixels, format='PNG')
        response = self.upload(session, image=pixels.getvalue())
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(response.json(), {'detail': 'invalid_image'})
        records = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
        self.assertEqual(records['evidence'], [])

    def test_bad_manifest_payloads(self):
        session = self.session()
        changes = ({'extra': 'x'}, {'version': '2'}, {'captured_at': '2026-02-30T01:02:03Z'},
                   {'captured_at': '2026-11-14T08:00:00+07:00'}, {'captured_at': 'yesterday'},
                   {'slot': 'unknown'}, {'sha256': 'FF' * 32}, {'device_id': 1},
                   {'session_id': 'x' * 129}, {'captured_at': ''})
        for change in changes:
            with self.subTest(change=change):
                response = self.upload(session, changes=change)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json(), {'detail': 'invalid_manifest'})
        for text in ('{', '[]', 'null', '{}', ' ' * 4097):
            response = self.client.post('/evidence', headers=self.auth(session),
                                data={'session_id': session['session_id'], 'manifest': text, 'signature': '00' * 64},
                                files={'image': ('photo.jpg', photo())})
            self.assertIn(response.status_code, (400, 422), response.text)
        self.assertEqual(self.upload(session, signature='GG' * 64).json(), {'detail': 'invalid_signature'})

    def test_retake_preserves_signed_history_restart_and_report(self):
        import sqlite3
        session = self.session()
        url = '/session/' + session['session_id']
        first = self.upload(session).json()['evidence_id']
        before = self.client.get(url, headers=self.auth(session)).json()['evidence'][0]
        with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
            original = db.execute('SELECT manifest, signature, image FROM evidence WHERE evidence_id=?',
                                  (first,)).fetchone()
        response = self.upload(session, image=photo('blue'), replaces=first)
        self.assertEqual(response.status_code, 200, response.text)
        revised = response.json()
        self.assertNotEqual(revised['evidence_id'], first)
        self.assertEqual(revised['replaces_evidence_id'], first)
        listing = self.client.get(url, headers=self.auth(session)).json()
        self.assertEqual(listing['evidence_history'], [before])
        self.assertEqual(len(listing['evidence']), 1)
        self.assertEqual(listing['evidence'][0]['replaces_evidence_id'], first)
        self.assertEqual(self.verify(session, first).json()['result'], 'PASS')
        self.assertEqual(self.verify(session, revised['evidence_id'], photo('blue')).json()['result'], 'PASS')
        self.assertEqual(self.verify(session, revised['evidence_id']).json()['reason'], 'image_modified')
        with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
            self.assertEqual(db.execute('SELECT manifest, signature, image FROM evidence_history '
                                        'WHERE evidence_id=?', (first,)).fetchone(), original)
        restarted = TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
        self.addCleanup(restarted.close)
        self.assertEqual(restarted.get(url, headers=self.auth(session)).json(), listing)
        self.assertEqual(self.verify(session, first, client=restarted).json()['result'], 'PASS')
        for slot in SLOTS[1:]:
            self.assertEqual(self.upload(session, slot).status_code, 200)
        report = self.client.post(url + '/finalize', headers=self.auth(session)).json()['report']
        self.assertEqual(report['evidence_history'], [before])
        self.assertEqual(len(report['evidence']), 4)
        self.assertEqual(report['evidence'][0]['evidence_id'], revised['evidence_id'])
        self.assertEqual(self.upload(session, replaces=revised['evidence_id']).json(),
                         {'detail': 'session_finalized'})

    def test_replacement_validates_exact_current_binding_and_revision_limit(self):
        import uuid
        session = self.session()
        first = self.upload(session).json()['evidence_id']
        other_slot = self.upload(session, SLOTS[1]).json()['evidence_id']
        stranger = self.session()
        foreign = self.upload(stranger).json()['evidence_id']
        for replacement in ('', 'not-a-uuid', str(uuid.uuid4()), other_slot, foreign):
            with self.subTest(replacement=replacement):
                response = self.upload(session, replaces=replacement)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json(), {'detail': 'invalid_replacement'})
        response = self.upload(session, SLOTS[2], replaces=first)
        self.assertEqual(response.json(), {'detail': 'invalid_replacement'})
        current = first
        for _ in range(4):
            response = self.upload(session, replaces=current)
            self.assertEqual(response.status_code, 200, response.text)
            current = response.json()['evidence_id']
            stale = self.upload(session, replaces=first)
            self.assertEqual(stale.status_code, 409, stale.text)
            self.assertEqual(stale.json(), {'detail': 'stale_evidence'})
        response = self.upload(session, replaces=current)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json(), {'detail': 'revision_limit_reached'})
        listing = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
        self.assertEqual(len(listing['evidence_history']), 4)
        self.assertEqual(listing['evidence'][1]['evidence_id'], current)
        self.assertEqual([r['replaces_evidence_id'] for r in listing['evidence_history']][0], None)
        for record in listing['evidence_history']:
            self.assertEqual(self.verify(session, record['evidence_id']).json()['result'], 'PASS')
        self.assertEqual(self.verify(stranger, first).status_code, 404)

    def test_finalize_rechecks_archived_signature_binding_and_image(self):
        import sqlite3
        session = self.session()
        ids = [self.upload(session, slot).json()['evidence_id'] for slot in SLOTS]
        self.assertEqual(self.upload(session, replaces=ids[0]).status_code, 200)
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        with sqlite3.connect(database) as db:
            db.row_factory = sqlite3.Row
            original = dict(db.execute('SELECT * FROM evidence_history WHERE evidence_id=?', (ids[0],)).fetchone())
        for field, value, code in (
                ('manifest', '{', 'signature_invalid'), ('signature', '00' * 64, 'signature_invalid'),
                ('public_key', '00' * 32, 'signature_invalid'), ('slot', SLOTS[1], 'signature_invalid'),
                ('image', photo('blue'), 'image_hash_mismatch')):
            with self.subTest(field=field):
                with sqlite3.connect(database) as db:
                    db.execute(f'UPDATE evidence_history SET {field}=? WHERE evidence_id=?', (value, ids[0]))
                response = self.client.post('/session/' + session['session_id'] + '/finalize', headers=self.auth(session))
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json(), {'detail': code})
                with sqlite3.connect(database) as db:
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM reports').fetchone()[0], 0)
                    db.execute(f'UPDATE evidence_history SET {field}=? WHERE evidence_id=?', (original[field], ids[0]))

    def test_concurrent_replacements_commit_one_revision(self):
        import threading
        from concurrent.futures import ThreadPoolExecutor
        session = self.session()
        first = self.upload(session).json()['evidence_id']
        barrier = threading.Barrier(2)
        # Independent TestClient loops exercise separate SQLite writers.
        def replace():
            client = TestClient(self.app)
            with client:
                manifest = {'version': '1', 'session_id': session['session_id'], 'device_id': self.public_key,
                            'captured_at': '2026-11-14T08:00:00Z', 'slot': SLOTS[0],
                            'sha256': hashlib.sha256(photo('blue')).hexdigest()}
                text = canonical(manifest)
                barrier.wait(timeout=5)
                return client.post('/evidence', headers=self.auth(session),
                    data={'session_id': session['session_id'], 'manifest': text, 'replaces_evidence_id': first,
                          'signature': self.key.sign(text.encode()).signature.hex()},
                    files={'image': ('blue.jpg', photo('blue'))})
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: replace(), range(2)))
        self.assertEqual(sorted(r.status_code for r in responses), [200, 409])
        self.assertEqual(next(r.json() for r in responses if r.status_code == 409), {'detail': 'stale_evidence'})
        listing = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
        self.assertEqual(len(listing['evidence']), 1)
        self.assertEqual([r['evidence_id'] for r in listing['evidence_history']], [first])

    def test_concurrent_finalize_and_retake_report_matches_committed_state(self):
        import threading
        from concurrent.futures import ThreadPoolExecutor
        session = self.session()
        ids = [self.upload(session, slot).json()['evidence_id'] for slot in SLOTS]
        url = '/session/' + session['session_id']
        barrier = threading.Barrier(2)
        def finalize():
            with TestClient(self.app) as client:
                barrier.wait(timeout=5)
                return client.post(url + '/finalize', headers=self.auth(session))
        def replace():
            barrier.wait(timeout=5)
            return self.upload(session, replaces=ids[0])
        with ThreadPoolExecutor(max_workers=2) as pool:
            finalized = pool.submit(finalize)
            replaced = pool.submit(replace)
            report_response, replacement = finalized.result(), replaced.result()
        self.assertEqual(report_response.status_code, 200, report_response.text)
        report = report_response.json()['report']
        listing = self.client.get(url, headers=self.auth(session)).json()
        self.assertEqual(report['evidence'], listing['evidence'])
        self.assertEqual(report['evidence_history'], listing['evidence_history'])
        if replacement.status_code == 200:
            self.assertEqual([r['evidence_id'] for r in report['evidence_history']], [ids[0]])
        else:
            self.assertEqual(replacement.status_code, 409, replacement.text)
            self.assertEqual(replacement.json(), {'detail': 'session_finalized'})
            self.assertEqual(report['evidence_history'], [])
        self.assertEqual(self.client.post(url + '/finalize', headers=self.auth(session)).json(),
                         report_response.json())

    def test_replacement_failure_rolls_back_archive_and_current_record(self):
        import sqlite3
        session = self.session()
        first = self.upload(session).json()['evidence_id']
        url = '/session/' + session['session_id']
        before = self.client.get(url, headers=self.auth(session)).json()
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        with sqlite3.connect(database) as db:
            db.execute("CREATE TRIGGER fail_replacement BEFORE INSERT ON evidence "
                       "BEGIN SELECT RAISE(ABORT, 'test insert failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.upload(session, replaces=first)
        self.assertEqual(self.client.get(url, headers=self.auth(session)).json(), before)
        self.assertEqual(self.verify(session, first).json()['result'], 'PASS')

    def test_revision_migration_preserves_legacy_records_and_report_bytes(self):
        import sqlite3
        session = self.session()
        ids = [self.upload(session, slot).json()['evidence_id'] for slot in SLOTS]
        url = '/session/' + session['session_id']
        self.client.post(url + '/finalize', headers=self.auth(session))
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        with sqlite3.connect(database) as db:
            db.execute('DROP TABLE evidence_history')
            db.execute('ALTER TABLE evidence DROP COLUMN analysis')
            db.execute('ALTER TABLE evidence DROP COLUMN replaces_evidence_id')
            before = db.execute('SELECT * FROM evidence').fetchall()
            tokens = db.execute('SELECT * FROM sessions').fetchall()
            # Simulate persisted report from old version, not generated with new fields.
            legacy_report = canonical({'version': '1', 'session_id': session['session_id'], 'evidence': []})
            db.execute('UPDATE reports SET report=?', (legacy_report,))
            reports = db.execute('SELECT * FROM reports').fetchall()
        restarted = TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
        self.addCleanup(restarted.close)
        self.assertEqual(self.verify(session, ids[0], client=restarted).json()['result'], 'PASS')
        self.assertEqual(restarted.get(url, headers=self.auth(session)).json()['evidence_history'], [])
        self.assertEqual(restarted.post(url + '/finalize', headers=self.auth(session)).json()['report'],
                         json.loads(legacy_report))
        with sqlite3.connect(database) as db:
            self.assertEqual(db.execute('SELECT * FROM sessions').fetchall(), tokens)
            self.assertEqual(db.execute('SELECT * FROM reports').fetchall(), reports)
            self.assertEqual([r[:-2] for r in db.execute('SELECT * FROM evidence')], before)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_failed_revision_migration_rolls_back_schema_changes(self):
        import sqlite3
        session = self.session()
        first = self.upload(session).json()['evidence_id']
        database = Path(self.directory.name) / 'trustcam.sqlite3'
        with sqlite3.connect(database) as db:
            db.execute('DROP TABLE evidence_history')
            db.execute('ALTER TABLE evidence DROP COLUMN analysis')
            db.execute('ALTER TABLE evidence DROP COLUMN replaces_evidence_id')
            before = db.execute('SELECT * FROM evidence').fetchall()
            columns = db.execute('PRAGMA table_info(evidence)').fetchall()
        native_connect = sqlite3.connect
        def deny_history(*args, **kwargs):
            db = native_connect(*args, **kwargs)
            db.set_authorizer(lambda operation, name, *_: sqlite3.SQLITE_DENY
                              if operation == sqlite3.SQLITE_CREATE_TABLE and name == 'evidence_history'
                              else sqlite3.SQLITE_OK)
            return db
        with patch('backend.app.sqlite3.connect', side_effect=deny_history):
            with self.assertRaises(sqlite3.DatabaseError):
                importlib.import_module('backend.app').create_app(self.directory.name)
        with native_connect(database) as db:
            self.assertEqual(db.execute('PRAGMA table_info(evidence)').fetchall(), columns)
            self.assertEqual(db.execute('SELECT * FROM evidence').fetchall(), before)
        restarted = TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
        self.addCleanup(restarted.close)
        self.assertEqual(self.verify(session, first, client=restarted).json()['result'], 'PASS')

    def test_duplicate_slot_conflict(self):
        session = self.session()
        self.assertEqual(self.upload(session).status_code, 200)
        response = self.upload(session)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json(), {'detail': 'slot_already_collected'})
        records = self.client.get('/session/' + session['session_id'], headers=self.auth(session)).json()
        self.assertEqual(len(records['evidence']), 1)

    def test_multipart_rejects_extra_or_duplicate_fields(self):
        session = self.session()
        manifest = {'version': '1', 'session_id': session['session_id'], 'device_id': self.public_key,
                    'captured_at': '2026-11-14T08:00:00Z', 'slot': SLOTS[0],
                    'sha256': hashlib.sha256(photo()).hexdigest()}
        text = canonical(manifest)
        fields = [('session_id', (None, session['session_id'])), ('manifest', (None, text)),
                  ('signature', (None, self.key.sign(text.encode()).signature.hex())),
                  ('image', ('a.jpg', photo(), 'image/jpeg'))]
        for extra in (('extra', (None, 'bad')), ('session_id', (None, session['session_id'])),
                      ('image', ('extra.jpg', photo(), 'image/jpeg'))):
            response = self.client.post('/evidence', headers=self.auth(session), files=fields + [extra])
            self.assertEqual(response.status_code, 400, response.text)
            self.assertEqual(response.json(), {'detail': 'invalid_multipart_fields'})

    def test_noncanonical_and_outer_hash_signature_rejected(self):
        session = self.session()
        manifest = {'version': '1', 'session_id': session['session_id'], 'device_id': self.public_key,
                    'captured_at': '2026-11-14T08:00:00Z', 'slot': SLOTS[0],
                    'sha256': hashlib.sha256(photo()).hexdigest()}
        for text in (json.dumps(manifest), canonical(manifest) + '\n'):
            response = self.client.post('/evidence', headers=self.auth(session),
                data={'session_id': session['session_id'], 'manifest': text,
                      'signature': self.key.sign(text.encode()).signature.hex()},
                files={'image': ('a.jpg', photo())})
            self.assertEqual(response.json(), {'detail': 'invalid_manifest'})
        text = canonical(manifest)
        signature = self.key.sign(hashlib.sha256(text.encode()).digest()).signature.hex()
        response = self.client.post('/evidence', headers=self.auth(session),
            data={'session_id': session['session_id'], 'manifest': text, 'signature': signature},
            files={'image': ('a.jpg', photo())})
        self.assertEqual(response.json(), {'detail': 'signature_invalid'})

    def test_configurable_data_dir(self):
        from unittest.mock import patch
        configured = Path(self.directory.name) / 'configured'
        with patch.dict(os.environ, {'TRUSTCAM_DATA_DIR': str(configured)}):
            client = TestClient(importlib.import_module('backend.app').create_app())
            self.addCleanup(client.close)
            self.assertEqual(client.get('/health').status_code, 200)
            self.assertTrue((configured / 'trustcam.sqlite3').is_file())

    def test_malformed_multipart_error_is_machine_code(self):
        response = self.client.post('/evidence', content=b'broken',
                                    headers={'Content-Type': 'multipart/form-data'})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(response.json(), {'detail': 'invalid_multipart'})

    def test_stream_limit_without_content_length(self):
        import asyncio
        import httpx

        async def run():
            async def chunks():
                for _ in range(162):
                    yield b'x' * (64 * 1024)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://test') as client:
                response = await client.post('/evidence', content=chunks(),
                                             headers={'Content-Type': 'multipart/form-data; boundary=test'})
                self.assertEqual(response.status_code, 413, response.text)
                self.assertEqual(response.json(), {'detail': 'request_too_large'})
        asyncio.run(run())

    def test_out_of_order_slots_only_signed_slots_count(self):
        session = self.session()
        response = self.upload(session, SLOTS[-1])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['next_action'], {'type': 'capture', 'slot': SLOTS[0]})
        response = self.upload(session, SLOTS[0])
        self.assertEqual(response.json()['next_action'], {'type': 'capture', 'slot': SLOTS[1]})

    def test_upload_and_finalize_auth_isolation(self):
        owner = self.session()
        stranger = self.session(SigningKey.generate())
        body = {'session_id': owner['session_id'], 'manifest': '{}', 'signature': '00' * 64}
        for headers, status in (({}, 401), (self.auth(stranger), 403),
                                ({'Authorization': 'Bearer wrong'}, 401)):
            response = self.client.post('/evidence', headers=headers, data=body,
                                        files={'image': ('a.jpg', photo())})
            self.assertEqual(response.status_code, status, response.text)
            response = self.client.post('/session/' + owner['session_id'] + '/finalize', headers=headers)
            self.assertEqual(response.status_code, status, response.text)
        listing = self.client.get('/session/' + owner['session_id'], headers=self.auth(owner)).json()
        self.assertEqual(listing['evidence'], [])

    def test_verify_rejects_stored_binding_corruption(self):
        session = self.session()
        evidence_id = self.upload(session).json()['evidence_id']
        import sqlite3
        with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
            db.execute('UPDATE evidence SET public_key=? WHERE evidence_id=?',
                       (SigningKey.generate().verify_key.encode().hex(), evidence_id))
        self.assertEqual(self.verify(session, evidence_id).json(),
                         {'result': 'FAIL', 'reason': 'signature_invalid'})
        self.assertEqual(self.verify(session, evidence_id, b'invalid').json(), {'detail': 'invalid_image'})

    def test_session_auth_and_restart(self):
        session = self.session()
        self.assertEqual(session['device_id'], self.public_key)
        self.assertEqual(session['next_action'], {'type': 'capture', 'slot': SLOTS[0]})
        url = '/session/' + session['session_id']
        self.assertEqual(self.client.get(url).status_code, 401)
        stranger = self.session(SigningKey.generate())
        self.assertEqual(self.client.get(url, headers=self.auth(stranger)).status_code, 403)
        self.assertEqual(self.client.get('/session/unknown', headers=self.auth(session)).status_code, 404)
        expected = {'session_id': session['session_id'], 'evidence': [], 'evidence_history': [],
                    'next_action': session['next_action'], 'analysis_mode': 'checklist',
                    'status': 'collecting', 'report_id': None, 'max_evidence': 20, 'max_history': 80}
        self.assertEqual(self.client.get(url, headers=self.auth(session)).json(), expected)
        restarted = TestClient(importlib.import_module('backend.app').create_app(self.directory.name))
        self.addCleanup(restarted.close)
        self.assertEqual(restarted.get(url, headers=self.auth(session)).json(), expected)
        import sqlite3
        with sqlite3.connect(Path(self.directory.name) / 'trustcam.sqlite3') as db:
            stored = db.execute('SELECT token_hash FROM sessions').fetchall()
        self.assertNotIn(session['token'], str(stored))
        self.assertIn((hashlib.sha256(session['token'].encode()).hexdigest(),), stored)

    def test_session_rejects_invalid_key(self):
        for body in ({}, {'public_key': 'AB' * 32}, {'public_key': 'aa'},
                     {'public_key': 42}, {'public_key': self.public_key, 'extra': 'x'}):
            with self.subTest(body=body):
                self.assertEqual(self.client.post('/session', json=body).status_code, 422)

    def test_health(self):
        self.assertEqual(self.client.get('/health').json(), {
            'status': 'ok', 'analysis_mode': 'checklist', 'vlm_configured': False,
            'vlm_status': 'not_configured'})


if __name__ == '__main__':
    unittest.main()
