#!/usr/bin/env python3
"""Dünyanın oyun verisini karo düzeninde üretir (Faz 7.3): tiles/*.bin, world.json, provinces.geojson, features.json.

Kullanım:  python build_world.py [dünya-id] [--verify-legacy]     (varsayılan: bati-karadeniz)
Önkoşul:   python fetch_dem.py <id> && python fetch_boundaries.py && python fetch_water.py <id> && python fetch_landcover.py <id>
Çıktı:     public/data/world/<id>/                 (commit edilir; oyunun okuduğu dosyalar)

Adımlar: DEM karolarını birleştir → kafese çapalı ızgaraya (`worldlib.grid_for_lattice`) alan ortalamasıyla
örnekle → denizi 0'a kırp → **iki geçişli nicemleme** (1. geçiş: tüm dünyanın en yükseği → dünya geneli tek
`max`; 2. geçiş: uint16) → 512×512 karolara kes → il sınırlarını (komşular otomatik) sadeleştirip oyun X/Z'sine
çevir → su özelliklerini ve arazi örtüsünü aynı ızgaraya işle → manifest.

`--verify-legacy`: yeni dünyanın eski alana düşen kısmını eski bölgeyle (public/data/regions/…) karşılaştırır;
yükseklik farkı ≤ 1 nicem, arazi örtüsü ve il kümesi raporlanır. Eski bölge verisi 7.10'a kadar depodadır.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import date
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pyarrow.parquet as pq
import shapely
import yaml
from shapely.geometry import box, mapping

import build_region
import features as features_lib
import landcover as landcover_lib
import regionlib
import worldlib as wl

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent
DEFAULT_WORLD = "bati-karadeniz"
LEGACY_DIR = REPO / "public" / "data" / "regions" / "zonguldak-bartin-karabuk"
OVERTURE_RELEASE_DEFAULT = "2026-09-23.1"

SIMPLIFY_TOLERANCE_M = build_region.SIMPLIFY_TOLERANCE_M
CLIP_PADDING_M = build_region.CLIP_PADDING_M
#: Eski bölgenin (Faz 2–6) örnekleme penceresi. GDAL'ın `reproject` dönüşümü yaklaşıktır (hata eşiği 0,125 piksel) ve
#: hata hedef pencerenin boyutuna/konumuna bağlıdır: aynı DEM'i farklı pencerede örneklemek, dik yamaçlarda
#: metre mertebesinde (en çok ~5 m, ortalama < 0,05 m) farklı yükseklik verir. Eski alanı eski bölgeyle ≤ 1 nicem
#: tutmak (plan §3.2 "ara dönem") için bu pencere **eskiyle aynı pencerede** yeniden hesaplanıp dünya dizisine
#: yerleştirilir. Yeni genişlemelerde (Faz 8+) bu liste büyür; böylece eski karolar hiçbir zaman değişmez.
PINNED_WINDOWS = (wl.Extent(0, 0, 1588, 1176),)
#: Karo başına dosya boyu bütçesi (bayt): yükseklik 512 KB + örtü 256 KB; sözleşme: her dosya ≤ 1 MB.
MAX_TILE_FILE_BYTES = 1024 * 1024


def load_world_config(world_id: str) -> dict:
    worlds = yaml.safe_load((TOOLS / "world.yaml").read_text(encoding="utf-8"))["worlds"]
    if world_id not in worlds:
        raise SystemExit(f"Bilinmeyen dünya: {world_id!r}. Tanımlılar: {', '.join(worlds)}")
    config = dict(worlds[world_id])
    if config.get("cell_size") != wl.CELL_SIZE_REAL:
        raise SystemExit(f"world.yaml cell_size {config.get('cell_size')}, kafes hücresi {wl.CELL_SIZE_REAL} m olmalı")
    return config


def resample_world_dem(dem_paths: list[Path], grid: wl.LatticeGrid) -> np.ndarray:
    """DEM'i ızgaraya örnekler (metre, float32); `PINNED_WINDOWS` eskiyle aynı pencerede hesaplanıp yerleştirilir."""
    elevation = build_region.resample_dem(dem_paths, grid)
    extent = grid.extent
    for window in PINNED_WINDOWS:
        inside = (
            window.col0 >= extent.col0
            and window.row0 >= extent.row0
            and window.col0 + window.cols <= extent.col0 + extent.cols
            and window.row0 + window.rows <= extent.row0 + extent.rows
        )
        if not inside:
            continue
        pinned = build_region.resample_dem(dem_paths, wl.LatticeGrid(window))
        r0, c0 = window.row0 - extent.row0, window.col0 - extent.col0
        elevation[r0 : r0 + window.rows, c0 : c0 + window.cols] = pinned
    return elevation


def select_neighbors(
    frame: gpd.GeoDataFrame, target_names: list[str], grid: wl.LatticeGrid, min_area_km2: float
) -> list[str]:
    """Izgarayla kesişen (kesişim alanı ≥ `min_area_km2`) hedef olmayan illerin adları (sıralı).

    Çok küçük parçalar (HUD'da gürültü yaratan sliver'lar, plan §8 risk 9) elenir. `frame`: UTM'de il çokgenleri,
    `shapeName` sütunlu.
    """
    grid_box = box(grid.left, grid.bottom, grid.right, grid.top)
    names: list[str] = []
    for row in frame.itertuples():
        if row.shapeName in target_names:
            continue
        if row.geometry.intersection(grid_box).area / 1e6 >= min_area_km2:
            names.append(row.shapeName)
    return sorted(set(names))


def province_features(
    targets: gpd.GeoDataFrame, neighbors: gpd.GeoDataFrame, grid: wl.LatticeGrid
) -> list[dict[str, Any]]:
    """İl sınırları (oyun X/Z): ızgarayla (+pay) kesişen tüm iller; hedef iller inRegion=true."""
    grid_box = box(grid.left, grid.bottom, grid.right, grid.top).buffer(CLIP_PADDING_M)
    out: list[dict[str, Any]] = []
    for in_region, frame in ((True, targets), (False, neighbors)):
        for row in frame.itertuples():
            clipped = row.geometry.simplify(SIMPLIFY_TOLERANCE_M, preserve_topology=True).intersection(grid_box)
            if clipped.is_empty:
                continue
            out.append(
                {
                    "type": "Feature",
                    "properties": {"name": row.shapeName, "iso": row.shapeISO, "inRegion": in_region},
                    "geometry": mapping(build_region.game_geometry(clipped, grid.origin_e, grid.origin_n)),
                }
            )
    return out


def build(
    world_id: str,
    config: dict,
    dem_paths: list[Path],
    boundaries_path: Path,
    out_dir: Path,
    water_path: Path,
    landcover_path: Path,
    built: str | None = None,
) -> tuple[dict, dict]:
    """Dünya dosyalarını `out_dir`'e yazar. Dönüş: (manifest, ek bilgi: elevation/cover dizileri, grid)."""
    boundaries = gpd.read_file(boundaries_path).to_crs(wl.CRS)
    targets = build_region.select_provinces(boundaries, config["provinces"])
    minx, miny, maxx, maxy = targets.total_bounds
    grid = wl.grid_for_lattice(minx, miny, maxx, maxy, config["margin_m"])
    build_region.check_grid_inside_bbox(grid, config["bbox"])

    if config.get("neighbors", "auto") == "auto":
        neighbor_names = select_neighbors(
            boundaries, list(config["provinces"]), grid, float(config.get("neighbor_min_area_km2", 1))
        )
    else:
        neighbor_names = list(config["neighbors"])
    neighbors = build_region.select_provinces(boundaries, neighbor_names)
    print(f"  hedef iller: {', '.join(config['provinces'])}; komşular: {', '.join(neighbor_names)}")

    # 1. geçiş: dünya geneli yükseklik üst sınırı; 2. geçiş: bununla uint16'ya nicemle.
    elevation = resample_world_dem(dem_paths, grid)
    elevation_max = wl.world_elevation_max(float(np.clip(elevation, 0, None).max()))
    quantized = wl.quantize_with_range(elevation, 0.0, elevation_max)
    del elevation

    collection = json.loads(water_path.read_text(encoding="utf-8"))
    water = features_lib.build_features(collection, grid)
    release = collection.get("overture_release") or OVERTURE_RELEASE_DEFAULT

    table = pq.read_table(landcover_path)
    classes, skipped = landcover_lib.rasterize_landcover(
        table.column("subtype").to_pylist(), shapely.from_wkb(table.column("geometry").to_pylist()), grid
    )
    if skipped:
        print(f"  uyarı: arazi örtüsünde tanınmayan türler atlandı: {dict(skipped)}")

    height_tiles = wl.slice_into_tiles(quantized, grid.extent, np.uint16)
    cover_tiles = wl.slice_into_tiles(classes, grid.extent, np.uint8)

    if out_dir.exists():
        shutil.rmtree(out_dir)  # kalıntı karo kalmasın (yalnızca bu betiğin çıktı klasörü)
    (out_dir / "tiles").mkdir(parents=True)

    blobs: dict[tuple[int, int], bytes] = {}
    for (tx, ty), tile in height_tiles.items():
        height_blob = wl.height_tile_bytes(tile)
        cover_blob = wl.cover_tile_bytes(cover_tiles[(tx, ty)])
        if max(len(height_blob), len(cover_blob)) > MAX_TILE_FILE_BYTES:
            raise SystemExit(f"karo ({tx}, {ty}) 1 MB'ı aşıyor")
        blobs[(tx, ty)] = height_blob
        (out_dir / wl.tile_name(tx, ty, "height")).write_bytes(height_blob)
        (out_dir / wl.tile_name(tx, ty, "cover")).write_bytes(cover_blob)

    manifest = wl.build_manifest(
        world_id=world_id,
        name=config["name"],
        extent=grid.extent,
        elevation_max=elevation_max,
        tile_blobs=blobs,
        layers=["water"],
        landcover_classes=landcover_lib.CLASSES,
        sources=[
            "Copernicus GLO-30 DEM",
            "geoBoundaries",
            "Overture Maps (OpenStreetMap)",
            "ESA WorldCover 2021 (Overture Maps)",
        ],
        overture_release=release,
        built=built or date.today().isoformat(),
    )
    wl.validate_manifest(manifest)

    (out_dir / "world.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (out_dir / "provinces.geojson").write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": province_features(targets, neighbors, grid)},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    (out_dir / "features.json").write_text(
        json.dumps(water, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    return manifest, {"heights": quantized, "cover": classes, "grid": grid}


def verify_legacy(manifest: dict, heights: np.ndarray, cover: np.ndarray, legacy_dir: Path = LEGACY_DIR) -> bool:
    """Yeni dünyanın eski alanı ≈ eski bölge mi? Sonucu yazdırır; yükseklik ≤ 1 nicem ise True."""
    legacy_meta = json.loads((legacy_dir / "meta.json").read_text(encoding="utf-8"))
    legacy_extent = wl.Extent(0, 0, legacy_meta["gridWidth"], legacy_meta["gridHeight"])
    legacy_h = np.fromfile(legacy_dir / "heightmap.bin", dtype="<u2").reshape(legacy_extent.rows, legacy_extent.cols)
    legacy_c = np.fromfile(legacy_dir / "landcover.bin", dtype=np.uint8).reshape(legacy_extent.rows, legacy_extent.cols)
    extent = wl.Extent.from_dict(manifest["extent"])
    result = wl.compare_with_legacy(
        heights, extent, manifest["elevation"]["max"], legacy_h, float(legacy_meta["elevationMax"]), legacy_extent
    )
    c0, r0 = legacy_extent.col0 - extent.col0, legacy_extent.row0 - extent.row0
    window = cover[r0 : r0 + legacy_extent.rows, c0 : c0 + legacy_extent.cols]
    cover_diff = int((window != legacy_c).sum())
    print(
        f"  eski alan karşılaştırması: yükseklik en çok {result['max_diff_m'] * 100:.2f} cm fark "
        f"(1 nicem = {result['step_m'] * 100:.2f} cm; farklı hücre {result['differing_cells']}), "
        f"arazi örtüsü farklı hücre {cover_diff} / {window.size}"
    )
    return bool(result["within_one_step"])


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("world_id", nargs="?", default=DEFAULT_WORLD)
    parser.add_argument("--verify-legacy", action="store_true", help="eski alanı eski bölgeyle karşılaştır")
    args = parser.parse_args(argv)

    config = load_world_config(args.world_id)
    dem_paths = [TOOLS / "raw" / "dem" / f"{name}.tif" for name in regionlib.tiles_for_bbox(*config["bbox"])]
    boundaries_path = TOOLS / "raw" / "boundaries" / "geoBoundaries-TUR-ADM1.geojson"
    water_path = TOOLS / "raw" / "water" / f"{args.world_id}.geojson"
    landcover_path = TOOLS / "raw" / "landcover" / f"{args.world_id}.parquet"
    missing = [str(p) for p in [*dem_paths, boundaries_path, water_path, landcover_path] if not p.exists()]
    if missing:
        raise SystemExit(
            "Eksik ham veri (önce fetch_dem.py, fetch_boundaries.py, fetch_water.py ve fetch_landcover.py çalıştır):\n  "
            + "\n  ".join(missing)
        )

    out_dir = REPO / "public" / "data" / "world" / args.world_id
    print(f"{args.world_id}: karo düzeninde üretiliyor")
    manifest, extra = build(args.world_id, config, dem_paths, boundaries_path, out_dir, water_path, landcover_path)

    extent = manifest["extent"]
    total = sum(p.stat().st_size for p in out_dir.rglob("*") if p.is_file())
    print(
        f"  extent {extent['cols']}×{extent['rows']} (col0 {extent['col0']}, row0 {extent['row0']}), "
        f"{len(manifest['tiles'])} karo, yükseklik 0..{manifest['elevation']['max']:.0f} m, toplam {total / 1e6:.1f} MB"
    )
    print("  arazi örtüsü: " + ", ".join(f"{k}={v}" for k, v in landcover_lib.class_histogram(extra["cover"]).items()))
    print(f"  → {out_dir}")

    if args.verify_legacy and not verify_legacy(manifest, extra["heights"], extra["cover"]):
        print("HATA: eski alan eski bölgeden 1 nicemden fazla sapıyor", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
