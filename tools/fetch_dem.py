#!/usr/bin/env python3
"""Bir bölge için Copernicus GLO-30 DEM karolarını indirir (AWS Open Data, anonim).

Kullanım:  python fetch_dem.py [dünya-id]      (varsayılan: bati-karadeniz)
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
DEFAULT_WORLD = "bati-karadeniz"


def load_world(world_id: str) -> dict:
    """Dünya tanımını (world.yaml) döndürür; `bbox` içerir."""
    worlds = yaml.safe_load((TOOLS / "world.yaml").read_text(encoding="utf-8"))["worlds"]
    if world_id not in worlds:
        raise SystemExit(f"Bilinmeyen dünya: {world_id!r}. Tanımlılar: {', '.join(worlds)}")
    return worlds[world_id]


def main(argv: list[str]) -> int:
    world_id = argv[1] if len(argv) > 1 else DEFAULT_WORLD
    world = load_world(world_id)
    tiles = regionlib.tiles_for_bbox(*world["bbox"])
    print(f"{world_id}: {len(tiles)} karo gerekli")

    for name in tiles:
        url = regionlib.tile_url(name)
        dest = RAW_DEM / f"{name}.tif"
        size = fetchlib.remote_size(url)
        if size is None and regionlib.may_be_open_sea(name):
            # Copernicus açık deniz karolarını yayımlamaz: bu karo denizdir (yükseklik 0). İşaret dosyası bırakılır;
            # build_world.py bunu eksik veri saymaz.
            (RAW_DEM / f"{name}.sea").parent.mkdir(parents=True, exist_ok=True)
            (RAW_DEM / f"{name}.sea").write_text("deniz karosu (Copernicus'ta yok)\n", encoding="utf-8")
            print(f"  deniz     {name}  (Copernicus'ta yok; deniz sayılır)")
            continue
        if size is None:
            raise SystemExit(f"Karo bulunamadı ya da erişilemedi: {url}")
        downloaded = fetchlib.download(url, dest, expected_size=size)
        print(f"  {'indirildi' if downloaded else 'mevcut  '} {name}  ({size / 1e6:.1f} MB)")

    print(f"Tamam → {RAW_DEM}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
