"""Dünya (karo) biçiminin saf yardımcıları: kafes/karo matematiği, dünya-geneli nicemleme, manifest.

Sözleşme: docs/faz-7-paralel-plan.md §3. Bu modül yalnızca numpy ve standart kütüphaneyi kullanır
(rasterio/geopandas yok); ağır bağımlılıklar olmadan test edilebilir. Kafes sabitleri
`src/config.ts` → `WORLD` ile aynı olmalıdır (tools/tests/test_worldlib.py bunu denetler).

Kafes: tam sayı örnek `(col, row)`; (0, 0) = eski bölgenin kuzeybatı örneği, negatif indeksler batıya/kuzeye
uzanır. Oyun konumu `x = ANCHOR_X + col · hücre`, `z = ANCHOR_Z + row · hücre` (piksel merkezi).
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

import numpy as np

# src/config.ts → HORIZONTAL_SCALE ve WORLD ile aynı olmalı (testle denetlenir).
HORIZONTAL_SCALE = 50
CELL_SIZE_REAL = 100
LATTICE_CELL = CELL_SIZE_REAL / HORIZONTAL_SCALE  # oyun m
ANCHOR_X = -1587
ANCHOR_Z = -1175
TILE_SIZE = 512
CHUNK_CELLS = 128

ORIGIN_UTM = (434085, 4576261)
CRS = "EPSG:32636"
MANIFEST_VERSION = 1
UINT16_MAX = 65535

# Kafesin sol/üst kenarı (eski ızgaranın sol/üst kenarı), gerçek UTM metre.
LATTICE_LEFT_E = ORIGIN_UTM[0] + ANCHOR_X * HORIZONTAL_SCALE - CELL_SIZE_REAL // 2  # 354685
LATTICE_TOP_N = ORIGIN_UTM[1] - ANCHOR_Z * HORIZONTAL_SCALE + CELL_SIZE_REAL // 2  # 4635061


class WorldDataError(ValueError):
    """Dünya verisi/manifest sözleşmeyle uyuşmuyorsa fırlatılır."""


@dataclass(frozen=True)
class Extent:
    """Gerçek veri dikdörtgeni (kafes örnekleri)."""

    col0: int
    row0: int
    cols: int
    rows: int

    def as_dict(self) -> dict[str, int]:
        return {"col0": self.col0, "row0": self.row0, "cols": self.cols, "rows": self.rows}

    @staticmethod
    def from_dict(value: dict) -> "Extent":
        return Extent(int(value["col0"]), int(value["row0"]), int(value["cols"]), int(value["rows"]))


# ---------------------------------------------------------------------------- kafes matematiği


def lattice_x(col: float) -> float:
    return ANCHOR_X + col * LATTICE_CELL


def lattice_z(row: float) -> float:
    return ANCHOR_Z + row * LATTICE_CELL


def grid_origin_of(extent: Extent) -> tuple[float, float]:
    """Birleştirilmiş dizinin (0, 0) örneğinin oyun konumu (`RegionMeta.gridOrigin`)."""
    return lattice_x(extent.col0), lattice_z(extent.row0)


def tile_of(col: int, row: int) -> tuple[int, int]:
    """Örneği içeren karo; negatif indeks sıfıra değil aşağı yuvarlanır."""
    return col // TILE_SIZE, row // TILE_SIZE


def tile_range_of(extent: Extent) -> tuple[int, int, int, int]:
    """`extent` ile kesişen karo aralığı (tx0, tx1, ty0, ty1; kapsayıcı)."""
    tx0, ty0 = tile_of(extent.col0, extent.row0)
    tx1, ty1 = tile_of(extent.col0 + extent.cols - 1, extent.row0 + extent.rows - 1)
    return tx0, tx1, ty0, ty1


def tile_coords_of(extent: Extent) -> list[tuple[int, int]]:
    """`extent` ile kesişen karoların (tx, ty) listesi: satır satır (ty, sonra tx)."""
    tx0, tx1, ty0, ty1 = tile_range_of(extent)
    return [(tx, ty) for ty in range(ty0, ty1 + 1) for tx in range(tx0, tx1 + 1)]


def tile_name(tx: int, ty: int, kind: str) -> str:
    """Manifeste göreli karo dosya yolu; `kind` = 'height' | 'cover'."""
    return f"tiles/{tx}_{ty}.{kind}.bin"


def extent_for_lattice_bounds(
    left_e: float, top_n: float, right_e: float, bottom_n: float
) -> Extent:
    """UTM kutusunu (sol, üst, sağ, alt) kaplayan, kafese yuvarlı en küçük örnek dikdörtgeni."""
    col0 = math.floor((left_e - LATTICE_LEFT_E) / CELL_SIZE_REAL)
    row0 = math.floor((LATTICE_TOP_N - top_n) / CELL_SIZE_REAL)
    col1 = math.ceil((right_e - LATTICE_LEFT_E) / CELL_SIZE_REAL)
    row1 = math.ceil((LATTICE_TOP_N - bottom_n) / CELL_SIZE_REAL)
    return Extent(col0, row0, col1 - col0, row1 - row0)


# ---------------------------------------------------------------------------- karo kesme / birleştirme


def slice_into_tiles(
    data: np.ndarray, extent: Extent, dtype: np.dtype | type
) -> dict[tuple[int, int], np.ndarray]:
    """`extent` boyutundaki diziyi 512×512'lik karolara keser; extent dışı kısım 0 kalır.

    Dönüş: (tx, ty) → (512, 512) dizi. `extent` ile kesişen her karo üretilir.
    """
    if data.shape != (extent.rows, extent.cols):
        raise WorldDataError(f"dizi boyutu {data.shape}, beklenen {(extent.rows, extent.cols)}")
    tiles: dict[tuple[int, int], np.ndarray] = {}
    for tx, ty in tile_coords_of(extent):
        tile = np.zeros((TILE_SIZE, TILE_SIZE), dtype=dtype)
        c_lo = max(tx * TILE_SIZE, extent.col0)
        c_hi = min((tx + 1) * TILE_SIZE, extent.col0 + extent.cols)
        r_lo = max(ty * TILE_SIZE, extent.row0)
        r_hi = min((ty + 1) * TILE_SIZE, extent.row0 + extent.rows)
        tile[r_lo - ty * TILE_SIZE : r_hi - ty * TILE_SIZE, c_lo - tx * TILE_SIZE : c_hi - tx * TILE_SIZE] = data[
            r_lo - extent.row0 : r_hi - extent.row0, c_lo - extent.col0 : c_hi - extent.col0
        ]
        tiles[(tx, ty)] = tile
    return tiles


def assemble(
    tiles: dict[tuple[int, int], np.ndarray], extent: Extent, dtype: np.dtype | type
) -> np.ndarray:
    """`slice_into_tiles`'ın tersi: karolardan `extent` boyutunda tek dizi. Eksik karo hata verir."""
    expected = set(tile_coords_of(extent))
    if set(tiles) != expected:
        missing = sorted(expected - set(tiles))
        extra = sorted(set(tiles) - expected)
        raise WorldDataError(f"karo kümesi extent ile uyuşmuyor (eksik {missing}, fazla {extra})")
    out = np.zeros((extent.rows, extent.cols), dtype=dtype)
    for (tx, ty), tile in tiles.items():
        if tile.shape != (TILE_SIZE, TILE_SIZE):
            raise WorldDataError(f"karo ({tx}, {ty}) boyutu {tile.shape}")
        c_lo = max(tx * TILE_SIZE, extent.col0)
        c_hi = min((tx + 1) * TILE_SIZE, extent.col0 + extent.cols)
        r_lo = max(ty * TILE_SIZE, extent.row0)
        r_hi = min((ty + 1) * TILE_SIZE, extent.row0 + extent.rows)
        out[r_lo - extent.row0 : r_hi - extent.row0, c_lo - extent.col0 : c_hi - extent.col0] = tile[
            r_lo - ty * TILE_SIZE : r_hi - ty * TILE_SIZE, c_lo - tx * TILE_SIZE : c_hi - tx * TILE_SIZE
        ]
    return out


def height_tile_bytes(tile: np.ndarray) -> bytes:
    """uint16 karo → little-endian bayt (satır satır)."""
    return np.ascontiguousarray(tile, dtype="<u2").tobytes()


def cover_tile_bytes(tile: np.ndarray) -> bytes:
    return np.ascontiguousarray(tile, dtype=np.uint8).tobytes()


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------- dünya-geneli nicemleme


def world_elevation_max(max_elevation: float, round_to: int = 100) -> float:
    """Dünya geneli tek yükseklik üst sınırı: en yüksek nokta `round_to`'ya yukarı yuvarlı."""
    return float(max(math.ceil(max(max_elevation, 1.0) / round_to) * round_to, round_to))


def quantize_with_range(elevation: np.ndarray, elevation_min: float, elevation_max: float) -> np.ndarray:
    """Yükseklikleri (m) verilen (dünya geneli) aralıkla uint16'ya nicemler; deniz altı 0'a kırpılır.

    Çağıran önce tüm dünyanın `max`'ini hesaplar (1. geçiş), sonra bununla nicemler (2. geçiş).
    """
    if elevation_max <= elevation_min:
        raise WorldDataError("elevation_max > elevation_min olmalı")
    clipped = np.clip(elevation.astype(np.float64), elevation_min, elevation_max)
    scaled = (clipped - elevation_min) / (elevation_max - elevation_min) * UINT16_MAX
    return np.rint(scaled).astype(np.uint16)


def requantize(values: np.ndarray, old_max: float, new_max: float) -> np.ndarray:
    """uint16 değerleri eski dünya aralığından (min = 0) yeni aralığa çevirir (≤ 1 nicem hata)."""
    meters = values.astype(np.float64) / UINT16_MAX * old_max
    return quantize_with_range(meters, 0.0, new_max)


# ---------------------------------------------------------------------------- manifest


def build_manifest(
    *,
    world_id: str,
    name: str,
    extent: Extent,
    elevation_max: float,
    tile_blobs: dict[tuple[int, int], bytes],
    layers: list[str],
    landcover_classes: list[str],
    sources: list[str],
    overture_release: str,
    built: str,
    elevation_min: float = 0.0,
) -> dict:
    """`world.json` içeriği. `tile_blobs` = (tx, ty) → yükseklik karosunun baytları (bayt/sha için)."""
    coords = tile_coords_of(extent)
    if set(tile_blobs) != set(coords):
        raise WorldDataError("tile_blobs, extent ile kesişen karo kümesine eşit olmalı")
    return {
        "version": MANIFEST_VERSION,
        "id": world_id,
        "name": name,
        "crs": CRS,
        "originUtm": list(ORIGIN_UTM),
        "horizontalScale": HORIZONTAL_SCALE,
        "cellSizeReal": CELL_SIZE_REAL,
        "lattice": {"anchorX": ANCHOR_X, "anchorZ": ANCHOR_Z},
        "tileSize": TILE_SIZE,
        "extent": extent.as_dict(),
        "elevation": {"min": elevation_min, "max": elevation_max, "encoding": "uint16"},
        "tiles": [
            {
                "tx": tx,
                "ty": ty,
                "height": tile_name(tx, ty, "height"),
                "cover": tile_name(tx, ty, "cover"),
                "bytes": len(tile_blobs[(tx, ty)]),
                "sha256": sha256_hex(tile_blobs[(tx, ty)]),
            }
            for tx, ty in coords
        ],
        "provinces": "provinces.geojson",
        "features": {"file": "features.json", "layers": layers},
        "landcover": {"classes": landcover_classes},
        "sources": sources,
        "overtureRelease": overture_release,
        "built": built,
    }


def validate_manifest(manifest: dict) -> None:
    """Manifesti sözleşmeye göre denetler (TS `parseWorldManifest`'in Python eşi); hata → WorldDataError."""

    def need(cond: bool, message: str) -> None:
        if not cond:
            raise WorldDataError(f"manifest geçersiz: {message}")

    need(manifest.get("version") == MANIFEST_VERSION, "version")
    need(manifest.get("crs") == CRS, "crs")
    need(list(manifest.get("originUtm", [])) == list(ORIGIN_UTM), "originUtm")
    need(manifest.get("horizontalScale") == HORIZONTAL_SCALE, "horizontalScale")
    need(manifest.get("cellSizeReal") == CELL_SIZE_REAL, "cellSizeReal")
    need(
        manifest.get("lattice") == {"anchorX": ANCHOR_X, "anchorZ": ANCHOR_Z},
        "lattice WORLD.lattice ile aynı olmalı",
    )
    need(manifest.get("tileSize") == TILE_SIZE, "tileSize")
    extent = Extent.from_dict(manifest["extent"])
    need(extent.cols > 0 and extent.rows > 0, "extent boyutu")
    elevation = manifest.get("elevation", {})
    need(elevation.get("encoding") == "uint16", "elevation.encoding")
    need(elevation.get("max", 0) > elevation.get("min", 0), "elevation aralığı")

    seen = set()
    for tile in manifest.get("tiles", []):
        key = (tile["tx"], tile["ty"])
        need(key not in seen, f"yinelenen karo {key}")
        seen.add(key)
        need(tile["bytes"] == TILE_SIZE * TILE_SIZE * 2, f"karo {key} bayt sayısı")
        need(len(tile["sha256"]) == 64, f"karo {key} sha256")
    need(seen == set(tile_coords_of(extent)), "karolar extent ile kesişen kümeye eşit (boşluksuz) olmalı")
