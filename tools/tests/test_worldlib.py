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
