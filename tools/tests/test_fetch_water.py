import io

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
import shapely

import fetch_water as fw
from rangefile import HttpRangeFile
from rangeserver import serve

BBOX = (31.2, 40.75, 33.25, 41.95)


def wkb(geom) -> bytes:
    return shapely.to_wkb(geom)


def make_row(i, name, lon, lat, subtype="river", vertices=2):
    """`lon, lat` çevresinde küçük bir çizgi (`vertices` köşeli) ve tutarlı bbox."""
    line = shapely.LineString([(lon + 0.01 * k / (vertices - 1), lat + 0.01 * k / (vertices - 1)) for k in range(vertices)])
    x0, y0, x1, y1 = line.bounds
    return {
        "id": f"id{i}",
        "names": {"primary": name},
        "subtype": subtype,
        "class": subtype,
        "is_salt": None,
        "is_intermittent": None,
        "geometry": wkb(line),
        "bbox": {"xmin": x0, "ymin": y0, "xmax": x1, "ymax": y1},
    }


def parquet_bytes(rows, row_group_size=50):
    table = pa.Table.from_pylist(rows)
    sink = io.BytesIO()
    pq.write_table(table, sink, row_group_size=row_group_size)
    return sink.getvalue()


def test_bbox_intersects():
    assert fw.bbox_intersects((0, 0, 2, 2), (1, 1, 3, 3))
    assert fw.bbox_intersects((0, 0, 1, 1), (1, 1, 2, 2))  # kenar teması
    assert not fw.bbox_intersects((0, 0, 1, 1), (2, 2, 3, 3))


@pytest.fixture(scope="module")
def dataset():
    """Uzaktaki (Avrupa/Amerika) 400 çok köşeli özellik (~1,3 MB) + bölge içinde 3 özellik; satır grupları konuma göre sıralı."""
    far = [make_row(i, f"uzak{i}", -100 + i * 0.05, 30 + i * 0.05, vertices=200) for i in range(400)]
    inside = [make_row(1000 + i, f"yakın{i}", 32.0 + i * 0.2, 41.2) for i in range(3)]
    return parquet_bytes(far + inside, row_group_size=50)


def test_row_group_pruning_uses_bbox_statistics(dataset):
    meta = pq.ParquetFile(io.BytesIO(dataset)).metadata
    assert meta.num_row_groups == 9  # 403 satır / 50
    groups = fw.row_groups_for_bbox(meta, BBOX)
    assert groups == [8]  # yalnızca son grup bölgeye değiyor


def test_read_features_returns_only_intersecting_rows(dataset):
    rows = fw.read_features(io.BytesIO(dataset), BBOX)
    assert sorted(r["names"]["primary"] for r in rows) == ["yakın0", "yakın1", "yakın2"]


def test_read_features_outside_returns_empty(dataset):
    assert fw.read_features(io.BytesIO(dataset), (100, -50, 101, -49)) == []


def test_missing_bbox_stats_keeps_all_row_groups():
    table = pa.Table.from_pylist([{"id": "a", "x": 1}])
    sink = io.BytesIO()
    pq.write_table(table, sink)
    meta = pq.ParquetFile(io.BytesIO(sink.getvalue())).metadata
    assert fw.row_groups_for_bbox(meta, BBOX) == [0]


def test_to_geojson_feature_roundtrips_geometry_and_properties():
    row = make_row(1, "Filyos Çayı", 32.0, 41.5)
    feature = fw.to_geojson_feature(row)
    assert feature["properties"]["name"] == "Filyos Çayı"
    assert feature["properties"]["subtype"] == "river"
    assert feature["geometry"]["type"] == "LineString"
    assert feature["geometry"]["coordinates"][0] == (32.0, 41.5)


def test_range_reading_downloads_far_less_than_the_file(dataset):
    """Asıl amaç: yalnızca altbilgi + ilgili satır grubu indirilir."""
    httpd, base, handler = serve({"/part.parquet": dataset})
    try:
        f = HttpRangeFile(base + "/part.parquet", block_size=1024, sleep=lambda _: None)
        rows = fw.read_features(f, BBOX)
        assert len(rows) == 3
        assert f.bytes_downloaded < len(dataset) * 0.15  # dosyanın küçük bir bölümü
    finally:
        httpd.shutdown()


def test_extract_water_over_multiple_files(dataset):
    empty = parquet_bytes([make_row(1, "uzak", -70, 10)])
    httpd, base, _ = serve({"/a.parquet": dataset, "/b.parquet": empty})
    try:
        logs = []
        features, downloaded = fw.extract_water(
            BBOX,
            ["a.parquet", "b.parquet"],
            open_file=lambda key: HttpRangeFile(f"{base}/{key}", block_size=1024, sleep=lambda _: None),
            log=logs.append,
        )
        assert [f["properties"]["name"] for f in features] == ["yakın0", "yakın1", "yakın2"]
        assert downloaded > 0
        assert len(logs) == 1  # yalnızca sonuç veren dosya raporlanır
    finally:
        httpd.shutdown()


def test_list_water_files_paginates_and_filters_parquet():
    pages = {
        None: "<Key>a/part-0.parquet</Key><Key>a/readme.txt</Key><NextContinuationToken>T1</NextContinuationToken>",
        "T1": "<Key>a/part-1.parquet</Key>",
    }
    seen = []

    class Response(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def opener(request, timeout=0):
        url = request.full_url
        seen.append(url)
        token = None
        if "continuation-token=T1" in url:
            token = "T1"
        return Response(pages[token].encode())

    keys = fw.list_water_files("2026-09-23.1", opener=opener)
    assert keys == ["a/part-0.parquet", "a/part-1.parquet"]
    assert len(seen) == 2
    assert "theme%3Dbase/type%3Dwater" in seen[0]
