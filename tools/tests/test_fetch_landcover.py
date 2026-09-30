import io

import pyarrow as pa
import pyarrow.parquet as pq
import shapely

import fetch_landcover as fl
from rangefile import HttpRangeFile
from rangeserver import serve

BBOX = (31.2, 40.75, 33.25, 41.95)


def make_row(subtype, lon, lat, size=0.01, min_zoom=8):
    polygon = shapely.box(lon, lat, lon + size, lat + size)
    x0, y0, x1, y1 = polygon.bounds
    return {
        "id": f"{subtype}{lon}{lat}",
        "subtype": subtype,
        "geometry": shapely.to_wkb(polygon),
        "bbox": {"xmin": x0, "ymin": y0, "xmax": x1, "ymax": y1},
        "cartography": {"prominence": None, "min_zoom": min_zoom, "max_zoom": 15, "sort_key": 2},
    }


def parquet_bytes(rows, row_group_size=50):
    sink = io.BytesIO()
    pq.write_table(pa.Table.from_pylist(rows), sink, row_group_size=row_group_size)
    return sink.getvalue()


def dataset():
    far = [make_row("forest", -100 + i * 0.05, 30 + i * 0.05) for i in range(200)]
    inside = [make_row("forest", 32.0, 41.2), make_row("crop", 32.5, 41.3)]
    edge = [make_row("grass", 33.24, 41.9, size=0.05)]  # kutuyu kısmen kesen çokgen
    return parquet_bytes(far + inside + edge)


def test_read_landcover_returns_only_intersecting_rows():
    table = fl.read_landcover(io.BytesIO(dataset()), BBOX)
    assert table.column_names == ["subtype", "geometry"]
    assert sorted(table.column("subtype").to_pylist()) == ["crop", "forest", "grass"]


def test_coarse_zoom_rows_are_dropped():
    """min_zoom < 8 satırları gezegen ölçeğinde sadeleştirilmiş dev çokgenlerdir; alınmaz."""
    coarse = make_row("forest", 30.0, 40.0, size=10, min_zoom=0)  # bölgeyi kaplayan dev çokgen
    detailed = make_row("crop", 32.0, 41.2)
    table = fl.read_landcover(io.BytesIO(parquet_bytes([coarse, detailed])), BBOX)
    assert table.column("subtype").to_pylist() == ["crop"]


def test_missing_cartography_column_keeps_rows():
    row = make_row("forest", 32.0, 41.2)
    del row["cartography"]
    table = fl.read_landcover(io.BytesIO(parquet_bytes([row])), BBOX)
    assert table.num_rows == 1


def test_read_landcover_outside_returns_empty_table_with_schema():
    table = fl.read_landcover(io.BytesIO(dataset()), (100, -50, 101, -49))
    assert table.num_rows == 0
    assert table.column_names == ["subtype", "geometry"]


def test_extract_landcover_over_multiple_files():
    data = dataset()
    empty = parquet_bytes([make_row("forest", -70, 10)])
    httpd, base, _ = serve({"/a.parquet": data, "/b.parquet": empty})
    try:
        logs: list[str] = []
        table, downloaded = fl.extract_landcover(
            BBOX,
            ["a.parquet", "b.parquet"],
            open_file=lambda key: HttpRangeFile(f"{base}/{key}", block_size=1024, sleep=lambda _: None),
            log=logs.append,
        )
        assert table.num_rows == 3
        assert downloaded > 0
        assert len(logs) == 1  # yalnızca sonuç veren dosya raporlanır
    finally:
        httpd.shutdown()


def test_extract_landcover_with_no_matches_is_empty():
    httpd, base, _ = serve({"/a.parquet": parquet_bytes([make_row("forest", -70, 10)])})
    try:
        table, _ = fl.extract_landcover(
            BBOX,
            ["a.parquet"],
            open_file=lambda key: HttpRangeFile(f"{base}/{key}", block_size=1024, sleep=lambda _: None),
            log=lambda _: None,
        )
        assert table.num_rows == 0
    finally:
        httpd.shutdown()
