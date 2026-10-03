#!/usr/bin/env python3
"""Bir bölge için Copernicus GLO-30 DEM karolarını indirir (AWS Open Data, anonim).

Kullanım:  python fetch_dem.py [dünya-id] [--groups cekirdek,bati]   (varsayılan: bati-karadeniz, tüm gruplar)
Önkoşul:   python fetch_boundaries.py   (sınır kutusu hedef illerden türetilir; bkz. worldconfig.py)
Çıktı:     tools/raw/dem/<karo>.tif             (tools/raw/ .gitignore'dadır, commit edilmez)

Karolar zaten indirilmişse atlanır (boyut eşleşirse).

Lisans/atıf: Copernicus DEM GLO-30 — © DLR e.V. 2010–2014 ve © Airbus Defence and Space GmbH
2014–2018, Avrupa Birliği ve ESA adına COPERNICUS kapsamında sağlanmıştır.
"""

from __future__ import annotations

import sys
from pathlib import Path

import fetchlib
import regionlib
import worldconfig

TOOLS = Path(__file__).resolve().parent
RAW_DEM = TOOLS / "raw" / "dem"
DEFAULT_WORLD = "bati-karadeniz"


def load_world(world_id: str, groups: list[str] | None = None) -> dict:
    """Dünya tanımını (world.yaml + grup dosyaları) döndürür; türetilmiş `bbox` içerir (`worldconfig.load_world`)."""
    return worldconfig.load_world(world_id, groups)


def main(argv: list[str]) -> int:
    args = worldconfig.fetch_arguments(__doc__, argv[1:], DEFAULT_WORLD)
    world_id = args.world_id
    world = load_world(world_id, worldconfig.parse_groups_arg(args.groups))
    tiles = regionlib.tiles_for_bbox(*world["bbox"])
    print(f"{world_id}: {len(tiles)} karo gerekli (bbox {world['bbox']})")

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
