"""build_region.build() için uçtan uca test: sentetik DEM + sentetik il sınırları.

DEM, bilinen doğrusal bir yüzeydir (yükseklik = f(boylam, enlem)); böylece çıktı
heightmap'inde her pikselin beklenen değeri bağımsız olarak hesaplanabilir. Bu, satır/sütun
yönünü, georeferansı ve nicemlemeyi birlikte doğrular.
"""

import json
from pathlib import Path

import numpy as np
import pytest
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin

import build_region
import regionlib

# 1°×1° sentetik karo: boylam 32–33, enlem 41–42; ~0.01° piksel
LON0, LAT0, PIXEL = 32.0, 42.0, 0.01
REGION = {
    "name": "Test Bölgesi",
    "provinces": ["A"],
    "neighbors": ["B"],
    "bbox": [32.1, 41.1, 32.95, 41.9],
    "margin_m": 1000,
    "cell_size": 1000,
}


def elevation_at(lon, lat):
    """Doğrusal yüzey: doğuya ve kuzeye doğru yükselir (metre)."""
    return 1000.0 * (lat - 41.0) + 500.0 * (lon - 32.0)


def rect(x0, y0, x1, y1):
    return {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}


def write_boundaries(path: Path) -> None:
    """A (hedef) ve doğusundaki komşu B."""
    path.write_text(json.dumps({
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": [
            {"type": "Feature", "properties": {"shapeName": "A", "shapeISO": "T-1"}, "geometry": rect(32.3, 41.3, 32.6, 41.6)},
            {"type": "Feature", "properties": {"shapeName": "B", "shapeISO": "T-2"}, "geometry": rect(32.6, 41.3, 32.9, 41.6)},
        ],
    }))


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    root = tmp_path_factory.mktemp("region")

    # DEM karosu
    size = round(1 / PIXEL)
    lons = LON0 + (np.arange(size) + 0.5) * PIXEL
    lats = LAT0 - (np.arange(size) + 0.5) * PIXEL
    data = elevation_at(lons[None, :], lats[:, None]).astype(np.float32)
    dem = root / "tile.tif"
    with rasterio.open(
        dem, "w", driver="GTiff", height=size, width=size, count=1, dtype="float32",
        crs="EPSG:4326", transform=from_origin(LON0, LAT0, PIXEL, PIXEL),
    ) as dst:
        dst.write(data, 1)

    boundaries = root / "b.geojson"
    write_boundaries(boundaries)

    out = root / "out"
    meta = build_region.build("test", REGION, [dem], boundaries, out)
    return out, meta


def test_meta_contract(built):
    out, meta = built
    on_disk = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert on_disk == meta
    assert meta["crs"] == "EPSG:32636"
    assert meta["elevationEncoding"] == "uint16"
    assert meta["elevationMin"] == 0
    assert meta["horizontalScale"] == regionlib.HORIZONTAL_SCALE
    assert meta["cellSizeReal"] == 1000
    assert len(meta["originUtm"]) == 2


def test_heightmap_size_matches_grid(built):
    out, meta = built
    raw = (out / "heightmap.bin").read_bytes()
    assert len(raw) == meta["gridWidth"] * meta["gridHeight"] * 2


def test_heightmap_values_match_known_surface(built):
    """Her pikselin yüksekliği, piksel merkezinin (boylam, enlem) değerine eşit olmalı."""
    out, meta = built
    w, h = meta["gridWidth"], meta["gridHeight"]
    q = np.frombuffer((out / "heightmap.bin").read_bytes(), dtype="<u2").reshape(h, w)
    elevation = regionlib.dequantize_elevation(q, meta["elevationMin"], meta["elevationMax"])

    oe, on = meta["originUtm"]
    grid = regionlib.Grid(w, h, meta["cellSizeReal"], oe, on)
    to_lonlat = Transformer.from_crs("EPSG:32636", "EPSG:4326", always_xy=True)

    checked = 0
    for row in range(3, h - 3, 2):
        for col in range(3, w - 3, 2):
            e = grid.left + (col + 0.5) * grid.cell
            n = grid.top - (row + 0.5) * grid.cell
            lon, lat = to_lonlat.transform(e, n)
            # Doğrusal yüzey + alan ortalaması ≈ merkez değeri (küçük dönüşüm farkıyla)
            assert elevation[row, col] == pytest.approx(elevation_at(lon, lat), abs=4.0)
            checked += 1
    assert checked > 50


def test_north_is_row_zero_and_east_is_last_column(built):
    out, meta = built
    w, h = meta["gridWidth"], meta["gridHeight"]
    q = np.frombuffer((out / "heightmap.bin").read_bytes(), dtype="<u2").reshape(h, w)
    # Yüzey kuzeye ve doğuya yükselir → satır 0 (kuzey) ve son sütun (doğu) daha yüksek
    assert q[0, w // 2] > q[h - 1, w // 2]
    assert q[h // 2, w - 1] > q[h // 2, 0]


def test_provinces_are_in_game_coordinates_with_flags(built):
    out, meta = built
    fc = json.loads((out / "provinces.geojson").read_text(encoding="utf-8"))
    by_name = {f["properties"]["name"]: f for f in fc["features"]}
    assert by_name["A"]["properties"]["inRegion"] is True
    assert by_name["B"]["properties"]["inRegion"] is False

    def bounds(feature):
        pts = np.array(feature["geometry"]["coordinates"][0])
        return pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max()

    ax0, az0, ax1, az1 = bounds(by_name["A"])
    bx0, _, bx1, _ = bounds(by_name["B"])
    assert ax0 < ax1 and az0 < az1
    # B, A'nın doğusundadır. (UTM'de meridyenler hafif eğik olduğundan uç değerler değil,
    # merkezler ve örtüşme karşılaştırılır.)
    assert (bx0 + bx1) / 2 > (ax0 + ax1) / 2
    assert bx0 <= ax1 + 1  # komşular kenarda birleşir (boşluk yok)
    # A'nın merkezi yaklaşık grid merkezine yakın; oyun koordinatları birkaç km/50 mertebesinde
    assert abs((ax0 + ax1) / 2) < 3000 / regionlib.HORIZONTAL_SCALE * 5
    # Koordinatlar 2 ondalığa yuvarlanmış
    for x, z in by_name["A"]["geometry"]["coordinates"][0]:
        assert round(x, 2) == x and round(z, 2) == z


def test_missing_province_fails_loudly(tmp_path):
    boundaries = tmp_path / "b.geojson"
    write_boundaries(boundaries)
    bad = dict(REGION, provinces=["YOK"])
    with pytest.raises(SystemExit, match="bulunamadı"):
        build_region.build("x", bad, [], boundaries, tmp_path / "out")


def test_grid_outside_bbox_is_rejected():
    grid = regionlib.Grid(width=10, height=10, cell=100_000, origin_e=500_000, origin_n=4_600_000)
    with pytest.raises(SystemExit):
        build_region.check_grid_inside_bbox(grid, [32.0, 41.0, 32.5, 41.5])


def test_build_writes_features_json_when_water_given(tmp_path):
    """build(water_path=…) features.json ve meta alanlarını üretir."""
    root = tmp_path
    size = round(1 / PIXEL)
    lons = LON0 + (np.arange(size) + 0.5) * PIXEL
    lats = LAT0 - (np.arange(size) + 0.5) * PIXEL
    data = elevation_at(lons[None, :], lats[:, None]).astype(np.float32)
    dem = root / "tile.tif"
    with rasterio.open(
        dem, "w", driver="GTiff", height=size, width=size, count=1, dtype="float32",
        crs="EPSG:4326", transform=from_origin(LON0, LAT0, PIXEL, PIXEL),
    ) as dst:
        dst.write(data, 1)
    boundaries = root / "b.geojson"
    write_boundaries(boundaries)
    water = root / "w.geojson"
    water.write_text(json.dumps({
        "type": "FeatureCollection",
        "overture_release": "2026-09-23.1",
        "features": [{
            "type": "Feature",
            "properties": {"name": "Deneme Çayı", "subtype": "river", "class": "river", "is_salt": None, "is_intermittent": None},
            "geometry": {"type": "LineString", "coordinates": [[32.35, 41.35], [32.45, 41.45], [32.55, 41.55]]},
        }],
    }))

    out = root / "out"
    meta = build_region.build("test", REGION, [dem], boundaries, out, water)
    assert meta["features"] == ["water"]
    assert "Overture Maps (OpenStreetMap)" in meta["sources"]
    assert meta["overtureRelease"] == "2026-09-23.1"
    features = json.loads((out / "features.json").read_text(encoding="utf-8"))
    assert features["version"] == 1
    assert features["water"]["lines"][0]["name"] == "Deneme Çayı"
    # Kuzeydoğuya akıyor: x artar, z azalır (−Z kuzey)
    xz = features["water"]["lines"][0]["xz"]
    assert xz[-2] > xz[0] and xz[-1] < xz[1]


def test_build_without_water_has_no_features(built):
    out, meta = built
    assert "features" not in meta
    assert not (out / "features.json").exists()
