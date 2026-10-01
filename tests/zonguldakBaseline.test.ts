import { beforeAll, describe, expect, it } from 'vitest';
import { CREATURES, FRESH_WATER, HORIZONTAL_SCALE, VERTICAL_SCALE } from '../src/config';
import { createRegionCreatureTerrain } from '../src/creatures/regionTerrain';
import type { CreatureTerrain } from '../src/creatures/kinds';
import type { ProvinceShape, RegionData } from '../src/data/region';
import { LANDCOVER_CLASSES } from '../src/data/landcover';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { provinceAt } from '../src/world/provinces';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { forestStarts, walk } from './helpers/creatureWalk';
import { loadRealWorld } from './helpers/realRegion';

/**
 * 8.0 Zonguldak ölçüm tabanı: pilot ilin (il sınırı içi) arazi, örtü, eğim, su ve canlı yoğunluğu istatistikleri.
 * Sonraki Faz 8 görevlerinin "önce/sonra" karşılaştırması bu sayılara göredir (docs/faz-8-zonguldak-olcumler.md).
 * Hiçbir oyun davranışı değişmez; yalnızca ölçer. Yapısal sayılar gevşek aralıklarla denetlenir;
 * `ZONGULDAK_REPORT=1 npx vitest run tests/zonguldakBaseline.test.ts` tabloları stdout'a yazar.
 */

const PILOT = 'Zonguldak';
const REPORT = Boolean(process.env.ZONGULDAK_REPORT);

/** Oyun m² → gerçek km²: (50 m)² = 2500 m² gerçek / oyun m². */
const GAME_M2_TO_KM2 = (HORIZONTAL_SCALE * HORIZONTAL_SCALE) / 1e6;
/** Oyun m → gerçek km. */
const GAME_M_TO_KM = HORIZONTAL_SCALE / 1000;

let region: RegionData;
let source: RegionHeightSource;
let terrain: CreatureTerrain;
let province: ProvinceShape;

beforeAll(async () => {
  region = await loadRealWorld();
  source = RegionHeightSource.fromRegion(region);
  terrain = createRegionCreatureTerrain({
    source,
    cover: LandCoverMap.fromRegion(region),
    freshWater: new FreshWaterIndex(region.features!.water, FRESH_WATER.indexCellSize),
  });
  province = region.provinces.find((p) => p.name === PILOT)!;
}, 60_000);

function out(text: string): void {
  if (REPORT) process.stdout.write(`${text}\n`);
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
}

interface GridStats {
  cells: number;
  landCells: number;
  coastEdges: number;
  /** Sınır kutusu içinde, hiçbir ilin çokgenine düşmeyen kara hücreleri (il çokgeni kıyıdan içeride kalıyor). */
  noProvinceLand: number;
  /** ...bunlardan denize komşu olanlar (ilsiz kıyı şeridi). */
  noProvinceCoast: number;
  coverCounts: Record<string, number>;
  elevations: number[];
  slopes: number[];
}

/** İl sınırı içindeki ızgara hücrelerinin (100 m gerçek) istatistikleri. */
function gridStats(): GridStats {
  const { gridWidth, gridHeight, gridOrigin, cellSizeReal } = region.meta;
  const cell = cellSizeReal / HORIZONTAL_SCALE;
  const b = province.bounds;
  const c0 = Math.max(0, Math.floor((b.minX - gridOrigin.x) / cell));
  const c1 = Math.min(gridWidth - 1, Math.ceil((b.maxX - gridOrigin.x) / cell));
  const r0 = Math.max(0, Math.floor((b.minZ - gridOrigin.z) / cell));
  const r1 = Math.min(gridHeight - 1, Math.ceil((b.maxZ - gridOrigin.z) / cell));
  const { elevationMin, elevationMax } = region.meta;
  const stats: GridStats = {
    cells: 0,
    landCells: 0,
    coastEdges: 0,
    noProvinceLand: 0,
    noProvinceCoast: 0,
    coverCounts: Object.fromEntries(LANDCOVER_CLASSES.map((k) => [k, 0])),
    elevations: [],
    slopes: [],
  };
  // Deniz = heightmap'te 0 m (sözleşme; `RegionHeightSource` da böyle ayırır). Arazi örtüsü kıyıdan denize taşabilir.
  const isLand = (i: number): boolean => (region.heights[i] as number) > 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = gridOrigin.x + c * cell;
      const z = gridOrigin.z + r * cell;
      const i = r * gridWidth + c;
      if (provinceAt([province], x, z) === null) {
        if (isLand(i) && provinceAt(region.provinces, x, z) === null) {
          stats.noProvinceLand++;
          const seaNeighbor = [1, -1, gridWidth, -gridWidth].some(
            (d) => i + d >= 0 && i + d < region.heights.length && !isLand(i + d),
          );
          if (seaNeighbor) stats.noProvinceCoast++;
        }
        continue;
      }
      stats.cells++;
      if (!isLand(i)) continue;
      stats.landCells++;
      const cls = LANDCOVER_CLASSES[region.landcover?.[i] ?? 0] as string;
      stats.coverCounts[cls] = (stats.coverCounts[cls] ?? 0) + 1;
      const v = region.heights[i] as number;
      stats.elevations.push(elevationMin + (v / 65535) * (elevationMax - elevationMin));
      stats.slopes.push(source.slopeDegAt(x, z));
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= gridWidth || nr >= gridHeight) continue;
        if (!isLand(nr * gridWidth + nc)) stats.coastEdges++;
      }
    }
  }
  stats.elevations.sort((a, b2) => a - b2);
  stats.slopes.sort((a, b2) => a - b2);
  return stats;
}

/** Çokgen dış halkasının alanı (oyun m², shoelace). */
function ringArea(ring: Float64Array): number {
  let a = 0;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a +=
      (ring[j * 2] as number) * (ring[i * 2 + 1] as number) -
      (ring[i * 2] as number) * (ring[j * 2 + 1] as number);
  }
  return Math.abs(a) / 2;
}

function waterStats() {
  const water = region.features!.water;
  const inside = (x: number, z: number): boolean => provinceAt([province], x, z) !== null;
  const lineKm: Record<string, number> = { river: 0, stream: 0, canal: 0 };
  const named = new Map<string, number>();
  for (const line of water.lines) {
    // Çizgiyi bölüm ortasından il içine say: sınırı aşan nehirler kabaca kırpılır.
    for (let i = 0; i + 3 < line.xz.length; i += 2) {
      const x0 = line.xz[i] as number;
      const z0 = line.xz[i + 1] as number;
      const x1 = line.xz[i + 2] as number;
      const z1 = line.xz[i + 3] as number;
      if (!inside((x0 + x1) / 2, (z0 + z1) / 2)) continue;
      const km = Math.hypot(x1 - x0, z1 - z0) * GAME_M_TO_KM;
      lineKm[line.kind] = (lineKm[line.kind] ?? 0) + km;
      if (line.name) named.set(line.name, (named.get(line.name) ?? 0) + km);
    }
  }
  const lakes = water.polygons
    .filter((p) => inside((p.bounds.minX + p.bounds.maxX) / 2, (p.bounds.minZ + p.bounds.maxZ) / 2))
    .map((p) => ({
      kind: p.kind,
      name: p.name ?? '',
      km2: ringArea(p.rings[0] as Float64Array) * GAME_M2_TO_KM2,
    }));
  const springs = water.points.filter((p) => inside(p.x, p.z)).length;
  return { lineKm, named, lakes, springs };
}

describe(`${PILOT} ölçüm tabanı (8.0)`, () => {
  it('pilot il manifestte, hedef il ve makul büyüklükte', () => {
    expect(province).toBeDefined();
    expect(province.inRegion).toBe(true);
    const stats = gridStats();
    const areaKm2 = stats.cells * (region.meta.cellSizeReal / 1000) ** 2;
    const landKm2 = stats.landCells * (region.meta.cellSizeReal / 1000) ** 2;
    // Zonguldak il yüzölçümü ≈ 3 300 km² (kıyı şeridinde denize taşan sınır nedeniyle kara biraz küçük çıkabilir).
    expect(areaKm2).toBeGreaterThan(2500);
    expect(areaKm2).toBeLessThan(4500);
    expect(landKm2).toBeGreaterThan(2400);
    expect(landKm2).toBeLessThanOrEqual(areaKm2);
    expect(stats.coastEdges).toBeGreaterThan(200); // Zonguldak kıyı ilidir

    out(`\n## Arazi (il sınırı içi, ${region.meta.cellSizeReal} m hücre)`);
    out(`| Ölçüt | Değer |\n|---|---|`);
    out(`| İl çokgeni alanı | ${areaKm2.toFixed(0)} km² |`);
    out(`| Kara alanı | ${landKm2.toFixed(0)} km² |`);
    out(
      `| İl çokgeni içi kıyı uzunluğu (hücre kenarlarından, yaklaşık) | ${(stats.coastEdges * (region.meta.cellSizeReal / 1000)).toFixed(0)} km |`,
    );
    out(
      `| Sınır kutusunda hiçbir ile ait olmayan kara | ${stats.noProvinceLand} hücre (${(stats.noProvinceLand * (region.meta.cellSizeReal / 1000) ** 2).toFixed(1)} km²), ${stats.noProvinceCoast} hücresi denize komşu |`,
    );
    const e = stats.elevations;
    out(
      `| Rakım ort / medyan / p90 / en yüksek | ${(e.reduce((s, v) => s + v, 0) / e.length).toFixed(0)} / ${percentile(e, 0.5).toFixed(0)} / ${percentile(e, 0.9).toFixed(0)} / ${e[e.length - 1]!.toFixed(0)} m |`,
    );
    const bands: Array<[string, number, number]> = [
      ['0–50 m', 0, 50],
      ['50–200 m', 50, 200],
      ['200–500 m', 200, 500],
      ['500–1000 m', 500, 1000],
      ['≥ 1000 m', 1000, Infinity],
    ];
    out(`\n| Rakım bandı | Kara payı |\n|---|---|`);
    for (const [name, lo, hi] of bands) {
      const n = e.filter((v) => v >= lo && v < hi).length;
      out(`| ${name} | %${((100 * n) / e.length).toFixed(1)} |`);
    }
    const s = stats.slopes;
    out(`\n| Eğim (oyun uzayı) | Kara payı |\n|---|---|`);
    for (const limit of [15, 30, 45, 60]) {
      out(
        `| ≤ ${limit}° | %${((100 * s.filter((v) => v <= limit).length) / s.length).toFixed(1)} |`,
      );
    }
    out(`| Medyan | ${percentile(s, 0.5).toFixed(1)}° |`);
    out(`\n| Arazi örtüsü | Kara payı |\n|---|---|`);
    for (const [cls, n] of Object.entries(stats.coverCounts)) {
      if (n > 0) out(`| ${cls} | %${((100 * n) / stats.landCells).toFixed(1)} |`);
    }
    const forest = (stats.coverCounts.forest ?? 0) / stats.landCells;
    expect(forest).toBeGreaterThan(0.2); // Zonguldak ormanlık bir il
    // Rakım dağılımı: tüm sayılar sonlu ve sıralı.
    expect(e.every((v) => Number.isFinite(v))).toBe(true);
    // Eğim ölçeği notu (CLAUDE.md): kara alanının büyük kısmı oyuncunun tırmanma sınırının (60°) altında.
    expect(s.filter((v) => v <= 60).length / s.length).toBeGreaterThan(0.85);
  });

  it('tatlı su: nehir/dere uzunluğu, göller, kaynaklar', () => {
    const w = waterStats();
    const riverKm = w.lineKm.river ?? 0;
    expect(riverKm + (w.lineKm.stream ?? 0)).toBeGreaterThan(50); // il içinde akarsu var
    out(`\n## Tatlı su (il sınırı içi; çizgiler bölüm ortasından sayılır)`);
    out(`| Tür | Değer |\n|---|---|`);
    out(`| Nehir | ${riverKm.toFixed(0)} km |`);
    out(`| Dere | ${(w.lineKm.stream ?? 0).toFixed(0)} km |`);
    out(`| Kanal | ${(w.lineKm.canal ?? 0).toFixed(0)} km |`);
    out(
      `| Göl/gölet/baraj çokgeni | ${w.lakes.length} (toplam ${w.lakes.reduce((s, l) => s + l.km2, 0).toFixed(2)} km²) |`,
    );
    out(`| Kaynak noktası | ${w.springs} |`);
    const top = [...w.named.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    out(
      `| En uzun adlı akarsular | ${top.map(([n, km]) => `${n} ${km.toFixed(0)} km`).join(', ')} |`,
    );
    const bigLakes = [...w.lakes].sort((a, b) => b.km2 - a.km2).slice(0, 5);
    out(
      `| En büyük durgun sular | ${bigLakes.map((l) => `${l.name || l.kind} ${l.km2.toFixed(2)} km²`).join(', ')} |`,
    );
  });

  it('canlı yoğunluğu: ormanda gündüz av hayvanı, gece kurt, yüksek ormanda ayı', () => {
    const STARTS = 6;
    const low = forestStarts(terrain, region, {
      minElevation: 50,
      maxElevation: 700,
      count: STARTS,
      seed: 277,
      provinces: [PILOT],
    });
    expect(low.length).toBe(STARTS);
    const day = walk(terrain, low, 50, 21);
    const night = walk(terrain, low, -30, 22);
    const prey = day.perMinute.roe_deer + day.perMinute.wild_boar;
    expect(prey).toBeGreaterThan(0.1);
    expect(prey).toBeLessThan(2);
    expect(night.perMinute.wolf).toBeGreaterThanOrEqual(day.perMinute.wolf);
    for (const r of [day, night]) {
      expect(r.peak).toBeLessThanOrEqual(CREATURES.maxActive);
      expect(r.meanMs).toBeLessThan(2);
    }

    const high = forestStarts(terrain, region, {
      minElevation: 700,
      maxElevation: 2000,
      count: STARTS,
      seed: 291,
      provinces: [PILOT],
    });
    const bears = high.length > 0 ? walk(terrain, high, 50, 23).perMinute.brown_bear : null;
    if (bears !== null) expect(bears).toBeLessThan(0.2);

    const fmt = (r: Record<string, number>) =>
      `karaca ${r.roe_deer!.toFixed(3)}, domuz ${r.wild_boar!.toFixed(3)}, kurt ${r.wolf!.toFixed(3)}, ayı ${r.brown_bear!.toFixed(3)}`;
    out(
      `\n## Canlı yoğunluğu (100 m içine giren benzersiz canlı / dk; ${STARTS} başlangıç × 10 dk)`,
    );
    out(`| Durum | Karşılaşma/dk |\n|---|---|`);
    out(`| Orman 50–700 m, gündüz | ${fmt(day.perMinute)} |`);
    out(`| Orman 50–700 m, gece | ${fmt(night.perMinute)} |`);
    out(
      `| Orman ≥ 700 m, gündüz (${high.length} başlangıç) | ${bears === null ? 'uygun orman bulunamadı' : `ayı ${bears.toFixed(3)}`} |`,
    );
    out(`| Bir CreatureSystem adımı (ortalama) | ${day.meanMs.toFixed(3)} ms |`);
  }, 300_000);

  it('ölçek sabitleri sözleşmeyle uyumlu', () => {
    expect(HORIZONTAL_SCALE).toBe(50);
    expect(VERTICAL_SCALE).toBe(15);
  });
});
