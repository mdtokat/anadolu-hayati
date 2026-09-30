"""Veri hattının saf yardımcıları: ızgara hesabı, koordinat dönüşümü, nicemleme, karo adları.

Bu modül bilerek yalnızca numpy ve standart kütüphaneyi kullanır (rasterio/geopandas yok);
böylece ağır bağımlılıklar olmadan test edilebilir.

Koordinat sözleşmesi (CLAUDE.md "Koordinat Sistemi ve Ölçek" ile aynı olmalı):
  x = (easting − originE) / HORIZONTAL_SCALE
  z = −(northing − originN) / HORIZONTAL_SCALE
  y = elevation / VERTICAL_SCALE   (dikey ölçek yalnızca oyunda uygulanır; veri gerçek metredir)
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

# src/config.ts içindeki HORIZONTAL_SCALE ile aynı olmalı. meta.json'a da yazılır ve oyun
# yüklerken karşılaştırır: bir taraf değişip diğeri eski kalırsa sessizce yanlış çalışmasın.
HORIZONTAL_SCALE = 50

UINT16_MAX = 65535

DEM_BUCKET_URL = "https://copernicus-dem-30m.s3.amazonaws.com"


@dataclass(frozen=True)
class Grid:
    """Orijin merkezli, kuzeyden güneye/batıdan doğuya satır satır ızgara (EPSG:32636).

    Örnekler raster piksel merkezindedir: sütun c için easting = left + (c + 0.5) * cell.
    Oyunda x = (c − (width − 1) / 2) * cell / HORIZONTAL_SCALE (simetrik).
    """

    width: int
    height: int
    cell: float
    origin_e: float
    origin_n: float

    @property
    def left(self) -> float:
        return self.origin_e - self.width * self.cell / 2

    @property
    def top(self) -> float:
        return self.origin_n + self.height * self.cell / 2

    @property
    def right(self) -> float:
        return self.left + self.width * self.cell

    @property
    def bottom(self) -> float:
        return self.top - self.height * self.cell


def grid_for_bounds(
    minx: float, miny: float, maxx: float, maxy: float, cell: float, margin: float
) -> Grid:
    """UTM sınır kutusu (+ pay) için ızgara. Orijin kutu merkezidir, tam metreye yuvarlanır."""
    origin_e = round((minx + maxx) / 2)
    origin_n = round((miny + maxy) / 2)
    width = math.ceil((maxx - minx + 2 * margin) / cell)
    height = math.ceil((maxy - miny + 2 * margin) / cell)
    return Grid(width=width, height=height, cell=cell, origin_e=origin_e, origin_n=origin_n)


def utm_to_game(easting: float, northing: float, origin_e: float, origin_n: float) -> tuple[float, float]:
    """UTM (E, N) → oyun (x, z)."""
    return (easting - origin_e) / HORIZONTAL_SCALE, -(northing - origin_n) / HORIZONTAL_SCALE


def game_to_utm(x: float, z: float, origin_e: float, origin_n: float) -> tuple[float, float]:
    """Oyun (x, z) → UTM (E, N)."""
    return origin_e + x * HORIZONTAL_SCALE, origin_n - z * HORIZONTAL_SCALE


def sample_game_position(grid: Grid, col: int, row: int) -> tuple[float, float]:
    """(satır, sütun) örneğinin oyun x/z konumu (piksel merkezi)."""
    easting = grid.left + (col + 0.5) * grid.cell
    northing = grid.top - (row + 0.5) * grid.cell
    return utm_to_game(easting, northing, grid.origin_e, grid.origin_n)


def quantize_elevation(elevation: np.ndarray) -> tuple[np.ndarray, float, float]:
    """Yükseklikleri (m) uint16'ya nicemler.

    Denizin altı 0'a kırpılır (sözleşme). elevationMin = 0; elevationMax tam sayıya yukarı
    yuvarlanır (metadata'da okunaklı kalsın). Dönüş: (uint16 dizi, elevationMin, elevationMax).
    """
    clipped = np.clip(elevation.astype(np.float64), 0.0, None)
    elevation_min = 0.0
    elevation_max = float(max(math.ceil(float(clipped.max())), 1))
    scaled = clipped / elevation_max * UINT16_MAX
    return np.rint(scaled).astype(np.uint16), elevation_min, elevation_max


def dequantize_elevation(values: np.ndarray, elevation_min: float, elevation_max: float) -> np.ndarray:
    """uint16 → metre. elevation = min + (v / 65535) * (max − min)."""
    return elevation_min + values.astype(np.float64) / UINT16_MAX * (elevation_max - elevation_min)


def tiles_for_bbox(lon_min: float, lat_min: float, lon_max: float, lat_max: float) -> list[str]:
    """Kutuyu kaplayan Copernicus GLO-30 karo adları (her karo 1°×1°, adı güneybatı köşesidir)."""
    names: list[str] = []
    for lat in range(math.floor(lat_min), math.floor(lat_max) + 1):
        for lon in range(math.floor(lon_min), math.floor(lon_max) + 1):
            # Bir kenar tam tam sayıya denk gelirse (örn. lat_max = 42.0) fazladan karo istenmez.
            if lat == lat_max and lat > lat_min:
                continue
            if lon == lon_max and lon > lon_min:
                continue
            ns = "N" if lat >= 0 else "S"
            ew = "E" if lon >= 0 else "W"
            names.append(f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM")
    return names


def tile_url(name: str) -> str:
    return f"{DEM_BUCKET_URL}/{name}/{name}.tif"


def is_lfs_pointer(data: bytes) -> bool:
    """İndirilen içerik gerçek dosya değil de bir Git LFS işaretçisi mi?"""
    return data[:64].startswith(b"version https://git-lfs.github.com/spec/")
