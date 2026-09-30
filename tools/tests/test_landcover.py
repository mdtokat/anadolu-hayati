"""landcover.rasterize_landcover: çokgenler → sınıf ızgarası (yön, öncelik, eşik, determinizm)."""

import numpy as np
import pytest
import shapely
from pyproj import Transformer
from shapely.geometry import box

import landcover as lc
import regionlib

TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32636", always_xy=True)
LON, LAT = 33.0, 41.5


@pytest.fixture(scope="module")
def grid():
    """Orta meridyen yakınında 10×10 km'lik ızgara, 100 m hücre (100×100)."""
    e, n = TO_UTM.transform(LON, LAT)
    return regionlib.grid_for_bounds(e - 5_000, n - 5_000, e + 5_000, n + 5_000, cell=100, margin=0)


TO_LONLAT = Transformer.from_crs("EPSG:32636", "EPSG:4326", always_xy=True)


def utm_box(grid, west, south, east, north):
    """Izgara sol-alt köşesine göre metre cinsinden dikdörtgen → WGS84 çokgen."""
    corners = [
        (grid.left + west, grid.bottom + south),
        (grid.left + east, grid.bottom + south),
        (grid.left + east, grid.bottom + north),
        (grid.left + west, grid.bottom + north),
    ]
    return shapely.Polygon([TO_LONLAT.transform(e, n) for e, n in corners])


def test_classes_table_starts_with_none_and_is_unique():
    assert lc.CLASSES[0] == "none"
    assert len(set(lc.CLASSES)) == len(lc.CLASSES)
    assert all(name in lc.CLASSES for name in lc.SUBTYPE_CLASS.values())


def test_polygon_fills_cells_and_north_is_row_zero(grid):
    # Yalnızca kuzey yarı (üst 5 km) orman
    polygon = utm_box(grid, 0, 5_000, 10_000, 10_000)
    classes, skipped = lc.rasterize_landcover(["forest"], [polygon], grid)
    assert classes.shape == (grid.height, grid.width)
    assert classes.dtype == np.uint8
    assert not skipped
    assert (classes[: grid.height // 2 - 1] == lc.CLASS_INDEX["forest"]).all()
    assert (classes[grid.height // 2 + 1 :] == 0).all()


def test_east_is_last_column(grid):
    polygon = utm_box(grid, 5_000, 0, 10_000, 10_000)
    classes, _ = lc.rasterize_landcover(["grass"], [polygon], grid)
    assert (classes[:, -grid.width // 2 + 1 :] == lc.CLASS_INDEX["grass"]).all()
    assert (classes[:, : grid.width // 2 - 1] == 0).all()


def test_majority_class_wins_inside_a_cell(grid):
    # 100 m'lik hücrenin ~%75'i orman, ~%25'i çayır olacak biçimde dikey sınır (x = 1075 m)
    forest = utm_box(grid, 0, 0, 1_075, 10_000)
    grass = utm_box(grid, 1_075, 0, 10_000, 10_000)
    classes, _ = lc.rasterize_landcover(["forest", "grass"], [forest, grass], grid)
    assert classes[50, 10] == lc.CLASS_INDEX["forest"]  # x 1000–1100 m hücresi (%75 orman)
    assert classes[50, 11] == lc.CLASS_INDEX["grass"]


def test_low_coverage_stays_none(grid):
    # Hücrenin yalnızca %10'u kaplı → eşik altı
    sliver = utm_box(grid, 5_000, 5_000, 5_010, 5_100)
    classes, _ = lc.rasterize_landcover(["forest"], [sliver], grid)
    assert (classes == 0).all()


def test_unknown_subtypes_are_skipped_and_reported(grid):
    polygon = utm_box(grid, 0, 0, 10_000, 10_000)
    classes, skipped = lc.rasterize_landcover(["kelebek"], [polygon], grid)
    assert (classes == 0).all()
    assert skipped == {"kelebek": 1}


def test_result_is_independent_of_input_order(grid):
    a = utm_box(grid, 0, 0, 6_000, 10_000)
    b = utm_box(grid, 4_000, 0, 10_000, 10_000)  # a ile 4–6 km arası çakışır
    one, _ = lc.rasterize_landcover(["forest", "shrub"], [a, b], grid)
    two, _ = lc.rasterize_landcover(["shrub", "forest"], [b, a], grid)
    assert (one == two).all()


def test_invalid_geometries_do_not_crash(grid):
    bowtie = shapely.Polygon([(LON, LAT), (LON + 0.01, LAT + 0.01), (LON + 0.01, LAT), (LON, LAT + 0.01)])
    classes, _ = lc.rasterize_landcover(["forest"], [bowtie], grid)
    assert classes.shape == (grid.height, grid.width)


def test_class_histogram(grid):
    polygon = utm_box(grid, 0, 0, 10_000, 10_000)
    classes, _ = lc.rasterize_landcover(["urban"], [polygon], grid)
    histogram = lc.class_histogram(classes)
    assert histogram == {"urban": grid.width * grid.height}
