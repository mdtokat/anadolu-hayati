import { beforeAll, describe, expect, it } from 'vitest';
import { ambientMix } from '../src/audio/ambientMix';
import { TELEPORTS } from '../src/config';
import type { RegionData } from '../src/data/region';
import { latLonToGame } from '../src/world/geo';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealRegion } from './helpers/realRegion';

let region: RegionData;
let source: RegionHeightSource;
let cover: LandCoverMap;
const at = (lat: number, lon: number) => latLonToGame(lat, lon, region.meta.originUtm);

beforeAll(async () => {
  region = await loadRealRegion();
  source = RegionHeightSource.fromRegion(region);
  cover = LandCoverMap.fromRegion(region)!;
}, 60_000);

describe('RegionHeightSource.distanceToSea (gerçek bölge)', () => {
  it('denizin içinde 0; kıyıya yakın karada küçük; iç kesimde çok büyük', () => {
    const sea = firstSeaPoint();
    const coast = at(41.75, 32.39); // Amasra
    const inland = at(41.25, 32.69); // Safranbolu
    expect(source.distanceToSea(sea.x, sea.z)).toBe(0);
    expect(source.distanceToSea(coast.x, coast.z)).toBeLessThan(150);
    expect(source.distanceToSea(inland.x, inland.z)).toBeGreaterThan(AMBIENT_FAR());
  });

  it('kıyıdan iç kesime yürürken uzaklık (kabaca) artar', () => {
    let previous = -1;
    let increases = 0;
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const p = at(41.75 - (0.4 * i) / steps, 32.39); // Amasra'dan güneye
      const d = source.distanceToSea(p.x, p.z);
      if (d > previous) increases++;
      previous = d;
    }
    expect(increases).toBeGreaterThan(steps * 0.6);
  });

  it('ızgara dışı sonsuz uzaklık verir (deniz sesi yok)', () => {
    expect(source.distanceToSea(1e7, 1e7)).toBe(Number.POSITIVE_INFINITY);
  });

  it('ilk çağrıdan sonra sorgu ucuz (önbellekli)', () => {
    source.distanceToSea(0, 0);
    const t0 = performance.now();
    for (let i = 0; i < 20_000; i++) source.distanceToSea(i % 500, (i * 7) % 500);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

/** Izgara içinde (taban çukurlaştırılmış, yani negatif yükseklikli) ilk deniz hücresinin merkezi. */
function firstSeaPoint(): { x: number; z: number } {
  for (let r = 0; r < source.height; r++) {
    for (let c = 0; c < source.width; c++) {
      const x = source.xAt(c);
      const z = source.zAt(r);
      if (source.heightAt(x, z) < 0) return { x, z };
    }
  }
  throw new Error('bölgede deniz hücresi yok');
}

function AMBIENT_FAR(): number {
  return 350; // AMBIENT.seaFarDistance (testte sabit: iç kesim bunun çok ötesinde olmalı)
}

describe('gerçek bölgede ortam karışımı', () => {
  const sample = (lat: number, lon: number, sun: number) => {
    const p = at(lat, lon);
    return ambientMix({
      elevationM: source.elevationAt(p.x, p.z),
      seaDistance: source.distanceToSea(p.x, p.z),
      cover: cover.classAt(p.x, p.z),
      sunAltitudeDeg: sun,
      sheltered: false,
    });
  };

  it('Amasra kıyısında deniz belirgin; Safranbolu iç kesiminde deniz yok', () => {
    expect(sample(41.75, 32.39, 40).sea).toBeGreaterThan(0.5);
    expect(sample(41.25, 32.69, 40).sea).toBe(0);
  });

  it('Yenice ormanında gündüz kuş + yaprak, gece cırcır; rüzgâr hafif', () => {
    const day = sample(41.2, 32.34, 40);
    const night = sample(41.2, 32.34, -30);
    expect(day.leaves).toBeGreaterThan(0.2);
    expect(day.birds).toBeGreaterThan(0.3);
    expect(day.night).toBe(0);
    expect(night.night).toBeGreaterThan(0.3);
    expect(night.birds).toBe(0);
  });

  it('ışınlanma noktalarının hepsinde seviyeler geçerlidir', () => {
    for (const tp of TELEPORTS) {
      const m = sample(tp.lat, tp.lon, 20);
      for (const v of Object.values(m)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
