#!/usr/bin/env python3
"""Overture Maps'ten yerleşim katmanlarını (Faz 10) çeker: yollar, idari birimler, yerler (POI), bina noktaları.

Kullanım:  python fetch_settlements.py [dünya-id] [katman ...] [--groups cekirdek,bati]
           (varsayılan: bati-karadeniz, tüm katmanlar, tüm gruplar)
Katmanlar: roads, divisions, places, buildings
Çıktı:     tools/raw/settlements/<dünya-id>/<katman>.json  (WGS84; commit edilmez) + `.cover.json` (indirilen kutu;
           katman istenen kutuyu kapsıyorsa indirme atlanır)

Yöntem `fetch_water.py` ile aynıdır: Parquet dosyaları HTTP Range ile okunur, yalnızca altbilgiler ve sınır
kutusuyla kesişen satır grupları (yalnızca gereken sütunlar) indirilir.

Lisans/atıf:
- `transportation` (yollar), `buildings`, `divisions`: OpenStreetMap türevi ağırlıklı — ODbL-1.0,
  © OpenStreetMap katkıcıları (bina katmanında ayrıca Microsoft/Google ML ayak izleri, ODbL/CDLA).
- `places`: Overture Places — CDLA-Permissive-2.0.
"""

from __future__ import annotations

import json
import sys
import urllib.parse
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq
import shapely

import fetchlib
import worldconfig
from fetch_dem import load_world
from fetch_water import BUCKET_URL, OVERTURE_RELEASE, BBox, bbox_intersects, list_parquet_files, row_groups_for_bbox
from rangefile import HttpRangeFile

TOOLS = Path(__file__).resolve().parent
RAW_SETTLEMENTS = TOOLS / "raw" / "settlements"
DEFAULT_WORLD = "bati-karadeniz"

PREFIXES = {
    "roads": "release/{release}/theme=transportation/type=segment/",
    "divisions": "release/{release}/theme=divisions/type=division/",
    "places": "release/{release}/theme=places/type=place/",
    "buildings": "release/{release}/theme=buildings/type=building/",
}

#: Oyunda çizilen yol sınıfları (Overture `class`). `track`/`path`/`footway` ve kent içi `residential`/`service`
#: bilerek yoktur: 1:50 ölçekte kent içi sokaklar 0,5 oyun m arayla iç içe geçer, orman yolları haritayı doldurur.
ROAD_CLASSES = frozenset({"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified"})

#: Yerleşim için ilgili POI kategorileri (Overture `basic_category` / `taxonomy.primary` içinde aranan parçalar).
PLACE_KEYWORDS = (
    "mosque",
    "muslim",
    "islam",
    "cemetery",
    "graveyard",
    "fountain",
    "turkish_bath",
    "hammam",
    "public_bath",
    "castle",
    "fort",
    "monument",
    "memorial",
    "historic",
    "landmark",
    "museum",
    "clock_tower",
    "tomb",
    "mausoleum",
    "bridge",
    "mine",
    "bazaar",
    "market",
    "caravanserai",
    "town_hall",
    "city_hall",
    "government",
    "tea_house",
    "coffee",
    "bakery",
    "grocery",
)

#: Özel bina sınıfları (Overture `class`, OSM `building=*`): adlarıyla birlikte ayrı listelenir.
SPECIAL_BUILDING_CLASSES = frozenset(
    {"mosque", "religious", "church", "civic", "government", "school", "hospital", "industrial", "factory", "castle", "historic"}
)

LAYER_COLUMNS = {
    "roads": ["id", "names", "subtype", "class", "road_surface", "geometry", "bbox"],
    "divisions": [
        "id",
        "names",
        "subtype",
        "class",
        "country",
        "admin_level",
        "population",
        "local_type",
        "hierarchies",
        "capital_of_divisions",
        "geometry",
        "bbox",
    ],
    "places": ["id", "names", "basic_category", "taxonomy", "confidence", "geometry", "bbox"],
    # Bina geometrisi indirilmez: merkez için bbox yeter (indirmeyi ~10 kat küçültür).
    "buildings": ["id", "names", "subtype", "class", "height", "num_floors", "bbox"],
}


# -- saf yardımcılar (test edilir) ---------------------------------------------


def _box(row: dict[str, Any]) -> BBox | None:
    box = row.get("bbox")
    if not box:
        return None
    return (box["xmin"], box["ymin"], box["xmax"], box["ymax"])


def _name(row: dict[str, Any]) -> str | None:
    names = row.get("names") or {}
    return names.get("primary")


def _surface(row: dict[str, Any]) -> str | None:
    """Segmentin baskın yüzeyi (`road_surface` kurallarının ilki; yoksa None)."""
    rules = row.get("road_surface") or []
    for rule in rules:
        if rule and rule.get("value"):
            return rule["value"]
    return None


def road_record(row: dict[str, Any]) -> dict[str, Any] | None:
    """Yol segmenti → kayıt (`ROAD_CLASSES` dışı ya da yol olmayan segment None)."""
    if row.get("subtype") != "road" or row.get("class") not in ROAD_CLASSES:
        return None
    geometry = shapely.from_wkb(row["geometry"])
    if geometry.geom_type != "LineString":
        return None
    return {
        "id": row.get("id"),
        "class": row["class"],
        "name": _name(row),
        "surface": _surface(row),
        "coords": [[round(x, 6), round(y, 6)] for x, y in geometry.coords],
    }


def division_record(row: dict[str, Any]) -> dict[str, Any] | None:
    """İdari birim (yalnızca Türkiye) → kayıt; nokta geometrisi olmayanlar elenir."""
    if row.get("country") != "TR":
        return None
    geometry = shapely.from_wkb(row["geometry"])
    if geometry.geom_type != "Point":
        geometry = geometry.representative_point()
    hierarchy = (row.get("hierarchies") or [[]])[0] or []
    local_type = row.get("local_type") or {}
    if isinstance(local_type, list):  # pyarrow map → [(anahtar, değer), ...]
        local_type = dict(local_type)
    return {
        "id": row.get("id"),
        "name": _name(row),
        "subtype": row.get("subtype"),
        "class": row.get("class"),
        "adminLevel": row.get("admin_level"),
        "population": row.get("population"),
        "localType": local_type.get("tr") or local_type.get("en"),
        "hierarchy": [{"subtype": h.get("subtype"), "name": h.get("name")} for h in hierarchy],
        "capitalOf": [c.get("subtype") for c in (row.get("capital_of_divisions") or [])],
        "lon": round(geometry.x, 6),
        "lat": round(geometry.y, 6),
    }


def _categories(row: dict[str, Any]) -> list[str]:
    taxonomy = row.get("taxonomy") or {}
    found = [row.get("basic_category"), taxonomy.get("primary")]
    found += list(taxonomy.get("hierarchy") or [])
    return [c for c in found if c]


def place_record(row: dict[str, Any], min_confidence: float = 0.5) -> dict[str, Any] | None:
    """İlgili kategorideki POI → kayıt; ilgisiz ya da düşük güvenli kayıt None."""
    categories = _categories(row)
    if not any(key in c for c in categories for key in PLACE_KEYWORDS):
        return None
    if (row.get("confidence") or 0) < min_confidence:
        return None
    geometry = shapely.from_wkb(row["geometry"])
    point = geometry if geometry.geom_type == "Point" else geometry.representative_point()
    taxonomy = row.get("taxonomy") or {}
    return {
        "id": row.get("id"),
        "name": _name(row),
        "category": taxonomy.get("primary") or row.get("basic_category"),
        "basic": row.get("basic_category"),
        "lon": round(point.x, 6),
        "lat": round(point.y, 6),
    }


def building_record(row: dict[str, Any]) -> list[Any] | None:
    """Bina → `[lon, lat, sınıf|None, kat|None, ad|None, boy_m|None]` (bbox merkezi; kompakt)."""
    box = _box(row)
    if box is None:
        return None
    lon = round((box[0] + box[2]) / 2, 6)
    lat = round((box[1] + box[3]) / 2, 6)
    cls = row.get("class")
    name = _name(row) if cls in SPECIAL_BUILDING_CLASSES else None
    height = row.get("height")
    return [lon, lat, cls, row.get("num_floors"), name, round(height, 1) if height else None]


RECORDERS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "roads": road_record,
    "divisions": division_record,
    "places": place_record,
    "buildings": building_record,
}


def read_layer(source: Any, layer: str, bbox: BBox) -> list[Any]:
    """Parquet dosyasından `bbox` ile kesişen satırları katmanın kayıt biçimine çevirir (satır grubu satır grubu)."""
    parquet = pq.ParquetFile(source)
    groups = row_groups_for_bbox(parquet.metadata, bbox)
    names = parquet.schema_arrow.names
    columns = [c for c in LAYER_COLUMNS[layer] if c in names]
    record = RECORDERS[layer]
    out: list[Any] = []
    for group in groups:
        for row in parquet.read_row_group(group, columns=columns).to_pylist():
            box = _box(row)
            if box is None or not bbox_intersects(box, bbox):
                continue
            item = record(row)
            if item is not None:
                out.append(item)
    return out


def extract_layer(
    layer: str,
    bbox: BBox,
    keys: Iterable[str],
    open_file: Callable[[str], HttpRangeFile] = lambda key: HttpRangeFile(BUCKET_URL + urllib.parse.quote(key, safe="/=")),
    log: Callable[[str], None] = print,
) -> tuple[list[Any], int]:
    """Tüm dosyalardaki katman kayıtlarını toplar. Dönüş: (kayıtlar, indirilen bayt)."""
    items: list[Any] = []
    downloaded = 0
    keys = list(keys)
    for index, key in enumerate(keys, start=1):
        file = open_file(key)
        found = read_layer(file, layer, bbox)
        downloaded += file.bytes_downloaded
        if found:
            log(f"  [{index}/{len(keys)}] {len(found)} kayıt ({file.bytes_downloaded / 1e6:.1f} MB)")
        items += found
    return items, downloaded


def main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("world_id", nargs="?", default=DEFAULT_WORLD)
    parser.add_argument("layers", nargs="*", help=f"katmanlar (varsayılan: {', '.join(PREFIXES)})")
    parser.add_argument("--groups", default=None, help="virgülle ayrılmış il grupları (varsayılan: hepsi)")
    args = parser.parse_args(argv[1:])
    world_id = args.world_id
    layers = args.layers or list(PREFIXES)
    unknown = [layer for layer in layers if layer not in PREFIXES]
    if unknown:
        print(f"Bilinmeyen katman: {', '.join(unknown)} (geçerli: {', '.join(PREFIXES)})")
        return 2
    want = tuple(load_world(world_id, worldconfig.parse_groups_arg(args.groups))["bbox"])
    out_dir = RAW_SETTLEMENTS / world_id
    out_dir.mkdir(parents=True, exist_ok=True)
    for layer in layers:
        dest = out_dir / f"{layer}.json"
        bbox = fetchlib.plan_fetch(dest, want, OVERTURE_RELEASE)
        if bbox is None:
            print(f"mevcut   {dest}  (kayıtlı kapsam {want} kutusunu içeriyor)")
            continue
        keys = list_parquet_files(PREFIXES[layer].format(release=OVERTURE_RELEASE))
        print(f"{world_id}: Overture {OVERTURE_RELEASE} '{layer}', {len(keys)} dosya, bbox {bbox}")
        items, downloaded = extract_layer(layer, bbox, keys)  # type: ignore[arg-type]
        dest.write_text(
            json.dumps({"overture_release": OVERTURE_RELEASE, "layer": layer, "items": items}, ensure_ascii=False),
            encoding="utf-8",
        )
        fetchlib.record_cover(dest, bbox, OVERTURE_RELEASE)
        print(f"  Tamam: {len(items)} kayıt, {downloaded / 1e6:.1f} MB indirildi → {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
