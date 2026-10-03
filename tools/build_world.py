#!/usr/bin/env python3
"""Dünyanın oyun verisini karo düzeninde üretir (Faz 7.3): tiles/*.bin, world.json, provinces.geojson, features.json.

Kullanım:  python build_world.py [dünya-id]     (varsayılan: bati-karadeniz)
Önkoşul:   python fetch_dem.py <id> && python fetch_boundaries.py && python fetch_water.py <id> && python fetch_landcover.py <id>
Çıktı:     public/data/world/<id>/                 (commit edilir; oyunun okuduğu dosyalar)

Adımlar: DEM karolarını birleştir → kafese çapalı ızgaraya (`worldlib.grid_for_lattice`) alan ortalamasıyla
örnekle → denizi 0'a kırp → **iki geçişli nicemleme** (1. geçiş: tüm dünyanın en yükseği → dünya geneli tek
`max`; 2. geçiş: uint16) → 512×512 karolara kes → il sınırlarını (komşular otomatik) sadeleştirip oyun X/Z'sine
çevir → su özelliklerini ve arazi örtüsünü aynı ızgaraya işle → manifest.
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
import rasterio
import shapely
import yaml
from pyproj import Transformer
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from shapely.geometry import box, mapping

import features as features_lib
import landcover as landcover_lib
import regionlib
import worldlib as wl

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent
DEFAULT_WORLD = "bati-karadeniz"
OVERTURE_RELEASE_DEFAULT = "2026-09-23.1"

# Sınır sadeleştirme toleransı (gerçek metre) ve komşu illerin kırpıldığı kutu payı.
SIMPLIFY_TOLERANCE_M = 30.0
CLIP_PADDING_M = 5000.0
GAME_COORD_DECIMALS = 2
#: Eski bölgenin (Faz 2–6) örnekleme penceresi. GDAL'ın `reproject` dönüşümü yaklaşıktır (hata eşiği 0,125 piksel) ve
#: hata hedef pencerenin boyutuna/konumuna bağlıdır: aynı DEM'i farklı pencerede örneklemek, dik yamaçlarda
#: metre mertebesinde (en çok ~5 m, ortalama < 0,05 m) farklı yükseklik verir. Eski alanı eski bölgeyle ≤ 1 nicem
#: tutmak (plan §3.2 "ara dönem") için bu pencere **eskiyle aynı pencerede** yeniden hesaplanıp dünya dizisine
#: yerleştirilir. Yeni genişlemelerde (Faz 8+) bu liste büyür; böylece eski karolar hiçbir zaman değişmez.
#: Her pencere (kafes dikdörtgeni, DEM karolarını seçen eski bbox) çiftidir: genişlemede DEM mozaiği büyüse de eski alan
#: eski mozaikte ve eski pencerede örneklenir. İkinci pencere Faz 7 dünyasının (Batı Karadeniz, 5 il) tamamıdır:
#: Kastamonu–Çankırı genişlemesinde eski karolar (≤ 1 nicem yeniden nicemleme dışında) değişmesin. Üçüncü pencere
#: Kastamonu–Çankırı dünyasının (7 il) tamamıdır: Sinop–Sakarya genişlemesinde bu alan da değişmesin.
PINNED_WINDOWS = (
    (wl.Extent(0, 0, 1588, 1176), (30.30, 40.00, 33.30, 41.95)),
    (wl.Extent(-640, 0, 2228, 1962), (30.30, 40.00, 33.30, 41.95)),
    (wl.Extent(-640, -256, 3452, 2218), (30.30, 40.00, 34.95, 42.10)),
)
#: Karo başına dosya boyu bütçesi (bayt): yükseklik 512 KB + örtü 256 KB; sözleşme: her dosya ≤ 1 MB.
MAX_TILE_FILE_BYTES = 1024 * 1024


def select_provinces(boundaries: gpd.GeoDataFrame, names: list[str]) -> gpd.GeoDataFrame:
    """İsimle il seçer; herhangi biri bulunamazsa açıkça hata verir (sessizce eksik bırakmaz)."""
    found = boundaries[boundaries.shapeName.isin(names)]
    missing = sorted(set(names) - set(found.shapeName))
    if missing:
        raise SystemExit(f"geoBoundaries'te bulunamadı: {missing}")
    return found


def game_geometry(geometry, origin_e: float, origin_n: float):
    """UTM geometrisini oyun X/Z koordinatlarına (2 ondalık) çevirir."""

    def convert(coords: np.ndarray) -> np.ndarray:
        e, n = coords[:, 0], coords[:, 1]
        x = (e - origin_e) / regionlib.HORIZONTAL_SCALE
        z = -(n - origin_n) / regionlib.HORIZONTAL_SCALE
        return np.round(np.column_stack([x, z]), GAME_COORD_DECIMALS)

    return shapely.transform(geometry, convert)


def resample_dem(dem_paths: list[Path], grid: wl.LatticeGrid) -> np.ndarray:
    """DEM karolarını birleştirip ızgaraya alan ortalamasıyla örnekler (metre, float32)."""
    datasets = [rasterio.open(path) for path in dem_paths]
    try:
        mosaic, mosaic_transform = merge(datasets, nodata=0)
        crs = datasets[0].crs
    finally:
        for dataset in datasets:
            dataset.close()

    elevation = np.zeros((grid.height, grid.width), dtype=np.float32)
    reproject(
        source=mosaic[0].astype(np.float32),
        destination=elevation,
        src_transform=mosaic_transform,
        src_crs=crs,
        dst_transform=from_origin(grid.left, grid.top, grid.cell, grid.cell),
        dst_crs=wl.CRS,
        resampling=Resampling.average,
    )
    if not np.isfinite(elevation).all():
        raise SystemExit("Örneklenen yükseklikte geçersiz (NaN/inf) değer var.")
    return elevation


def check_grid_inside_bbox(grid: wl.LatticeGrid, bbox: list[float]) -> None:
    """Izgara, world.yaml sınır kutusunun (ve dolayısıyla indirilen karoların) içinde mi?"""
    to_lonlat = Transformer.from_crs(wl.CRS, "EPSG:4326", always_xy=True)
    corners = [(grid.left, grid.top), (grid.right, grid.top), (grid.left, grid.bottom), (grid.right, grid.bottom)]
    lons, lats = zip(*(to_lonlat.transform(e, n) for e, n in corners))
    lon_min, lat_min, lon_max, lat_max = bbox
    if min(lons) < lon_min or max(lons) > lon_max or min(lats) < lat_min or max(lats) > lat_max:
        raise SystemExit(
            f"Izgara sınır kutusunu aşıyor: lon {min(lons):.3f}..{max(lons):.3f}, "
            f"lat {min(lats):.3f}..{max(lats):.3f}; bbox {bbox}. world.yaml'ı genişlet."
        )


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
    elevation = resample_dem(dem_paths, grid)
    extent = grid.extent
    # Büyük pencere önce: küçük (daha eski) pencere en son yazılır ve kendi alanında geçerli kalır.
    for window, window_bbox in sorted(PINNED_WINDOWS, key=lambda w: -w[0].cols * w[0].rows):
        inside = (
            window.col0 >= extent.col0
            and window.row0 >= extent.row0
            and window.col0 + window.cols <= extent.col0 + extent.cols
            and window.row0 + window.rows <= extent.row0 + extent.rows
        )
        if not inside:
            continue
        window_dem = [p for p in dem_paths if p.stem in set(regionlib.tiles_for_bbox(*window_bbox))]
        pinned = resample_dem(window_dem, wl.LatticeGrid(window))
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
                    "geometry": mapping(game_geometry(clipped, grid.origin_e, grid.origin_n)),
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
    targets = select_provinces(boundaries, config["provinces"])
    minx, miny, maxx, maxy = targets.total_bounds
    grid = wl.grid_for_lattice(minx, miny, maxx, maxy, config["margin_m"])
    check_grid_inside_bbox(grid, config["bbox"])

    if config.get("neighbors", "auto") == "auto":
        neighbor_names = select_neighbors(
            boundaries, list(config["provinces"]), grid, float(config.get("neighbor_min_area_km2", 1))
        )
    else:
        neighbor_names = list(config["neighbors"])
    neighbors = select_provinces(boundaries, neighbor_names)
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


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("world_id", nargs="?", default=DEFAULT_WORLD)
    args = parser.parse_args(argv)

    config = load_world_config(args.world_id)
    dem_dir = TOOLS / "raw" / "dem"
    tile_names = regionlib.tiles_for_bbox(*config["bbox"])
    # Açık deniz karoları Copernicus'ta yoktur (fetch_dem.py `.sea` işareti bırakır): mozaiğe girmez, deniz (0) kalır.
    sea_tiles = {name for name in tile_names if (dem_dir / f"{name}.sea").exists()}
    dem_paths = [dem_dir / f"{name}.tif" for name in tile_names if name not in sea_tiles]
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
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
