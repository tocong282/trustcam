#!/usr/bin/env python3
"""Offline stdlib integrity check. Run: python corpus/legal-demo/verify.py"""
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent


def file_bytes(name):
    path = (ROOT / name).resolve()
    assert path.is_relative_to(ROOT), f"Path escapes corpus: {name}"
    return path.read_bytes()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    manifest = json.loads(file_bytes("manifest.json"))
    docs = {d["id"]: d for d in manifest["documents"]}
    assert len(docs) == len(manifest["documents"]) == 3
    chunks = [json.loads(line) for line in file_bytes("chunks.jsonl").decode().splitlines()]
    assert chunks and len({c["id"] for c in chunks}) == len(chunks), "Empty/duplicate chunks"
    texts = {}
    for doc in docs.values():
        assert doc["jurisdiction"] == "VN" and doc["language"] == "vi"
        assert doc["demo_only"] is True and doc["current_validity_verified"] is False
        assert doc["version"] == "original_published"
        assert doc["legal_status"] == "original text; amendment applicability not fully verified"
        assert doc["document_number"] and doc["title"]
        for field in ("issued_date", "effective_date"):
            datetime.strptime(doc[field], "%Y-%m-%d")
        for source in doc["sources"]:
            for field in ("url", "resolved_url"):
                parsed = urlsplit(source[field])
                assert parsed.scheme == "https" and parsed.hostname in {"vanban.chinhphu.vn", "datafiles.chinhphu.vn", "congbao.chinhphu.vn", "congbaocdn.chinhphu.vn", "rfd.gov.vn"}
            fetched = datetime.fromisoformat(source["fetched_at"].replace("Z", "+00:00"))
            assert fetched.utcoffset().total_seconds() == 0 and fetched <= datetime.now(timezone.utc)
            raw = file_bytes(source["file"])
            assert raw and sha(raw) == source["sha256"], source["file"]
            if source["media_type"] == "application/pdf":
                assert raw.startswith(b"%PDF-")
        text = file_bytes(doc["text_file"])
        assert sha(text) == doc["text_sha256"], doc["text_file"]
        texts[doc["id"]] = text.decode("utf-8")
        assert len(texts[doc["id"]]) > 10000, "Missing/truncated law body"
        assert doc["document_number"] in texts[doc["id"]]
        for excerpt in doc["known_source_excerpts"]:
            assert excerpt in texts[doc["id"]], (doc["id"], excerpt)
        selected = [c for c in chunks if c["document_id"] == doc["id"]]
        assert sorted(c["article"] for c in selected) == sorted(doc["selected_articles"])
        for c in selected:
            assert c["source_file"] == doc["text_file"]
            assert c["source_url"] == doc["body_source_url"]
            assert c["legal_status"] == doc["legal_status"]
            assert c["demo_only"] is True and c["current_validity_verified"] is False
            assert len(c["text"].strip()) > 50 and c["text"] in texts[doc["id"]]
            assert sha(c["text"].encode()) == c["sha256"]
            assert c["text"].splitlines()[0] == c["label"]
            assert re.match(rf"^Điều {c['article']}\.", c["label"])
            assert not re.search(r"(?m)^Điều \d+\.", c["text"][len(c["label"]):])
            start, end = c["text_start"], c["text_end"]
            assert texts[doc["id"]][start:end] == c["text"]
            following = texts[doc["id"]][end:].lstrip()
            # Selected articles must end at structural boundary, never arbitrary character cap.
            assert re.match(r"(?:Điều \d+\.|Chương\b|CHƯƠNG\b|Mục\b|PHẦN\b|Phần\b)", following), (c["id"], following[:80])
    assert set(c["document_id"] for c in chunks) == set(docs)
    print(f"PASS: {len(docs)} documents; {len(chunks)} complete article chunks; hashes, provenance, metadata, excerpts, IDs and boundaries verified")


if __name__ == "__main__":
    main()
