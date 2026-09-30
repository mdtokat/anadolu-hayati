#!/usr/bin/env python3
"""Overture Maps `base/water` katmanından (OSM türevi) bölgenin su özelliklerini çeker.

Kullanım:  python fetch_water.py [bölge-id]      (varsayılan: zonguldak-bartin-karabuk)
Çıktı:     tools/raw/water/<bölge-id>.geojson    (WGS84; commit edilmez)

Overture veri kümesi küresel ve yüzlerce GB'dır; Parquet dosyaları HTTP Range istekleriyle okunur:
yalnızca dosya altbilgileri ve sınır kutusuyla kesişen satır grupları indirilir (bölge için birkaç MB).

Lisans/atıf: Overture Maps Foundation, `base` teması — su özellikleri OpenStreetMap'ten gelir,
ODbL-1.0: © OpenStreetMap katkıcıları. Türetilen veri de ODbL kapsamındadır.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq
import shapely
from shapely.geometry import mapping

from fetch_dem import load_region
from rangefile import USER_AGENT, HttpRangeFile

TOOLS = Path(__file__).resolve().parent
RAW_WATER = TOOLS / "raw" / "water"
DEFAULT_REGION = "zonguldak-bartin-karabuk"

BUCKET_URL = "https://overturemaps-us-west-2.s3.amazonaws.com/"
# Yeniden üretilebilirlik için sabitlenmiş yayın; yeni bir yayına geçmek bilinçli bir karardır.
OVERTURE_RELEASE = "2026-09-23.1"
WATER_PREFIX = "release/{release}/theme=base/type=water/"

BBox = tuple[float, float, float, float]  # boylam_min, enlem_min, boylam_max, enlem_max

COLUMNS = ["id", "names", "subtype", "class", "is_salt", "is_intermittent", "geometry", "bbox"]


# -- saf yardımcılar (test edilir) ---------------------------------------------


def bbox_intersects(a: BBox, b: BBox) -> bool:
    """İki [xmin, ymin, xmax, ymax] kutusu kesişiyor mu (kenar teması dahil)?"""
    return a[0] <= b[2] and a[2] >= b[0] and a[1] <= b[3] and a[3] >= b[1]


def row_groups_for_bbox(metadata: Any, bbox: BBox) -> list[int]:
    """Parquet altbilgisindeki `bbox.*` istatistiklerine bakarak `bbox` ile kesişebilecek satır grupları.

    İstatistik yoksa grup temkinli olarak dahil edilir (atlamak veri kaybettirir, dahil etmek yalnızca yavaşlatır).
    """
    names = [metadata.schema.column(i).path for i in range(metadata.num_columns)]
    index = {name: i for i, name in enumerate(names)}
    needed = ("bbox.xmin", "bbox.ymin", "bbox.xmax", "bbox.ymax")
    if any(name not in index for name in needed):
        return list(range(metadata.num_row_groups))

    selected: list[int] = []
    for group in range(metadata.num_row_groups):
        row_group = metadata.row_group(group)
        stats = {name: row_group.column(index[name]).statistics for name in needed}
        if any(s is None or not s.has_min_max for s in stats.values()):
            selected.append(group)
            continue
        group_box: BBox = (
            stats["bbox.xmin"].min,
            stats["bbox.ymin"].min,
            stats["bbox.xmax"].max,
            stats["bbox.ymax"].max,
        )
        if bbox_intersects(group_box, bbox):
            selected.append(group)
    return selected


def rows_in_bbox(table: Any, bbox: BBox) -> list[dict[str, Any]]:
    """Tablodaki satırlardan kutuyla kesişenleri sözlük olarak döndürür."""
    rows = table.to_pylist()
    kept = []
    for row in rows:
        box = row["bbox"]
        if box and bbox_intersects((box["xmin"], box["ymin"], box["xmax"], box["ymax"]), bbox):
            kept.append(row)
    return kept


def read_features(source: Any, bbox: BBox) -> list[dict[str, Any]]:
    """Parquet dosyasından (dosya nesnesi ya da yol) `bbox` ile kesişen özellikleri okur;
    yalnızca ilgili satır gruplarına dokunur."""
    parquet = pq.ParquetFile(source)
    groups = row_groups_for_bbox(parquet.metadata, bbox)
    if not groups:
        return []
    columns = [c for c in COLUMNS if c in parquet.schema_arrow.names]
    return rows_in_bbox(parquet.read_row_groups(groups, columns=columns), bbox)


def to_geojson_feature(row: dict[str, Any]) -> dict[str, Any]:
    """Overture satırını (WKB geometri) GeoJSON Feature'a çevirir."""
    names = row.get("names") or {}
    return {
        "type": "Feature",
        "properties": {
            "id": row.get("id"),
            "name": names.get("primary"),
            "subtype": row.get("subtype"),
            "class": row.get("class"),
            "is_salt": row.get("is_salt"),
            "is_intermittent": row.get("is_intermittent"),
        },
        "geometry": mapping(shapely.from_wkb(row["geometry"])),
    }


# -- ağ ------------------------------------------------------------------------


def list_parquet_files(prefix: str, opener: Callable[..., Any] = urllib.request.urlopen) -> list[str]:
    """`prefix` altındaki Parquet dosyalarının S3 anahtarları (sayfalama dahil)."""
    quoted = urllib.parse.quote(prefix, safe="/")
    keys: list[str] = []
    token: str | None = None
    while True:
        url = f"{BUCKET_URL}?list-type=2&prefix={quoted}&max-keys=1000"
        if token:
            url += f"&continuation-token={urllib.parse.quote(token)}"
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with opener(request, timeout=60) as response:
            text = response.read().decode("utf-8")
        keys += re.findall(r"<Key>([^<]+)</Key>", text)
        match = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", text)
        if not match:
            return [k for k in keys if k.endswith(".parquet")]
        token = match.group(1)


def list_water_files(release: str = OVERTURE_RELEASE, opener: Callable[..., Any] = urllib.request.urlopen) -> list[str]:
    """Yayındaki `water` Parquet dosyalarının S3 anahtarları (sayfalama dahil)."""
    return list_parquet_files(WATER_PREFIX.format(release=release), opener)


def extract_water(
    bbox: BBox,
    keys: Iterable[str],
    open_file: Callable[[str], HttpRangeFile] = lambda key: HttpRangeFile(BUCKET_URL + urllib.parse.quote(key, safe="/=")),
    log: Callable[[str], None] = print,
) -> tuple[list[dict[str, Any]], int]:
    """Tüm dosyalardaki `bbox` ile kesişen su özelliklerini toplar. Dönüş: (özellikler, indirilen bayt)."""
    features: list[dict[str, Any]] = []
    downloaded = 0
    keys = list(keys)
    for index, key in enumerate(keys, start=1):
        file = open_file(key)
        rows = read_features(file, bbox)
        downloaded += file.bytes_downloaded
        if rows:
            log(f"  [{index}/{len(keys)}] {key.rsplit('/', 1)[-1][:24]}…: {len(rows)} özellik ({file.bytes_downloaded / 1e6:.1f} MB)")
            features += [to_geojson_feature(row) for row in rows]
    return features, downloaded


def main(argv: list[str]) -> int:
    region_id = argv[1] if len(argv) > 1 else DEFAULT_REGION
    bbox = tuple(load_region(region_id)["bbox"])
    print(f"{region_id}: Overture {OVERTURE_RELEASE} su katmanı, bbox {bbox}")

    keys = list_water_files()
    print(f"  {len(keys)} dosya taranıyor (yalnızca altbilgiler ve ilgili satır grupları indirilir)")
    features, downloaded = extract_water(bbox, keys)  # type: ignore[arg-type]

    dest = RAW_WATER / f"{region_id}.geojson"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        json.dumps({"type": "FeatureCollection", "overture_release": OVERTURE_RELEASE, "features": features}, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Tamam: {len(features)} özellik, {downloaded / 1e6:.1f} MB indirildi → {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
