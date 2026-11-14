"""Offline integrity/excerpt checks. Run: python verify.py"""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent

def load(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8'))

def sha(data):
    return hashlib.sha256(data).hexdigest()

def local(path):
    p=(ROOT/path).resolve()
    assert p.is_relative_to(ROOT), path
    return p

manifest=load('manifest.json')
docs={d['id']:d for d in manifest['documents']}
chunks=[json.loads(s) for s in (ROOT/'chunks.jsonl').read_text(encoding='utf-8').splitlines()]
by_id={c['id']:c for c in chunks}
assert len(by_id)==len(chunks)
for f in manifest['files']:
    data=local(f['path']).read_bytes()
    assert len(data)==f['bytes'] and sha(data)==f['sha256'], f['path']
required={'id','document_id','article','label','text','source_url','source_file','raw_source_files','sha256','legal_status','demo_only','current_validity_verified','language','jurisdiction','text_start','text_end'}
for c in chunks:
    assert required <= c.keys()
    d=docs[c['document_id']]
    text=local(c['source_file']).read_text(encoding='utf-8')
    assert text[c['text_start']:c['text_end']]==c['text'],c['id']
    assert sha(c['text'].encode())==c['sha256'],c['id']
    assert text.startswith(c['boundary_start'],c['text_start'])
    assert (text.startswith(c['boundary_end'],c['text_end']) if c['boundary_end'] else c['text_end']==len(text))
    assert c['source_url']==d['source_url'] and c['raw_source_files']==d['raw_source_files']
    assert c['demo_only'] is True and c['current_validity_verified'] is False
    assert c['language']=='vi' and c['jurisdiction']=='VN'
    assert isinstance(c['article'],(int,str)) and c['legal_status']
    for f in c['raw_source_files']: assert local(f).is_file()
for d in docs.values():
    assert d['type'] in ('insurer_policy','claims_guide','law')
    assert not d['latest_version_verified'] and not d['current_validity_verified']
    assert d['publication_date'] is None
    assert set(d['chunk_ids'])=={c['id'] for c in chunks if c['document_id']==d['id']}
    for f in d['files']:
        assert sha(local(f['path']).read_bytes())==f['sha256']
assert (ROOT/'text/baoviet-969-2026.selected.txt').read_bytes()==(ROOT/'raw/baoviet-969-2026.visual-transcription.txt').read_bytes()
# Selected section labels and terminal subclauses prevent silently truncated exceptions.
for suffix,need in {'5-2-6':['a)','b)','c)','bất khả kháng','cơ quan có thẩm quyền'], '6':['6.1.','6.2.','6.3.','6.4.'], '7':['7.1.1.','7.1.2.','7.1.6.','7.2.6.','7.3.3.','7.6.4.'], '10':['10.1.','10.2.5.','10.3.2.','không rơi vào điểm loại trừ'], '11':['11.1.','11.10.','11.15.'], '14':['14.1.','14.2.','14.3.','500.000','nhỏ hơn hoặc bằng'], '15-2':['a)','b)','cơ quan có thẩm quyền']}.items():
    body=by_id['baoviet-969-2026-'+suffix]['text']
    assert all(s in body for s in need),suffix
for f in ('raw/baoviet-969.pdf','raw/own-damage-claim-form.pdf'):
    assert local(f).read_bytes().startswith(b'%PDF-')
for r in load('retrievals.json'):
    assert r['http_status']==200
    assert sha(local(r['source_file']).read_bytes())==r['sha256']
    assert r['fetched_at_utc'].endswith('+00:00')
# Ledger helper caps long evidence; retained prefix must still match exact source body.
ledger=load('citations.json')
for d in docs.values():
    entry=next(s for s in ledger['sources'] if s['id']==d['citation_id'])
    assert entry['url']==d['source_url'] and entry.get('quotes')
    body=' '.join(local(d['source_file']).read_text(encoding='utf-8').split()).casefold()
    for evidence in entry['quotes']:
        quote=evidence['text'].split('... [truncated]')[0].rstrip()
        assert ' '.join(quote.split()).casefold() in body
# This is byte/excerpt verification, NOT coverage verification or OCR certification.
queries=load('queries.json')
for q in queries:
    for e in q['expected_passages']:
        c=by_id[e['chunk_id']]
        assert e['quote'] in c['text']
        assert e['source_url']==c['source_url']
        assert e['text_start']==c['text_start']+c['text'].index(e['quote'])
        assert e['text_end']==e['text_start']+len(e['quote'])
    if q['query']=='PASS có đồng nghĩa được bồi thường không':
        assert q['must_abstain_coverage'] is True and q['integrity_separate_from_coverage'] is True
print(f'PASS: {len(docs)} documents; {len(chunks)} chunks; {len(manifest["files"])} file hashes; {len(queries)} query fixtures; exact excerpts, boundaries, metadata, retrieval hashes verified.')
print('NOT VERIFIED: latest/current applicability, customer contract, claim coverage, full OCR accuracy, RAG/application wiring.')
