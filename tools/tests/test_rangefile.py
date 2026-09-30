import io

import pytest

from rangefile import HttpRangeFile
from rangeserver import serve

DATA = bytes(range(256)) * 4096  # 1 MiB


@pytest.fixture()
def server():
    httpd, base, handler = serve({"/f.bin": DATA})
    yield base, handler
    httpd.shutdown()


def test_reads_arbitrary_ranges_and_seeks(server):
    base, _ = server
    f = HttpRangeFile(base + "/f.bin", block_size=4096)
    assert f.size == len(DATA)
    f.seek(1000)
    assert f.read(50) == DATA[1000:1050]
    f.seek(-10, io.SEEK_END)
    assert f.read(100) == DATA[-10:]
    f.seek(5000)
    f.seek(10, io.SEEK_CUR)
    assert f.tell() == 5010
    assert f.read(3) == DATA[5010:5013]
    assert f.read(10**9) == DATA[5013:]
    assert f.read(10) == b""


def test_only_needed_blocks_are_downloaded(server):
    base, _ = server
    f = HttpRangeFile(base + "/f.bin", block_size=4096)
    f.seek(100_000)
    f.read(10)
    assert f.bytes_downloaded == 4096  # yalnızca ilgili blok
    assert f.requests == 1
    f.seek(100_000)
    f.read(10)  # önbellekten
    assert f.requests == 1


def test_adjacent_missing_blocks_use_one_request(server):
    base, handler = server
    f = HttpRangeFile(base + "/f.bin", block_size=4096)
    f.seek(0)
    assert f.read(4096 * 5) == DATA[: 4096 * 5]
    assert f.requests == 1  # 5 bitişik blok tek Range isteği
    assert len(handler.log) == 1


def test_last_partial_block(server):
    base, _ = server
    f = HttpRangeFile(base + "/f.bin", block_size=300_000)  # 1 MiB / 300 KB → son blok kısmi
    f.seek(len(DATA) - 100)
    assert f.read(100) == DATA[-100:]


def test_transient_failures_are_retried():
    httpd, base, handler = serve({"/f.bin": DATA}, fail_first=2)
    try:
        f = HttpRangeFile(base + "/f.bin", block_size=4096, sleep=lambda _: None)
        f.seek(10)
        assert f.read(20) == DATA[10:30]  # ilk iki GET koptu, üçüncü başardı
    finally:
        httpd.shutdown()


def test_gives_up_after_retries():
    httpd, base, _ = serve({"/f.bin": DATA}, fail_first=10_000)
    try:
        f = HttpRangeFile(base + "/f.bin", retries=3, sleep=lambda _: None)
        f.seek(0)
        with pytest.raises(OSError, match="denemede okunamadı"):
            f.read(10)
    finally:
        httpd.shutdown()


def test_missing_file_raises():
    httpd, base, _ = serve({})
    try:
        with pytest.raises(OSError):
            HttpRangeFile(base + "/yok.bin", retries=2, sleep=lambda _: None)
    finally:
        httpd.shutdown()
