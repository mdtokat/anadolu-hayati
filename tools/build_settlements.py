#!/usr/bin/env python3
"""Yerleşim verisini (Faz 10) üretir: il/ilçe merkezleri ve seçilmiş köyler, şehirlerarası yollar, simge yapılar.

Kullanım:  python build_settlements.py [dünya-id]      (varsayılan: bati-karadeniz)
Girdi:     tools/raw/settlements/<id>/{divisions,roads,places,buildings}.json  (fetch_settlements.py)
           tools/settlements.yaml, public/data/world/<id>/{world.json, provinces.geojson}
Çıktı:     public/data/world/<id>/settlements.json  + world.json'a `settlements` girdisi (bayt + sha256)

`build_world.py` dünya klasörünü baştan yazar (settlements.json silinir); dünya yeniden üretilirse bu betik de
yeniden çalıştırılmalıdır. Çıktı deterministiktir (aynı ham veri → aynı bayt).

Ölçek notu: 1 oyun m = 50 gerçek m. Gerçek binalar tek tek konmaz; her yerleşimin **ayak izi** gerçek bina
yoğunluğundan (100 m hücre başına bina sayısı) alınır, oyun binaları bu ayak izine seed'li yerleşir
(src/settlements/layout.ts). Simge yapılar gerçek konumlarına yakın en boş parsele oturur.

Lisans: yollar/binalar/idari birimler OSM türevidir (ODbL-1.0, © OpenStreetMap katkıcıları); simge yapı
konumları Overture Places'tan (CDLA-Permissive-2.0) elle seçilmiştir.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import zlib
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import shapely
import yaml
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, box, shape
from shapely.ops import linemerge, unary_union

import worldlib as wl

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent
DEFAULT_WORLD = "bati-karadeniz"
SETTLEMENTS_VERSION = 1

#: Overture yol sınıfı → oyun yol sınıfı (0 = anayol, 1 = il/ilçe yolu, 2 = köy yolu).
ROAD_CLASS = {"motorway": 0, "trunk": 0, "primary": 0, "secondary": 1, "tertiary": 1, "unclassified": 2}
#: Sınıf başına sadeleştirme toleransı (oyun m) ve en kısa parça (oyun m).
ROAD_SIMPLIFY = {0: 0.5, 1: 0.7, 2: 0.9}
ROAD_MIN_LENGTH = 4.0
#: Hedef illerin dışında yalnızca bu sınıflar çizilir (komşu illerde yerleşim yok; köy yolları boşluğa gitmesin).
ROAD_CLASSES_OUTSIDE = frozenset({0})
#: İl sınırı tamponu (oyun m): sınır boyunca giden yol kesilmesin.
PROVINCE_BUFFER = 20.0
#: Yol koordinatları 0,1 oyun m birimli tam sayılara yuvarlanır ve ardışık farkla (delta) yazılır (dosya küçülür).
COORD_UNIT = 0.1

RANKS = ("il", "ilce", "koy")
#: Elle seçilmiş simge yapı türleri (src/settlements/kinds.ts `LANDMARK_KINDS` ile aynı olmalı).
LANDMARK_KINDS = frozenset(
    {"mosque_grand", "mosque", "han", "hamam", "tomb", "clock_tower", "castle", "monument", "shop_row"}
)

_TO_UTM = Transformer.from_crs("EPSG:4326", wl.CRS, always_xy=True)


# -- saf yardımcılar (test edilir) ---------------------------------------------


def lonlat_to_game(lon: float, lat: float) -> tuple[float, float]:
    """WGS84 → oyun (x, z): `x = (E − E0)/50`, `z = −(N − N0)/50`."""
    e, n = _TO_UTM.transform(lon, lat)
    return (e - wl.ORIGIN_UTM[0]) / wl.HORIZONTAL_SCALE, -(n - wl.ORIGIN_UTM[1]) / wl.HORIZONTAL_SCALE


def game_to_cell(x: float, z: float) -> tuple[int, int]:
    """Oyun konumunu içeren kafes örneği (piksel merkezi en yakın)."""
    return round((x - wl.ANCHOR_X) / wl.LATTICE_CELL), round((z - wl.ANCHOR_Z) / wl.LATTICE_CELL)


def stable_id(overture_id: str) -> int:
    """Overture kimliğinden kalıcı yerleşim kimliği (20 bit; oyunda bina kimliği `sid·1024 + i`)."""
    return zlib.crc32(overture_id.encode("utf-8")) & 0xFFFFF


def village_selected(overture_id: str, fraction: float) -> bool:
    """Köyün çizilip çizilmeyeceği: kimlik karmasına göre deterministik `fraction` oranı."""
    digest = hashlib.sha256(overture_id.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") / 2**32 < fraction


def settlement_rank(division: dict[str, Any]) -> str | None:
    """İdari birimin yerleşim rütbesi: il merkezi, ilçe merkezi/belde ya da köy; ilgisizse None."""
    if division.get("subtype") != "locality":
        return None
    cls = division.get("class")
    if cls == "city":
        return "il"
    if cls == "town":
        return "ilce"
    if cls == "village":
        return "koy"
    return None


def province_of(division: dict[str, Any]) -> str | None:
    hierarchy = division.get("hierarchy") or []
    return hierarchy[1]["name"] if len(hierarchy) > 1 else None


def aggregate_buildings(buildings: list[list[Any]]) -> tuple[Counter, list[tuple[float, float, str | None]]]:
    """Bina noktaları → (hücre başına bina sayısı, cami sınıflı binalar [(x, z, ad)])."""
    counts: Counter = Counter()
    mosques: list[tuple[float, float, str | None]] = []
    if not buildings:
        return counts, mosques
    lons = [b[0] for b in buildings]
    lats = [b[1] for b in buildings]
    es, ns = _TO_UTM.transform(lons, lats)
    for b, e, n in zip(buildings, es, ns):
        x = (e - wl.ORIGIN_UTM[0]) / wl.HORIZONTAL_SCALE
        z = -(n - wl.ORIGIN_UTM[1]) / wl.HORIZONTAL_SCALE
        counts[game_to_cell(x, z)] += 1
        if b[2] == "mosque":
            mosques.append((x, z, b[4]))
    return counts, mosques


def assign_footprints(
    settlements: list[dict[str, Any]],
    counts: Counter,
    radius_m: dict[str, float],
    min_cell: dict[str, int],
) -> dict[int, list[tuple[int, int, int]]]:
    """Bina hücrelerini yerleşimlere dağıtır: hücre, yarıçapı içindeki merkezlerden **yarıçapa göre en yakın** olana
    (d / r en küçük) gider ve o rütbenin en az bina eşiğini geçmelidir. Dönüş: sid → [(dc, dr, n)] (merkez hücreye
    göreli, sıralı)."""
    cell_m = wl.CELL_SIZE_REAL
    centers = []
    for s in settlements:
        col, row = game_to_cell(s["x"], s["z"])
        centers.append((s["id"], col, row, radius_m[s["rank"]] / cell_m, min_cell[s["rank"]]))
    # Kaba ızgara: merkezleri 40 hücrelik kovalara koy (yakın arama).
    bucket = 40
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, (_, col, row, _, _) in enumerate(centers):
        buckets[(col // bucket, row // bucket)].append(i)
    out: dict[int, list[tuple[int, int, int]]] = defaultdict(list)
    for (col, row), n in sorted(counts.items()):
        best: tuple[float, int] | None = None
        bc, br = col // bucket, row // bucket
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for i in buckets.get((bc + dx, br + dy), ()):
                    _, ccol, crow, radius, threshold = centers[i]
                    if n < threshold:
                        continue
                    ratio = math.hypot(col - ccol, row - crow) / radius
                    if ratio <= 1 and (best is None or ratio < best[0]):
                        best = (ratio, i)
        if best is not None:
            sid, ccol, crow, _, _ = centers[best[1]]
            out[sid].append((col - ccol, row - crow, min(n, 255)))
    return out


def delta_encode(coords: list[tuple[float, float]]) -> list[int]:
    """[(x, z), …] → [x0, z0, dx1, dz1, …] (0,1 m birimli tam sayılar; ilk nokta mutlak, sonrakiler farktır).
    Yuvarlama birikmez: farklar yuvarlanmış mutlak değerler arasındadır."""
    out: list[int] = []
    px = pz = 0
    for i, (x, z) in enumerate(coords):
        qx = round(x / COORD_UNIT)
        qz = round(z / COORD_UNIT)
        if i == 0:
            out += [qx, qz]
        else:
            if qx == px and qz == pz:
                continue
            out += [qx - px, qz - pz]
        px, pz = qx, qz
    return out


def delta_decode(values: list[int]) -> list[tuple[float, float]]:
    """`delta_encode`'un tersi (testler ve QA için)."""
    out: list[tuple[float, float]] = []
    x = z = 0
    for i in range(0, len(values), 2):
        x = values[i] if i == 0 else x + values[i]
        z = values[i + 1] if i == 0 else z + values[i + 1]
        out.append((round(x * COORD_UNIT, 1), round(z * COORD_UNIT, 1)))
    return out


def _lines_of(geometry) -> list[LineString]:
    if geometry.is_empty:
        return []
    if isinstance(geometry, LineString):
        return [geometry]
    if isinstance(geometry, MultiLineString):
        return list(geometry.geoms)
    return [g for g in getattr(geometry, "geoms", []) if isinstance(g, LineString)]


def build_roads(
    roads: list[dict[str, Any]],
    extent_box: tuple[float, float, float, float],
    target_area,
) -> list[dict[str, Any]]:
    """Yol segmentleri → oyun yolları: dönüştür, dünya kutusuna kırp, sınıf başına birleştir ve sadeleştir.

    `target_area`: hedef illerin (tamponlu) birleşimi, oyun X/Z; dışında yalnızca `ROAD_CLASSES_OUTSIDE` kalır."""
    clip = box(*extent_box)
    by_class: dict[int, list[LineString]] = defaultdict(list)
    for road in roads:
        cls = ROAD_CLASS.get(road["class"])
        if cls is None:
            continue
        coords = road["coords"]
        es, ns = _TO_UTM.transform([c[0] for c in coords], [c[1] for c in coords])
        line = LineString(
            [((e - wl.ORIGIN_UTM[0]) / wl.HORIZONTAL_SCALE, -(n - wl.ORIGIN_UTM[1]) / wl.HORIZONTAL_SCALE) for e, n in zip(es, ns)]
        )
        if not line.intersects(clip):
            continue
        line = line.intersection(clip)
        if cls not in ROAD_CLASSES_OUTSIDE:
            line = line.intersection(target_area)
        by_class[cls].extend(_lines_of(line))

    out: list[dict[str, Any]] = []
    for cls in sorted(by_class):
        union = unary_union(by_class[cls])
        merged = linemerge(union) if isinstance(union, MultiLineString) else union
        for line in sorted(_lines_of(merged), key=lambda g: (round(g.coords[0][0], 1), round(g.coords[0][1], 1), g.length)):
            simple = line.simplify(ROAD_SIMPLIFY[cls], preserve_topology=False)
            if simple.length < ROAD_MIN_LENGTH:
                continue
            out.append({"c": cls, "d": delta_encode(list(simple.coords))})
    return out


def select_settlements(
    divisions: list[dict[str, Any]],
    provinces: set[str],
    counts: Counter,
    config: dict[str, Any],
    inside,
) -> list[dict[str, Any]]:
    """Çizilecek yerleşimleri seçer (il/ilçe merkezleri hepsi; köyler `village_fraction` ve bina eşiğiyle)."""
    styles: dict[str, str] = config.get("styles") or {}
    display: dict[str, str] = config.get("display_names") or {}
    village_radius = config["radius_m"]["koy"] / wl.CELL_SIZE_REAL
    out: list[dict[str, Any]] = []
    for division in divisions:
        rank = settlement_rank(division)
        province = province_of(division)
        if rank is None or province not in provinces or not division.get("name"):
            continue
        x, z = lonlat_to_game(division["lon"], division["lat"])
        if not inside(x, z):
            continue
        if rank == "koy":
            if not village_selected(division["id"], config["village_fraction"]):
                continue
            col, row = game_to_cell(x, z)
            r = int(village_radius)
            total = sum(
                counts.get((col + dc, row + dr), 0)
                for dc in range(-r, r + 1)
                for dr in range(-r, r + 1)
                if dc * dc + dr * dr <= r * r
            )
            if total < config["village_min_buildings"]:
                continue
        name = division["name"]
        out.append(
            {
                "id": stable_id(division["id"]),
                "name": display.get(name, name),
                "province": province,
                "rank": rank,
                "style": styles.get(name, "koy" if rank == "koy" else "kasaba"),
                "population": division.get("population"),
                "x": round(x, 2),
                "z": round(z, 2),
            }
        )
    out.sort(key=lambda s: (RANKS.index(s["rank"]), s["province"], s["name"], s["id"]))
    ids = [s["id"] for s in out]
    if len(set(ids)) != len(ids):
        dup = [k for k, v in Counter(ids).items() if v > 1]
        raise SystemExit(f"yerleşim kimliği çakışması: {dup}")
    return out


def count_mosques(
    settlements: list[dict[str, Any]],
    footprints: dict[int, list[tuple[int, int, int]]],
    places: list[dict[str, Any]],
    mosque_buildings: list[tuple[float, float, str | None]],
) -> dict[int, int]:
    """Yerleşim ayak izine düşen gerçek cami sayısı (Overture Places `muslim_place_of_worship` adı cami olanlar
    + OSM `building=mosque`; aynı hücredekiler bir sayılır)."""
    cell_owner: dict[tuple[int, int], int] = {}
    for s in settlements:
        col, row = game_to_cell(s["x"], s["z"])
        for dc, dr, _ in footprints.get(s["id"], []):
            cell_owner[(col + dc, row + dr)] = s["id"]
    seen: dict[int, set[tuple[int, int]]] = defaultdict(set)
    points: list[tuple[float, float]] = []
    for p in places:
        name = (p.get("name") or "").lower()
        if p.get("category") == "muslim_place_of_worship" and ("cami" in name or "mescid" in name or "mosque" in name):
            points.append(lonlat_to_game(p["lon"], p["lat"]))
    points += [(x, z) for x, z, _ in mosque_buildings]
    for x, z in points:
        cell = game_to_cell(x, z)
        owner = cell_owner.get(cell)
        if owner is not None:
            seen[owner].add(cell)
    return {sid: len(cells) for sid, cells in seen.items()}


def resolve_landmarks(landmarks: list[dict[str, Any]], settlements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Elle seçilmiş simge yapıları yerleşime bağlar (yerleşim adı il/ilçe merkezlerinden biri olmalı)."""
    by_name = {s["name"]: s for s in settlements if s["rank"] != "koy"}
    out = []
    for item in landmarks:
        if item["kind"] not in LANDMARK_KINDS:
            raise SystemExit(f"bilinmeyen simge yapı türü: {item['kind']}")
        owner = by_name.get(item["settlement"])
        if owner is None:
            raise SystemExit(f"simge yapının yerleşimi bulunamadı: {item['settlement']} ({item['name']})")
        x, z = lonlat_to_game(item["lon"], item["lat"])
        out.append({"s": owner["id"], "kind": item["kind"], "name": item["name"], "x": round(x, 2), "z": round(z, 2)})
    return out


def build_settlements(
    world_dir: Path,
    raw_dir: Path,
    config: dict[str, Any],
    release: str,
) -> dict[str, Any]:
    manifest = json.loads((world_dir / "world.json").read_text(encoding="utf-8"))
    extent = wl.Extent.from_dict(manifest["extent"])
    x0, z0 = wl.lattice_x(extent.col0), wl.lattice_z(extent.row0)
    x1, z1 = wl.lattice_x(extent.col0 + extent.cols - 1), wl.lattice_z(extent.row0 + extent.rows - 1)
    extent_box = (x0, z0, x1, z1)

    provinces_json = json.loads((world_dir / "provinces.geojson").read_text(encoding="utf-8"))
    targets = set(config["provinces"])
    target_shapes = [shape(f["geometry"]) for f in provinces_json["features"] if f["properties"]["name"] in targets]
    target_area = unary_union(target_shapes).buffer(PROVINCE_BUFFER)
    shapely.prepare(target_area)

    def inside(x: float, z: float) -> bool:
        return x0 <= x <= x1 and z0 <= z <= z1

    def read(layer: str) -> list[Any]:
        return json.loads((raw_dir / f"{layer}.json").read_text(encoding="utf-8"))["items"]

    counts, mosque_buildings = aggregate_buildings(read("buildings"))
    settlements = select_settlements(read("divisions"), targets, counts, config, inside)
    footprints = assign_footprints(settlements, counts, config["radius_m"], config["min_cell_buildings"])
    mosques = count_mosques(settlements, footprints, read("places"), mosque_buildings)
    for s in settlements:
        cells = footprints.get(s["id"], [])
        s["mosques"] = mosques.get(s["id"], 0)
        s["buildings"] = sum(n for _, _, n in cells)
        s["cells"] = [v for cell in cells for v in cell]

    return {
        "version": SETTLEMENTS_VERSION,
        "overtureRelease": release,
        "settlements": settlements,
        "landmarks": resolve_landmarks(config.get("landmarks") or [], settlements),
        "roads": build_roads(read("roads"), extent_box, target_area),
    }


def write_output(world_dir: Path, data: dict[str, Any]) -> tuple[int, str]:
    """settlements.json'ı yazar ve world.json'a `settlements` girdisini (bayt + sha256) ekler."""
    blob = (json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    (world_dir / "settlements.json").write_bytes(blob)
    sha = wl.sha256_hex(blob)
    manifest_path = world_dir / "world.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["settlements"] = {"file": "settlements.json", "bytes": len(blob), "sha256": sha}
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(blob), sha


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("world_id", nargs="?", default=DEFAULT_WORLD)
    args = parser.parse_args(argv)

    config = yaml.safe_load((TOOLS / "settlements.yaml").read_text(encoding="utf-8"))["worlds"][args.world_id]
    raw_dir = TOOLS / "raw" / "settlements" / args.world_id
    missing = [str(raw_dir / f"{k}.json") for k in ("divisions", "roads", "places", "buildings") if not (raw_dir / f"{k}.json").exists()]
    if missing:
        raise SystemExit("Eksik ham veri (önce fetch_settlements.py çalıştır):\n  " + "\n  ".join(missing))
    release = json.loads((raw_dir / "divisions.json").read_text(encoding="utf-8"))["overture_release"]
    world_dir = REPO / "public" / "data" / "world" / args.world_id

    data = build_settlements(world_dir, raw_dir, config, release)
    size, sha = write_output(world_dir, data)
    ranks = Counter(s["rank"] for s in data["settlements"])
    road_classes = Counter(r["c"] for r in data["roads"])
    road_length = defaultdict(float)
    for r in data["roads"]:
        pts = delta_decode(r["d"])
        road_length[r["c"]] += sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
    print(
        f"{args.world_id}: {len(data['settlements'])} yerleşim ({dict(ranks)}), {len(data['landmarks'])} simge yapı, "
        f"{len(data['roads'])} yol ({dict(road_classes)}; uzunluk oyun m: "
        + ", ".join(f"{k}={v:.0f}" for k, v in sorted(road_length.items()))
        + f"), {size / 1e3:.0f} KB, sha256 {sha[:12]}…"
    )
    empty = [s["name"] for s in data["settlements"] if s["rank"] != "koy" and not s["cells"]]
    if empty:
        print(f"  uyarı: bina hücresi olmayan merkezler: {', '.join(empty)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
