import { beforeAll, describe, expect, it } from 'vitest';
import { CLIMATE, CLOCK, FRESH_WATER, SCATTER, SURVIVAL } from '../src/config';
import type { RegionData } from '../src/data/region';
import { ambientTemperature } from '../src/survival/climate';
import { initialVitals, stepVitals, type VitalsState } from '../src/survival/vitals';
import { createRandom } from '../src/utils/random';
import { chunkGridFor, type ChunkGrid } from '../src/world/chunks';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { isInPilotProvince, pilotProvince } from '../src/world/pilot';
import type { PropKind } from '../src/world/propKinds';
import { PROP_KINDS } from '../src/world/propKinds';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { scatterChunk } from '../src/world/scatter';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealWorld } from './helpers/realRegion';

/**
 * 8.4 Zonguldak ekoloji ve denge turu (ölçüm): su, yiyecek ve yakıt bulunabilirliği ile gece soğuğu, pilot il
 * içinde rastgele yürünebilir kara noktalarından. Sonuçlar docs/faz-8-zonguldak-olcumler.md "8.4" bölümündedir;
 * `ZONGULDAK_REPORT=1` tabloları yazdırır. Canlı yoğunluğu `tests/zonguldakBaseline.test.ts`'tedir.
 */
const REPORT = Boolean(process.env.ZONGULDAK_REPORT);
const out = (s: string) => {
  if (REPORT) process.stdout.write(`${s}\n`);
};

/** Oyuncu yürüyüş hızı (oyun m/sn), yürüyerek bulma süresi için. */
const WALK_SPEED = 4;
const FOOD_KINDS: readonly PropKind[] = ['berry_bush', 'hazel', 'chestnut', 'mushroom'];
const FUEL_KINDS: readonly PropKind[] = ['stick', 'bush'];

let region: RegionData;
let source: RegionHeightSource;
let water: FreshWaterIndex;
let grid: ChunkGrid;
let points: Array<{ x: number; z: number; elevation: number }>;

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;

beforeAll(async () => {
  region = await loadRealWorld();
  source = RegionHeightSource.fromRegion(region);
  water = new FreshWaterIndex(region.features!.water, FRESH_WATER.indexCellSize);
  grid = chunkGridFor(source);

  // Pilot ilde rastgele, kara, yürünebilir (≤ 45°) 1500 nokta.
  const pilot = pilotProvince(region.provinces)!;
  const rng = createRandom(8400);
  points = [];
  for (let i = 0; i < 100000 && points.length < 1500; i++) {
    const x = rng.range(pilot.bounds.minX, pilot.bounds.maxX);
    const z = rng.range(pilot.bounds.minZ, pilot.bounds.maxZ);
    if (!isInPilotProvince(region.provinces, x, z) || source.elevationAt(x, z) <= 0) continue;
    if (source.slopeDegAt(x, z) > 45) continue;
    points.push({ x, z, elevation: source.elevationAt(x, z) });
  }
}, 120_000);

describe('Zonguldak ekolojisi (8.4)', () => {
  it(
    'su erişimi: rastgele yürünebilir noktadan en yakın tatlı suya uzaklık',
    { timeout: 60_000 },
    () => {
      const MAX = 2000;
      const distances = points
        .map((p) => water.nearest(p.x, p.z, MAX)?.distance ?? Infinity)
        .sort((a, b) => a - b);
      const within = (d: number) => distances.filter((v) => v <= d).length / distances.length;
      out('\n## 8.4 Su erişimi (rastgele yürünebilir kara noktası → en yakın tatlı su)');
      out('| Ölçüt | Değer |\n|---|---|');
      out(
        `| Medyan / p90 uzaklık | ${percentile(distances, 0.5).toFixed(0)} / ${percentile(distances, 0.9).toFixed(0)} oyun m |`,
      );
      for (const d of [60, 120, 240, 480]) {
        out(
          `| ≤ ${d} m (${(d / WALK_SPEED).toFixed(0)} sn yürüyüş) | %${(100 * within(d)).toFixed(1)} |`,
        );
      }
      // Susuzluk yürürken ~7,5 dk'da biter: oyuncunun çoğu 2 dakikalık (480 m) yürüyüşte su bulabilmeli.
      expect(within(480)).toBeGreaterThan(0.7);
    },
  );

  it('yiyecek ve yakıt: en yakın yenebilir bitki / dal-çalı uzaklığı', () => {
    // Pilot ilin sınır kutusuyla kesişen chunk'ların nesneleri.
    const pilot = pilotProvince(region.provinces)!;
    const b = pilot.bounds;
    const size = grid.cells * grid.cellSize;
    const cx0 = Math.max(grid.cx0, Math.floor((b.minX - grid.originX) / size) + grid.cx0);
    const cx1 = Math.min(
      grid.cx0 + grid.cols - 1,
      Math.floor((b.maxX - grid.originX) / size) + grid.cx0,
    );
    const cy0 = Math.max(grid.cy0, Math.floor((b.minZ - grid.originZ) / size) + grid.cy0);
    const cy1 = Math.min(
      grid.cy0 + grid.rows - 1,
      Math.floor((b.maxZ - grid.originZ) / size) + grid.cy0,
    );
    const cover = LandCoverMap.fromRegion(region)!;
    const CELL = 100;
    const buckets: Record<'food' | 'fuel', Map<string, Array<[number, number]>>> = {
      food: new Map(),
      fuel: new Map(),
    };
    const counts = Object.fromEntries(PROP_KINDS.map((k) => [k, 0])) as Record<PropKind, number>;
    const add = (which: 'food' | 'fuel', x: number, z: number) => {
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      let list = buckets[which].get(key);
      if (!list) buckets[which].set(key, (list = []));
      list.push([x, z]);
    };
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const props = scatterChunk({
          cx,
          cy,
          grid,
          seed: SCATTER.seed,
          cover,
          height: source,
          isWater: (x, z, clearance) => water.nearest(x, z, clearance) !== null,
        });
        for (let i = 0; i < props.count; i++) {
          const x = props.x[i] as number;
          const z = props.z[i] as number;
          if (!isInPilotProvince(region.provinces, x, z)) continue;
          const kind = PROP_KINDS[props.kind[i] as number] as PropKind;
          counts[kind]++;
          if (FOOD_KINDS.includes(kind)) add('food', x, z);
          if (FUEL_KINDS.includes(kind)) add('fuel', x, z);
        }
      }
    }
    const nearest = (which: 'food' | 'fuel', x: number, z: number): number => {
      let best = Infinity;
      const gx = Math.floor(x / CELL);
      const gz = Math.floor(z / CELL);
      for (let ring = 0; ring <= 12; ring++) {
        for (let i = -ring; i <= ring; i++) {
          for (let j = -ring; j <= ring; j++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
            for (const [px, pz] of buckets[which].get(`${gx + i},${gz + j}`) ?? []) {
              best = Math.min(best, Math.hypot(px - x, pz - z));
            }
          }
        }
        if (best <= ring * CELL) break; // daha dış halka daha yakın nokta içeremez
      }
      return best;
    };
    const food = points.map((p) => nearest('food', p.x, p.z)).sort((a, b) => a - b);
    const fuel = points.map((p) => nearest('fuel', p.x, p.z)).sort((a, b) => a - b);
    const within = (arr: number[], d: number) => arr.filter((v) => v <= d).length / arr.length;
    const areaKm2 = 3174; // pilot il çokgeni alanı (km², zonguldakBaseline ölçümü)
    out(
      '\n## 8.4 Yiyecek ve yakıt (pilot ildeki nesneler; nesne yoğunluğu km² başına gerçek alan)',
    );
    out('| Tür | Adet | /km² (gerçek) |\n|---|---|---|');
    for (const k of PROP_KINDS)
      out(`| ${k} | ${counts[k]} | ${(counts[k] / areaKm2).toFixed(1)} |`);
    out('\n| Ölçüt | Yenebilir bitki | Dal / çalı |\n|---|---|---|');
    out(
      `| Medyan uzaklık | ${percentile(food, 0.5).toFixed(0)} m | ${percentile(fuel, 0.5).toFixed(0)} m |`,
    );
    out(
      `| p90 uzaklık | ${percentile(food, 0.9).toFixed(0)} m | ${percentile(fuel, 0.9).toFixed(0)} m |`,
    );
    for (const d of [60, 120, 240]) {
      out(
        `| ≤ ${d} m (${(d / WALK_SPEED).toFixed(0)} sn) | %${(100 * within(food, d)).toFixed(1)} | %${(100 * within(fuel, d)).toFixed(1)} |`,
      );
    }
    // Tokluk yürürken ~19 dk'da biter, yakıt ateş için ilk işlerden: çoğu nokta 2 dakikalık yürüyüşte bulur.
    expect(within(food, 480)).toBeGreaterThan(0.7);
    expect(within(fuel, 120)).toBeGreaterThan(0.8);
  }, 120_000);

  it('gece soğuğu: rakım bandı başına, yatarak/ateşsiz/barınaksız bir gece (18:00 → 06:00 oyun saati)', () => {
    // Süreler gerçek saniyedir; oyun saati CLOCK.dayLengthSeconds / 24 gerçek sn'de bir saat ilerler.
    const secondsPerHour = CLOCK.dayLengthSeconds / 24;
    const keepFed = (s: VitalsState): VitalsState => ({ ...s, hydration: 100, satiety: 100 });
    const night = (elevationM: number, activity: 'rest' | 'walk') => {
      let state = initialVitals();
      let minHealth = state.health;
      let minTemp = state.bodyTemp;
      for (let t = 0; t < 12 * secondsPerHour; t++) {
        const hour = (18 + t / secondsPerHour) % 24;
        const ambientC = ambientTemperature({ hour, dayOfYear: CLOCK.dayOfYear, elevationM });
        const step = stepVitals(state, { activity, ambientC }, 1);
        state = keepFed(step.state);
        minHealth = Math.min(minHealth, state.health);
        minTemp = Math.min(minTemp, state.bodyTemp);
        if (step.dead) return { dead: true, minHealth: 0, minTemp, atMinute: t / 60 };
      }
      return { dead: false, minHealth, minTemp, atMinute: null };
    };
    const elevations = points.map((p) => p.elevation).sort((a, b) => a - b);
    const bands = [
      ['medyan', percentile(elevations, 0.5)],
      ['p90', percentile(elevations, 0.9)],
      ['p99', percentile(elevations, 0.99)],
      ['en yüksek yürünebilir', elevations[elevations.length - 1] as number],
    ] as const;
    out('\n## 8.4 Gece soğuğu (18:00 → 06:00, su-tokluk dolu, ateşsiz/barınaksız)');
    out(
      '| Rakım bandı | Rakım | Gece en düşük ortam | Yatarak: en düşük can / ısı | Yürüyerek: en düşük can / ısı |\n|---|---|---|---|---|',
    );
    for (const [name, e] of bands) {
      const coldest = ambientTemperature({
        hour: CLIMATE.warmestHour - 12,
        dayOfYear: CLOCK.dayOfYear,
        elevationM: e,
      });
      const rest = night(e, 'rest');
      const walk = night(e, 'walk');
      const fmt = (r: ReturnType<typeof night>) =>
        r.dead
          ? `ölür (${r.atMinute!.toFixed(0)}. dk)`
          : `${r.minHealth.toFixed(0)} / ${r.minTemp.toFixed(1)} °C`;
      out(
        `| ${name} | ${e.toFixed(0)} m | ${coldest.toFixed(1)} °C | ${fmt(rest)} | ${fmt(walk)} |`,
      );
    }
    // Medyan rakımda (≈ 300 m) bir gece ateşsiz bile hayatta geçer; yürümek ısıtır.
    expect(night(percentile(elevations, 0.5), 'rest').dead).toBe(false);
    expect(night(percentile(elevations, 0.9), 'walk').dead).toBe(false);
    expect(SURVIVAL.hypothermiaBelowC).toBeGreaterThan(0);
  });
});
