"""İndirme yardımcıları (yalnızca standart kütüphane)."""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from pathlib import Path

CHUNK = 1024 * 1024
USER_AGENT = "anadolu-hayati-data-pipeline/1.0"


def remote_size(url: str, timeout: float = 30) -> int | None:
    """HEAD ile uzak dosya boyutu; alınamazsa None."""
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            length = response.headers.get("Content-Length")
            return int(length) if length is not None else None
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None


def download(
    url: str,
    dest: Path,
    expected_size: int | None = None,
    retries: int = 3,
    timeout: float = 60,
) -> bool:
    """`url`'yi `dest`'e indirir. Dosya zaten varsa ve boyutu beklenene uyuyorsa atlar.

    Yarım kalmış indirme asla `dest` adıyla bırakılmaz: `.part` dosyasına yazılır, boyut
    doğrulandıktan sonra yeniden adlandırılır. Dönüş: gerçekten indirildiyse True, atlandıysa False.
    """
    if dest.exists() and expected_size is not None and dest.stat().st_size == expected_size:
        return False

    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=timeout) as response, part.open("wb") as out:
                while chunk := response.read(CHUNK):
                    out.write(chunk)
            size = part.stat().st_size
            if expected_size is not None and size != expected_size:
                raise OSError(f"boyut uyuşmuyor: {size} != {expected_size}")
            part.replace(dest)
            return True
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
            part.unlink(missing_ok=True)
            if attempt < retries:
                time.sleep(2**attempt)  # 2 s, 4 s, ...

    raise RuntimeError(f"indirilemedi ({retries} deneme): {url}: {last_error}")
