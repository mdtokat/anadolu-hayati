"""Dünya tanımı yükleyicisi (Faz 12.0b): `world.yaml` / `settlements.yaml` ortak ayarlarını ve `tools/groups/*.yaml`
il gruplarını birleştirir; sınır kutusunu (`bbox`) hedef illerden türetir.

Neden: genişlemeler (Faz 12: batı / doğu / güney grupları) aynı anda üç oturumda yazılır; il listesi, üslup, simge yapı
ve sınır kutusu tek satırlık ortak alanlar olursa her PR çakışırdı. Artık her grup yalnızca kendi `groups/<grup>.yaml`
dosyasını düzenler; ortak dosyalar yalnızca ortak ayarları taşır (`neighbors`, `margin_m`, `village_fraction` …).

Grup dosyası biçimi (hepsi isteğe bağlı; bilinmeyen anahtar hata verir):
  provinces: [Kocaeli, Bilecik]      geoBoundaries `shapeName` (Türkçe karakterlerle); akış dizisi
  styles: { Gebze: sanayi }          yerleşim üslubu (settlements.yaml `styles` biçimi)
  display_names: { Ereğli: ... }     Overture adı → görünen ad
  landmarks: [ {settlement, kind, name, lon, lat} ]
  clip_bbox: { Ankara: [lon0, lat0, lon1, lat1] }   ızgara kapsamı hesabında il çokgenini kırpar (il sınırı tam kalır)
  no_mosque_towns: [Amasra]          cami sığmayan merkezler (yalnızca test istisnası; veri hattı okumaz)

Sınır kutusu: hedef illerin (kırpılmış) UTM sınırlarından `margin_m` payla kafese hizalı ızgara kurulur
(`worldlib.grid_for_lattice`); `bbox` bu ızgaranın enlem/boylam zarfıdır (0,01° dışa yuvarlı). `world.yaml` `bbox_max`
üst sınır kutusudur (EPSG:32636'nın güvenli aralığı): türetilen kutu bunun içinde kalmalıdır.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

import worldlib as wl

TOOLS = Path(__file__).resolve().parent
GROUPS_DIR = TOOLS / "groups"
BOUNDARIES_PATH = TOOLS / "raw" / "boundaries" / "geoBoundaries-TUR-ADM1.geojson"

#: Grup dosyasında geçerli anahtarlar (yazım hatası sessizce yutulmasın).
GROUP_KEYS = frozenset({"provinces", "styles", "display_names", "landmarks", "clip_bbox", "no_mosque_towns"})
#: Zarf sınırı yuvarlama adımı (derece): DEM karolarını ve Overture satır gruplarını seçer; dışa yuvarlanır.
BBOX_STEP = 0.01
#: Izgara kenarından zarf için örneklenen nokta sayısı (kenar başına): UTM dikdörtgeninin enlem/boylam zarfı kenar
#: ortalarında köşelerden taşabilir (meridyen yakınsaması).
EDGE_SAMPLES = 64


def fetch_arguments(description: str, argv: list[str], default_world: str):
    """`fetch_*` betiklerinin ortak komut satırı: `[dünya-id] [--groups a,b]` (yalnızca bu gruplar; varsayılan hepsi)."""
    import argparse

    parser = argparse.ArgumentParser(description=description, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("world_id", nargs="?", default=default_world)
    parser.add_argument(
        "--groups",
        default=None,
        help="virgülle ayrılmış il grupları (örn. cekirdek,bati); yalnızca bunların illerinin sınır kutusu indirilir (varsayılan: hepsi)",
    )
    return parser.parse_args(argv)


def read_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def world_entry(world_id: str, name: str = "world.yaml", tools: Path = TOOLS) -> dict:
    worlds = read_yaml(tools / name)["worlds"]
    if world_id not in worlds:
        raise SystemExit(f"Bilinmeyen dünya: {world_id!r}. Tanımlılar: {', '.join(worlds)}")
    return dict(worlds[world_id])


def group_names(world: dict, selected: list[str] | None = None) -> list[str]:
    """Dünyanın grup listesi (`world.yaml` `groups`, birleştirme sırası); `selected` verilirse onunla sınırlanır."""
    names = list(world.get("groups") or [])
    if selected is None:
        return names
    unknown = [n for n in selected if n not in names]
    if unknown:
        raise SystemExit(f"Bilinmeyen grup: {', '.join(unknown)}. Tanımlılar: {', '.join(names)}")
    return [n for n in names if n in set(selected)]  # birleştirme sırası korunur


def parse_groups_arg(value: str | None) -> list[str] | None:
    """`--groups bati,dogu` → ['bati', 'dogu']; verilmediyse None (hepsi)."""
    if value is None:
        return None
    return [part.strip() for part in value.split(",") if part.strip()]


def load_group(name: str, groups_dir: Path = GROUPS_DIR) -> dict:
    path = groups_dir / f"{name}.yaml"
    if not path.exists():
        raise SystemExit(f"Grup dosyası yok: {path}")
    data = read_yaml(path)
    unknown = sorted(set(data) - GROUP_KEYS)
    if unknown:
        raise SystemExit(f"{path.name}: bilinmeyen anahtar {unknown} (geçerli: {sorted(GROUP_KEYS)})")
    return data


def merge_groups(names: list[str], groups_dir: Path = GROUPS_DIR) -> dict[str, Any]:
    """Grup dosyalarını sırayla birleştirir. İl, üslup, görünen ad ve kırpma anahtarları gruplar arasında benzersiz
    olmalıdır (iki grup aynı ili ya da yer adını tanımlarsa hata: sahiplik karışmasın). Simge yapılar sırayla eklenir."""
    merged: dict[str, Any] = {
        "provinces": [],
        "styles": {},
        "display_names": {},
        "landmarks": [],
        "clip_bbox": {},
        "no_mosque_towns": [],
    }
    owner: dict[str, dict[str, str]] = {"provinces": {}, "styles": {}, "display_names": {}, "clip_bbox": {}}
    for name in names:
        group = load_group(name, groups_dir)
        for province in group.get("provinces") or []:
            _claim(owner["provinces"], province, name, "il")
            merged["provinces"].append(province)
        for key in ("styles", "display_names", "clip_bbox"):
            for item, value in (group.get(key) or {}).items():
                _claim(owner[key], item, name, key)
                merged[key][item] = value
        merged["landmarks"] += list(group.get("landmarks") or [])
        merged["no_mosque_towns"] += list(group.get("no_mosque_towns") or [])
    stray = sorted(set(merged["clip_bbox"]) - set(merged["provinces"]))
    if stray:
        raise SystemExit(f"clip_bbox hedef il olmayan bir ili kırpıyor: {stray}")
    return merged


def _claim(owners: dict[str, str], key: str, group: str, what: str) -> None:
    if key in owners:
        raise SystemExit(f"{what} '{key}' iki grupta tanımlı: {owners[key]} ve {group}")
    owners[key] = group


# -- sınır kutusu (geopandas gerektirir; yalnızca çağrılınca içe aktarılır) -----------------------------------


def target_bounds(targets, clip_bbox: dict[str, list[float]] | None) -> tuple[float, float, float, float]:
    """Hedef illerin UTM sınırları; `clip_bbox` (lon/lat) verilen illerin çokgeni kutuyla kesilir.

    `targets`: UTM'de (wl.CRS), `shapeName` sütunlu GeoDataFrame. Kırpma boş bir çokgen bırakırsa hata."""
    from shapely.geometry import box
    from pyproj import Transformer

    clip_bbox = clip_bbox or {}
    to_utm = Transformer.from_crs("EPSG:4326", wl.CRS, always_xy=True)
    geometries = []
    for row in targets.itertuples():
        geometry = row.geometry
        if row.shapeName in clip_bbox:
            lon0, lat0, lon1, lat1 = clip_bbox[row.shapeName]
            corners = [to_utm.transform(lon, lat) for lon, lat in ((lon0, lat0), (lon1, lat0), (lon1, lat1), (lon0, lat1))]
            geometry = geometry.intersection(box(*_bounds(corners)))
            if geometry.is_empty:
                raise SystemExit(f"clip_bbox {row.shapeName} ilinin çokgeniyle kesişmiyor")
        geometries.append(geometry)
    from shapely.ops import unary_union

    return unary_union(geometries).bounds


def _bounds(points: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs, ys = zip(*points)
    return min(xs), min(ys), max(xs), max(ys)


def grid_lonlat_envelope(grid: wl.Grid | Any) -> tuple[float, float, float, float]:
    """Izgara dikdörtgeninin (kenarlar boyunca örneklenmiş) enlem/boylam zarfı: [lon_min, lat_min, lon_max, lat_max]."""
    from pyproj import Transformer

    to_lonlat = Transformer.from_crs(wl.CRS, "EPSG:4326", always_xy=True)
    points: list[tuple[float, float]] = []
    for i in range(EDGE_SAMPLES + 1):
        t = i / EDGE_SAMPLES
        e = grid.left + t * (grid.right - grid.left)
        n = grid.bottom + t * (grid.top - grid.bottom)
        points += [(e, grid.top), (e, grid.bottom), (grid.left, n), (grid.right, n)]
    lons, lats = to_lonlat.transform([p[0] for p in points], [p[1] for p in points])
    return min(lons), min(lats), max(lons), max(lats)


def round_outward(bbox: tuple[float, float, float, float], step: float = BBOX_STEP) -> list[float]:
    """[lon_min, lat_min, lon_max, lat_max] kutusunu `step` katlarına dışa yuvarlar (ondalık gürültüsüz)."""
    import math

    lon0, lat0, lon1, lat1 = bbox
    decimals = max(0, round(-math.log10(step)))
    return [
        round(math.floor(lon0 / step + 1e-9) * step, decimals),
        round(math.floor(lat0 / step + 1e-9) * step, decimals),
        round(math.ceil(lon1 / step - 1e-9) * step, decimals),
        round(math.ceil(lat1 / step - 1e-9) * step, decimals),
    ]


def derive_bbox(
    boundaries,
    provinces: list[str],
    margin_m: float,
    clip_bbox: dict[str, list[float]] | None = None,
    bbox_max: list[float] | None = None,
) -> list[float]:
    """Hedef illerden sınır kutusu: kırpılmış il sınırları + `margin_m` paylı kafes ızgarasının enlem/boylam zarfı.

    `boundaries`: UTM'de il çokgenleri (`shapeName`, `shapeISO`). Boş il listesi → hata (kutu yok).
    `bbox_max` verilmişse türetilen kutu bunun içinde kalmalıdır."""
    if not provinces:
        raise SystemExit("Hedef il listesi boş: sınır kutusu türetilemez (tools/groups/*.yaml).")
    found = boundaries[boundaries.shapeName.isin(provinces)]
    missing = sorted(set(provinces) - set(found.shapeName))
    if missing:
        raise SystemExit(f"geoBoundaries'te bulunamadı: {missing}")
    minx, miny, maxx, maxy = target_bounds(found, clip_bbox)
    grid = wl.grid_for_lattice(minx, miny, maxx, maxy, margin_m)
    bbox = round_outward(grid_lonlat_envelope(grid))
    if bbox_max is not None:
        lon0, lat0, lon1, lat1 = bbox_max
        if bbox[0] < lon0 or bbox[1] < lat0 or bbox[2] > lon1 or bbox[3] > lat1:
            raise SystemExit(
                f"Türetilen sınır kutusu {bbox}, world.yaml bbox_max {bbox_max} dışına çıkıyor: "
                "EPSG:32636'nın güvenli aralığını gözden geçirip bbox_max'ı bilinçli olarak genişlet."
            )
    return bbox


def load_world(
    world_id: str,
    selected_groups: list[str] | None = None,
    tools: Path = TOOLS,
    boundaries_path: Path | None = None,
) -> dict:
    """Birleştirilmiş dünya tanımı: `world.yaml` ortak ayarları + grup il listesi + türetilmiş `bbox`.

    `selected_groups`: yalnızca bu grupların illeri (fetch_*'in `--groups` bayrağı); None = hepsi."""
    world = world_entry(world_id, "world.yaml", tools)
    merged = merge_groups(group_names(world, selected_groups), tools / "groups")
    world["provinces"] = merged["provinces"]
    world["clip_bbox"] = merged["clip_bbox"]
    path = boundaries_path or (tools / "raw" / "boundaries" / "geoBoundaries-TUR-ADM1.geojson")
    if not path.exists():
        raise SystemExit(f"İl sınırları yok ({path}): önce `python fetch_boundaries.py` çalıştır (sınır kutusu bundan türetilir).")
    import geopandas as gpd

    boundaries = gpd.read_file(path).to_crs(wl.CRS)
    world["bbox"] = derive_bbox(
        boundaries, world["provinces"], float(world["margin_m"]), world["clip_bbox"], world.get("bbox_max")
    )
    return world


def load_settlements_config(world_id: str, tools: Path = TOOLS) -> dict:
    """Birleştirilmiş yerleşim tanımı: `settlements.yaml` ortak ayarları + tüm grupların il/üslup/ad/simge yapıları.
    Ham veri gerekmez."""
    world = world_entry(world_id, "world.yaml", tools)
    config = world_entry(world_id, "settlements.yaml", tools)
    merged = merge_groups(group_names(world), tools / "groups")
    config["provinces"] = merged["provinces"]
    config["styles"] = {**(config.get("styles") or {}), **merged["styles"]}
    config["display_names"] = {**(config.get("display_names") or {}), **merged["display_names"]}
    config["landmarks"] = list(config.get("landmarks") or []) + merged["landmarks"]
    return config
