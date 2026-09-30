"""Overture su özelliklerini (WGS84 GeoJSON) oyunun `features.json` yapısına çevirir.

Girdi: fetch_water.py çıktısı. Çıktı koordinatları oyun X/Z'sidir (bkz. CLAUDE.md "Koordinat Sistemi").
Deniz/körfez/okyanus dahil edilmez (deniz zaten heightmap'in 0 m seviyesidir); yüzme havuzu, atık su ve
hendek/drenaj gibi içilebilir sayılmayan türler elenir.

Lisans: girdi OpenStreetMap kaynaklıdır (ODbL-1.0); türetilen `features.json` da ODbL kapsamındadır.
"""

from __future__ import annotations

from typing import Any

import geopandas as gpd
import numpy as np
import shapely
from shapely.geometry import box

import regionlib

SIMPLIFY_TOLERANCE_M = 10.0
CLIP_PADDING_M = 200.0
GAME_COORD_DECIMALS = 2
MIN_LINE_LENGTH_M = 30.0
MIN_POLYGON_AREA_M2 = 500.0
FEATURES_VERSION = 1

# (subtype, class) → tür. Çizgiler akarsu, çokgenler durgun su, noktalar kaynak.
LINE_KINDS = {("river", "river"): "river", ("stream", "stream"): "stream", ("canal", "canal"): "canal"}
POLYGON_SUBTYPES = {"lake": "lake", "reservoir": "reservoir", "pond": "pond", "water": "water"}
POLYGON_EXCLUDED_CLASSES = {"wastewater"}
POINT_KINDS = {("spring", "spring"): "spring"}


def classify(properties: dict[str, Any], geometry_type: str) -> str | None:
    """Özelliğin oyun türü; oyunda gösterilmeyecekse (deniz, havuz, atık su…) None."""
    subtype = properties.get("subtype")
    klass = properties.get("class")
    if properties.get("is_salt"):
        return None
    if geometry_type in ("LineString", "MultiLineString"):
        return LINE_KINDS.get((subtype, klass))
    if geometry_type in ("Polygon", "MultiPolygon"):
        if klass in POLYGON_EXCLUDED_CLASSES:
            return None
        return POLYGON_SUBTYPES.get(subtype)
    if geometry_type in ("Point", "MultiPoint"):
        return POINT_KINDS.get((subtype, klass))
    return None


def _flat_game_coords(coords: np.ndarray, origin_e: float, origin_n: float) -> list[float]:
    x = (coords[:, 0] - origin_e) / regionlib.HORIZONTAL_SCALE
    z = -(coords[:, 1] - origin_n) / regionlib.HORIZONTAL_SCALE
    return np.round(np.column_stack([x, z]), GAME_COORD_DECIMALS).ravel().tolist()


def _clean(properties: dict[str, Any]) -> dict[str, Any]:
    """pandas eksik değerleri (None) NaN yapar; NaN "doğru" sayıldığı için None'a geri çevrilir."""
    return {k: (None if isinstance(v, float) and v != v else v) for k, v in properties.items()}


def _base(kind: str, properties: dict[str, Any]) -> dict[str, Any]:
    item: dict[str, Any] = {"kind": kind}
    if properties.get("name"):
        item["name"] = properties["name"]
    return item


def build_features(collection: dict[str, Any], grid: regionlib.Grid, crs: str = "EPSG:32636") -> dict[str, Any]:
    """`collection` (GeoJSON FeatureCollection, WGS84) → features.json içeriği."""
    frame = gpd.GeoDataFrame.from_features(collection["features"], crs="EPSG:4326").to_crs(crs)
    frame = frame[~frame.geometry.is_empty & frame.geometry.notna()]
    clip_box = box(grid.left, grid.bottom, grid.right, grid.top).buffer(CLIP_PADDING_M)

    lines: list[dict[str, Any]] = []
    polygons: list[dict[str, Any]] = []
    points: list[dict[str, Any]] = []

    # (itertuples 'class' gibi anahtar sözcük sütunlarını yeniden adlandırır; sözlük kayıtları kullanılır.)
    records = frame.drop(columns="geometry").to_dict("records")
    for raw_properties, geometry in zip(records, frame.geometry, strict=True):
        properties = _clean(raw_properties)
        kind = classify(properties, geometry.geom_type)
        if kind is None:
            continue

        if kind in LINE_KINDS.values():
            clipped = geometry.simplify(SIMPLIFY_TOLERANCE_M).intersection(clip_box)
            for part in shapely.get_parts(clipped):
                if part.geom_type != "LineString" or part.length < MIN_LINE_LENGTH_M:
                    continue
                item = _base(kind, properties)
                if properties.get("is_intermittent"):
                    item["intermittent"] = True
                item["xz"] = _flat_game_coords(np.asarray(part.coords), grid.origin_e, grid.origin_n)
                lines.append(item)
        elif kind in POLYGON_SUBTYPES.values():
            clipped = geometry.buffer(0).simplify(SIMPLIFY_TOLERANCE_M).intersection(clip_box)
            for part in shapely.get_parts(clipped):
                if part.geom_type != "Polygon" or part.area < MIN_POLYGON_AREA_M2:
                    continue
                rings = [part.exterior, *part.interiors]
                item = _base(kind, properties)
                item["rings"] = [_flat_game_coords(np.asarray(r.coords), grid.origin_e, grid.origin_n) for r in rings]
                polygons.append(item)
        else:  # nokta (kaynak)
            for part in shapely.get_parts(geometry):
                if not clip_box.contains(part):
                    continue
                x, z = _flat_game_coords(np.array([[part.x, part.y]]), grid.origin_e, grid.origin_n)
                item = _base(kind, properties)
                item.update({"x": x, "z": z})
                points.append(item)

    # Deterministik çıktı: aynı girdi → aynı dosya.
    lines.sort(key=lambda i: (i["kind"], i.get("name", ""), i["xz"][:2]))
    polygons.sort(key=lambda i: (i["kind"], i.get("name", ""), i["rings"][0][:2]))
    points.sort(key=lambda i: (i["kind"], i.get("name", ""), i["x"], i["z"]))
    return {"version": FEATURES_VERSION, "water": {"lines": lines, "polygons": polygons, "points": points}}
