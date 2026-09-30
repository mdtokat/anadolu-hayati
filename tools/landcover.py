"""Overture arazi örtüsü çokgenlerini (ESA WorldCover türevi, WGS84) bölge ızgarasına rasterleştirir.

Çıktı: `landcover.bin` — hücre başına 1 bayt sınıf, heightmap ile aynı ızgara ve sıra (satır satır,
kuzeyden güneye, batıdan doğuya). Sınıf değerleri CLASSES listesindeki indekstir; liste `meta.json`'a
yazılır (oyun bunu kendi tablosuyla karşılaştırır, bkz. CLAUDE.md "Bölge Veri Formatı").

Her hücre `SUPERSAMPLE`×`SUPERSAMPLE` alt hücreye bölünüp sınıf başına kaplama sayılır; en çok
alan kaplayan sınıf kazanır (kaplama %25'in altındaysa hücre "none" kalır: deniz, kaynak verinin boşluğu).

Lisans: ESA WorldCover 2021, CC-BY-4.0 (Overture Maps üzerinden).
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from typing import Any

import geopandas as gpd
import numpy as np
import shapely
from rasterio.features import rasterize
from rasterio.transform import from_origin

import regionlib

#: Sınıf tablosu; değer = indeks. Sıra sözleşmedir: yalnızca sona eklenir (src/data/region.ts ile eşleşir).
CLASSES = ["none", "forest", "shrub", "grass", "crop", "barren", "urban", "snow", "wetland"]
CLASS_INDEX = {name: index for index, name in enumerate(CLASSES)}

#: Overture `land_cover.subtype` → sınıf. Listede olmayan tür yok sayılır ve raporlanır.
SUBTYPE_CLASS = {
    "forest": "forest",
    "mangrove": "forest",
    "shrub": "shrub",
    "grass": "grass",
    "moss": "grass",
    "crop": "crop",
    "barren": "barren",
    "urban": "urban",
    "snow": "snow",
    "wetland": "wetland",
}

SUPERSAMPLE = 4
#: Bir hücreye sınıf verilebilmesi için alt hücrelerin en az bu oranı o sınıfla kaplı olmalı.
MIN_COVERAGE = 0.25


def rasterize_landcover(
    subtypes: Iterable[str | None],
    geometries: Iterable[Any],
    grid: regionlib.Grid,
    crs: str = "EPSG:32636",
) -> tuple[np.ndarray, Counter[str]]:
    """WGS84 çokgenlerini ızgaraya işler. Dönüş: (uint8 [yükseklik, genişlik], atlanan türlerin sayımı)."""
    frame = gpd.GeoDataFrame({"subtype": list(subtypes)}, geometry=list(geometries), crs="EPSG:4326").to_crs(crs)
    frame = frame[frame.geometry.notna() & ~frame.geometry.is_empty]

    skipped: Counter[str] = Counter()
    by_class: dict[str, list[Any]] = {}
    for subtype, geometry in zip(frame["subtype"], frame.geometry, strict=True):
        name = SUBTYPE_CLASS.get(subtype or "")
        if name is None:
            skipped[str(subtype)] += 1
            continue
        by_class.setdefault(name, []).append(geometry)

    height, width, s = grid.height, grid.width, SUPERSAMPLE
    transform = from_origin(grid.left, grid.top, grid.cell / s, grid.cell / s)
    best_coverage = np.zeros((height, width), dtype=np.uint8)
    result = np.zeros((height, width), dtype=np.uint8)
    threshold = int(np.ceil(MIN_COVERAGE * s * s))

    # Sabit sıra (CLASSES) → beraberlikte önceki sınıf kazanır; girdi sırasından bağımsız, deterministik.
    for name in CLASSES[1:]:
        shapes = by_class.get(name)
        if not shapes:
            continue
        mask = rasterize(
            ((shapely.make_valid(g), 1) for g in shapes),
            out_shape=(height * s, width * s),
            transform=transform,
            fill=0,
            dtype="uint8",
        )
        coverage = mask.reshape(height, s, width, s).sum(axis=(1, 3), dtype=np.uint16).astype(np.uint8)
        wins = (coverage >= threshold) & (coverage > best_coverage)
        result[wins] = CLASS_INDEX[name]
        best_coverage[wins] = coverage[wins]
    return result, skipped


def class_histogram(classes: np.ndarray) -> dict[str, int]:
    """Sınıf adı → hücre sayısı (yalnızca görülenler)."""
    counts = np.bincount(classes.ravel(), minlength=len(CLASSES))
    return {name: int(counts[index]) for index, name in enumerate(CLASSES) if counts[index]}
