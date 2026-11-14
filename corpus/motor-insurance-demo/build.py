"""Rebuild local corpus from retained retrievals; no network, stdlib only."""
from pathlib import Path
from html.parser import HTMLParser
from datetime import datetime, timezone
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parent
SOURCES = '/home/rcong/.hermes/skills/research/grounded-citations/scripts/sources.py'
POLICY = 'https://baovietonline.com.vn/uploads/attachment/quy-tac-bao-hiem-vat-chat-o-to-bao-hiem-vat-chat-xe-o-to-vi.pdf'
PRODUCT = 'https://baovietonline.com.vn/vi/bao-hiem-ca-nhan/54/bao-hiem-vat-chat-xe-o-to.html'
FORM = 'https://baovietonline.com.vn/uploads/attachment/a28f0c31be4a2ff2618c17a0a1365970.pdf'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def save(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if not self.hidden and tag in ('p','div','h1','h2','h3','li','br','a'): self.out.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.hidden -= 1
        if not self.hidden: self.out.append('\n' if tag in ('p','div','h1','h2','h3','li','a') else '')
    def handle_data(self, data):
        if not self.hidden: self.out.append(data)

# ponytail: selected policy sections visually checked, not entire OCR; expand only after page review.
selected = (ROOT/'text/baoviet-969-2026.selected.txt').read_text(encoding='utf-8')
visual = ROOT/'raw/baoviet-969-2026.visual-transcription.txt'
if visual.exists():
    assert visual.read_text(encoding='utf-8') == selected
else:
    visual.write_text(selected, encoding='utf-8')
ocr = '\n\f\n'.join((ROOT/f'raw/ocr-969/page-{n:02}.txt').read_text(encoding='utf-8') for n in range(1,22))
(ROOT/'text/baoviet-969-2026.full-ocr-unreviewed.txt').write_text(ocr, encoding='utf-8')
parser = Text()
parser.feed((ROOT/'raw/product-claims.html').read_text(encoding='utf-8'))
product = '\n'.join(s.strip() for s in ''.join(parser.out).splitlines() if s.strip()) + '\n'
(ROOT/'text/product.txt').write_text(product, encoding='utf-8')
form = (ROOT/'raw/own-damage-claim-form.pdftotext.txt').read_text(encoding='utf-8')
(ROOT/'text/claim-form.txt').write_text(form, encoding='utf-8')

base = dict(insurer='Tổng Công ty Bảo hiểm Bảo Việt', demo_only=True, current_validity_verified=False, language='vi', jurisdiction='VN', applicability='Chỉ là ví dụ công khai; phụ thuộc hợp đồng, giấy chứng nhận, phụ lục và tình tiết thực tế.', publication_date=None, latest_version_verified=False)
policy_files = ['raw/baoviet-969.pdf', 'raw/baoviet-969.pdftotext.txt', 'raw/baoviet-969-2026.visual-transcription.txt'] + [f'raw/ocr-969/page-{n:02}.{ext}' for n in (1,9,10,11,12,13,14,15,17,18) for ext in ('png','txt')]
docs: list[dict] = [dict(base, id='baoviet-969-2026', title='Quy tắc bảo hiểm vật chất xe ô tô', version='969/QĐ-BHBV; ngày 26/01/2026 đọc từ trang 1; chưa xác nhận mới nhất', type='insurer_policy', document_number='969/QĐ-BHBV', issued_date='2026-01-26', effective_date=None, website_application_date='2026-03-01', website_application_date_source=PRODUCT, date_note='Trang sản phẩm ghi áp dụng từ 1/3/2026; không coi đó là ngày hiệu lực pháp luật hoặc xác nhận áp dụng hợp đồng khách hàng.', official_urls=[POLICY,PRODUCT], source_url=POLICY, source_file='text/baoviet-969-2026.selected.txt', raw_source_files=policy_files, legal_status='insurer_contractual_terms_example_not_legislation', citation_id=3, extraction='pdftotext text layer corrupted; Tesseract vie 220 dpi; selected complete sections visually transcribed against PNG pages; full OCR retained unreviewed.'),
 dict(base, id='baoviet-product-54', title='Trang sản phẩm Bảo hiểm vật chất xe ô tô — nhãn phiên bản', version='snapshot; ngày công bố không xác định', type='claims_guide', document_number=None, issued_date=None, effective_date=None, official_urls=[PRODUCT], source_url=PRODUCT, source_file='text/product.txt', raw_source_files=['raw/product-claims.html'], legal_status='official_product_reference_not_contract_not_legislation', citation_id=1, extraction='stdlib HTMLParser; scripts/styles removed, HTML entities decoded; version labels only, NOT independent motor claim procedure.'),
 dict(base, id='baoviet-own-damage-claim-form', title='Thông báo tai nạn & yêu cầu bồi thường bảo hiểm vật chất ô tô (Áp dụng đối với tổn thất vật chất đơn giản)', version='mẫu công khai không thấy số phiên bản/ngày ban hành; chưa xác nhận hiện hành', type='claims_guide', document_number=None, issued_date=None, effective_date=None, official_urls=[FORM], source_url=FORM, source_file='text/claim-form.txt', raw_source_files=['raw/own-damage-claim-form.pdf','raw/own-damage-claim-form.pdftotext.txt'], legal_status='official_claim_form_example_not_coverage_decision_not_legislation', citation_id=6, extraction='pdftotext -layout; complete one-page form; no asserted relation to policy 969 beyond same insurer and own-damage product.')]
chunks=[]

def chunk(doc, key, article, label, start, end, pages):
    text=(ROOT/doc['source_file']).read_text(encoding='utf-8')
    a=text.index(start)
    b=text.index(end,a) if end else len(text)
    # Keep exact complete section, including trailing newlines; offsets count Unicode codepoints.
    body=text[a:b]
    row=dict(id=doc['id']+'-'+key, document_id=doc['id'], article=article, label=label, text=body, source_url=doc['source_url'], source_file=doc['source_file'], raw_source_files=doc['raw_source_files'], sha256=sha(body.encode()), legal_status=doc['legal_status'], demo_only=True, current_validity_verified=False, language='vi', jurisdiction='VN', text_start=a, text_end=b, boundary_start=start, boundary_end=end, pdf_pages=pages, citation_id=doc['citation_id'])
    chunks.append(row)

p=docs[0]
sections=[('5-2-6','5.2.6','Nghĩa vụ khi xảy ra thiệt hại','5.2.6.','5.2.7.',[9]),('5-2-7','5.2.7','Trung thực và hợp tác trong hồ sơ','5.2.7.','Điều 6.',[9]),('6',6,'Giám định thiệt hại — gồm chứng từ và ảnh chụp','Điều 6.','Điều 7.',[10]),('7',7,'Hồ sơ bồi thường — toàn bộ Điều 7','Điều 7.','Điều 10.',[10,11,12]),('10',10,'Đối tượng và Phạm vi bảo hiểm — toàn bộ Điều 10','Điều 10.','Điều 11.',[13,14]),('11',11,'Loại trừ — toàn bộ Điều 11','Điều 11.','Điều 14.',[14,15]),('14',14,'Mức khấu trừ — toàn bộ Điều 14','Điều 14.','15.2.',[17]),('15-2','15.2','Giảm trừ khi tự ý sửa chữa — toàn bộ khoản 15.2','15.2.',None,[18])]
for args in sections: chunk(p,*args)
chunk(docs[1], 'version-labels','Tài liệu biểu mẫu','Nhãn 5688 trước 1/3/2026 và 969 từ 1/3/2026','Quy tắc bảo hiểm vật chất Ô Tô (số 5688)', 'Danh sách Garage liên kết với BHBV', [])
chunk(docs[2], 'full-form','Mẫu toàn trang','Toàn bộ mẫu thông báo tai nạn, thông tin xe và cam đoan', '                                                                                                                        BẢO HIỂM XE Ô TÔ', None,[1])
(ROOT/'chunks.jsonl').write_text(''.join(json.dumps(c,ensure_ascii=False)+'\n' for c in chunks),encoding='utf-8')
for doc in docs:
    paths = doc['raw_source_files']+[doc['source_file']]
    doc['files']=[dict(path=f,sha256=sha((ROOT/f).read_bytes()),bytes=(ROOT/f).stat().st_size) for f in paths]
    doc['sha256']=doc['files'][0]['sha256']
    doc['fetched_at_utc']=datetime.fromtimestamp((ROOT/paths[0]).stat().st_mtime,timezone.utc).isoformat()
    doc['fetched_at_note']='UTC file capture completion timestamp; original HTTP headers unavailable for first fetch; see retrievals.json for verified re-fetch.'
    doc['chunk_ids']=[c['id'] for c in chunks if c['document_id']==doc['id']]
files=[dict(path=str(f.relative_to(ROOT)),sha256=sha(f.read_bytes()),bytes=f.stat().st_size) for folder in ('raw','text') for f in sorted((ROOT/folder).rglob('*')) if f.is_file()]
save('manifest.json',dict(schema_version='motor-insurance-demo/1',demo_only=True,current_validity_verified=False,documents=docs,files=files,excluded_candidates=[dict(path='raw/baoviet-6556-2016.pdf',reason='older policy; no chunks, do not mix deadlines'),dict(path='raw/baoviet-5688-2021.pdf',reason='website labels before 1/3/2026; no chunks, do not mix deadlines'),dict(path='raw/claims-guide.html',reason='health claims page, not motor own-damage; no chunks')],offset_convention='Unicode codepoints, half-open [text_start,text_end) in UTF-8 decoded source_file; not byte/PDF offsets',scope='3 retained example documents, 10 selected complete sections; full policy PDF retained, only selected text visually reviewed. Not wired to application.'))
# Ledger rejects evidence absent from retained text.
for c in chunks:
    subprocess.run(['python',SOURCES,'--ledger',str(ROOT/'citations.json'),'quote',str(c['citation_id']),'--text',c['text'],'--from',str(ROOT/c['source_file'])],check=True,capture_output=True)
fixtures = [
 ('chụp ảnh gì','6','6.4.','Chỉ có chỉ dẫn ảnh chụp thiệt hại và tài liệu liên quan khi không giám định được; không có danh sách góc chụp cản xe chuẩn trong nguồn. Ảnh toàn cảnh/vị trí xe/biển số/cận cảnh nếu đề xuất phải gắn nhãn khuyến nghị demo, không phải trích quy tắc.'),
 ('báo tổn thất thế nào','5-2-6','5.2.6.','Theo đúng ví dụ quy tắc 969: thông báo ngay, giữ nguyên ngoại lệ của khoản a và c; dùng đầu mối ghi trong hợp đồng thực tế. Không lấy mốc 6 giờ của bản cũ.'),
 ('có tự sửa trước khi giám định không','5-2-6','b) Không tự ý','Không tự ý di chuyển, tháo dỡ hoặc sửa chữa khi chưa có ý kiến chấp thuận, giữ nguyên các ngoại lệ về an toàn, hạn chế thiệt hại và yêu cầu cơ quan có thẩm quyền.'),
 ('giấy tờ hồ sơ cần gì','7','Điều 7.','Toàn bộ Điều 7: tùy vụ việc một hoặc nhiều loại tài liệu; không biến hồ sơ công an, tòa án, mất trộm thành bắt buộc cho vết xước nhỏ.'),
 ('PASS có đồng nghĩa được bồi thường không','10','10.1.','Không. PASS của TRUSTCAM chỉ là tín hiệu kiểm tra tính toàn vẹn/chứng cứ theo chức năng được triển khai, không phải quyết định phạm vi hoặc chi trả. Nguồn bảo hiểm không định nghĩa TRUSTCAM PASS. Chưa có hợp đồng thực tế, nguyên nhân và giám định nên phải từ chối kết luận vết xước được bảo hiểm.')]
queries=[]
for query,key,start,note in fixtures:
    c=next(c for c in chunks if c['id']=='baoviet-969-2026-'+key)
    quote=c['text'][c['text'].index(start):].strip()
    offset=c['text_start']+c['text'].index(quote)
    queries.append(dict(query=query,expected_passages=[dict(chunk_id=c['id'],quote=quote,source_url=c['source_url'],source_file=c['source_file'],text_start=offset,text_end=offset+len(quote))],answer_guardrail=note,must_abstain_coverage=True,integrity_separate_from_coverage=True))
save('queries.json',queries)
print(json.dumps(dict(documents=len(docs),chunks=len(chunks),hashed_files=len(files),queries=len(queries)),ensure_ascii=False))
