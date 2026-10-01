#!/usr/bin/env python3
"""Overture Maps `base/land_cover` katmanından (ESA WorldCover 2021 türevi) bölgenin arazi örtüsünü çeker.

Kullanım:  python fetch_landcover.py [dünya-id]      (varsayılan: bati-karadeniz)
Çıktı:     tools/raw/landcover/<bölge-id>.parquet    (WGS84; sütunlar: subtype, geometry [WKB]; commit edilmez)

Overture veri kümesi küresel ve yüzlerce GB'dır; Parquet dosyaları HTTP Range istekleriyle okunur
(bkz. fetch_water.py): yalnızca dosya altbilgileri ve sınır kutusuyla kesişen satır grupları indirilir.

Lisans/atıf: ESA WorldCover 2021, CC-BY-4.0 — © ESA WorldCover project 2021 / Contains modified
Copernicus Sentinel data (2021) processed by ESA WorldCover consortium. Overture Maps Foundation üzerinden.
"""

from __future__ import annotations

import sys
import urllib.parse
from collections import Counter
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

from fetch_dem import load_world
from fetch_water import BBox, BUCKET_URL, OVERTURE_RELEASE, list_parquet_files, row_groups_for_bbox
from rangefile import HttpRangeFile

TOOLS = Path(__file__).resolve().parent
RAW_LANDCOVER = TOOLS / "raw" / "landcover"
DEFAULT_WORLD = "bati-karadeniz"
LANDCOVER_PREFIX = "release/{release}/theme=base/type=land_cover/"
COLUMNS = ["subtype", "geometry", "bbox", "cartography"]
#: Overture arazi örtüsünü çoklu detay düzeyinde tutar: `cartography.min_zoom` < 8 olan satırlar gezegen ölçeğinde
#: sadeleştirilmiş dev çokgenlerdir (tek bir "orman" çokgeni milyonlarca km²'dir). Yalnızca ayrıntılı düzey (>= 8) alınır.
MIN_DETAIL_ZOOM = 8


def empty_table() -> pa.Table:
    return pa.table({"subtype": pa.array([], pa.string()), "geometry": pa.array([], pa.binary())})


def filter_to_bbox(table: pa.Table, bbox: BBox) -> pa.Table:
    """Satırlardan sınır kutusu `bbox` ile kesişen ve ayrıntılı düzeyde olanları tutar (yalnızca subtype, geometry kalır)."""
    box = table.column("bbox")
    keep = pc.and_(
        pc.and_(
            pc.less_equal(pc.struct_field(box, "xmin"), bbox[2]),
            pc.greater_equal(pc.struct_field(box, "xmax"), bbox[0]),
        ),
        pc.and_(
            pc.less_equal(pc.struct_field(box, "ymin"), bbox[3]),
            pc.greater_equal(pc.struct_field(box, "ymax"), bbox[1]),
        ),
    )
    if "cartography" in table.column_names:
        detailed = pc.greater_equal(pc.struct_field(table.column("cartography"), "min_zoom"), MIN_DETAIL_ZOOM)
        keep = pc.and_(keep, pc.fill_null(detailed, False))
    return table.filter(keep).select(["subtype", "geometry"])


def read_landcover(source: Any, bbox: BBox) -> pa.Table:
    """Parquet dosyasından (dosya nesnesi ya da yol) `bbox` ile kesişen satırları okur;
    yalnızca ilgili satır gruplarına dokunur."""
    parquet = pq.ParquetFile(source)
    groups = row_groups_for_bbox(parquet.metadata, bbox)
    if not groups:
        return empty_table()
    columns = [name for name in COLUMNS if name in parquet.schema_arrow.names]
    return filter_to_bbox(parquet.read_row_groups(groups, columns=columns), bbox)


def extract_landcover(
    bbox: BBox,
    keys: Iterable[str],
    open_file: Callable[[str], HttpRangeFile] = lambda key: HttpRangeFile(BUCKET_URL + urllib.parse.quote(key, safe="/=")),
    log: Callable[[str], None] = print,
) -> tuple[pa.Table, int]:
    """Tüm dosyalardaki `bbox` ile kesişen arazi örtüsünü toplar. Dönüş: (tablo, indirilen bayt)."""
    tables: list[pa.Table] = []
    downloaded = 0
    keys = list(keys)
    for index, key in enumerate(keys, start=1):
        file = open_file(key)
        table = read_landcover(file, bbox)
        downloaded += file.bytes_downloaded
        if table.num_rows:
            log(f"  [{index}/{len(keys)}] {key.rsplit('/', 1)[-1][:24]}…: {table.num_rows} çokgen ({file.bytes_downloaded / 1e6:.1f} MB)")
            tables.append(table)
    if not tables:
        return empty_table(), downloaded
    return pa.concat_tables(tables), downloaded


def main(argv: list[str]) -> int:
    world_id = argv[1] if len(argv) > 1 else DEFAULT_WORLD
    bbox = tuple(load_world(world_id)["bbox"])
    print(f"{world_id}: Overture {OVERTURE_RELEASE} arazi örtüsü (ESA WorldCover), bbox {bbox}")

    keys = list_parquet_files(LANDCOVER_PREFIX.format(release=OVERTURE_RELEASE))
    print(f"  {len(keys)} dosya taranıyor (yalnızca altbilgiler ve ilgili satır grupları indirilir)")
    table, downloaded = extract_landcover(bbox, keys)  # type: ignore[arg-type]

    dest = RAW_LANDCOVER / f"{world_id}.parquet"
    dest.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, dest, compression="zstd")
    counts = Counter(table.column("subtype").to_pylist())
    print(f"Tamam: {table.num_rows} çokgen, {downloaded / 1e6:.1f} MB indirildi → {dest}")
    print("  türler: " + ", ".join(f"{name}={count}" for name, count in counts.most_common()))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
