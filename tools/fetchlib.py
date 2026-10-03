"""İndirme yardımcıları (yalnızca standart kütüphane)."""

from __future__ import annotations

import json
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


# -- ham veri kapsam kaydı (Faz 12.0b: `--groups` ile kısmi indirme) -------------------------------------------
# Her ham dosyanın yanına, hangi sınır kutusu ve Overture sürümüyle indirildiğini yazan `<dosya>.cover.json` konur.
# Aynı ya da daha küçük kutu istenirse indirme atlanır; daha büyük/farklı kutu istenirse eski kutuyla birleşimi
# (zarf) indirilir, böylece ham veri yalnızca büyür. Kayıt yoksa (eski ham dosya) kapsam bilinmez: yeniden indirilir.

BBox4 = tuple[float, float, float, float]  # boylam_min, enlem_min, boylam_max, enlem_max


def cover_record_path(dest: Path) -> Path:
    return dest.with_name(dest.name + ".cover.json")


def read_cover(dest: Path, release: str) -> BBox4 | None:
    """`dest` için kayıtlı kapsam kutusu; dosya, kayıt ya da sürüm uymuyorsa None."""
    record = cover_record_path(dest)
    if not dest.exists() or not record.exists():
        return None
    try:
        data = json.loads(record.read_text(encoding="utf-8"))
        if data.get("release") != release:
            return None
        lon0, lat0, lon1, lat1 = (float(v) for v in data["bbox"])
    except (ValueError, KeyError, TypeError):
        return None
    return lon0, lat0, lon1, lat1


def covers(have: BBox4 | None, want: BBox4) -> bool:
    """`have` kutusu `want`'ı tamamen içeriyor mu?"""
    return have is not None and have[0] <= want[0] and have[1] <= want[1] and have[2] >= want[2] and have[3] >= want[3]


def union_bbox(a: BBox4 | None, b: BBox4) -> BBox4:
    if a is None:
        return b
    return min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])


def plan_fetch(dest: Path, bbox: BBox4, release: str) -> BBox4 | None:
    """İndirilecek kutu: kapsam zaten yeterliyse None (atla), değilse eski kapsamla birleşimi."""
    have = read_cover(dest, release)
    if covers(have, bbox):
        return None
    return union_bbox(have, bbox)


def record_cover(dest: Path, bbox: BBox4, release: str) -> None:
    cover_record_path(dest).write_text(
        json.dumps({"release": release, "bbox": [round(v, 6) for v in bbox]}) + "\n", encoding="utf-8"
    )
