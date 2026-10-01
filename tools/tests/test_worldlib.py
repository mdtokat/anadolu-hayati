import re
from pathlib import Path

import numpy as np
import pytest

import worldlib as wl

CONFIG_TS = Path(__file__).resolve().parents[2] / "src" / "config.ts"


def _config_text() -> str:
    return CONFIG_TS.read_text(encoding="utf-8")


def test_constants_match_config_ts():
    text = _config_text()
    assert int(re.search(r"export const HORIZONTAL_SCALE = (\d+)", text).group(1)) == wl.HORIZONTAL_SCALE
    block = text[text.index("export const WORLD = {") :]
    block = block[: block.index("} as const;")]
    assert int(re.search(r"anchorX: (-?\d+)", block).group(1)) == wl.ANCHOR_X
    assert int(re.search(r"anchorZ: (-?\d+)", block).group(1)) == wl.ANCHOR_Z
    assert int(re.search(r"tileSize: (\d+)", block).group(1)) == wl.TILE_SIZE


def test_lattice_is_old_grid_special_case():
    # Eski ızgara 1588 × 1176, orijin merkezli: x = (c − (W−1)/2) · hücre.
    for col in (0, 1, 793, 794, 1587):
        assert wl.lattice_x(col) == pytest.approx((col - 1587 / 2) * wl.LATTICE_CELL)
    for row in (0, 1, 587, 588, 1175):
        assert wl.lattice_z(row) == pytest.approx((row - 1175 / 2) * wl.LATTICE_CELL)
    # Kafesin sol/üst kenarı eski ızgaranın kenarıdır.
    assert wl.LATTICE_LEFT_E == 354685
    assert wl.LATTICE_TOP_N == 4635061


def test_tile_of_floors_negative_indices():
    assert wl.tile_of(0, 0) == (0, 0)
    assert wl.tile_of(511, 511) == (0, 0)
    assert wl.tile_of(512, 0) == (1, 0)
    assert wl.tile_of(-1, -1) == (-1, -1)
    assert wl.tile_of(-512, 0) == (-1, 0)
    assert wl.tile_of(-513, 0) == (-2, 0)


def test_tile_range_matches_plan():
    old = wl.Extent(0, 0, 1588, 1176)
    assert wl.tile_range_of(old) == (0, 3, 0, 2)
    assert len(wl.tile_coords_of(old)) == 12
    new = wl.Extent(-640, 0, 2228, 1962)
    assert wl.tile_range_of(new) == (-2, 3, 0, 3)
    assert len(wl.tile_coords_of(new)) == 24


def test_grid_origin_of():
    assert wl.grid_origin_of(wl.Extent(0, 0, 1588, 1176)) == (-1587, -1175)
    assert wl.grid_origin_of(wl.Extent(-640, 0, 2228, 1962)) == (-2867, -1175)


def test_extent_for_lattice_bounds_reproduces_old_grid():
    extent = wl.extent_for_lattice_bounds(
        wl.LATTICE_LEFT_E,
        wl.LATTICE_TOP_N,
        wl.LATTICE_LEFT_E + 1588 * 100,
        wl.LATTICE_TOP_N - 1176 * 100,
    )
    assert extent == wl.Extent(0, 0, 1588, 1176)


def test_slice_assemble_roundtrip_with_negative_tiles_and_partial_edges():
    rng = np.random.default_rng(7)
    extent = wl.Extent(-700, -30, 1500, 1100)  # negatif karolar + kısmi kenar karoları
    data = rng.integers(0, 65535, size=(extent.rows, extent.cols), dtype=np.uint16)
    tiles = wl.slice_into_tiles(data, extent, np.uint16)
    assert set(tiles) == set(wl.tile_coords_of(extent))
    assert all(t.shape == (512, 512) for t in tiles.values())
    assert np.array_equal(wl.assemble(tiles, extent, np.uint16), data)
    # (-1, -1) karosu col −512…−1, row −512…−1; extent satırları −30'dan başlar → ilk 482 satır extent dışı (0).
    assert not tiles[(-1, -1)][:482].any()
    assert tiles[(-1, -1)][482:].any()
    # (-2, -1) karosunun sol 324 sütunu (col −1024…−701) extent dışıdır.
    assert not tiles[(-2, -1)][:, :324].any()


def test_slice_rejects_wrong_shape_and_assemble_rejects_missing_tile():
    extent = wl.Extent(0, 0, 600, 600)
    with pytest.raises(wl.WorldDataError):
        wl.slice_into_tiles(np.zeros((10, 10), np.uint16), extent, np.uint16)
    tiles = wl.slice_into_tiles(np.zeros((600, 600), np.uint16), extent, np.uint16)
    del tiles[(1, 1)]
    with pytest.raises(wl.WorldDataError):
        wl.assemble(tiles, extent, np.uint16)


def test_world_elevation_max_rounds_up_to_hundred():
    assert wl.world_elevation_max(1995.2) == 2000.0
    assert wl.world_elevation_max(2000.0) == 2000.0
    assert wl.world_elevation_max(2000.1) == 2100.0
    assert wl.world_elevation_max(0.0) == 100.0


def test_quantize_with_range_two_pass():
    elevation = np.array([[-12.0, 0.0], [500.0, 2000.0]])
    emax = wl.world_elevation_max(float(elevation.max()))
    q = wl.quantize_with_range(elevation, 0.0, emax)
    assert q.dtype == np.uint16
    assert q[0, 0] == 0 and q[0, 1] == 0 and q[1, 1] == 65535
    back = q.astype(np.float64) / 65535 * emax
    assert np.abs(back - np.clip(elevation, 0, None)).max() <= emax / 65535 / 2 + 1e-9


def test_requantize_changes_at_most_one_step():
    rng = np.random.default_rng(3)
    old = rng.integers(0, 65535, size=(64, 64), dtype=np.uint16)
    new = wl.requantize(old, 1996.0, 2500.0)
    meters_old = old.astype(np.float64) / 65535 * 1996.0
    meters_new = new.astype(np.float64) / 65535 * 2500.0
    assert np.abs(meters_new - meters_old).max() <= 2500.0 / 65535  # ≤ 1 nicem (yeni aralıkta)
    # Aynı aralığa çevirme kimliktir.
    assert np.array_equal(wl.requantize(old, 1996.0, 1996.0), old)


def _manifest(extent: wl.Extent):
    blobs = {c: bytes(512 * 512 * 2) for c in wl.tile_coords_of(extent)}
    return wl.build_manifest(
        world_id="bati-karadeniz",
        name="Batı Karadeniz",
        extent=extent,
        elevation_max=1996.0,
        tile_blobs=blobs,
        layers=["water"],
        landcover_classes=["none", "forest"],
        sources=["x"],
        overture_release="2026-09-23.1",
        built="2026-10-01",
    )


def test_build_manifest_is_valid_and_lists_every_tile():
    manifest = _manifest(wl.Extent(0, 0, 1588, 1176))
    wl.validate_manifest(manifest)
    assert len(manifest["tiles"]) == 12
    assert manifest["tiles"][0]["height"] == "tiles/0_0.height.bin"
    assert manifest["tiles"][0]["bytes"] == 524288
    assert manifest["tiles"][0]["sha256"] == wl.sha256_hex(bytes(524288))
    assert manifest["lattice"] == {"anchorX": -1587, "anchorZ": -1175}


def test_validate_manifest_rejects_gap_lattice_and_size_mismatches():
    good = _manifest(wl.Extent(0, 0, 1588, 1176))

    gap = {**good, "tiles": good["tiles"][:-1]}
    with pytest.raises(wl.WorldDataError):
        wl.validate_manifest(gap)

    extra = {**good, "tiles": good["tiles"] + [{**good["tiles"][0], "tx": 9}]}
    with pytest.raises(wl.WorldDataError):
        wl.validate_manifest(extra)

    bad_lattice = {**good, "lattice": {"anchorX": 0, "anchorZ": 0}}
    with pytest.raises(wl.WorldDataError):
        wl.validate_manifest(bad_lattice)

    bad_bytes = {**good, "tiles": [{**good["tiles"][0], "bytes": 10}] + good["tiles"][1:]}
    with pytest.raises(wl.WorldDataError):
        wl.validate_manifest(bad_bytes)

    dup = {**good, "tiles": good["tiles"] + [good["tiles"][0]]}
    with pytest.raises(wl.WorldDataError):
        wl.validate_manifest(dup)


def test_grid_for_lattice_reproduces_old_and_new_extents():
    # Eski bölge: Zonguldak–Bartın–Karabük sınır kutusu + 2 km → eski ızgara (kafesin kendisi).
    old = wl.grid_for_lattice(356685.83, 4519465.93, 511483.80, 4633056.19, 2000)
    assert old.extent == wl.Extent(0, 0, 1588, 1176)
    assert (old.left, old.top) == (354685, 4635061)
    assert (old.right, old.bottom) == (354685 + 158800, 4635061 - 117600)
    assert (old.origin_e, old.origin_n) == wl.ORIGIN_UTM
    # Plan §1.4: 5 hedef il → sütun −640…1588, satır 0…1962; batı kenarı chunk'a hizalı.
    new = wl.grid_for_lattice(293205.60, 4440864.10, 511483.80, 4633056.19, 2000)
    assert new.extent == wl.Extent(-640, 0, 2228, 1962)
    assert new.extent.col0 % wl.CHUNK_CELLS == 0 and new.extent.row0 % wl.CHUNK_CELLS == 0
    assert wl.tile_range_of(new.extent) == (-2, 3, 0, 3)
    assert wl.grid_origin_of(new.extent) == (-2867, -1175)


def test_grid_for_lattice_aligns_only_west_and_north_edges():
    g = wl.grid_for_lattice(360000, 4500000, 380000, 4520000, 0)
    e = g.extent
    assert e.col0 % 128 == 0 and e.row0 % 128 == 0
    # Doğu/güney kenar yerinde: ceil(kafes), hizalanmaz.
    assert g.right >= 380000 and g.right - 380000 < wl.CELL_SIZE_REAL
    assert g.bottom <= 4500000 and 4500000 - g.bottom < wl.CELL_SIZE_REAL
    # Kapsar: batı/kuzey kenar kutunun dışında (≥ 0, < bir chunk).
    assert 0 <= 360000 - g.left < 128 * wl.CELL_SIZE_REAL + wl.CELL_SIZE_REAL
    assert 0 <= g.top - 4520000 < 128 * wl.CELL_SIZE_REAL + wl.CELL_SIZE_REAL


def test_lattice_grid_matches_regionlib_grid_interface():
    import regionlib

    g = wl.grid_for_lattice(356685.83, 4519465.93, 511483.80, 4633056.19, 2000)
    legacy = regionlib.Grid(1588, 1176, 100, *wl.ORIGIN_UTM)
    for attr in ("width", "height", "cell", "origin_e", "origin_n", "left", "top", "right", "bottom"):
        assert getattr(g, attr) == getattr(legacy, attr), attr


def test_compare_with_legacy_detects_within_and_beyond_one_step():
    rng = np.random.default_rng(11)
    legacy_extent = wl.Extent(0, 0, 40, 30)
    new_extent = wl.Extent(-128, 0, 300, 100)
    elevation = rng.uniform(0, 1990, size=(30, 40))
    legacy_h = wl.quantize_with_range(elevation, 0.0, 1996.0)
    new_h = np.zeros((new_extent.rows, new_extent.cols), np.uint16)
    new_h[0:30, 128:168] = wl.quantize_with_range(elevation, 0.0, 2500.0)
    ok = wl.compare_with_legacy(new_h, new_extent, 2500.0, legacy_h, 1996.0, legacy_extent)
    assert ok["within_one_step"] and ok["max_diff_m"] <= ok["step_m"]
    new_h[5, 130 + 3] += 200  # ≈ 7,6 m sapma
    bad = wl.compare_with_legacy(new_h, new_extent, 2500.0, legacy_h, 1996.0, legacy_extent)
    assert not bad["within_one_step"]


def test_compare_with_legacy_rejects_area_outside_world():
    import pytest

    with pytest.raises(wl.WorldDataError):
        wl.compare_with_legacy(
            np.zeros((10, 10), np.uint16), wl.Extent(0, 0, 10, 10), 100.0, np.zeros((30, 40), np.uint16), 100.0,
            wl.Extent(0, 0, 40, 30),
        )
