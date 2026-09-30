#!/usr/bin/env python3
"""geoBoundaries (gbOpen) Türkiye ADM1 il sınırlarını indirir.

Kullanım:  python fetch_boundaries.py
Çıktı:     tools/raw/boundaries/geoBoundaries-TUR-ADM1.geojson   (commit edilmez)

Not: geoBoundaries dosyaları Git LFS ile saklanır. `raw.githubusercontent.com` gerçek dosya
yerine ~130 baytlık bir LFS işaretçisi döndürür; gerçek içerik `media.githubusercontent.com`
üzerindendir. Betik işaretçiyi tanır ve doğru adresi kullanır.

Lisans/atıf: geoBoundaries — CC BY 4.0. Runfola, D. et al. (2020) geoBoundaries: A global
database of political administrative boundaries. PLoS ONE 15(4): e0231866.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

import fetchlib
import regionlib

TOOLS = Path(__file__).resolve().parent
DEST = TOOLS / "raw" / "boundaries" / "geoBoundaries-TUR-ADM1.geojson"
PATH = "wmgeolab/geoBoundaries/main/releaseData/gbOpen/TUR/ADM1/geoBoundaries-TUR-ADM1.geojson"
URLS = [
    f"https://media.githubusercontent.com/media/{PATH}",  # LFS gerçek içerik
    f"https://raw.githubusercontent.com/{PATH}",  # LFS değilse doğrudan içerik
]


def is_valid_geojson(path: Path) -> bool:
    """Dosya, LFS işaretçisi olmayan ve özellik içeren geçerli bir GeoJSON mu?"""
    if not path.exists():
        return False
    data = path.read_bytes()
    if regionlib.is_lfs_pointer(data):
        return False
    try:
        return len(json.loads(data)["features"]) > 0
    except (ValueError, KeyError, TypeError):
        return False


def main() -> int:
    if is_valid_geojson(DEST):
        print(f"mevcut   {DEST}")
        return 0

    for url in URLS:
        with tempfile.TemporaryDirectory() as tmp:
            candidate = Path(tmp) / "boundaries.geojson"
            try:
                fetchlib.download(url, candidate)
            except RuntimeError as error:
                print(f"  atlandı: {error}")
                continue
            if not is_valid_geojson(candidate):
                print(f"  geçersiz içerik (LFS işaretçisi olabilir): {url}")
                continue
            DEST.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(candidate, DEST)
            print(f"indirildi {DEST}  ({DEST.stat().st_size / 1e6:.1f} MB)  ← {url}")
            return 0

    raise SystemExit("İl sınırları indirilemedi.")


if __name__ == "__main__":
    sys.exit(main())
