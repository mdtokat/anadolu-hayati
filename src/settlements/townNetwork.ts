import { ROADS, SETTLEMENT_LAYOUT } from '../config';
import type { RoadData, SettlementsData } from '../data/settlements';
import type { FootprintRegistry } from './footprints';
import { footprintRadius, settlementCenter, type LayoutTerrain } from './layout';
import { PointIndex, samplePath, terrainRouteField } from './roadNetwork';
import type { NearestWater } from './roadRouting';
import { findRoute, type RouteField } from './routeFinder';

/**
 * Kent içi yol ağı bağlantısı (saf): il/ilçe merkezlerinde veri yolları kentin içinde kesilir (`cutRoads`) ve yerlerini
 * kent sokakları alır. Bu modül (1) kesilen yol uçlarını en yakın sokağa/anayola yapı ayak izlerinden kaçan kısa
 * yollarla bağlar, (2) hiçbir yola bağlanmayan sokak adalarını bağlar; bağlanamayanları siler. Sonuçta kentte kopuk
 * çizgi kalmaz.
 */

export interface TownRoads {
  /** Kesilen yol uçlarından sokaklara giden bağlantılar. */
  joins: RoadData[];
  /** Bağlı kalan sokaklar (+ ada bağlantı yolları). */
  streets: RoadData[];
}

/** Çizgi örnek aralığı (oyun m). */
const SAMPLE_STEP = 2.2;

/** Aynı yol ağına ait sayılma uzaklığı (oyun m): yol/sokak çizgileri bu kadar yakınsa kesişir. */
const TOUCH = 2.4;

export function connectTownRoads(
  roads: readonly RoadData[],
  streets: readonly RoadData[],
  data: SettlementsData,
  terrain: LayoutTerrain & { nearestWater?: NearestWater },
  footprints: FootprintRegistry,
): TownRoads {
  const towns = data.settlements
    .filter((s) => s.rank !== 'koy')
    .map((s) => ({
      ...settlementCenter(s),
      r: footprintRadius(s) * SETTLEMENT_LAYOUT.innerRoadCut,
      reach: footprintRadius(s) * 1.4,
    }));
  if (towns.length === 0) return { joins: [], streets: [...streets] };

  const base = terrainRouteField({
    heightAt: terrain.heightAt,
    elevationAt: terrain.elevationAt,
    nearestWater: terrain.nearestWater,
    bounds: { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity },
  });
  // Rota ekseni yapıdan yol yarı genişliği + pay kadar uzak kalır (boyanan yol yapıya girmesin).
  const fieldFor = (cls: number): RouteField => {
    const margin = (ROADS.width[cls] as number) / 2 + 0.9;
    return {
      cost: (x, z) =>
        footprints.contains(x, z, margin) ? Number.POSITIVE_INFINITY : base.cost(x, z),
    };
  };

  const nearTown = (x: number, z: number) =>
    towns.some((t) => Math.hypot(x - t.x, z - t.z) <= t.reach);
  // Çizgilerin kent çevresindeki örnek noktaları (2,2 m); bağlantı turları arasında yeniden hesaplanmaz.
  const sampleCache = new Map<RoadData, number[]>();
  const samplesOf = (line: RoadData): number[] => {
    let out = sampleCache.get(line);
    if (!out) {
      out = [];
      const sp = samplePath(Array.from(line.xz), SAMPLE_STEP);
      for (let i = 0; i + 1 < sp.length; i += 2) {
        if (nearTown(sp[i] as number, sp[i + 1] as number))
          out.push(sp[i] as number, sp[i + 1] as number);
      }
      sampleCache.set(line, out);
    }
    return out;
  };
  // Kentlerin çevresindeki veri yolları (bağlantı hedefi ve ada kontrolü için).
  const nearRoads = roads.filter((road) => {
    // Seyrek köşeli düz yollar kentin içinden geçebilir: köşeler değil, 20 m'lik örnekler denetlenir.
    const sp = samplePath(Array.from(road.xz), 20);
    for (let i = 0; i + 1 < sp.length; i += 2) {
      if (nearTown(sp[i] as number, sp[i + 1] as number)) return true;
    }
    return false;
  });

  // 1. Kesilen yol uçlarını sokaklara/anayola bağla.
  const targets = new PointIndex();
  for (const line of [...streets, ...nearRoads.filter((r) => r.cls === 0)]) {
    const sp = samplePath(Array.from(line.xz), 5);
    for (let i = 0; i + 1 < sp.length; i += 2)
      targets.add(sp[i] as number, sp[i + 1] as number, 0, line.cls);
  }
  const joins: RoadData[] = [];
  for (const road of roads) {
    if (road.cls === 0) continue;
    const n = road.xz.length;
    for (const at of [0, n - 2]) {
      const ex = road.xz[at] as number;
      const ez = road.xz[at + 1] as number;
      if (!towns.some((t) => Math.abs(Math.hypot(ex - t.x, ez - t.z) - t.r) < 14)) continue;
      const target = targets.nearest(ex, ez, SETTLEMENT_LAYOUT.joinReach);
      if (!target || target.d < 3) continue;
      const route = findRoute(ex, ez, target.x, target.z, fieldFor(road.cls), { pad: 24 });
      if (route) joins.push({ cls: road.cls, xz: Float32Array.from(route) });
    }
  }

  // 2. Sokak adaları: veri yollarına/anayollara bağlı olmayan sokak bileşenleri en yakın bağlı çizgiye bağlanır
  // (bağlanınca onlar da hedef olur); bağlanamayanlar silinir. Bileşenler bir kez hesaplanır.
  const lines = [...nearRoads, ...joins, ...streets];
  const dataCount = nearRoads.length + joins.length;
  const comp = componentsOf(lines.map((line) => samplesOf(line)));
  const anchored = new Set<number>();
  for (let i = 0; i < dataCount; i++) anchored.add(comp[i] as number);
  const index = new PointIndex();
  const addToIndex = (line: RoadData, label: number) => {
    const sp = samplesOf(line);
    for (let k = 0; k + 3 < sp.length; k += 4) {
      index.add(sp[k] as number, sp[k + 1] as number, label, line.cls);
    }
  };
  for (let i = 0; i < dataCount; i++) addToIndex(lines[i] as RoadData, -2);
  const stray = new Map<number, number[]>();
  for (let i = dataCount; i < lines.length; i++) {
    const c = comp[i] as number;
    if (anchored.has(c)) {
      addToIndex(lines[i] as RoadData, -2);
      continue;
    }
    const list = stray.get(c) ?? [];
    list.push(i);
    stray.set(c, list);
  }
  const dropped = new Set<RoadData>();
  const added: RoadData[] = [];
  for (const [c, members] of stray) {
    let best: { ax: number; az: number; q: { x: number; z: number; d: number } } | null = null;
    for (const i of members) {
      const sp = samplesOf(lines[i] as RoadData);
      for (let k = 0; k + 1 < sp.length; k += 4) {
        const q = index.nearestOther(
          sp[k] as number,
          sp[k + 1] as number,
          c,
          best ? best.q.d : SETTLEMENT_LAYOUT.joinReach * 1.5,
        );
        if (q && (best === null || q.d < best.q.d))
          best = { ax: sp[k] as number, az: sp[k + 1] as number, q };
      }
    }
    let linked = false;
    if (best && best.q.d > TOUCH) {
      const route = findRoute(best.ax, best.az, best.q.x, best.q.z, fieldFor(1), { pad: 24 });
      if (route) {
        const link: RoadData = { cls: 1, xz: Float32Array.from(route) };
        added.push(link);
        addToIndex(link, -2);
        linked = true;
      }
    } else if (best) {
      linked = true; // zaten değiyor
    }
    if (linked) for (const i of members) addToIndex(lines[i] as RoadData, -2);
    else for (const i of members) dropped.add(lines[i] as RoadData);
  }
  const kept = streets.filter((st) => !dropped.has(st));
  return { joins, streets: [...kept, ...added] };
}

/**
 * Çizgilerin bağlı bileşenleri: iki çizgi herhangi bir noktada `TOUCH` içinde yakınsa aynı bileşendir (kesişen
 * sokaklar, uç uca gelen yollar). Dönüş: çizgi başına bileşen etiketi.
 */
function componentsOf(samples: ReadonlyArray<readonly number[]>): Int32Array {
  const parent = Int32Array.from({ length: samples.length }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i] as number] as number;
      i = parent[i] as number;
    }
    return i;
  };
  const cell = 4;
  const grid = new Map<number, Array<{ x: number; z: number; line: number }>>();
  const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
  samples.forEach((sp, li) => {
    for (let k = 0; k + 1 < sp.length; k += 2) {
      const x = sp[k] as number;
      const z = sp[k + 1] as number;
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const other of grid.get(key(cx + dx, cz + dz)) ?? []) {
            if (other.line !== li && Math.hypot(other.x - x, other.z - z) <= TOUCH) {
              parent[find(li)] = find(other.line);
            }
          }
        }
      }
      const list = grid.get(key(cx, cz));
      if (list) list.push({ x, z, line: li });
      else grid.set(key(cx, cz), [{ x, z, line: li }]);
    }
  });
  const out = new Int32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = find(i);
  return out;
}
