import { beforeAll, describe, expect, it } from 'vitest';
import { CITY_START } from '../src/config';
import type { RegionData } from '../src/data/region';
import { initPhysics } from '../src/physics/PhysicsWorld';
import {
  cityCentersOf,
  cityRespawnRandom,
  openYaw,
  pickCityStart,
  type CityCenter,
} from '../src/survival/cityStart';
import { createRandom } from '../src/utils/random';
import { loadRealRegion } from './helpers/realRegion';
import { setupWorld } from './helpers/walker';

const centers: CityCenter[] = [
  { name: 'A', x: 0, z: 0, radius: 40 },
  { name: 'B', x: 500, z: 0, radius: 40 },
  { name: 'C', x: 0, z: 500, radius: 40 },
  { name: 'D', x: 500, z: 500, radius: 40 },
];
/** Çözümleyici: noktayı olduğu gibi (yürünebilir) kabul eder. */
const identity = (x: number, z: number) => ({ x, y: 0, z });

describe('cityCentersOf', () => {
  it('yalnızca il ve ilçe merkezlerini (köyleri değil) süzer', () => {
    const make = (name: string, rank: 'il' | 'ilce' | 'koy') => ({
      data: { name, rank, x: 1, z: 2 },
      radius: 30,
    });
    const list = cityCentersOf([make('a', 'il'), make('b', 'ilce'), make('c', 'koy')]);
    expect(list.map((c) => c.name)).toEqual(['a', 'b']);
    expect(list[0]).toEqual({ name: 'a', x: 1, z: 2, radius: 30 });
  });
});

describe('pickCityStart', () => {
  it('aynı tohum aynı sonucu verir; farklı tohumlarda farklı merkezler çıkar', () => {
    const a = pickCityStart(centers, createRandom(7), identity);
    const b = pickCityStart(centers, createRandom(7), identity);
    expect(a).toEqual(b);
    const names = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      names.add(pickCityStart(centers, createRandom(seed), identity)!.name);
    }
    expect(names.size).toBe(centers.length); // her merkez seçilebilir
  });

  it('nokta merkezin yakınında kalır (ofset ≤ yarıçap oranı)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const start = pickCityStart(centers, createRandom(seed), identity)!;
      const center = centers.find((c) => c.name === start.name)!;
      const distance = Math.hypot(start.point.x - center.x, start.point.z - center.z);
      expect(distance).toBeLessThanOrEqual(center.radius * CITY_START.maxOffsetFraction + 1e-6);
      expect(start.yaw).toBeGreaterThanOrEqual(0);
      expect(start.yaw).toBeLessThan(Math.PI * 2);
    }
  });

  it('çözümlenemeyen merkez atlanır, diğerine geçilir; hiçbiri olmazsa null', () => {
    const onlyB = (x: number, z: number) => (x > 300 && z < 100 ? { x, y: 0, z } : null);
    for (let seed = 0; seed < 20; seed++) {
      expect(pickCityStart(centers, createRandom(seed), onlyB)?.name).toBe('B');
    }
    expect(pickCityStart(centers, createRandom(1), () => null)).toBeNull();
    expect(pickCityStart([], createRandom(1), identity)).toBeNull();
  });

  it('yeniden doğma tohumu ölüm sırasına bağlı ve tekrarlanabilir', () => {
    const first = pickCityStart(centers, cityRespawnRandom(3), identity);
    expect(pickCityStart(centers, cityRespawnRandom(3), identity)).toEqual(first);
    const names = new Set<string>();
    for (let n = 0; n < 40; n++)
      names.add(pickCityStart(centers, cityRespawnRandom(n), identity)!.name);
    expect(names.size).toBeGreaterThan(1);
  });
});

describe('openYaw', () => {
  const origin = { x: 0, y: 0, z: 0 };

  it('önü açıksa yönünü korur', () => {
    expect(openYaw(origin, 1.2, () => false)).toBeCloseTo(1.2);
  });

  it('duvara bakıyorsa açık tarafa döner (ileri = (−sin, −cos))', () => {
    // Kuzey (−Z) tarafı 3 m ötede kapalı; güney (+Z) açık.
    const blocked = (_x: number, z: number) => z < -3;
    const yaw = openYaw(origin, 0, blocked);
    // Seçilen yön kuzeye (−Z) bakmaz: ileri Z bileşeni −cos(yaw) ≥ 0.
    expect(-Math.cos(yaw)).toBeGreaterThanOrEqual(-1e-9);
  });

  it('her yön kapalıysa verilen yönde kalır', () => {
    expect(openYaw(origin, 0.7, () => true)).toBeCloseTo(0.7);
  });
});

describe('RegionWorld.cityStart (gerçek bölge)', () => {
  let region: RegionData;
  beforeAll(async () => {
    await initPhysics();
    region = await loadRealRegion();
  });

  it('il ve ilçe merkezlerinden rastgele bir noktaya başlar: yürünebilir, yapı dışı, çeşitli iller', () => {
    const { world, dispose } = setupWorld(region, true);
    const map = world.settlementMap;
    expect(map).not.toBeNull();
    const provinces = new Set<string>();
    const names = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const start = world.cityStart(createRandom(seed * 101));
      expect(start, `seed ${seed}`).not.toBeNull();
      const { point } = start!;
      expect(map!.buildingAt(point.x, point.z, 1), `${start!.name}: yapının içinde`).toBeNull();
      expect(world.terrain.heightAt(point.x, point.z)).toBeCloseTo(point.y - 0.05, 1);
      names.add(start!.name);
      // Başlangıç bakışının önü (≥ 2 m) bir duvar değildir.
      const ahead = {
        x: point.x - Math.sin(start!.yaw) * 2,
        z: point.z - Math.cos(start!.yaw) * 2,
      };
      expect(map!.buildingAt(ahead.x, ahead.z, 0.5), `${start!.name}: bakış duvara`).toBeNull();
      const info = world.locationInfo(point.x, point.z, point.y);
      if (info.province) provinces.add(info.province);
    }
    expect(names.size).toBeGreaterThan(10);
    expect(provinces.size).toBeGreaterThanOrEqual(3);
    dispose();
  }, 60_000);

  it('respawnPoint artık şehir merkezlerinden gelir ve ölüm sırasına göre değişir', () => {
    const { world, dispose } = setupWorld(region, true);
    const points = new Set<string>();
    for (let n = 0; n < 12; n++) {
      const p = world.respawnPoint(n);
      expect(p).not.toBeNull();
      points.add(`${Math.round(p!.x)}|${Math.round(p!.z)}`);
    }
    expect(points.size).toBeGreaterThan(6);
    dispose();
  }, 60_000);

  it('yerleşim verisi yoksa eski pilot il doğmasına döner', () => {
    const { world, dispose } = setupWorld(region, false);
    expect(world.cityStart(createRandom(1))).toBeNull();
    expect(world.respawnPoint(0)).not.toBeNull();
    dispose();
  }, 60_000);
});
