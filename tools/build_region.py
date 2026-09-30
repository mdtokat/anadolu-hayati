#!/usr/bin/env python3
"""Bir bölgenin oyun verisini üretir: heightmap.bin, meta.json, provinces.geojson.

Kullanım:  python build_region.py [bölge-id]      (varsayılan: zonguldak-bartin-karabuk)
Önkoşul:   python fetch_dem.py && python fetch_boundaries.py
Çıktı:     public/data/regions/<bölge-id>/         (commit edilir; oyunun okuduğu dosyalar)

Adımlar: DEM karolarını birleştir → EPSG:32636'ya dönüştürüp `cell_size` (100 m) ızgaraya
alan ortalamasıyla örnekle → denizi 0'a kırp → uint16'ya nicemle → il sınırlarını sadeleştirip
oyun X/Z koordinatlarına çevir.

Örnekleme: 30 m → 100 m için `Resampling.average` (alan ortalaması). En yakın komşu, sivri
gürültülü tepeler üretirdi; ortalama tepe yüksekliklerini hafifçe düşürür (ızgaradaki en yüksek
değer gerçek zirveden biraz düşüktür). Copernicus GLO-30 bir yüzey modelidir (DSM): ağaç ve
bina yüksekliklerini içerir.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from shapely.geometry import box, mapping

import regionlib

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent
DEFAULT_REGION = "zonguldak-bartin-karabuk"
CRS = "EPSG:32636"
# Sözleşme: tek dosya 20 MB'ı geçmemeli; geçerse chunk'lara bölünmeli (Faz 7+).
MAX_FILE_BYTES = 20 * 1024 * 1024
# Sınır sadeleştirme toleransı (gerçek metre) ve komşu illerin kırpıldığı kutu payı.
SIMPLIFY_TOLERANCE_M = 30.0
CLIP_PADDING_M = 5000.0
GAME_COORD_DECIMALS = 2


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


def resample_dem(dem_paths: list[Path], grid: regionlib.Grid) -> np.ndarray:
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
        dst_crs=CRS,
        resampling=Resampling.average,
    )
    if not np.isfinite(elevation).all():
        raise SystemExit("Örneklenen yükseklikte geçersiz (NaN/inf) değer var.")
    return elevation


def check_grid_inside_bbox(grid: regionlib.Grid, bbox: list[float]) -> None:
    """Izgara, regions.yaml sınır kutusunun (ve dolayısıyla indirilen karoların) içinde mi?"""
    to_lonlat = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)
    corners = [(grid.left, grid.top), (grid.right, grid.top), (grid.left, grid.bottom), (grid.right, grid.bottom)]
    lons, lats = zip(*(to_lonlat.transform(e, n) for e, n in corners))
    lon_min, lat_min, lon_max, lat_max = bbox
    if min(lons) < lon_min or max(lons) > lon_max or min(lats) < lat_min or max(lats) > lat_max:
        raise SystemExit(
            f"Izgara sınır kutusunu aşıyor: lon {min(lons):.3f}..{max(lons):.3f}, "
            f"lat {min(lats):.3f}..{max(lats):.3f}; bbox {bbox}. regions.yaml'ı genişlet."
        )


def build(
    region_id: str,
    region: dict,
    dem_paths: list[Path],
    boundaries_path: Path,
    out_dir: Path,
) -> dict:
    """Bölge dosyalarını `out_dir`'e yazar. Dönüş: yazılan meta sözlüğü."""
    boundaries = gpd.read_file(boundaries_path).to_crs(CRS)
    targets = select_provinces(boundaries, region["provinces"])
    neighbors = select_provinces(boundaries, region.get("neighbors", []))

    minx, miny, maxx, maxy = targets.total_bounds
    grid = regionlib.grid_for_bounds(minx, miny, maxx, maxy, region["cell_size"], region["margin_m"])
    check_grid_inside_bbox(grid, region["bbox"])

    elevation = resample_dem(dem_paths, grid)
    quantized, elevation_min, elevation_max = regionlib.quantize_elevation(elevation)

    heightmap = quantized.astype("<u2").tobytes()  # little-endian, satır satır (kuzey→güney, batı→doğu)
    if len(heightmap) > MAX_FILE_BYTES:
        raise SystemExit(f"heightmap.bin {len(heightmap) / 1e6:.1f} MB > 20 MB: chunk'lara bölünmeli.")

    # İl sınırları: ızgarayla (+pay) kesişen tüm iller; hedef iller inRegion=true.
    grid_box = box(grid.left, grid.bottom, grid.right, grid.top).buffer(CLIP_PADDING_M)
    features = []
    for in_region, frame in ((True, targets), (False, neighbors)):
        for row in frame.itertuples():
            clipped = row.geometry.simplify(SIMPLIFY_TOLERANCE_M, preserve_topology=True).intersection(grid_box)
            if clipped.is_empty:
                continue
            features.append(
                {
                    "type": "Feature",
                    "properties": {"name": row.shapeName, "iso": row.shapeISO, "inRegion": in_region},
                    "geometry": mapping(game_geometry(clipped, grid.origin_e, grid.origin_n)),
                }
            )

    meta = {
        "id": region_id,
        "name": region["name"],
        "crs": CRS,
        "originUtm": [grid.origin_e, grid.origin_n],
        "gridWidth": grid.width,
        "gridHeight": grid.height,
        "cellSizeReal": grid.cell,
        "elevationMin": elevation_min,
        "elevationMax": elevation_max,
        "elevationEncoding": "uint16",
        # Sözleşme koruması: oyun bunu src/config.ts'deki HORIZONTAL_SCALE ile karşılaştırır.
        "horizontalScale": regionlib.HORIZONTAL_SCALE,
        "sources": ["Copernicus GLO-30 DEM", "geoBoundaries"],
        "built": date.today().isoformat(),
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "heightmap.bin").write_bytes(heightmap)
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "provinces.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return meta


def main(argv: list[str]) -> int:
    from fetch_dem import load_region  # gecikmeli: yalnızca komut satırında gerekir

    region_id = argv[1] if len(argv) > 1 else DEFAULT_REGION
    region = load_region(region_id)
    dem_paths = [TOOLS / "raw" / "dem" / f"{name}.tif" for name in regionlib.tiles_for_bbox(*region["bbox"])]
    boundaries_path = TOOLS / "raw" / "boundaries" / "geoBoundaries-TUR-ADM1.geojson"
    missing = [str(p) for p in [*dem_paths, boundaries_path] if not p.exists()]
    if missing:
        raise SystemExit("Eksik ham veri (önce fetch_dem.py ve fetch_boundaries.py çalıştır):\n  " + "\n  ".join(missing))

    out_dir = REPO / "public" / "data" / "regions" / region_id
    meta = build(region_id, region, dem_paths, boundaries_path, out_dir)

    size = (out_dir / "heightmap.bin").stat().st_size
    print(f"{region_id}: ızgara {meta['gridWidth']}×{meta['gridHeight']} @ {meta['cellSizeReal']:.0f} m")
    print(f"  origin UTM {meta['originUtm']}, yükseklik 0..{meta['elevationMax']:.0f} m, heightmap.bin {size / 1e6:.2f} MB")
    print(f"  → {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
