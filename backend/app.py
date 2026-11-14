import hashlib
import hmac
import io
import json
from datetime import datetime
import re
import warnings
from contextlib import contextmanager
import os
from pathlib import Path
import secrets
import sqlite3
import uuid

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from backend.vlm import configuration, inspect_image, unique_object
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse
from starlette.staticfiles import StaticFiles
from backend.dashboard import install_dashboard

SLOTS = ('wide_context', 'damage_closeup', 'serial_or_plate', 'identifier_doc')
MAX_EVIDENCE = 20
MAX_HISTORY = 80


class SessionInput(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    public_key: str = Field(pattern=r'^[0-9a-f]{64}$')


def next_action(slots):
    return next(({'type': 'capture', 'slot': slot} for slot in SLOTS if slot not in slots),
                {'type': 'finalize'})


MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000
EVIDENCE_COLUMNS = ('evidence_id, session_id, slot, sha256, captured_at, manifest, signature, '
                    'public_key, image, analysis, replaces_evidence_id, is_additional')
MANIFEST_FIELDS = {'version', 'session_id', 'device_id', 'captured_at', 'slot', 'sha256'}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def parse_manifest(text):
    try:
        value = json.loads(text)
        if not isinstance(value, dict) or set(value) != MANIFEST_FIELDS:
            raise ValueError
        if any(not isinstance(v, str) or not v or len(v) > 128 for v in value.values()):
            raise ValueError
        if value['version'] != '1' or value['slot'] not in SLOTS:
            raise ValueError
        if not re.fullmatch(r'[0-9a-f]{64}', value['device_id']):
            raise ValueError
        if not re.fullmatch(r'[0-9a-f]{64}', value['sha256']):
            raise ValueError
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|\+00:00)', value['captured_at']):
            raise ValueError
        datetime.fromisoformat(value['captured_at'].replace('Z', '+00:00'))
        if canonical(value).decode() != text:
            raise ValueError
        return value
    except (ValueError, TypeError, RecursionError):
        raise HTTPException(400, 'invalid_manifest') from None


def signature_valid(manifest, signature, public_key):
    try:
        VerifyKey(bytes.fromhex(public_key)).verify(canonical(manifest), bytes.fromhex(signature))
        return True
    except (BadSignatureError, ValueError, TypeError):
        return False


def verified_manifest(record, session):
    try:
        manifest = parse_manifest(record['manifest'])
        bound = (manifest['session_id'] == record['session_id'] == session['session_id'] and
                 manifest['device_id'] == session['public_key'] == record['public_key'] and
                 manifest['sha256'] == record['sha256'] and manifest['slot'] == record['slot'] and
                 manifest['captured_at'] == record['captured_at'])
    except HTTPException:
        raise HTTPException(400, 'signature_invalid') from None
    if not bound or not signature_valid(manifest, record['signature'], session['public_key']):
        raise HTTPException(400, 'signature_invalid')
    return manifest


def validate_stored_evidence(record, session):
    manifest = verified_manifest(record, session)
    if hashlib.sha256(record['image']).hexdigest() != manifest['sha256']:
        raise HTTPException(400, 'image_hash_mismatch')


async def image_bytes(upload):
    content = bytearray()
    while chunk := await upload.read(64 * 1024):
        content.extend(chunk)
        if len(content) > MAX_IMAGE_BYTES:
            raise HTTPException(413, 'image_too_large')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                if image.format not in ('JPEG', 'PNG') or image.width * image.height > MAX_PIXELS:
                    raise HTTPException(400, 'invalid_image')
                image.verify()
            with Image.open(io.BytesIO(content)) as image:
                image.load()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError,
            Image.DecompressionBombWarning):
        raise HTTPException(400, 'invalid_image') from None
    return bytes(content)


def evidence_records(db, session_id, history=False):
    table = 'evidence_history' if history else 'evidence'
    rows = db.execute('SELECT evidence_id, slot, sha256, captured_at, manifest, signature, public_key, '
                      f'analysis, replaces_evidence_id, is_additional FROM {table} WHERE session_id=? ORDER BY rowid',
                      (session_id,)).fetchall()
    records = []
    for row in rows:
        record = dict(row)
        record['is_additional'] = bool(record['is_additional'])
        analysis = record.pop('analysis')
        record['manifest'] = json.loads(row['manifest'])
        if analysis is not None:
            record['analysis'] = json.loads(analysis)
        records.append(record)
    return records


def create_app(data_dir=None):
    directory = Path(data_dir or os.environ.get('TRUSTCAM_DATA_DIR', Path(__file__).parent / 'data'))
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    database = directory / 'trustcam.sqlite3'

    @contextmanager
    def connect():
        db = sqlite3.connect(database, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('''CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY, public_key TEXT NOT NULL, token_hash TEXT NOT NULL)''')
        db.execute('''CREATE TABLE IF NOT EXISTS evidence (
            evidence_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(session_id),
            slot TEXT NOT NULL, sha256 TEXT NOT NULL, captured_at TEXT NOT NULL,
            manifest TEXT NOT NULL, signature TEXT NOT NULL, public_key TEXT NOT NULL,
            image BLOB NOT NULL)''')
        db.execute('''CREATE TABLE IF NOT EXISTS reports (
            report_id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE REFERENCES sessions(session_id),
            report TEXT NOT NULL)''')
        if 'analysis' not in {row['name'] for row in db.execute('PRAGMA table_info(evidence)')}:
            db.execute('ALTER TABLE evidence ADD COLUMN analysis TEXT')
        if 'replaces_evidence_id' not in {row['name'] for row in db.execute('PRAGMA table_info(evidence)')}:
            db.execute('ALTER TABLE evidence ADD COLUMN replaces_evidence_id TEXT')
        if 'is_additional' not in {row['name'] for row in db.execute('PRAGMA table_info(evidence)')}:
            db.execute('ALTER TABLE evidence ADD COLUMN is_additional INTEGER NOT NULL DEFAULT 0')
        db.execute('''CREATE TABLE IF NOT EXISTS evidence_history (
            evidence_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(session_id),
            slot TEXT NOT NULL, sha256 TEXT NOT NULL, captured_at TEXT NOT NULL,
            manifest TEXT NOT NULL, signature TEXT NOT NULL, public_key TEXT NOT NULL,
            image BLOB NOT NULL, analysis TEXT, replaces_evidence_id TEXT,
            is_additional INTEGER NOT NULL DEFAULT 0)''')
        if 'is_additional' not in {row['name'] for row in db.execute('PRAGMA table_info(evidence_history)')}:
            db.execute('ALTER TABLE evidence_history ADD COLUMN is_additional INTEGER NOT NULL DEFAULT 0')
        # SQLite auto-index constraints cannot be dropped; rebuild only legacy unique-slot tables.
        if any(index['unique'] and
               [row['name'] for row in db.execute('SELECT name FROM pragma_index_info(?) ORDER BY seqno',
                                                  (index['name'],))] == ['session_id', 'slot']
               for index in db.execute('PRAGMA index_list(evidence)').fetchall()):
            db.execute('''CREATE TABLE evidence_new (
                evidence_id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(session_id),
                slot TEXT NOT NULL, sha256 TEXT NOT NULL, captured_at TEXT NOT NULL,
                manifest TEXT NOT NULL, signature TEXT NOT NULL, public_key TEXT NOT NULL,
                image BLOB NOT NULL, analysis TEXT, replaces_evidence_id TEXT,
                is_additional INTEGER NOT NULL DEFAULT 0)''')
            db.execute(f'INSERT INTO evidence_new (rowid, {EVIDENCE_COLUMNS}) '
                       f'SELECT rowid, {EVIDENCE_COLUMNS} FROM evidence ORDER BY rowid')
            db.execute('DROP TABLE evidence')
            db.execute('ALTER TABLE evidence_new RENAME TO evidence')
    database.chmod(0o600)
    vlm_config = configuration()
    app = FastAPI(title='TRUSTCAM')

    @app.middleware('http')
    async def bound_request(request, call_next):
        # Bound wire bytes before multipart parser can spool unbounded files.
        path = request.scope['path']
        upload = (path in ('/evidence', '/verify') or
                  re.fullmatch(r'/dashboard/api/sessions/[^/]+/verify', path))
        limit = MAX_IMAGE_BYTES + 64 * 1024 if upload else 16 * 1024
        chunks, received = [], 0
        async for chunk in request.stream():
            received += len(chunk)
            if received > limit:
                return JSONResponse({'detail': 'request_too_large'}, status_code=413)
            chunks.append(chunk)
        request._body = b''.join(chunks)
        return await call_next(request)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        detail = exc.detail
        if exc.status_code == 400 and detail in ('Missing boundary in multipart.', 'There was an error parsing the body'):
            detail = 'invalid_multipart'
        elif exc.status_code == 404 and detail == 'Not Found':
            detail = 'not_found'
        return JSONResponse({'detail': detail}, status_code=exc.status_code, headers=exc.headers)

    def authorized_token(db, authorization):
        if not authorization or not authorization.startswith('Bearer '):
            raise HTTPException(401, 'auth_required')
        token = authorization[7:]
        if not token or len(token) > 256:
            raise HTTPException(401, 'invalid_token')
        digest = hashlib.sha256(token.encode()).hexdigest()
        # Authenticate first: invalid credentials never disclose record existence.
        if not db.execute('SELECT 1 FROM sessions WHERE token_hash=?', (digest,)).fetchone():
            raise HTTPException(401, 'invalid_token')
        return digest

    def authorized(db, session_id, authorization):
        digest = authorized_token(db, authorization)
        session = db.execute('SELECT * FROM sessions WHERE session_id=?', (session_id,)).fetchone()
        if session is None:
            raise HTTPException(404, 'session_not_found')
        if not hmac.compare_digest(session['token_hash'], digest):
            raise HTTPException(403, 'session_forbidden')
        return session

    @app.get('/health')
    def health():
        return {'status': 'ok', 'analysis_mode': 'checklist', 'vlm_configured': vlm_config is not None,
                'vlm_status': 'not_checked' if vlm_config else 'not_configured'}

    @app.post('/session')
    def session_create(body: SessionInput):
        session_id, token = str(uuid.uuid4()), secrets.token_urlsafe(32)
        with connect() as db:
            db.execute('INSERT INTO sessions VALUES (?, ?, ?)',
                       (session_id, body.public_key, hashlib.sha256(token.encode()).hexdigest()))
        return {'session_id': session_id, 'token': token, 'device_id': body.public_key,
                'next_action': next_action(()), 'max_evidence': MAX_EVIDENCE, 'max_history': MAX_HISTORY}

    @app.get('/session/{session_id}')
    def session_get(session_id: str, authorization: str | None = Header(default=None)):
        with connect() as db:
            authorized(db, session_id, authorization)
            records = evidence_records(db, session_id)
            history = evidence_records(db, session_id, history=True)
            report = db.execute('SELECT report_id FROM reports WHERE session_id=?', (session_id,)).fetchone()
        return {'session_id': session_id, 'evidence': records, 'evidence_history': history,
                'max_evidence': MAX_EVIDENCE, 'max_history': MAX_HISTORY,
                'status': 'finalized' if report else 'collecting',
                'report_id': report['report_id'] if report else None,
                'next_action': next_action({r['slot'] for r in records}),
                'analysis_mode': 'checklist'}

    async def exact_form(request, expected, optional=()):
        form = await request.form()
        keys = [key for key, _ in form.multi_items()]
        if not expected <= set(keys) <= expected | set(optional) or len(keys) != len(set(keys)):
            raise HTTPException(400, 'invalid_multipart_fields')

    @app.post('/evidence')
    async def evidence_upload(request: Request, session_id: str = Form(max_length=64),
                              manifest: str = Form(max_length=4096),
                              signature: str = Form(max_length=128),
                              image: UploadFile = File(),
                              replaces_evidence_id: str | None = Form(default=None),
                              authorization: str | None = Header(default=None)):
        try:
            with connect() as db:
                session = authorized(db, session_id, authorization)
            await exact_form(request, {'session_id', 'manifest', 'signature', 'image'}, {'replaces_evidence_id', 'additional'})
            form = await request.form()
            if 'replaces_evidence_id' in form:
                replacement = form['replaces_evidence_id']
                try:
                    if not isinstance(replacement, str) or str(uuid.UUID(replacement)) != replacement:
                        raise ValueError
                except (ValueError, AttributeError):
                    raise HTTPException(400, 'invalid_replacement') from None
                replaces_evidence_id = replacement
            is_additional = 'additional' in form
            if is_additional and form['additional'] != 'true':
                raise HTTPException(400, 'invalid_additional')
            if is_additional and replaces_evidence_id is not None:
                raise HTTPException(400, 'invalid_replacement')
            value = parse_manifest(manifest)
            if value['session_id'] != session_id:
                raise HTTPException(400, 'session_mismatch')
            if value['device_id'] != session['public_key']:
                raise HTTPException(400, 'device_mismatch')
            if not re.fullmatch(r'[0-9a-f]{128}', signature):
                raise HTTPException(400, 'invalid_signature')
            if not signature_valid(value, signature, session['public_key']):
                raise HTTPException(400, 'signature_invalid')
            content = await image_bytes(image)
            digest = hashlib.sha256(content).hexdigest()
            if digest != value['sha256']:
                raise HTTPException(400, 'image_hash_mismatch')
            evidence_id = str(uuid.uuid4())
            with connect() as db:
                db.execute('BEGIN IMMEDIATE')
                authorized(db, session_id, authorization)
                if db.execute('SELECT 1 FROM reports WHERE session_id=?', (session_id,)).fetchone():
                    raise HTTPException(409, 'session_finalized')
                current = db.execute('SELECT evidence_id FROM evidence WHERE session_id=? AND slot=?',
                                     (session_id, value['slot'])).fetchone()
                if current and replaces_evidence_id is None and not is_additional:
                    raise HTTPException(409, 'slot_already_collected')
                if replaces_evidence_id is None and db.execute(
                        'SELECT COUNT(*) FROM evidence WHERE session_id=?', (session_id,)).fetchone()[0] >= MAX_EVIDENCE:
                    raise HTTPException(409, 'evidence_limit_reached')
                if is_additional and next_action({r['slot'] for r in evidence_records(db, session_id)}) != {'type': 'finalize'}:
                    raise HTTPException(409, 'checklist_incomplete')
                if replaces_evidence_id is not None:
                    target = db.execute('SELECT * FROM evidence WHERE evidence_id=?',
                                        (replaces_evidence_id,)).fetchone()
                    archived = None if target else db.execute(
                        'SELECT * FROM evidence_history WHERE evidence_id=?', (replaces_evidence_id,)).fetchone()
                    record = target or archived
                    if not record or record['session_id'] != session_id or record['slot'] != value['slot']:
                        raise HTTPException(400, 'invalid_replacement')
                    if not target:
                        raise HTTPException(409, 'stale_evidence')
                    is_additional = bool(target['is_additional'])
                    seen = set()
                    while record:
                        if (record['evidence_id'] in seen or record['session_id'] != session_id or
                                record['slot'] != value['slot'] or bool(record['is_additional']) != is_additional):
                            raise HTTPException(400, 'invalid_replacement')
                        seen.add(record['evidence_id'])
                        if len(seen) >= 5:
                            raise HTTPException(409, 'revision_limit_reached')
                        predecessor = record['replaces_evidence_id']
                        record = db.execute('SELECT * FROM evidence_history WHERE evidence_id=?',
                                            (predecessor,)).fetchone() if predecessor else None
                        if predecessor and not record:
                            raise HTTPException(400, 'invalid_replacement')
                    if db.execute('SELECT COUNT(*) FROM evidence_history WHERE session_id=?',
                                  (session_id,)).fetchone()[0] >= MAX_HISTORY:
                        raise HTTPException(409, 'history_limit_reached')
                    db.execute(f'INSERT INTO evidence_history ({EVIDENCE_COLUMNS}) '
                               f'SELECT {EVIDENCE_COLUMNS} FROM evidence WHERE evidence_id=?',
                               (replaces_evidence_id,))
                    db.execute('DELETE FROM evidence WHERE evidence_id=?', (replaces_evidence_id,))
                db.execute('INSERT INTO evidence (evidence_id, session_id, slot, sha256, captured_at, '
                           'manifest, signature, public_key, image, replaces_evidence_id, is_additional) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                           (evidence_id, session_id, value['slot'], digest, value['captured_at'],
                            manifest, signature, session['public_key'], content, replaces_evidence_id, int(is_additional)))
                records = evidence_records(db, session_id)
            return {'evidence_id': evidence_id, 'sha256': digest, 'slot': value['slot'],
                    'is_additional': is_additional,
                    'next_action': next_action({r['slot'] for r in records}),
                    'analysis_mode': 'checklist',
                    **({'replaces_evidence_id': replaces_evidence_id} if replaces_evidence_id is not None else {})}
        finally:
            await image.close()

    @app.post('/evidence/{evidence_id}/analyze')
    async def evidence_analyze(evidence_id: str, request: Request,
                               authorization: str | None = Header(default=None)):
        with connect() as db:
            # Validate bearer before any resource lookup.
            authorized_token(db, authorization)
            record = db.execute('SELECT * FROM evidence WHERE evidence_id=?', (evidence_id,)).fetchone()
            if not record:
                archived = db.execute('SELECT session_id FROM evidence_history WHERE evidence_id=?',
                                      (evidence_id,)).fetchone()
                if archived:
                    authorized(db, archived['session_id'], authorization)
                    if db.execute('SELECT 1 FROM reports WHERE session_id=?', (archived['session_id'],)).fetchone():
                        raise HTTPException(409, 'session_finalized')
                    raise HTTPException(409, 'evidence_superseded')
                raise HTTPException(404, 'evidence_not_found')
            session = authorized(db, record['session_id'], authorization)
            if db.execute('SELECT 1 FROM reports WHERE session_id=?', (record['session_id'],)).fetchone():
                raise HTTPException(409, 'session_finalized')
        body = await request.body()
        try:
            value = json.loads(body, object_pairs_hook=unique_object) if body else {}
            if (request.query_params or not isinstance(value, dict) or
                    set(value) - {'language'} or value.get('language', 'vi') not in ('vi', 'en')):
                raise ValueError
            language = value.get('language', 'vi')
        except (ValueError, TypeError, RecursionError):
            raise HTTPException(400, 'invalid_analysis_request') from None
        validate_stored_evidence(record, session)
        analysis = json.loads(record['analysis']) if record['analysis'] else await inspect_image(
            vlm_config, record['image'], record['slot'], language)
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM reports WHERE session_id=?', (record['session_id'],)).fetchone():
                raise HTTPException(409, 'session_finalized')
            if not db.execute('SELECT 1 FROM evidence WHERE evidence_id=?', (evidence_id,)).fetchone():
                raise HTTPException(409, 'evidence_superseded')
            db.execute('UPDATE evidence SET analysis=? WHERE evidence_id=? AND analysis IS NULL',
                       (canonical(analysis).decode(), evidence_id))
            # Concurrent successes never overwrite the first stored result.
            analysis = json.loads(db.execute('SELECT analysis FROM evidence WHERE evidence_id=?',
                                            (evidence_id,)).fetchone()['analysis'])
            slots = {r['slot'] for r in evidence_records(db, record['session_id'])}
        action = (next_action(slots) if analysis['status'] == 'accepted' else
                  {'type': 'capture', 'slot': record['slot']})
        return {'evidence_id': evidence_id, 'analysis': analysis, 'next_action': action}

    @app.post('/session/{session_id}/finalize')
    def session_finalize(session_id: str, authorization: str | None = Header(default=None)):
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            session = authorized(db, session_id, authorization)
            previous = db.execute('SELECT * FROM reports WHERE session_id=?', (session_id,)).fetchone()
            if previous:
                return {'report_id': previous['report_id'], 'report': json.loads(previous['report'])}
            for table, limit, error in (('evidence', MAX_EVIDENCE, 'evidence_limit_reached'),
                                        ('evidence_history', MAX_HISTORY, 'history_limit_reached')):
                if db.execute(f'SELECT COUNT(*) FROM {table} WHERE session_id=?', (session_id,)).fetchone()[0] > limit:
                    raise HTTPException(409, error)
                for record in db.execute(f'SELECT * FROM {table} WHERE session_id=?', (session_id,)):
                    validate_stored_evidence(record, session)
            records = evidence_records(db, session_id)
            if next_action({r['slot'] for r in records}) != {'type': 'finalize'}:
                raise HTTPException(409, 'checklist_incomplete')
            report = {'version': '1', 'session_id': session_id, 'device_id': session['public_key'],
                      'evidence': records, 'evidence_history': evidence_records(db, session_id, history=True),
                      'analysis_mode': 'checklist',
                      'integrity_notice': 'PASS verifies byte integrity and device signature only. '
                          'This report is not signed as a whole; only individual v1 manifests are signed. '
                          'Revision links and analysis are server metadata, not device-signed. '
                          'is_additional is unsigned server metadata. '
                          'It does not establish scene truth, capture time, identity, or legal validity. '
                          'Checklist completion is not visual assessment. '
                          'Optional VLM results are untrusted visual advisory only, not acceptance '
                          'of authenticity or a requirement for checklist finalization. '
                          'Cryptographic failure must not trigger automatic sanctions.'}
            report_id = str(uuid.uuid4())
            db.execute('INSERT INTO reports VALUES (?, ?, ?)',
                       (report_id, session_id, canonical(report).decode()))
        return {'report_id': report_id, 'report': report}

    @app.get('/session/{session_id}/report')
    def session_report(session_id: str, authorization: str | None = Header(default=None)):
        with connect() as db:
            authorized(db, session_id, authorization)
            record = db.execute('SELECT * FROM reports WHERE session_id=?', (session_id,)).fetchone()
            if not record:
                raise HTTPException(404, 'report_not_found')
        return {'report_id': record['report_id'], 'report': json.loads(record['report'])}

    @app.get('/report/{report_id}')
    def report_get(report_id: str, authorization: str | None = Header(default=None)):
        with connect() as db:
            # Authenticate even for unknown report IDs, avoiding existence leaks.
            if not authorization or not authorization.startswith('Bearer '):
                raise HTTPException(401, 'auth_required')
            token = authorization[7:]
            digest = hashlib.sha256(token.encode()).hexdigest()
            if not token or len(token) > 256 or not db.execute(
                    'SELECT 1 FROM sessions WHERE token_hash=?', (digest,)).fetchone():
                raise HTTPException(401, 'invalid_token')
            record = db.execute('SELECT * FROM reports WHERE report_id=?', (report_id,)).fetchone()
            if not record:
                raise HTTPException(404, 'report_not_found')
            authorized(db, record['session_id'], authorization)
        return {'report_id': report_id, 'report': json.loads(record['report'])}

    @app.post('/verify')
    async def verify(request: Request, session_id: str = Form(max_length=64), evidence_id: str = Form(max_length=64),
                     image: UploadFile = File(), authorization: str | None = Header(default=None)):
        try:
            with connect() as db:
                session = authorized(db, session_id, authorization)
                record = (db.execute('SELECT * FROM evidence WHERE evidence_id=? AND session_id=?',
                                     (evidence_id, session_id)).fetchone() or
                          db.execute('SELECT * FROM evidence_history WHERE evidence_id=? AND session_id=?',
                                     (evidence_id, session_id)).fetchone())
                if not record:
                    raise HTTPException(404, 'evidence_not_found')
            await exact_form(request, {'session_id', 'evidence_id', 'image'})
            content = await image_bytes(image)
            try:
                manifest = verified_manifest(record, session)
            except HTTPException:
                return {'result': 'FAIL', 'reason': 'signature_invalid'}
            if hashlib.sha256(content).hexdigest() != manifest['sha256']:
                return {'result': 'FAIL', 'reason': 'image_modified'}
            return {'result': 'PASS', 'reason': 'integrity_verified'}
        finally:
            await image.close()

    install_dashboard(app, connect, authorized, validate_stored_evidence, evidence_records)
    app.mount('/dashboard', StaticFiles(directory=Path(__file__).resolve().parents[1] / 'dashboard', html=True),
              name='dashboard')
    return app


app = create_app()
