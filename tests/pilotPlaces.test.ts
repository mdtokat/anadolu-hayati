import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER, PILOT, PROVINCE_PLACES, REGION_PLAYER, TELEPORTS } from '../src/config';
import type { RegionData } from '../src/data/region';
import { latLonToGame } from '../src/world/geo';
import { isInProvince } from '../src/world/pilot';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { findSafeSpawn } from '../src/world/spawn';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { teleportSlotForKey } from '../src/core/inputMapping';
import { loadRealWorld } from './helpers/realRegion';

/**
 * Faz 8.2: pilot ilin (Zonguldak) ve diğer hedef illerin (Bartın, Karabük, Düzce, Bolu) yer adları / ışınlanma
 * noktaları. Her yer kendi ilinde, karada, yürünebilir ve yakınında içilebilir su olmalı (hayatta kalma
 * başlangıcı için); yaklaşık koordinatlar yürünebilir noktaya çok kaymamalı.
 */
let region: RegionData;
let source: RegionHeightSource;
let water: FreshWaterIndex;

/** Yerin enlem/boylamından yürünebilir noktaya en çok kayma (oyun m; 60 m ≈ 3 km gerçek). */
const MAX_DRIFT = 60;
/** Yürünebilir noktadan en yakın tatlı suya en çok uzaklık (oyun m; ≈ 15 sn yürüyüş). */
const MAX_WATER_DISTANCE = 60;

beforeAll(async () => {
  region = await loadRealWorld();
  source = RegionHeightSource.fromRegion(region);
  water = new FreshWaterIndex(region.features!.water, FRESH_WATER.indexCellSize);
}, 60_000);

function safePoint(place: { lat: number; lon: number }) {
  const g = latLonToGame(place.lat, place.lon, region.meta.originUtm);
  const point = findSafeSpawn(source, g.x, g.z, REGION_PLAYER.maxSlopeDeg);
  return { g, point };
}

describe('PILOT.places', () => {
  it('en az 8, en çok 10 (Shift + 1–9, 0 tuşları) yer; adlar ve koordinatlar benzersiz', () => {
    expect(PILOT.places.length).toBeGreaterThanOrEqual(8);
    expect(PILOT.places.length).toBeLessThanOrEqual(10);
    expect(new Set(PILOT.places.map((p) => p.name)).size).toBe(PILOT.places.length);
    expect(new Set(PILOT.places.map((p) => `${p.lat},${p.lon}`)).size).toBe(PILOT.places.length);
  });

  it('ilk yer başlangıç noktasıdır (Zonguldak merkez)', () => {
    expect(PILOT.places[0].name).toBe('Zonguldak merkez');
    expect(PILOT.places[0].lat).toBe(PILOT.start.lat);
    expect(PILOT.places[0].lon).toBe(PILOT.start.lon);
  });

  it('tuş eşlemesi: 10 yerin hepsi bir tuşa denk gelir', () => {
    const slots = Array.from({ length: 10 }, (_, i) => teleportSlotForKey(`Digit${(i + 1) % 10}`));
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(PILOT.places.length).toBeLessThanOrEqual(slots.length);
  });

  it('Shift olmayan ışınlanma noktalarına (TELEPORTS) dokunulmadı: ilk nokta yine Zonguldak merkez', () => {
    expect(TELEPORTS).toHaveLength(10);
    expect(TELEPORTS[0].name).toBe('Zonguldak merkez');
  });

  it('tüm illerin yerlerinde adlar ve koordinatlar benzersiz', () => {
    const all = Object.values(PROVINCE_PLACES).flat();
    expect(new Set(all.map((p) => p.name)).size).toBe(all.length);
    expect(new Set(all.map((p) => `${p.lat},${p.lon}`)).size).toBe(all.length);
  });
});

describe('PROVINCE_PLACES', () => {
  it('pilot il + 8 diğer hedef il; her ilde 8–10 yer (Shift + 1–9, 0 tuşları)', () => {
    expect(Object.keys(PROVINCE_PLACES).sort()).toEqual(
      [
        'Bartın',
        'Bolu',
        'Düzce',
        'Karabük',
        'Zonguldak',
        'Kastamonu',
        'Çankırı',
        'Sinop',
        'Sakarya',
      ].sort(),
    );
    expect(PROVINCE_PLACES[PILOT.province]).toBe(PILOT.places);
    for (const [province, places] of Object.entries(PROVINCE_PLACES)) {
      expect(places.length, province).toBeGreaterThanOrEqual(8);
      expect(places.length, province).toBeLessThanOrEqual(10);
    }
  });

  for (const [province, places] of Object.entries(PROVINCE_PLACES)) {
    for (const place of places) {
      it(`${province} / ${place.name}: ilinde, karada, yürünebilir, yakında içilebilir su`, () => {
        const { g, point } = safePoint(place);
        expect(point).not.toBeNull();
        const p = point as { x: number; y: number; z: number };
        expect(isInProvince(region.provinces, province, p.x, p.z)).toBe(true);
        expect(source.elevationAt(p.x, p.z)).toBeGreaterThan(0);
        expect(Math.hypot(p.x - g.x, p.z - g.z)).toBeLessThanOrEqual(MAX_DRIFT);
        const hit = water.nearest(p.x, p.z, MAX_WATER_DISTANCE);
        expect(hit, 'yakında tatlı su yok').not.toBeNull();
      });
    }
  }
});
