import { beforeAll, describe, expect, it } from 'vitest';
import { PILOT, REGION_PLAYER } from '../src/config';
import { createNewGameSave } from '../src/save/newGame';
import type { ProvinceShape, RegionData } from '../src/data/region';
import { latLonToGame } from '../src/world/geo';
import { isInPilotProvince, pilotProvince } from '../src/world/pilot';
import { distanceToProvince, provinceAt } from '../src/world/provinces';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { findSafeSpawn } from '../src/world/spawn';
import { loadRealWorld } from './helpers/realRegion';

/**
 * Faz 8.1 pilot il çerçevesi: "pilot ilde mi?" tanımı (kıyı şeridi dahil) ve başlangıç noktası.
 * Ölçüm kaynağı: docs/faz-8-zonguldak-olcumler.md ("il çokgeni kıyıdan içeride kalıyor").
 */
let region: RegionData;
let source: RegionHeightSource;
let pilot: ProvinceShape;

beforeAll(async () => {
  region = await loadRealWorld();
  source = RegionHeightSource.fromRegion(region);
  pilot = pilotProvince(region.provinces)!;
});

describe('pilot il', () => {
  it('manifestte var ve hedef il (inRegion)', () => {
    expect(pilot).not.toBeNull();
    expect(pilot.name).toBe('Zonguldak');
    expect(pilot.inRegion).toBe(true);
  });

  it('başlangıç noktası pilot ilde, karada ve yürünebilir', () => {
    const { x, z } = latLonToGame(PILOT.start.lat, PILOT.start.lon, region.meta.originUtm);
    const start = findSafeSpawn(source, x, z, REGION_PLAYER.maxSlopeDeg)!;
    expect(start).not.toBeNull();
    expect(provinceAt(region.provinces, start.x, start.z)).toBe(pilot);
    expect(isInPilotProvince(region.provinces, start.x, start.z)).toBe(true);
    expect(source.elevationAt(start.x, start.z)).toBeGreaterThan(0);
  });

  it('isInPilotProvince: pilot ilin içi evet, başka ilin içi hayır', () => {
    const { x, z } = latLonToGame(41.4564, 31.7987, region.meta.originUtm); // Zonguldak merkez
    expect(isInPilotProvince(region.provinces, x, z)).toBe(true);
    const bolu = latLonToGame(40.7392, 31.6089, region.meta.originUtm);
    expect(isInPilotProvince(region.provinces, bolu.x, bolu.z)).toBe(false);
    const safranbolu = latLonToGame(41.2517, 32.6939, region.meta.originUtm);
    expect(isInPilotProvince(region.provinces, safranbolu.x, safranbolu.z)).toBe(false);
  });

  it('pilot il yoksa hiçbir yer pilot ilde değil', () => {
    const others = region.provinces.filter((p) => p !== pilot);
    expect(pilotProvince(others)).toBeNull();
    expect(isInPilotProvince(others, pilot.bounds.minX + 10, pilot.bounds.minZ + 10)).toBe(false);
  });

  it('kıyı şeridi: ilsiz kara hücrelerinin çoğu pilot ilde sayılır, hepsi tamponun içindedir', () => {
    // Pilot ilin sınır kutusu + pay içinde, hiçbir ile ait olmayan kara örnekleri (100 m hücre).
    const { gridWidth, gridHeight, gridOrigin } = region.meta;
    const cell = 2;
    const b = pilot.bounds;
    let stripLand = 0;
    let nearPilot = 0;
    let counted = 0;
    for (
      let r = Math.floor((b.minZ - 100 - gridOrigin.z) / cell);
      r <= Math.ceil((b.maxZ + 100 - gridOrigin.z) / cell);
      r++
    ) {
      for (
        let c = Math.floor((b.minX - 100 - gridOrigin.x) / cell);
        c <= Math.ceil((b.maxX + 100 - gridOrigin.x) / cell);
        c++
      ) {
        if (r < 0 || c < 0 || r >= gridHeight || c >= gridWidth) continue;
        if ((region.heights[r * gridWidth + c] as number) === 0) continue; // deniz
        const x = gridOrigin.x + c * cell;
        const z = gridOrigin.z + r * cell;
        if (provinceAt(region.provinces, x, z) !== null) continue;
        stripLand++;
        const pilotNearest =
          distanceToProvince(pilot, x, z) <=
          Math.min(
            ...region.provinces.filter((p) => p !== pilot).map((p) => distanceToProvince(p, x, z)),
          );
        if (pilotNearest) {
          nearPilot++;
          // Pilota en yakın şerit hücresi tampon içinde olmalı (tampon ölçümden küçük kalırsa bu uyarır).
          expect(isInPilotProvince(region.provinces, x, z), `(${x}, ${z})`).toBe(true);
          counted++;
        }
      }
    }
    expect(stripLand).toBeGreaterThan(300);
    expect(nearPilot).toBeGreaterThan(300);
    expect(counted).toBe(nearPilot);
  });

  it('config: kıyı tamponu ölçülen en geniş şeritten (5,2 oyun m) geniş, ama kıyıdan taşmayacak kadar dar', () => {
    expect(PILOT.coastBufferM).toBeGreaterThan(5.2);
    expect(PILOT.coastBufferM).toBeLessThan(40);
  });

  it('başlangıç bakışı açık: ileriye 300 m boyunca arazi görüşü kapatmaz (kuzey yamaç duvarıdır)', () => {
    const { x, z } = latLonToGame(PILOT.start.lat, PILOT.start.lon, region.meta.originUtm);
    const start = findSafeSpawn(source, x, z, REGION_PLAYER.maxSlopeDeg)!;
    const eye = source.heightAt(start.x, start.z) + 1.6; // göz yüksekliği (oyun m)
    /** Yönde 300 m'ye kadar arazinin göz hizasının üstüne çıkan en büyük açı (derece). */
    const blockedDeg = (yawDeg: number): number => {
      const yaw = (yawDeg * Math.PI) / 180;
      let max = -90;
      for (let d = 3; d <= 300; d += 3) {
        const h = source.heightAt(start.x - Math.sin(yaw) * d, start.z - Math.cos(yaw) * d);
        max = Math.max(max, (Math.atan2(h - eye, d) * 180) / Math.PI);
      }
      return max;
    };
    expect(blockedDeg(PILOT.start.yawDeg)).toBeLessThan(5);
    expect(blockedDeg(0)).toBeGreaterThan(10); // varsayılan kuzey bakış yamaca bakar: bu yüzden yaw ayarlı
  });

  it('yeni oyun kaydı başlangıç bakışını taşır (radyan); varsayılan kuzeydir', () => {
    const spawn = { x: 1, y: 2, z: 3 };
    const yaw = (PILOT.start.yawDeg * Math.PI) / 180;
    expect(createNewGameSave('r', spawn, new Date(0), yaw).player).toEqual({
      ...spawn,
      yaw,
      pitch: 0,
    });
    expect(createNewGameSave('r', spawn, new Date(0)).player.yaw).toBe(0);
  });
});
