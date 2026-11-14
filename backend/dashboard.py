"""Single-enterprise, explicit-grant demo. No import of backend.app."""
import hashlib
import hmac
import json
import io
import math
import os
from pathlib import Path
import re
from urllib.parse import urlsplit
import secrets
import threading
import time
import warnings
from datetime import datetime, timezone

from fastapi import Header, HTTPException, Request
from starlette.datastructures import UploadFile
from PIL import Image, UnidentifiedImageError
from starlette.responses import JSONResponse, Response

COOKIE = 'trustcam_dashboard'
SESSION_SECONDS = 3600
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 20_000_000


def install_dashboard(app, connect, authorized, validate_stored_evidence, evidence_records):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('''CREATE TABLE IF NOT EXISTS dashboard_grants (
            session_id TEXT PRIMARY KEY REFERENCES sessions(session_id), shared_at TEXT NOT NULL)''')

    password = os.environ.get('TRUSTCAM_DASHBOARD_PASSWORD', '')
    enabled = 16 <= len(password) <= 1024
    salt = secrets.token_bytes(16)

    def password_hash(value):
        return hashlib.scrypt(value.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)

    expected = password_hash(password) if enabled else b''
    del password
    secure = os.environ.get('TRUSTCAM_DASHBOARD_ALLOW_HTTP') != '1'
    sessions = {}
    attempts = {}
    lock = threading.Lock()

    def authentication(request):
        token = request.cookies.get(COOKIE, '')
        digest = hashlib.sha256(token.encode()).digest()
        now = time.monotonic()
        with lock:
            for key in list(sessions):
                if sessions[key]['expires'] <= now:
                    del sessions[key]
            session = sessions.get(digest)
        if not session:
            raise HTTPException(401, 'dashboard_auth_required')
        return digest, session

    def check_origin(request):
        origin = request.headers.get('origin')
        if origin is not None and origin != f'{request.url.scheme}://{request.url.netloc}':
            raise HTTPException(403, 'origin_forbidden')

    @app.middleware('http')
    async def dashboard_boundary(request, call_next):
        dashboard_path = request.url.path == '/dashboard' or request.url.path.startswith('/dashboard/')
        share_path = request.url.path.startswith('/session/') and request.url.path.endswith('/share-enterprise')
        if not dashboard_path and not share_path:
            return await call_next(request)
        if share_path:
            try:
                if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                    check_origin(request)
                response = await call_next(request)
            except HTTPException as exc:
                response = JSONResponse({'detail': exc.detail}, status_code=exc.status_code)
            except Exception:
                response = JSONResponse({'detail': 'dashboard_unavailable'}, status_code=500)
            response.headers['Cache-Control'] = 'no-store'
            return response
        try:
            if not enabled:
                raise HTTPException(503, 'dashboard_disabled')
            if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                check_origin(request)
                if request.url.path != '/dashboard/api/login':
                    _, session = authentication(request)
                    if not hmac.compare_digest(request.headers.get('x-csrf-token', '').encode(), session['csrf_token'].encode()):
                        raise HTTPException(403, 'csrf_invalid')
            chunks, received = [], 0
            async for chunk in request.stream():
                received += len(chunk)
                limit = (MAX_IMAGE_BYTES + 64 * 1024
                         if re.fullmatch(r'/dashboard/api/sessions/[^/]+/verify', request.url.path) else 4096)
                if received > limit:
                    raise HTTPException(413, 'request_too_large')
                chunks.append(chunk)
            request._body = b''.join(chunks)
            response = await call_next(request)
        except HTTPException as exc:
            response = JSONResponse({'detail': exc.detail}, status_code=exc.status_code)
        except Exception:
            response = JSONResponse({'detail': 'dashboard_unavailable'}, status_code=500)
        response.headers['Cache-Control'] = 'no-store'
        return response

    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError
            result[key] = value
        return result

    async def small_json(request):
        chunks, received = [], 0
        async for chunk in request.stream():
            received += len(chunk)
            if received > 4096:
                raise HTTPException(413, 'request_too_large')
            chunks.append(chunk)
        try:
            return json.loads(b''.join(chunks), object_pairs_hook=unique_object)
        except (ValueError, RecursionError):
            raise HTTPException(400, 'invalid_json') from None

    @app.post('/dashboard/api/login')
    async def login(request: Request):
        try:
            body = await small_json(request)
            if not isinstance(body, dict) or set(body) != {'password'}:
                raise ValueError
            value = body['password']
            if not isinstance(value, str) or len(value) > 1024:
                raise ValueError
            value.encode()
        except (ValueError, KeyError, TypeError, RecursionError):
            raise HTTPException(400, 'invalid_login') from None
        client = request.client.host if request.client else 'unknown'
        now = time.monotonic()
        with lock:
            for key in list(attempts):
                if attempts[key][0] + 60 <= now:
                    del attempts[key]
            if client not in attempts and len(attempts) >= 1024:
                raise HTTPException(429, 'login_rate_limited')
            started, count = attempts.get(client, (now, 0))
            if count >= 5:
                raise HTTPException(429, 'login_rate_limited')
            attempts[client] = (started, count + 1)
        if not hmac.compare_digest(password_hash(value), expected):
            raise HTTPException(401, 'invalid_credentials')
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with lock:
            if len(sessions) >= 256:
                del sessions[next(iter(sessions))]
            sessions[hashlib.sha256(token.encode()).digest()] = {
                'csrf_token': csrf, 'expires': time.monotonic() + SESSION_SECONDS}
        response = JSONResponse({'csrf_token': csrf})
        response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, path='/dashboard',
                            httponly=True, secure=secure, samesite='strict')
        return response

    @app.post('/session/{session_id}/share-enterprise')
    async def share(session_id: str, request: Request, authorization: str | None = Header(default=None)):
        with connect() as db:
            authorized(db, session_id, authorization)
        value = await small_json(request)
        if not isinstance(value, dict) or set(value) != {'consent'} or value['consent'] is not True:
            raise HTTPException(400, 'explicit_consent_required')
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            authorized(db, session_id, authorization)
            db.execute('INSERT OR IGNORE INTO dashboard_grants VALUES (?, ?)',
                       (session_id, datetime.now(timezone.utc).isoformat()))
            shared_at = db.execute('SELECT shared_at FROM dashboard_grants WHERE session_id=?',
                                   (session_id,)).fetchone()['shared_at']
        return {'shared': True, 'shared_at': shared_at}

    @app.get('/session/{session_id}/share-enterprise')
    def share_status(session_id: str, authorization: str | None = Header(default=None)):
        with connect() as db:
            authorized(db, session_id, authorization)
            row = db.execute('SELECT shared_at FROM dashboard_grants WHERE session_id=?',
                             (session_id,)).fetchone()
        return {'shared': bool(row), **({'shared_at': row['shared_at']} if row else {})}

    def granted(db, session_id):
        row = db.execute('SELECT s.*, g.shared_at FROM sessions s JOIN dashboard_grants g '
                         'ON g.session_id=s.session_id WHERE s.session_id=?', (session_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'session_not_found')
        return row

    @app.get('/dashboard/api/sessions')
    def session_list(request: Request):
        authentication(request)
        with connect() as db:
            rows = db.execute('''SELECT g.session_id, g.shared_at, r.report_id,
                (SELECT count(*) FROM evidence e WHERE e.session_id=g.session_id) AS evidence_count,
                (SELECT count(*) FROM evidence_history h WHERE h.session_id=g.session_id) AS history_count
                FROM dashboard_grants g JOIN sessions s ON s.session_id=g.session_id
                LEFT JOIN reports r ON r.session_id=g.session_id ORDER BY g.shared_at DESC, g.session_id''').fetchall()
        return {'sessions': [dict(row, status='finalized' if row['report_id'] else 'collecting') for row in rows]}

    @app.get('/dashboard/api/sessions/{session_id}')
    def session_detail(session_id: str, request: Request):
        authentication(request)
        with connect() as db:
            session = granted(db, session_id)
            records = evidence_records(db, session_id)
            history = evidence_records(db, session_id, history=True)
            report = db.execute('SELECT report_id FROM reports WHERE session_id=?', (session_id,)).fetchone()
        slots = ('wide_context', 'damage_closeup', 'serial_or_plate', 'identifier_doc')
        present = {record['slot'] for record in records}
        action = next(({'type': 'capture', 'slot': slot} for slot in slots if slot not in present),
                      {'type': 'finalize'})
        return {'session_id': session_id, 'evidence': records, 'evidence_history': history,
                'max_evidence': 20, 'max_history': 80,
                'status': 'finalized' if report else 'collecting',
                'report_id': report['report_id'] if report else None, 'shared_at': session['shared_at'],
                'next_action': action, 'analysis_mode': 'checklist'}

    def evidence_row(db, session_id, evidence_id):
        record = (db.execute('SELECT * FROM evidence WHERE session_id=? AND evidence_id=?',
                             (session_id, evidence_id)).fetchone() or
                  db.execute('SELECT * FROM evidence_history WHERE session_id=? AND evidence_id=?',
                             (session_id, evidence_id)).fetchone())
        if not record:
            raise HTTPException(404, 'evidence_not_found')
        return record

    @app.get('/dashboard/api/sessions/{session_id}/evidence/{evidence_id}/image')
    def evidence_image(session_id: str, evidence_id: str, request: Request):
        authentication(request)
        with connect() as db:
            session = granted(db, session_id)
            record = evidence_row(db, session_id, evidence_id)
            validate_stored_evidence(record, session)
        try:
            with Image.open(io.BytesIO(record['image'])) as image:
                if image.format not in ('JPEG', 'PNG'):
                    raise HTTPException(400, 'invalid_image')
                media = 'image/jpeg' if image.format == 'JPEG' else 'image/png'
        except (OSError, ValueError, KeyError, SyntaxError, Image.DecompressionBombError):
            raise HTTPException(400, 'invalid_image') from None
        return Response(record['image'], media_type=media)

    @app.get('/dashboard/api/sessions/{session_id}/report')
    def session_report(session_id: str, request: Request):
        authentication(request)
        with connect() as db:
            granted(db, session_id)
            record = db.execute('SELECT * FROM reports WHERE session_id=?', (session_id,)).fetchone()
        if not record:
            raise HTTPException(404, 'report_not_found')
        return {'report_id': record['report_id'], 'report': json.loads(record['report'])}

    @app.post('/dashboard/api/sessions/{session_id}/verify')
    async def verify(session_id: str, request: Request):
        authentication(request)
        with connect() as db:
            session = granted(db, session_id)
        async with request.form(max_files=1, max_fields=1, max_part_size=4096) as form:
            keys = [key for key, _ in form.multi_items()]
            if sorted(keys) != ['evidence_id', 'image']:
                raise HTTPException(400, 'invalid_multipart_fields')
            evidence_id, upload = form['evidence_id'], form['image']
            if not isinstance(evidence_id, str) or not 1 <= len(evidence_id) <= 64 or not isinstance(upload, UploadFile):
                raise HTTPException(400, 'invalid_multipart_fields')
            with connect() as db:
                record = evidence_row(db, session_id, evidence_id)
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
        try:
            validate_stored_evidence(record, session)
        except HTTPException:
            return {'result': 'FAIL', 'reason': 'signature_invalid'}
        if hashlib.sha256(content).hexdigest() != record['sha256']:
            return {'result': 'FAIL', 'reason': 'image_modified'}
        return {'result': 'PASS', 'reason': 'integrity_verified'}

    @app.get('/dashboard/api/legal')
    def legal(request: Request, q: str = ''):
        authentication(request)
        if len(q) > 512:
            raise HTTPException(400, 'query_too_long')
        notice = ('Tra cứu từ khóa, không phải RAG sinh nội dung; không tạo câu trả lời. '
                  'Corpus luật công khai và ví dụ điều kiện hợp đồng bảo hiểm; điều khoản bảo hiểm '
                  'không phải luật. Chưa xác minh đầy đủ sửa đổi hoặc hiệu lực hiện tại '
                  '(current_validity_verified=false). Không phải tư vấn pháp lý. '
                  'PASS không đồng nghĩa được bồi thường; không kết luận phạm vi bảo hiểm, '
                  'trách nhiệm hay số tiền chi trả; phải đối chiếu hợp đồng thực tế.')
        directory = Path(__file__).resolve().parents[1] / 'corpus'
        tokens = lambda value: re.findall(r'\w+', value.casefold())
        terms = set(tokens(q))
        query = q.strip().casefold()
        staged = []
        for name in ('legal-demo', 'motor-insurance-demo'):
            try:
                with (directory / name / 'manifest.json').open(encoding='utf-8') as handle:
                    manifest = json.loads(handle.read(1024 * 1024 + 1))
                documents = {item['id']: item for item in manifest['documents']}
                with (directory / name / 'chunks.jsonl').open(encoding='utf-8') as handle:
                    content = handle.read(2 * 1024 * 1024 + 1)
                if len(content) > 2 * 1024 * 1024:
                    raise ValueError
                for line in content.splitlines():
                    row = json.loads(line)
                    url = urlsplit(row['source_url'])
                    if row['demo_only'] is not True or row['current_validity_verified'] is not False or url.scheme not in ('http', 'https') or not url.netloc:
                        raise ValueError
                    text = row['text']
                    if hashlib.sha256(text.encode()).hexdigest() != row['sha256']:
                        raise ValueError
                    staged.append((name, row, documents[row['document_id']], tokens(text)))
            except (OSError, ValueError, KeyError, TypeError, AttributeError, RecursionError):
                notice = f'Corpus unavailable: {name}. ' + notice
        frequency = {}
        for _, _, _, words in staged:
            for word in set(words):
                frequency[word] = frequency.get(word, 0) + 1
        weight = lambda word: math.log((len(staged) + 1) / (frequency.get(word, 0) + 1)) + 1
        bigrams = lambda words: {tuple(words[index:index + 2]) for index in range(len(words) - 1)}
        wanted = bigrams(tokens(q))
        ranked = []
        for name, row, document, words in staged:
            matched = terms & set(words)
            if not matched:
                continue
            score = sum(weight(word) for word in matched) + 0.5 * len(wanted & bigrams(words))
            if query and query == str(row['article']).casefold():
                score += 100
            ranked.append((score, {
                'id': row['id'], 'document_title': document['title'],
                'article': row['label'] if name == 'legal-demo' else str(row['article']),
                'label': row['label'], 'text': row['text'], 'source_url': row['source_url'],
                'sha256': row['sha256'], 'legal_status': row['legal_status'],
                'document_type': 'law' if name == 'legal-demo' else document['type'],
                'current_validity_verified': False}))
        ranked.sort(key=lambda pair: (-pair[0], pair[1]['id']))
        return {'mode': 'retrieval_only', 'results': [item for _, item in ranked[:5]],
                'current_validity_verified': False, 'notice': notice}

    @app.get('/dashboard/api/me')
    def me(request: Request):
        _, session = authentication(request)
        return {'authenticated': True, 'csrf_token': session['csrf_token']}

    @app.post('/dashboard/api/logout')
    def logout(request: Request):
        digest, _ = authentication(request)
        with lock:
            sessions.pop(digest, None)
        response = JSONResponse({'authenticated': False})
        response.delete_cookie(COOKIE, path='/dashboard', httponly=True,
                               secure=secure, samesite='strict')
        return response
