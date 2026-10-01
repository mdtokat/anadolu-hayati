#!/usr/bin/env python3
"""Bir bölge için Copernicus GLO-30 DEM karolarını indirir (AWS Open Data, anonim).

Kullanım:  python fetch_dem.py [bölge-id]      (varsayılan: zonguldak-bartin-karabuk)
Çıktı:     tools/raw/dem/<karo>.tif             (tools/raw/ .gitignore'dadır, commit edilmez)

Lisans/atıf: Copernicus DEM GLO-30 — © DLR e.V. 2010–2014 ve © Airbus Defence and Space GmbH
2014–2018, Avrupa Birliği ve ESA adına COPERNICUS kapsamında sağlanmıştır.
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

import fetchlib
import regionlib

TOOLS = Path(__file__).resolve().parent
RAW_DEM = TOOLS / "raw" / "dem"
DEFAULT_REGION = "zonguldak-bartin-karabuk"


def load_region(region_id: str) -> dict:
    """Bölge (regions.yaml) ya da dünya (world.yaml) tanımını döndürür; ikisi de `bbox` içerir."""
    regions = yaml.safe_load((TOOLS / "regions.yaml").read_text(encoding="utf-8"))["regions"]
    worlds = yaml.safe_load((TOOLS / "world.yaml").read_text(encoding="utf-8"))["worlds"]
    if region_id in worlds:
        return worlds[region_id]
    if region_id in regions:
        return regions[region_id]
    raise SystemExit(f"Bilinmeyen bölge/dünya: {region_id!r}. Tanımlılar: {', '.join([*worlds, *regions])}")


def main(argv: list[str]) -> int:
    region_id = argv[1] if len(argv) > 1 else DEFAULT_REGION
    region = load_region(region_id)
    tiles = regionlib.tiles_for_bbox(*region["bbox"])
    print(f"{region_id}: {len(tiles)} karo gerekli")

    for name in tiles:
        url = regionlib.tile_url(name)
        dest = RAW_DEM / f"{name}.tif"
        size = fetchlib.remote_size(url)
        if size is None:
            raise SystemExit(f"Karo bulunamadı ya da erişilemedi: {url}")
        downloaded = fetchlib.download(url, dest, expected_size=size)
        print(f"  {'indirildi' if downloaded else 'mevcut  '} {name}  ({size / 1e6:.1f} MB)")

    print(f"Tamam → {RAW_DEM}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
