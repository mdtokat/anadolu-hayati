"""Eski bölgeyi (public/data/regions/zonguldak-bartin-karabuk) karo düzenine çevirir (Faz 7.2).

    python tile_legacy.py [--out ../public/data/world/bati-karadeniz]

Ağ ve ağır bağımlılık gerekmez (yalnızca numpy). Çıktı **bit-eşdeğerdir**: extent = {0, 0, 1588, 1176}
(eski ızgara = kafesin (0, 0) köşesi), yükseklik aralığı eskisiyle aynı (`elevationMax` = 1996), değerler
yeniden nicemlenmeden karolara kesilir. İl sınırı ve özellikler (features.json) aynen kopyalanır. Eski veri
silinmez (7.10'da kalkar). Dünya-geneli yeni alan 7.3/7.4 hattıyla (`build_world.py`) üretilir.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np

import worldlib as wl

TOOLS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOLS_DIR.parent
LEGACY_DIR = REPO_ROOT / "public" / "data" / "regions" / "zonguldak-bartin-karabuk"
DEFAULT_OUT = REPO_ROOT / "public" / "data" / "world" / "bati-karadeniz"

WORLD_ID = "bati-karadeniz"
WORLD_NAME = "Batı Karadeniz"


def tile_legacy(legacy_dir: Path, out_dir: Path) -> dict:
    """`legacy_dir` içindeki eski bölgeyi `out_dir`'e karo düzeniyle yazar; manifesti döndürür."""
    meta = json.loads((legacy_dir / "meta.json").read_text(encoding="utf-8"))
    width, height = int(meta["gridWidth"]), int(meta["gridHeight"])
    if meta["horizontalScale"] != wl.HORIZONTAL_SCALE or meta["cellSizeReal"] != wl.CELL_SIZE_REAL:
        raise wl.WorldDataError("eski bölgenin ölçeği/hücre boyu kafesle uyuşmuyor")
    if list(meta["originUtm"]) != list(wl.ORIGIN_UTM):
        raise wl.WorldDataError("eski bölgenin orijini WORLD orijiniyle uyuşmuyor")
    if (width, height) != (1588, 1176):
        raise wl.WorldDataError(f"beklenmeyen eski ızgara boyutu {width}×{height}")
    if meta.get("elevationMin") != 0:
        raise wl.WorldDataError("eski bölgenin elevationMin değeri 0 olmalı")

    extent = wl.Extent(0, 0, width, height)
    heights = np.fromfile(legacy_dir / "heightmap.bin", dtype="<u2")
    if heights.size != width * height:
        raise wl.WorldDataError("heightmap.bin boyutu ızgarayla uyuşmuyor")
    cover = np.fromfile(legacy_dir / "landcover.bin", dtype=np.uint8)
    if cover.size != width * height:
        raise wl.WorldDataError("landcover.bin boyutu ızgarayla uyuşmuyor")

    height_tiles = wl.slice_into_tiles(heights.reshape(height, width), extent, np.uint16)
    cover_tiles = wl.slice_into_tiles(cover.reshape(height, width), extent, np.uint8)

    tiles_dir = out_dir / "tiles"
    if out_dir.exists():
        shutil.rmtree(out_dir)  # kalıntı karo kalmasın (yalnızca bu betiğin çıktı klasörü)
    tiles_dir.mkdir(parents=True)

    blobs: dict[tuple[int, int], bytes] = {}
    for (tx, ty), tile in height_tiles.items():
        blob = wl.height_tile_bytes(tile)
        blobs[(tx, ty)] = blob
        (out_dir / wl.tile_name(tx, ty, "height")).write_bytes(blob)
        (out_dir / wl.tile_name(tx, ty, "cover")).write_bytes(wl.cover_tile_bytes(cover_tiles[(tx, ty)]))

    manifest = wl.build_manifest(
        world_id=WORLD_ID,
        name=WORLD_NAME,
        extent=extent,
        elevation_max=float(meta["elevationMax"]),
        elevation_min=float(meta["elevationMin"]),
        tile_blobs=blobs,
        layers=list(meta.get("features", [])),
        landcover_classes=list(meta["landcover"]["classes"]),
        sources=list(meta["sources"]),
        overture_release=meta["overtureRelease"],
        built=meta["built"],  # eski verinin tarihi: çıktı yeniden üretilebilir (aynı girdi → aynı bayt)
    )
    wl.validate_manifest(manifest)

    shutil.copyfile(legacy_dir / "provinces.geojson", out_dir / "provinces.geojson")
    if manifest["features"]["layers"]:
        shutil.copyfile(legacy_dir / "features.json", out_dir / "features.json")
    (out_dir / "world.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return manifest


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--legacy", type=Path, default=LEGACY_DIR, help="eski bölge klasörü")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="çıktı dünya klasörü")
    args = parser.parse_args(argv)
    manifest = tile_legacy(args.legacy, args.out)
    total = sum(p.stat().st_size for p in args.out.rglob("*") if p.is_file())
    print(f"{len(manifest['tiles'])} karo yazıldı → {args.out} ({total / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
