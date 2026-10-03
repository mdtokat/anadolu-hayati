from collections import Counter

import shapely
from shapely.geometry import LineString, Point, box

import build_settlements as bs
import fetch_settlements as fs
import worldlib as wl


def test_delta_encode_roundtrip():
    coords = [(10.04, -3.0), (12.0, -3.0), (12.0, -3.04), (15.55, 1.25)]
    enc = bs.delta_encode(coords)
    assert enc[:2] == [100, -30]
    # 12.0, -3.04 → (120, -30): öncekiyle aynı nokta, atlanır
    assert bs.delta_decode(enc) == [(10.0, -3.0), (12.0, -3.0), (15.6, 1.2)] or bs.delta_decode(enc)[-1][0] == 15.6


def test_game_to_cell_matches_lattice():
    x, z = wl.lattice_x(-640), wl.lattice_z(100)
    assert bs.game_to_cell(x, z) == (-640, 100)
    assert bs.game_to_cell(x + 0.9, z - 0.9) == (-640, 100)


def test_stable_id_and_village_selection_deterministic():
    assert bs.stable_id("abc") == bs.stable_id("abc")
    assert 0 <= bs.stable_id("x" * 40) < 2**20
    ids = [f"v{i}" for i in range(2000)]
    picked = sum(bs.village_selected(i, 0.2) for i in ids)
    assert 300 < picked < 500
    assert [bs.village_selected(i, 0.2) for i in ids] == [bs.village_selected(i, 0.2) for i in ids]


def test_settlement_rank():
    assert bs.settlement_rank({"subtype": "locality", "class": "city"}) == "il"
    assert bs.settlement_rank({"subtype": "locality", "class": "town"}) == "ilce"
    assert bs.settlement_rank({"subtype": "locality", "class": "village"}) == "koy"
    assert bs.settlement_rank({"subtype": "locality", "class": "hamlet"}) is None
    assert bs.settlement_rank({"subtype": "county"}) is None


def test_municipality_records_are_not_settlements():
    # Kırıkkale/Bahşılı/Karakeçili: üstte "… Belediyesi" (city/town), altında gerçek yerleşim; belediye kaydı seçilmemeli.
    assert bs.settlement_rank({"subtype": "locality", "class": "city", "name": "Kırıkkale Belediyesi"}) is None
    assert bs.settlement_rank({"subtype": "locality", "class": "town", "name": "Bahşılı Belediyesi"}) is None
    assert bs.settlement_rank({"subtype": "locality", "class": "city", "name": "Kırıkkale"}) == "il"


def test_assign_footprints_nearest_by_radius_and_threshold():
    settlements = [
        {"id": 1, "rank": "il", "x": wl.lattice_x(0), "z": wl.lattice_z(0)},
        {"id": 2, "rank": "koy", "x": wl.lattice_x(30), "z": wl.lattice_z(0)},
    ]
    counts = Counter({(0, 0): 10, (5, 0): 2, (27, 0): 1, (29, 0): 3, (100, 0): 50})
    out = bs.assign_footprints(settlements, counts, {"il": 3500, "ilce": 2200, "koy": 600}, {"il": 3, "ilce": 3, "koy": 1})
    assert (0, 0, 10) in out[1]
    assert all(c[:2] != (5, 0) for c in out[1])  # eşik altı (2 < 3)
    assert (-1, 0, 3) in out[2]  # (29,0) köye daha yakın (oransal)
    assert (-3, 0, 1) in out[2]
    assert all(c[0] != 100 for c in out[1])  # yarıçap dışı


def test_build_roads_clips_merges_and_filters_outside():
    origin_e, origin_n = wl.ORIGIN_UTM
    # Oyun (0, 0) çevresinde iki parça halinde düz yol (lon/lat'a çevirerek)
    from pyproj import Transformer

    back = Transformer.from_crs(wl.CRS, "EPSG:4326", always_xy=True)

    def ll(x, z):
        return list(back.transform(origin_e + x * 50, origin_n - z * 50))

    roads = [
        {"class": "primary", "coords": [ll(-100, 0), ll(0, 0)]},
        {"class": "primary", "coords": [ll(0, 0), ll(100, 0)]},
        {"class": "tertiary", "coords": [ll(-100, 50), ll(100, 50)]},
        {"class": "track", "coords": [ll(-100, 60), ll(100, 60)]},
    ]
    area = box(-1000, -1000, 0, 1000)  # hedef il: batı yarısı
    out = bs.build_roads(roads, (-80, -80, 80, 80), area)
    classes = Counter(r["c"] for r in out)
    assert classes[0] == 1  # birleşti ve kırpıldı
    assert classes[1] == 1  # yalnızca il içindeki yarısı
    pts = bs.delta_decode([r for r in out if r["c"] == 0][0]["d"])
    xs = sorted(p[0] for p in pts)
    assert xs[0] >= -80.01 and xs[-1] <= 80.01
    tertiary = bs.delta_decode([r for r in out if r["c"] == 1][0]["d"])
    assert max(p[0] for p in tertiary) <= 0.01


def test_fetch_records():
    line = shapely.to_wkb(LineString([(31.0, 41.0), (31.1, 41.0)]))
    assert fs.road_record({"subtype": "road", "class": "track", "geometry": line}) is None
    rec = fs.road_record(
        {"subtype": "road", "class": "primary", "geometry": line, "names": {"primary": "D010"}, "road_surface": [{"value": "paved"}]}
    )
    assert rec["class"] == "primary" and rec["surface"] == "paved" and rec["name"] == "D010"
    point = shapely.to_wkb(Point(31.5, 41.2))
    div = fs.division_record(
        {"country": "TR", "geometry": point, "subtype": "locality", "class": "town", "names": {"primary": "Devrek"},
         "hierarchies": [[{"subtype": "country", "name": "Türkiye"}, {"subtype": "region", "name": "Zonguldak"}]],
         "local_type": [("tr", "ilçe")], "capital_of_divisions": [{"subtype": "county"}]}
    )
    assert div["name"] == "Devrek" and div["hierarchy"][1]["name"] == "Zonguldak" and div["capitalOf"] == ["county"]
    assert div["localType"] == "ilçe"
    assert fs.division_record({"country": "GR", "geometry": point}) is None
    place = fs.place_record(
        {"geometry": point, "confidence": 0.9, "basic_category": "x", "taxonomy": {"primary": "muslim_place_of_worship"}, "names": {"primary": "Ulu Cami"}}
    )
    assert place["category"] == "muslim_place_of_worship"
    assert fs.place_record({"geometry": point, "confidence": 0.9, "taxonomy": {"primary": "dentist"}}) is None
    b = fs.building_record({"bbox": {"xmin": 31.0, "xmax": 31.002, "ymin": 41.0, "ymax": 41.002}, "class": "mosque", "names": {"primary": "Cami"}})
    assert b[:3] == [31.001, 41.001, "mosque"] and b[4] == "Cami"


def test_colliding_stable_ids_are_resolved_deterministically_and_non_colliding_ids_are_unchanged():
    # İki gerçek çakışma (Faz 12.B dünyası): 20 bitlik CRC aynı kimliği verir.
    a = "e578543d-51c5-4774-81c8-2394b12de99d"  # Selahiye (Sakarya)
    b = "acfe110e-a767-41d3-9b11-81286fc5655e"  # Çanakçı (Samsun)
    assert bs.stable_id(a) == bs.stable_id(b)
    order = ["Sakarya", "Samsun"]

    def run(entries, provinces):
        items = [(oid, province, {"id": 0}) for oid, province in entries]
        bs.assign_unique_ids(items, provinces)
        return {oid: item["id"] for oid, _, item in items}

    ids = run([(b, "Samsun"), (a, "Sakarya")], order)
    assert ids[a] == bs.stable_id(a)  # önceki (çekirdek) il kimliğini korur
    assert ids[b] != ids[a] and ids[b] == bs.stable_id(b + "#1")
    # Girdi sırasından bağımsız ve tekrarlanabilir.
    assert run([(a, "Sakarya"), (b, "Samsun")], order) == ids
    # Çakışmayan kimlikler stable_id ile aynı kalır.
    c = "9cb7dea9-9c5c-422b-abef-5f661716b6a4"
    assert run([(c, "Sinop")], ["Sinop"])[c] == bs.stable_id(c)
    # Aynı ilde çakışırsa Overture kimliği küçük olan kalır.
    same = run([(b, "Samsun"), (a, "Samsun")], ["Samsun"])
    assert same[b] == bs.stable_id(b) and same[a] == bs.stable_id(a + "#1")
