import math
from pathlib import Path

import numpy as np
import pytest
import yaml

import regionlib as rl

REGIONS_YAML = Path(__file__).resolve().parent.parent / "regions.yaml"


def test_grid_is_centered_on_origin():
    g = rl.grid_for_bounds(356686, 4519466, 511484, 4633056, cell=100, margin=2000)
    # (154798 + 4000) / 100 = 1588 (yukarı yuvarlanır), (113590 + 4000) / 100 = 1176
    assert (g.width, g.height) == (1588, 1176)
    assert g.origin_e == round((356686 + 511484) / 2)
    assert g.origin_n == round((4519466 + 4633056) / 2)
    assert g.right - g.left == g.width * 100
    assert g.top - g.bottom == g.height * 100
    assert (g.left + g.right) / 2 == pytest.approx(g.origin_e)
    assert (g.top + g.bottom) / 2 == pytest.approx(g.origin_n)


def test_grid_covers_bounds_with_margin():
    minx, miny, maxx, maxy = 1000.0, 2000.0, 5050.0, 7010.0
    g = rl.grid_for_bounds(minx, miny, maxx, maxy, cell=100, margin=500)
    assert g.left <= minx - 500 + 50 and g.right >= maxx + 500 - 50
    assert g.bottom <= miny - 500 + 50 and g.top >= maxy + 500 - 50


def test_utm_game_roundtrip_and_axes():
    oe, on = 434085, 4576261
    # Doğuya 100 m → +x, kuzeye 100 m → −z (Three.js: −Z kuzey)
    x, z = rl.utm_to_game(oe + 100, on + 100, oe, on)
    assert x == pytest.approx(100 / rl.HORIZONTAL_SCALE)
    assert z == pytest.approx(-100 / rl.HORIZONTAL_SCALE)
    assert rl.utm_to_game(oe, on, oe, on) == (0, 0)
    e, n = rl.game_to_utm(x, z, oe, on)
    assert (e, n) == pytest.approx((oe + 100, on + 100))


def test_sample_positions_are_symmetric_around_origin():
    g = rl.grid_for_bounds(0, 0, 1000, 800, cell=100, margin=0)  # 10 x 8
    first = rl.sample_game_position(g, 0, 0)
    last = rl.sample_game_position(g, g.width - 1, g.height - 1)
    assert first[0] == pytest.approx(-last[0])
    assert first[1] == pytest.approx(-last[1])
    # Sütun aralığı 100 m = 2 oyun metresi
    assert rl.sample_game_position(g, 1, 0)[0] - first[0] == pytest.approx(100 / rl.HORIZONTAL_SCALE)
    # Satır 0 kuzeydedir → z negatif
    assert first[1] < 0


def test_quantize_clips_sea_and_uses_full_range():
    elevation = np.array([[-12.0, 0.0], [500.4, 1995.1]])
    q, emin, emax = rl.quantize_elevation(elevation)
    assert q.dtype == np.uint16
    assert emin == 0.0 and emax == 1996.0  # 1995.1 → yukarı yuvarlanır
    assert q[0, 0] == 0 and q[0, 1] == 0  # deniz altı 0'a kırpıldı
    assert q.max() <= 65535


def test_quantize_roundtrip_error_is_below_one_step():
    rng = np.random.default_rng(0)
    elevation = rng.uniform(0, 1995, size=(64, 64))
    q, emin, emax = rl.quantize_elevation(elevation)
    back = rl.dequantize_elevation(q, emin, emax)
    step = (emax - emin) / rl.UINT16_MAX
    assert np.abs(back - np.clip(elevation, 0, None)).max() <= step / 2 + 1e-9


def test_quantize_flat_zero_does_not_divide_by_zero():
    q, _, emax = rl.quantize_elevation(np.zeros((3, 3)))
    assert emax == 1.0 and (q == 0).all()


def test_heightmap_bytes_are_little_endian_row_major():
    q = np.array([[1, 2, 3], [4, 5, 6]], dtype=np.uint16)
    raw = q.astype("<u2").tobytes()
    assert raw == b"\x01\x00\x02\x00\x03\x00\x04\x00\x05\x00\x06\x00"


def test_tiles_for_region_bbox_are_the_six_expected():
    region = yaml.safe_load(REGIONS_YAML.read_text(encoding="utf-8"))["regions"]["zonguldak-bartin-karabuk"]
    tiles = rl.tiles_for_bbox(*region["bbox"])
    assert len(tiles) == 6
    assert set(tiles) == {
        f"Copernicus_DSM_COG_10_N{lat}_00_E{lon}_00_DEM" for lat in ("40", "41") for lon in ("031", "032", "033")
    }


def test_tiles_do_not_include_extra_tile_when_bbox_ends_on_integer():
    assert rl.tiles_for_bbox(31.2, 40.2, 32.0, 41.0) == [
        "Copernicus_DSM_COG_10_N40_00_E031_00_DEM"
    ]


def test_tile_url():
    name = "Copernicus_DSM_COG_10_N41_00_E032_00_DEM"
    assert rl.tile_url(name) == f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"


def test_lfs_pointer_detection():
    pointer = b"version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1559408\n"
    assert rl.is_lfs_pointer(pointer)
    assert not rl.is_lfs_pointer(b'{"type": "FeatureCollection"}')


def test_regions_yaml_is_well_formed():
    region = yaml.safe_load(REGIONS_YAML.read_text(encoding="utf-8"))["regions"]["zonguldak-bartin-karabuk"]
    assert region["provinces"] == ["Zonguldak", "Bartın", "Karabük"]
    lon_min, lat_min, lon_max, lat_max = region["bbox"]
    assert lon_min < lon_max and lat_min < lat_max
    assert region["cell_size"] > 0 and math.isfinite(region["margin_m"])
