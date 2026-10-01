#!/usr/bin/env python3
"""Üretilmiş dünyanın kalite denetimi raporu (Faz 7.4). Ham veri gerekmez; yalnızca `public/data/world/<id>/` okunur.

Kullanım:  python qa_world.py [dünya-id]      (varsayılan: bati-karadeniz)
Çıktı:     Markdown raporu (stdout) — PR açıklamasına yapıştırılır.

Raporlananlar: karo tablosu (bayt, kara %, yükseklik aralığı), arazi örtüsü histogramı, il kapsamı (hücre sayısı),
eski/yeni alan sınır sürekliliği (komşu örnek farkı iç gradyanla kıyaslanır), su çizgilerinin sınırdan geçişi.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from rasterio.features import rasterize
from affine import Affine

import landcover as landcover_lib
import worldlib as wl

REPO = Path(__file__).resolve().parent.parent
LEGACY_EXTENT = wl.Extent(0, 0, 1588, 1176)


def load_world(world_dir: Path) -> dict:
    """Dünya dizisini birleştirir: manifest, yükseklik (uint16), örtü (uint8), iller, özellikler."""
    manifest = json.loads((world_dir / "world.json").read_text(encoding="utf-8"))
    wl.validate_manifest(manifest)
    extent = wl.Extent.from_dict(manifest["extent"])
    heights, cover = {}, {}
    for tile in manifest["tiles"]:
        key = (tile["tx"], tile["ty"])
        heights[key] = np.fromfile(world_dir / tile["height"], dtype="<u2").reshape(wl.TILE_SIZE, wl.TILE_SIZE)
        cover[key] = np.fromfile(world_dir / tile["cover"], dtype=np.uint8).reshape(wl.TILE_SIZE, wl.TILE_SIZE)
    return {
        "manifest": manifest,
        "extent": extent,
        "heights": wl.assemble(heights, extent, np.uint16),
        "cover": wl.assemble(cover, extent, np.uint8),
        "provinces": json.loads((world_dir / manifest["provinces"]).read_text(encoding="utf-8")),
        "features": json.loads((world_dir / manifest["features"]["file"]).read_text(encoding="utf-8")),
        "dir": world_dir,
    }


def tile_table(world: dict) -> list[dict]:
    """Karo başına bayt, kara oranı (yükseklik > 0 ya da örtü ≠ none), yükseklik aralığı (m); yalnızca extent içi hücreler."""
    manifest, extent = world["manifest"], world["extent"]
    emax = manifest["elevation"]["max"]
    rows = []
    for tile in manifest["tiles"]:
        tx, ty = tile["tx"], tile["ty"]
        c0, c1 = max(tx * wl.TILE_SIZE, extent.col0), min((tx + 1) * wl.TILE_SIZE, extent.col0 + extent.cols)
        r0, r1 = max(ty * wl.TILE_SIZE, extent.row0), min((ty + 1) * wl.TILE_SIZE, extent.row0 + extent.rows)
        h = world["heights"][r0 - extent.row0 : r1 - extent.row0, c0 - extent.col0 : c1 - extent.col0]
        c = world["cover"][r0 - extent.row0 : r1 - extent.row0, c0 - extent.col0 : c1 - extent.col0]
        land = (h > 0) | (c != 0)
        rows.append(
            {
                "tx": tx,
                "ty": ty,
                "height_bytes": (world["dir"] / tile["height"]).stat().st_size,
                "cover_bytes": (world["dir"] / tile["cover"]).stat().st_size,
                "cells": int(h.size),
                "land_pct": float(land.mean() * 100),
                "min_m": float(h.min() / 65535 * emax),
                "max_m": float(h.max() / 65535 * emax),
            }
        )
    return rows


def seam_continuity(world: dict, window: wl.Extent = LEGACY_EXTENT, band: int = 20) -> dict:
    """`window` (eski alan) ile yeni alan arasındaki iki dikişte (batı: sütun `window.col0`, güney: satır
    `window.row0 + rows`) komşu örnek farklarını, dikişe `band` hücre yakın iç farklarla karşılaştırır (metre).

    Dönüş her dikiş için {seam_mean, seam_p99, interior_mean, interior_p99}.
    """
    extent, emax = world["extent"], world["manifest"]["elevation"]["max"]
    meters = world["heights"].astype(np.float64) / 65535 * emax
    c = window.col0 - extent.col0
    r = window.row0 - extent.row0
    r_end = r + window.rows
    c_end = c + window.cols

    def stats(seam: np.ndarray, interior: np.ndarray) -> dict:
        return {
            "seam_mean": float(seam.mean()),
            "seam_p99": float(np.percentile(seam, 99)),
            "interior_mean": float(interior.mean()),
            "interior_p99": float(np.percentile(interior, 99)),
        }

    out: dict[str, dict] = {}
    if c > 0:  # batı dikişi: (c − 1) ↔ c, satırlar window boyunca
        rows = slice(r, r_end)
        seam = np.abs(meters[rows, c] - meters[rows, c - 1])
        interior = np.abs(np.diff(meters[rows, c + 1 : c + 1 + band], axis=1)).ravel()
        out["west"] = stats(seam, interior)
    if r_end < extent.rows:  # güney dikişi: (r_end − 1) ↔ r_end, sütunlar window boyunca
        cols = slice(c, c_end)
        seam = np.abs(meters[r_end, cols] - meters[r_end - 1, cols])
        interior = np.abs(np.diff(meters[r_end - 1 - band : r_end - 1, cols], axis=0)).ravel()
        out["south"] = stats(seam, interior)
    return out


def province_cells(world: dict) -> dict[str, dict]:
    """Her ilin ızgarada kapladığı hücre sayısı (çokgenler hücre merkezine göre işlenir) ve içindeki kara oranı."""
    extent = world["extent"]
    gx, gz = wl.grid_origin_of(extent)
    # Oyun Z güneye doğru artar (satır 0 = en küçük z): rasterio'nun kuzey-yukarı varsayımı yerine pozitif eğimli afin.
    transform = Affine(wl.LATTICE_CELL, 0, gx - wl.LATTICE_CELL / 2, 0, wl.LATTICE_CELL, gz - wl.LATTICE_CELL / 2)
    land = (world["heights"] > 0) | (world["cover"] != 0)
    result = {}
    for feature in world["provinces"]["features"]:
        mask = rasterize(
            [(feature["geometry"], 1)], out_shape=(extent.rows, extent.cols), transform=transform, fill=0, dtype="uint8"
        ).astype(bool)
        count = int(mask.sum())
        result[feature["properties"]["name"]] = {
            "in_region": feature["properties"]["inRegion"],
            "cells": count,
            "land_pct": float(land[mask].mean() * 100) if count else 0.0,
        }
    return result


def water_crossing(world: dict, window: wl.Extent = LEGACY_EXTENT) -> dict:
    """Su çizgilerinin/çokgenlerinin eski/yeni alan dikişini geçen sayısı (oyun X/Z'de dikiş çizgileri)."""
    seam_x = wl.lattice_x(window.col0) - wl.LATTICE_CELL / 2  # batı dikişi (x sabit)
    seam_z = wl.lattice_z(window.row0 + window.rows) - wl.LATTICE_CELL / 2  # güney dikişi (z sabit)
    water = world["features"]["water"]
    west = south = 0
    for line in water["lines"]:
        xs, zs = np.array(line["xz"][0::2]), np.array(line["xz"][1::2])
        within_z = (zs.min() < wl.lattice_z(window.row0 + window.rows)) and (zs.max() > wl.lattice_z(window.row0))
        if xs.min() < seam_x < xs.max() and within_z:
            west += 1
        within_x = (xs.min() < wl.lattice_x(window.col0 + window.cols)) and (xs.max() > wl.lattice_x(window.col0))
        if zs.min() < seam_z < zs.max() and within_x:
            south += 1
    return {"lines_crossing_west_seam": west, "lines_crossing_south_seam": south, "lines": len(water["lines"])}


def report(world: dict) -> str:
    manifest = world["manifest"]
    extent = world["extent"]
    lines = [f"# Dünya kalite raporu — {manifest['id']}", ""]
    lines.append(
        f"extent: {extent.cols}×{extent.rows} (col0 {extent.col0}, row0 {extent.row0}), "
        f"{len(manifest['tiles'])} karo, yükseklik 0–{manifest['elevation']['max']:.0f} m, "
        f"Overture {manifest['overtureRelease']}, built {manifest['built']}"
    )
    lines += ["", "## Karo tablosu", "", "| karo | yükseklik (KB) | örtü (KB) | kara % | min m | max m |", "|---|---|---|---|---|---|"]
    for row in tile_table(world):
        lines.append(
            f"| {row['tx']}_{row['ty']} | {row['height_bytes'] / 1024:.0f} | {row['cover_bytes'] / 1024:.0f} | "
            f"{row['land_pct']:.0f} | {row['min_m']:.0f} | {row['max_m']:.0f} |"
        )
    hist = landcover_lib.class_histogram(world["cover"])
    total = sum(hist.values())
    lines += ["", "## Arazi örtüsü", "", "| sınıf | hücre | % |", "|---|---|---|"]
    lines += [f"| {name} | {count} | {count / total * 100:.1f} |" for name, count in hist.items()]
    lines += ["", "## İl kapsamı", "", "| il | hedef | hücre | kara % |", "|---|---|---|---|"]
    for name, info in sorted(province_cells(world).items()):
        lines.append(f"| {name} | {'evet' if info['in_region'] else 'komşu'} | {info['cells']} | {info['land_pct']:.0f} |")
    lines += ["", "## Eski/yeni alan sınır sürekliliği (komşu örnek farkı, metre)", "", "| dikiş | dikiş ort | dikiş p99 | iç ort | iç p99 |", "|---|---|---|---|---|"]
    for name, s in seam_continuity(world).items():
        lines.append(f"| {name} | {s['seam_mean']:.2f} | {s['seam_p99']:.2f} | {s['interior_mean']:.2f} | {s['interior_p99']:.2f} |")
    crossing = water_crossing(world)
    lines += ["", "## Su", "", f"- {crossing['lines']} akarsu çizgisi; batı dikişini geçen {crossing['lines_crossing_west_seam']}, güney dikişini geçen {crossing['lines_crossing_south_seam']}"]
    water = world["features"]["water"]
    lines.append(f"- {len(water['polygons'])} durgun su çokgeni, {len(water['points'])} kaynak")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    world_id = argv[0] if argv else "bati-karadeniz"
    print(report(load_world(REPO / "public" / "data" / "world" / world_id)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
