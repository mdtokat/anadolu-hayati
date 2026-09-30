import functools
import http.server
import threading
from pathlib import Path

import pytest

import fetchlib
import fetch_boundaries


@pytest.fixture()
def server(tmp_path: Path):
    """Geçici klasörü yerel HTTP sunucusuyla sunar."""
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(tmp_path))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield tmp_path, f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def test_download_writes_file_and_verifies_size(server, tmp_path_factory):
    root, base = server
    (root / "a.bin").write_bytes(b"x" * 5000)
    dest = tmp_path_factory.mktemp("out") / "sub" / "a.bin"
    size = fetchlib.remote_size(f"{base}/a.bin")
    assert size == 5000
    assert fetchlib.download(f"{base}/a.bin", dest, expected_size=size) is True
    assert dest.read_bytes() == b"x" * 5000
    assert not dest.with_suffix(".bin.part").exists()


def test_download_skips_when_file_already_complete(server, tmp_path_factory):
    root, base = server
    (root / "a.bin").write_bytes(b"y" * 100)
    dest = tmp_path_factory.mktemp("out") / "a.bin"
    dest.write_bytes(b"y" * 100)
    assert fetchlib.download(f"{base}/a.bin", dest, expected_size=100) is False


def test_download_redownloads_truncated_file(server, tmp_path_factory):
    root, base = server
    (root / "a.bin").write_bytes(b"z" * 100)
    dest = tmp_path_factory.mktemp("out") / "a.bin"
    dest.write_bytes(b"z" * 10)  # yarım kalmış
    assert fetchlib.download(f"{base}/a.bin", dest, expected_size=100) is True
    assert dest.stat().st_size == 100


def test_download_raises_after_retries_and_leaves_no_partial(server, tmp_path_factory, monkeypatch):
    _, base = server
    monkeypatch.setattr(fetchlib.time, "sleep", lambda _: None)
    dest = tmp_path_factory.mktemp("out") / "missing.bin"
    with pytest.raises(RuntimeError):
        fetchlib.download(f"{base}/yok.bin", dest, retries=2)
    assert not dest.exists() and not dest.with_suffix(".bin.part").exists()


def test_remote_size_returns_none_for_missing(server):
    _, base = server
    assert fetchlib.remote_size(f"{base}/yok.bin") is None


def test_boundaries_validation_rejects_lfs_pointer_and_accepts_geojson(tmp_path: Path):
    pointer = tmp_path / "p.geojson"
    pointer.write_bytes(b"version https://git-lfs.github.com/spec/v1\noid sha256:x\nsize 1\n")
    good = tmp_path / "g.geojson"
    good.write_text('{"type":"FeatureCollection","features":[{"type":"Feature"}]}')
    empty = tmp_path / "e.geojson"
    empty.write_text('{"type":"FeatureCollection","features":[]}')
    assert not fetch_boundaries.is_valid_geojson(pointer)
    assert fetch_boundaries.is_valid_geojson(good)
    assert not fetch_boundaries.is_valid_geojson(empty)
    assert not fetch_boundaries.is_valid_geojson(tmp_path / "yok.geojson")
