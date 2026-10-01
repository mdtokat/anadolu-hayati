import json
from pathlib import Path

import numpy as np

import tile_legacy as tl
import worldlib as wl

REPO = Path(__file__).resolve().parents[2]


def test_tiling_legacy_region_is_bit_exact_and_matches_committed_output(tmp_path):
    out = tmp_path / "world"
    manifest = tl.tile_legacy(tl.LEGACY_DIR, out)
    wl.validate_manifest(manifest)

    extent = wl.Extent.from_dict(manifest["extent"])
    assert extent == wl.Extent(0, 0, 1588, 1176)
    assert manifest["elevation"]["max"] == 1996.0
    assert len(manifest["tiles"]) == 12

    # Karolardan birleştirilen dizi eski heightmap/landcover ile birebir aynı.
    legacy_h = np.fromfile(tl.LEGACY_DIR / "heightmap.bin", dtype="<u2").reshape(1176, 1588)
    legacy_c = np.fromfile(tl.LEGACY_DIR / "landcover.bin", dtype=np.uint8).reshape(1176, 1588)
    h_tiles, c_tiles = {}, {}
    for t in manifest["tiles"]:
        key = (t["tx"], t["ty"])
        h_tiles[key] = np.fromfile(out / t["height"], dtype="<u2").reshape(512, 512)
        c_tiles[key] = np.fromfile(out / t["cover"], dtype=np.uint8).reshape(512, 512)
        assert (out / t["height"]).stat().st_size == t["bytes"] == 512 * 512 * 2
        assert wl.sha256_hex((out / t["height"]).read_bytes()) == t["sha256"]
    assert np.array_equal(wl.assemble(h_tiles, extent, np.uint16), legacy_h)
    assert np.array_equal(wl.assemble(c_tiles, extent, np.uint8), legacy_c)

    # İl ve özellikler aynen kopyalanır.
    for name in ("provinces.geojson", "features.json"):
        assert (out / name).read_bytes() == (tl.LEGACY_DIR / name).read_bytes()

    # Depodaki çıktı bu betiğin çıktısıyla aynı (elle düzenlenmiş/eskimiş karo kalmasın).
    committed = REPO / "public" / "data" / "world" / "bati-karadeniz"
    assert json.loads((committed / "world.json").read_text()) == json.loads((out / "world.json").read_text())
    for t in manifest["tiles"]:
        assert (committed / t["height"]).read_bytes() == (out / t["height"]).read_bytes()
        assert (committed / t["cover"]).read_bytes() == (out / t["cover"]).read_bytes()
