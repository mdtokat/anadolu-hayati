"""worldconfig (grup birleştirme, sınır kutusu türetme) ve fetchlib kapsam kaydı testleri — ham veri gerekmez."""

import json
from pathlib import Path

import geopandas as gpd
import pytest
import yaml
from shapely.geometry import box

import fetchlib
import worldconfig
import worldlib as wl

WORLD_YAML = {
    "worlds": {
        "t": {
            "groups": ["a", "b", "bos"],
            "neighbors": "auto",
            "margin_m": 1000,
            "cell_size": 100,
            "bbox_max": [30.0, 40.0, 36.0, 43.0],
        }
    }
}
SETTLEMENTS_YAML = {"worlds": {"t": {"village_fraction": 0.2, "display_names": {"X": "Ortak"}}}}


def write_group(root: Path, name: str, **data):
    (root / "groups").mkdir(exist_ok=True)
    (root / "groups" / f"{name}.yaml").write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")


@pytest.fixture
def tools(tmp_path):
    (tmp_path / "world.yaml").write_text(yaml.safe_dump(WORLD_YAML), encoding="utf-8")
    (tmp_path / "settlements.yaml").write_text(yaml.safe_dump(SETTLEMENTS_YAML), encoding="utf-8")
    write_group(
        tmp_path, "a", provinces=["Çankırı", "Bolu"], styles={"Bolu": "osmanli"}, display_names={"Ereğli": "Karadeniz Ereğli"},
        landmarks=[{"settlement": "Bolu", "kind": "han", "name": "Taşhan", "lon": 31.6, "lat": 40.7}],
        no_mosque_towns=["Amasra"],
    )
    write_group(tmp_path, "b", provinces=["Sinop"], styles={"Sinop": "osmanli"}, landmarks=[
        {"settlement": "Sinop", "kind": "castle", "name": "Kale", "lon": 35.1, "lat": 42.0}])
    write_group(tmp_path, "bos", provinces=[], styles={}, display_names={}, clip_bbox={}, no_mosque_towns=[], landmarks=[])
    return tmp_path


def test_groups_merge_in_world_yaml_order(tools):
    world = worldconfig.world_entry("t", "world.yaml", tools)
    merged = worldconfig.merge_groups(worldconfig.group_names(world), tools / "groups")
    assert merged["provinces"] == ["Çankırı", "Bolu", "Sinop"]
    assert merged["styles"] == {"Bolu": "osmanli", "Sinop": "osmanli"}
    assert [l["name"] for l in merged["landmarks"]] == ["Taşhan", "Kale"]
    assert merged["no_mosque_towns"] == ["Amasra"]


def test_empty_group_changes_nothing(tools):
    world = worldconfig.world_entry("t", "world.yaml", tools)
    without = worldconfig.merge_groups(["a", "b"], tools / "groups")
    assert worldconfig.merge_groups(worldconfig.group_names(world), tools / "groups") == without
    # Tek başına boş grup da geçerlidir (il yok).
    assert worldconfig.merge_groups(["bos"], tools / "groups")["provinces"] == []


def test_group_selection_keeps_merge_order_and_rejects_unknown(tools):
    world = worldconfig.world_entry("t", "world.yaml", tools)
    assert worldconfig.group_names(world, ["b", "a"]) == ["a", "b"]
    with pytest.raises(SystemExit, match="Bilinmeyen grup"):
        worldconfig.group_names(world, ["yok"])
    assert worldconfig.parse_groups_arg(None) is None
    assert worldconfig.parse_groups_arg("bati, dogu,") == ["bati", "dogu"]


def test_conflicts_and_typos_fail_loudly(tools):
    write_group(tools, "c", provinces=["Bolu"])
    with pytest.raises(SystemExit, match="iki grupta tanımlı"):
        worldconfig.merge_groups(["a", "c"], tools / "groups")
    write_group(tools, "d", provinces=["Z"], style={"x": "y"})  # `style` yazım hatası
    with pytest.raises(SystemExit, match="bilinmeyen anahtar"):
        worldconfig.merge_groups(["d"], tools / "groups")
    write_group(tools, "e", provinces=["Z"], clip_bbox={"Başka": [0, 0, 1, 1]})
    with pytest.raises(SystemExit, match="hedef il olmayan"):
        worldconfig.merge_groups(["e"], tools / "groups")
    with pytest.raises(SystemExit, match="Grup dosyası yok"):
        worldconfig.merge_groups(["yok"], tools / "groups")


def test_settlements_config_merges_shared_and_group_fields(tools):
    config = worldconfig.load_settlements_config("t", tools)
    assert config["provinces"] == ["Çankırı", "Bolu", "Sinop"]
    assert config["village_fraction"] == 0.2  # ortak ayar korunur
    assert config["display_names"] == {"X": "Ortak", "Ereğli": "Karadeniz Ereğli"}
    assert config["styles"]["Sinop"] == "osmanli" and len(config["landmarks"]) == 2


def test_real_groups_are_valid_and_cover_core_world():
    world = worldconfig.world_entry("bati-karadeniz")
    merged = worldconfig.merge_groups(worldconfig.group_names(world))
    core = worldconfig.load_group("cekirdek")
    assert merged["provinces"][: len(core["provinces"])] == core["provinces"]
    assert core["display_names"] == {"Ereğli": "Karadeniz Ereğli"}
    assert len(core["landmarks"]) == 41 and len(core["styles"]) == 16
    for name in ("bati", "dogu", "guney"):  # Faz 12 grup dosyaları var ve geçerli (içerikleri grupların işi)
        worldconfig.load_group(name)


# -- sınır kutusu -----------------------------------------------------------------------------------------------


def utm_square(center_lon: float, center_lat: float, half_m: float):
    from pyproj import Transformer

    e, n = Transformer.from_crs("EPSG:4326", wl.CRS, always_xy=True).transform(center_lon, center_lat)
    return box(e - half_m, n - half_m, e + half_m, n + half_m)


@pytest.fixture
def boundaries():
    return gpd.GeoDataFrame(
        {"shapeName": ["Bir", "Iki", "Uc"], "shapeISO": ["T1", "T2", "T3"],
         "geometry": [utm_square(32.0, 41.0, 20_000), utm_square(33.0, 41.0, 20_000), utm_square(36.5, 41.0, 20_000)]},
        crs=wl.CRS,
    )


def test_round_outward_uses_step_without_float_noise():
    assert worldconfig.round_outward((29.8412, 40.0501, 35.5399, 42.2201)) == [29.84, 40.05, 35.54, 42.23]
    assert worldconfig.round_outward((30.0, 40.0, 36.0, 42.0)) == [30.0, 40.0, 36.0, 42.0]


def test_derived_bbox_contains_provinces_and_grows_with_them(boundaries):
    one = worldconfig.derive_bbox(boundaries, ["Bir"], 1000)
    two = worldconfig.derive_bbox(boundaries, ["Bir", "Iki"], 1000)
    assert one[0] < 32.0 - 0.15 and one[2] > 32.0 + 0.15 and one[1] < 41.0 < one[3]
    assert two[0] == one[0] and two[2] > one[2]  # ikinci il doğuya uzatır
    # Zarf ızgara dikdörtgenini kapsar: ızgaranın dört köşesi kutunun içinde.
    from pyproj import Transformer

    found = boundaries[boundaries.shapeName.isin(["Bir", "Iki"])]
    grid = wl.grid_for_lattice(*found.total_bounds, 1000)
    to_ll = Transformer.from_crs(wl.CRS, "EPSG:4326", always_xy=True)
    for e, n in ((grid.left, grid.top), (grid.right, grid.top), (grid.left, grid.bottom), (grid.right, grid.bottom)):
        lon, lat = to_ll.transform(e, n)
        assert two[0] <= lon <= two[2] and two[1] <= lat <= two[3]


def test_bbox_max_is_enforced_and_empty_province_list_rejected(boundaries):
    assert worldconfig.derive_bbox(boundaries, ["Bir"], 1000, bbox_max=[30.0, 40.0, 36.0, 43.0])
    with pytest.raises(SystemExit, match="bbox_max"):
        worldconfig.derive_bbox(boundaries, ["Uc"], 1000, bbox_max=[30.0, 40.0, 36.0, 43.0])
    with pytest.raises(SystemExit, match="boş"):
        worldconfig.derive_bbox(boundaries, [], 1000)
    with pytest.raises(SystemExit, match="bulunamadı"):
        worldconfig.derive_bbox(boundaries, ["Yok"], 1000)


def test_clip_bbox_limits_extent_but_not_other_provinces(boundaries):
    full = worldconfig.derive_bbox(boundaries, ["Bir", "Uc"], 1000)
    clipped = worldconfig.derive_bbox(boundaries, ["Bir", "Uc"], 1000, clip_bbox={"Uc": [36.45, 40.5, 36.7, 41.5]})
    assert clipped[0] == full[0] and clipped[2] < full[2]  # Uc yalnızca kutu kadar
    with pytest.raises(SystemExit, match="kesişmiyor"):
        worldconfig.derive_bbox(boundaries, ["Uc"], 1000, clip_bbox={"Uc": [10, 10, 11, 11]})


def test_load_world_derives_bbox_from_groups(tools):
    # Sentetik il adları grup yaml'ındakilerle eşleşir (Çankırı, Bolu, Sinop); hepsi bbox_max içinde.
    frame = gpd.GeoDataFrame(
        {"shapeName": ["Çankırı", "Bolu", "Sinop"], "shapeISO": ["T1", "T2", "T3"],
         "geometry": [utm_square(32.0, 41.0, 20_000), utm_square(33.0, 41.0, 20_000), utm_square(35.0, 41.0, 20_000)]},
        crs=wl.CRS,
    )
    path = tools / "b.geojson"
    path.write_text(frame.to_crs("EPSG:4326").to_json(), encoding="utf-8")
    world = worldconfig.load_world("t", None, tools, path)
    assert world["provinces"] == ["Çankırı", "Bolu", "Sinop"]
    assert world["bbox"][0] < 32.0 < world["bbox"][2]
    only_a = worldconfig.load_world("t", ["a"], tools, path)
    assert only_a["provinces"] == ["Çankırı", "Bolu"] and only_a["bbox"][2] < world["bbox"][2]
    # Sınır dosyası yoksa yönlendiren hata.
    with pytest.raises(SystemExit, match="fetch_boundaries"):
        worldconfig.load_world("t", None, tools, tools / "yok.geojson")


# -- ham veri kapsam kaydı ---------------------------------------------------------------------------------------


def test_cover_record_skips_covered_requests_and_unions_partial_ones(tmp_path):
    dest = tmp_path / "water.geojson"
    release = "2026-09-23.1"
    bbox = (30.0, 40.0, 32.0, 41.0)
    assert fetchlib.plan_fetch(dest, bbox, release) == bbox  # dosya yok → indir
    dest.write_text("{}", encoding="utf-8")
    assert fetchlib.plan_fetch(dest, bbox, release) == bbox  # kayıt yok (eski ham dosya) → yeniden indir
    fetchlib.record_cover(dest, bbox, release)
    assert fetchlib.plan_fetch(dest, bbox, release) is None
    assert fetchlib.plan_fetch(dest, (30.5, 40.2, 31.5, 40.8), release) is None  # içindeki kutu
    assert fetchlib.plan_fetch(dest, (31.0, 40.0, 34.0, 42.0), release) == (30.0, 40.0, 34.0, 42.0)  # birleşim
    assert fetchlib.plan_fetch(dest, bbox, "baska-surum") == bbox  # sürüm değişti → yeniden
    fetchlib.cover_record_path(dest).write_text("bozuk", encoding="utf-8")
    assert fetchlib.read_cover(dest, release) is None
    assert json.loads(json.dumps(fetchlib.union_bbox(None, bbox))) == list(bbox)
