import json

import pytest
from pyproj import Transformer

import features as fe
import regionlib

TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32636", always_xy=True)


@pytest.fixture(scope="module")
def grid():
    """Orta meridyen yakınında (33°D, 41,5°K) 20×20 km'lik ızgara."""
    e, n = TO_UTM.transform(33.0, 41.5)
    return regionlib.grid_for_bounds(e - 10_000, n - 10_000, e + 10_000, n + 10_000, cell=100, margin=0)


def feature(subtype, klass, geometry, **props):
    properties = {"name": None, "is_salt": None, "is_intermittent": None, "subtype": subtype, "class": klass}
    properties.update(props)
    return {"type": "Feature", "properties": properties, "geometry": geometry}


def line(*coords):
    return {"type": "LineString", "coordinates": [list(c) for c in coords]}


def poly(*rings):
    return {"type": "Polygon", "coordinates": [[list(c) for c in ring] for ring in rings]}


def square(lon, lat, d=0.01):
    return [(lon - d, lat - d), (lon + d, lat - d), (lon + d, lat + d), (lon - d, lat + d), (lon - d, lat - d)]


def collection(*features):
    return {"type": "FeatureCollection", "features": list(features)}


class TestClassify:
    def test_lines(self):
        assert fe.classify({"subtype": "river", "class": "river"}, "LineString") == "river"
        assert fe.classify({"subtype": "stream", "class": "stream"}, "LineString") == "stream"
        assert fe.classify({"subtype": "canal", "class": "canal"}, "LineString") == "canal"

    def test_excluded_lines(self):
        assert fe.classify({"subtype": "canal", "class": "ditch"}, "LineString") is None
        assert fe.classify({"subtype": "canal", "class": "drain"}, "LineString") is None

    def test_polygons(self):
        for subtype in ("lake", "reservoir", "pond", "water"):
            assert fe.classify({"subtype": subtype, "class": subtype}, "Polygon") == subtype

    def test_excluded_polygons(self):
        assert fe.classify({"subtype": "water", "class": "wastewater"}, "Polygon") is None
        assert fe.classify({"subtype": "human_made", "class": "swimming_pool"}, "Polygon") is None
        assert fe.classify({"subtype": "ocean", "class": "ocean", "is_salt": True}, "Polygon") is None
        assert fe.classify({"subtype": "lake", "class": "lake", "is_salt": True}, "Polygon") is None

    def test_points(self):
        assert fe.classify({"subtype": "spring", "class": "spring"}, "Point") == "spring"
        assert fe.classify({"subtype": "spring", "class": "hot_spring"}, "Point") is None
        assert fe.classify({"subtype": "physical", "class": "waterfall"}, "Point") is None


class TestBuildFeatures:
    def test_line_becomes_game_coordinates(self, grid):
        fc = collection(feature("river", "river", line((32.99, 41.50), (33.00, 41.50), (33.01, 41.50)), name="Test Çayı"))
        out = fe.build_features(fc, grid)["water"]["lines"]
        assert len(out) == 1
        assert out[0]["kind"] == "river" and out[0]["name"] == "Test Çayı"
        xz = out[0]["xz"]
        # İlk köşe: (32.99, 41.50) → oyun x,z
        e, n = TO_UTM.transform(32.99, 41.50)
        x, z = regionlib.utm_to_game(e, n, grid.origin_e, grid.origin_n)
        assert xz[0] == pytest.approx(x, abs=0.02)
        assert xz[1] == pytest.approx(z, abs=0.02)
        # Doğuya gidiyor → x artıyor
        assert xz[-2] > xz[0]
        assert all(round(v, 2) == v for v in xz)

    def test_filtered_out_kinds_are_dropped(self, grid):
        fc = collection(
            feature("canal", "ditch", line((32.99, 41.5), (33.01, 41.5))),
            feature("human_made", "swimming_pool", poly(square(33.0, 41.5))),
            feature("ocean", "ocean", poly(square(33.0, 41.5)), is_salt=True),
            feature("physical", "waterfall", {"type": "Point", "coordinates": [33.0, 41.5]}),
        )
        out = fe.build_features(fc, grid)["water"]
        assert out == {"lines": [], "polygons": [], "points": []}

    def test_polygon_with_hole(self, grid):
        outer = square(33.0, 41.5, 0.02)
        hole = square(33.0, 41.5, 0.005)
        fc = collection(feature("lake", "lake", poly(outer, hole), name="Göl"))
        polygons = fe.build_features(fc, grid)["water"]["polygons"]
        assert len(polygons) == 1
        assert len(polygons[0]["rings"]) == 2  # dış + delik
        assert polygons[0]["kind"] == "lake"

    def test_tiny_features_are_dropped(self, grid):
        tiny_line = line((33.0, 41.5), (33.00005, 41.5))  # ~4 m
        tiny_pond = poly(square(33.0, 41.5, 0.0001))  # ~ 250 m²
        out = fe.build_features(collection(feature("stream", "stream", tiny_line), feature("pond", "pond", tiny_pond)), grid)["water"]
        assert out["lines"] == [] and out["polygons"] == []

    def test_lines_are_clipped_to_grid(self, grid):
        # 33°D civarı ±10 km ≈ ±0,12°; çizgi ızgaranın çok dışına uzanıyor
        fc = collection(feature("river", "river", line((32.0, 41.5), (34.0, 41.5))))
        xz = fe.build_features(fc, grid)["water"]["lines"][0]["xz"]
        half = (grid.right - grid.left) / 2 / regionlib.HORIZONTAL_SCALE + fe.CLIP_PADDING_M / regionlib.HORIZONTAL_SCALE
        assert max(abs(v) for v in xz[0::2]) <= half + 1
        assert len(xz) <= 8  # uzun çizgi kırpılıp sadeleşti

    def test_feature_outside_grid_is_dropped(self, grid):
        fc = collection(feature("river", "river", line((30.0, 41.5), (30.1, 41.5))))
        assert fe.build_features(fc, grid)["water"]["lines"] == []

    def test_spring_point(self, grid):
        fc = collection(
            feature("spring", "spring", {"type": "Point", "coordinates": [33.0, 41.5]}, name="Kaynak"),
            feature("spring", "spring", {"type": "Point", "coordinates": [10.0, 10.0]}),  # dışarıda
        )
        points = fe.build_features(fc, grid)["water"]["points"]
        assert len(points) == 1
        assert points[0]["kind"] == "spring" and points[0]["name"] == "Kaynak"
        assert abs(points[0]["x"]) < 2 and abs(points[0]["z"]) < 2  # orijine yakın

    def test_intermittent_flag(self, grid):
        fc = collection(feature("stream", "stream", line((32.99, 41.5), (33.01, 41.5)), is_intermittent=True))
        assert fe.build_features(fc, grid)["water"]["lines"][0]["intermittent"] is True

    def test_output_is_deterministic_regardless_of_input_order(self, grid):
        a = feature("river", "river", line((32.99, 41.50), (33.01, 41.50)), name="A")
        b = feature("stream", "stream", line((32.99, 41.51), (33.01, 41.51)), name="B")
        c = feature("lake", "lake", poly(square(33.0, 41.49)), name="C")
        one = fe.build_features(collection(a, b, c), grid)
        two = fe.build_features(collection(c, b, a), grid)
        assert json.dumps(one) == json.dumps(two)


def test_mixed_missing_values_do_not_break_classification_or_names(grid):
    """pandas karışık None/dolu sütunları NaN yapar; adsız özellik adsız, tuzsuz özellik kalmalı."""
    fc = collection(
        feature("river", "river", line((32.99, 41.50), (33.01, 41.50)), name="Adlı Çay", is_salt=None, is_intermittent=False),
        feature("stream", "stream", line((32.99, 41.51), (33.01, 41.51)), name=None, is_salt=None, is_intermittent=None),
        feature("ocean", "ocean", poly(square(33.0, 41.49)), name=None, is_salt=True),
    )
    lines = fe.build_features(fc, grid)["water"]["lines"]
    assert [item.get("name") for item in lines] == ["Adlı Çay", None]  # sıralama: (tür, ad); river < stream
    assert all("intermittent" not in item for item in lines)  # False ve None bayrak koymaz
    assert not any(isinstance(item.get("name"), float) for item in lines)
