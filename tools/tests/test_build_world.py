"""build_world için testler: komşu il seçimi (saf) ve sentetik DEM/il/su/örtü ile uçtan uca karo üretimi."""

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
import rasterio
import shapely
from pyproj import Transformer
from rasterio.transform import from_origin
from shapely.geometry import box

import build_world
import landcover as landcover_lib
import worldlib as wl

LON0, LAT0, PIXEL = 32.0, 42.0, 0.0005  # 1°×1° sentetik DEM karosu (~50 m piksel: 100 m hücreden ince)
CONFIG = {
    "name": "Test Dünyası",
    "provinces": ["A"],
    "neighbors": "auto",
    "neighbor_min_area_km2": 1,
    "bbox": [32.1, 41.1, 32.95, 41.9],
    "margin_m": 1000,
    "cell_size": 100,
}


def elevation_at(lon, lat):
    return 1000.0 * (lat - 41.0) + 500.0 * (lon - 32.0)


def rect(x0, y0, x1, y1):
    return {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}


def prov(name, geometry):
    return {"type": "Feature", "properties": {"shapeName": name, "shapeISO": f"T-{name}"}, "geometry": geometry}


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    root = tmp_path_factory.mktemp("world")
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
    boundaries.write_text(json.dumps({
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": [
            prov("A", rect(32.3, 41.3, 32.6, 41.6)),
            prov("B", rect(32.6, 41.3, 32.9, 41.6)),  # doğu komşusu
            prov("Sliver", rect(32.2999, 41.6, 32.31, 41.61)),  # ızgaraya değen ama çok küçük parça (< 1 km²)
            prov("Uzak", rect(30.0, 39.0, 30.2, 39.2)),  # ızgaranın dışında
        ],
    }))

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

    cover = root / "lc.parquet"
    pq.write_table(
        pa.table({
            "subtype": ["forest", "crop"],
            "geometry": pa.array(
                [shapely.to_wkb(box(32.3, 41.3, 32.45, 41.6)), shapely.to_wkb(box(32.45, 41.3, 32.6, 41.6))],
                pa.binary(),
            ),
        }),
        cover,
    )

    out = root / "out"
    manifest, extra = build_world.build("test-world", CONFIG, [dem], boundaries, out, water, cover, built="2026-10-01")
    return out, manifest, extra


def test_manifest_is_valid_and_matches_disk(built):
    out, manifest, extra = built
    on_disk = json.loads((out / "world.json").read_text(encoding="utf-8"))
    assert on_disk == manifest
    wl.validate_manifest(on_disk)
    extent = wl.Extent.from_dict(manifest["extent"])
    assert extent == extra["grid"].extent
    assert extent.col0 % wl.CHUNK_CELLS == 0 and extent.row0 % wl.CHUNK_CELLS == 0
    assert manifest["overtureRelease"] == "2026-09-23.1"
    assert manifest["built"] == "2026-10-01"
    assert manifest["features"] == {"file": "features.json", "layers": ["water"]}
    assert manifest["landcover"]["classes"] == landcover_lib.CLASSES


def test_every_tile_file_exists_with_size_and_sha(built):
    out, manifest, _ = built
    assert len(manifest["tiles"]) == len(wl.tile_coords_of(wl.Extent.from_dict(manifest["extent"])))
    for tile in manifest["tiles"]:
        height = (out / tile["height"]).read_bytes()
        cover = (out / tile["cover"]).read_bytes()
        assert len(height) == tile["bytes"] == 512 * 512 * 2 <= build_world.MAX_TILE_FILE_BYTES
        assert len(cover) == 512 * 512
        assert wl.sha256_hex(height) == tile["sha256"]


def test_world_wide_elevation_range_and_two_pass_quantization(built):
    out, manifest, extra = built
    emax = manifest["elevation"]["max"]
    assert manifest["elevation"]["min"] == 0
    assert emax % 100 == 0  # dünya geneli tek aralık, yukarı 100'e yuvarlı
    assert extra["heights"].max() <= 65535
    # En yüksek örnek yaklaşık gerçek en yüksek (tam aralığın büyük kısmı kullanılır).
    top_m = extra["heights"].max() / 65535 * emax
    assert emax - 100 <= top_m <= emax


def test_assembled_tiles_match_known_surface_at_lattice_positions(built):
    out, manifest, extra = built
    extent = wl.Extent.from_dict(manifest["extent"])
    tiles = {
        (t["tx"], t["ty"]): np.fromfile(out / t["height"], dtype="<u2").reshape(512, 512) for t in manifest["tiles"]
    }
    assembled = wl.assemble(tiles, extent, np.uint16)
    assert np.array_equal(assembled, extra["heights"])

    emax = manifest["elevation"]["max"]
    to_lonlat = Transformer.from_crs("EPSG:32636", "EPSG:4326", always_xy=True)
    grid = extra["grid"]
    checked = 0
    for row in range(3, extent.rows - 3, 9):
        for col in range(3, extent.cols - 3, 9):
            e = grid.left + (col + 0.5) * grid.cell
            n = grid.top - (row + 0.5) * grid.cell
            lon, lat = to_lonlat.transform(e, n)
            meters = assembled[row, col] / 65535 * emax
            assert meters == pytest.approx(elevation_at(lon, lat), abs=4.0)
            checked += 1
    assert checked > 50
    # Satır 0 kuzeyde: yüzey kuzeye yükselir.
    assert assembled[0, extent.cols // 2] > assembled[extent.rows - 1, extent.cols // 2]


def test_lattice_position_of_samples_matches_game_coordinates(built):
    """Izgara köşesinin oyun konumu (gridOrigin) ile UTM'den hesaplanan konum aynıdır."""
    _, manifest, extra = built
    extent = wl.Extent.from_dict(manifest["extent"])
    gx, gz = wl.grid_origin_of(extent)
    grid = extra["grid"]
    x = (grid.left + 0.5 * grid.cell - grid.origin_e) / wl.HORIZONTAL_SCALE
    z = -(grid.top - 0.5 * grid.cell - grid.origin_n) / wl.HORIZONTAL_SCALE
    assert (gx, gz) == (pytest.approx(x), pytest.approx(z))


def test_neighbors_are_auto_selected_and_flagged(built):
    out, _, _ = built
    fc = json.loads((out / "provinces.geojson").read_text(encoding="utf-8"))
    flags = {f["properties"]["name"]: f["properties"]["inRegion"] for f in fc["features"]}
    assert flags == {"A": True, "B": False}  # sliver ve uzak il yok


def test_landcover_classes_and_features_written(built):
    out, manifest, extra = built
    classes = set(np.unique(extra["cover"]).tolist())
    assert landcover_lib.CLASS_INDEX["forest"] in classes and landcover_lib.CLASS_INDEX["crop"] in classes
    features = json.loads((out / "features.json").read_text(encoding="utf-8"))
    assert features["version"] == 1
    assert features["water"]["lines"][0]["name"] == "Deneme Çayı"


def _frame(entries):
    return gpd.GeoDataFrame(
        {"shapeName": [n for n, _ in entries], "shapeISO": ["x"] * len(entries)},
        geometry=[g for _, g in entries],
        crs="EPSG:32636",
    )


def test_select_neighbors_filters_by_area_and_skips_targets():
    grid = wl.LatticeGrid(wl.Extent(0, 0, 100, 100))  # 10 km × 10 km
    left, top = grid.left, grid.top
    frame = _frame([
        ("Hedef", box(left, top - 5000, left + 5000, top)),
        ("Büyük", box(left + 5000, top - 5000, left + 12000, top)),  # 5 km² kesişim
        ("Kucuk", box(left + 9500, top - 500, left + 12000, top)),  # 0,25 km² kesişim
        ("Dışarda", box(left + 20000, top, left + 25000, top + 5000)),
    ])
    assert build_world.select_neighbors(frame, ["Hedef"], grid, 1.0) == ["Büyük"]
    assert build_world.select_neighbors(frame, ["Hedef"], grid, 0.1) == ["Büyük", "Kucuk"]


def test_unknown_world_id_and_cell_size_are_rejected():
    with pytest.raises(SystemExit):
        build_world.load_world_config("yok")


def test_real_world_yaml_is_consistent_with_contract():
    # Ham veri (il sınırları) gerektirmez: türetilmiş bbox yerine yaml'daki üst sınır (`bbox_max`) ve gruplar okunur.
    import regionlib
    import worldconfig

    world = worldconfig.world_entry("bati-karadeniz")
    groups = worldconfig.group_names(world)
    assert groups[0] == "cekirdek"
    # İl listesi grup dosyalarından gelir: çekirdek her zaman tanımlıdır, yeni iller yeni grup dosyalarına eklenir.
    core = worldconfig.load_group("cekirdek")["provinces"]
    assert core == ["Zonguldak", "Bartın", "Karabük", "Düzce", "Bolu", "Kastamonu", "Çankırı", "Sinop", "Sakarya"]
    merged = worldconfig.merge_groups(groups)["provinces"]
    assert merged[: len(core)] == core and len(set(merged)) == len(merged)
    assert "provinces" not in world and "bbox" not in world  # elle yazılmaz
    assert world["neighbors"] == "auto"
    assert world["cell_size"] == wl.CELL_SIZE_REAL
    lon0, lat0, lon1, lat1 = world["bbox_max"]
    assert lon0 < lon1 and lat0 < lat1
    # Üst sınır en azından Faz 11 sonrası dünyayı (7 boylam × 3 enlem = 21 DEM karosu) kapsar.
    assert len(regionlib.tiles_for_bbox(*world["bbox_max"])) >= 21
    # Sabitlenmiş pencereler (eski alanlar) eski DEM mozaiğinde örneklenir: Faz 6/7 pencereleri 8, Kastamonu–Çankırı 15,
    # Sinop–Sakarya (Faz 12 öncesi dünya, dördüncü pencere) 21 karo.
    for _, window_bbox in build_world.PINNED_WINDOWS:
        assert len(regionlib.tiles_for_bbox(*window_bbox)) in (8, 15, 21)


def test_missing_province_fails_loudly():
    frame = gpd.GeoDataFrame({"shapeName": ["A"], "geometry": [box(0, 0, 1, 1)]}, crs=wl.CRS)
    with pytest.raises(SystemExit, match="bulunamadı"):
        build_world.select_provinces(frame, ["YOK"])


def test_grid_outside_bbox_is_rejected():
    grid = wl.grid_for_lattice(500_000, 4_600_000, 700_000, 4_800_000, 0)
    with pytest.raises(SystemExit):
        build_world.check_grid_inside_bbox(grid, [32.0, 41.0, 32.5, 41.5])
