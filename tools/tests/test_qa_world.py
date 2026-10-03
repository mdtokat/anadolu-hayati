"""qa_world: depodaki gerçek dünya üzerinde rapor işlevleri (ham veri gerekmez)."""

from pathlib import Path

import pytest

import qa_world
import worldlib as wl

WORLD_DIR = Path(__file__).resolve().parents[2] / "public" / "data" / "world" / "bati-karadeniz"


@pytest.fixture(scope="module")
def world():
    return qa_world.load_world(WORLD_DIR)


def test_tile_table_budget_and_land(world):
    rows = qa_world.tile_table(world)
    # Sinop–Sakarya genişlemesi: 10 × 5 = 50 karo kafesinin hepsi kapsamla kesişir.
    assert len(rows) == len(world["manifest"]["tiles"]) == 50
    assert all(r["height_bytes"] <= 1024 * 1024 and r["cover_bytes"] <= 1024 * 1024 for r in rows)
    by_key = {(r["tx"], r["ty"]): r for r in rows}
    assert by_key[(-3, -1)]["land_pct"] == 0  # kuzeybatı köşe tamamen deniz
    assert by_key[(1, 2)]["land_pct"] == 100
    assert max(r["max_m"] for r in rows) > 2000


def test_seam_continuity_is_no_worse_than_interior(world):
    seams = qa_world.seam_continuity(world)
    assert set(seams) == {"west", "south"}
    for name, s in seams.items():
        assert s["seam_mean"] <= s["interior_mean"] * 1.5 + 1.0, name
        assert s["seam_p99"] <= s["interior_p99"] * 1.5 + 5.0, name


def test_province_cells_cover_nine_targets(world):
    cells = qa_world.province_cells(world)
    for name in ("Zonguldak", "Bartın", "Karabük", "Düzce", "Bolu", "Kastamonu", "Çankırı", "Sinop", "Sakarya"):
        assert cells[name]["in_region"] is True
        assert cells[name]["cells"] > 50_000
    assert cells["Ankara"]["in_region"] is False and cells["Ankara"]["cells"] > 0


def test_water_crosses_the_seams(world):
    crossing = qa_world.water_crossing(world)
    assert crossing["lines_crossing_west_seam"] > 0
    assert crossing["lines_crossing_south_seam"] > 0


def test_report_renders(world):
    text = qa_world.report(world)
    assert "Karo tablosu" in text and "Eski/yeni alan sınır sürekliliği" in text
    assert "| Düzce | evet |" in text
