import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SEABED, WATER } from '../src/config';
import type { RegionData } from '../src/data/region';
import { latLonToGame } from '../src/world/geo';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { seabedDepth, seaDistanceToLand } from '../src/world/seabed';
import { Water } from '../src/world/Water';
import { loadRealRegion } from './helpers/realRegion';

describe('seaDistanceToLand', () => {
  it('kara hücreleri 0; deniz hücreleri kıyıdan uzaklaştıkça artar', () => {
    // 6×1 şerit: [kara, deniz, deniz, deniz, deniz, deniz]
    const d = seaDistanceToLand(6, 1, (i) => i > 0);
    expect(Array.from(d)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('çapraz uzaklık √2 ile hesaplanır', () => {
    // 3×3, sol-üst köşe kara, gerisi deniz
    const d = seaDistanceToLand(3, 3, (i) => i !== 0);
    expect(d[4]).toBeCloseTo(Math.SQRT2, 5); // (1,1)
    expect(d[8]).toBeCloseTo(2 * Math.SQRT2, 5); // (2,2)
    expect(d[1]).toBe(1);
  });

  it('iki kıyıdan en yakın olana göre uzaklık verir', () => {
    // [kara, deniz×5, kara]
    const d = seaDistanceToLand(7, 1, (i) => i > 0 && i < 6);
    expect(Array.from(d)).toEqual([0, 1, 2, 3, 2, 1, 0]);
  });

  it('hiç kara yoksa çok büyük değer verir (sınırlı derinliğe kırpılır)', () => {
    const d = seaDistanceToLand(4, 4, () => true);
    expect(d[5]).toBeGreaterThan(1e6);
    const depth = seabedDepth(d, 2, 12, 4);
    expect(depth[5]).toBe(4);
  });
});

describe('seabedDepth', () => {
  it('uzaklık × hücre × tan(eğim), maxDepth ile sınırlı', () => {
    const depth = seabedDepth(new Float32Array([0, 1, 2, 100]), 2, 10, 3);
    const perCell = 2 * Math.tan((10 * Math.PI) / 180);
    expect(depth[0]).toBe(0);
    expect(depth[1]).toBeCloseTo(perCell, 5);
    expect(depth[2]).toBeCloseTo(2 * perCell, 5);
    expect(depth[3]).toBe(3);
  });
});

describe('RegionHeightSource: deniz tabanı (gerçek bölge)', () => {
  let region: RegionData;
  let source: RegionHeightSource;
  beforeAll(async () => {
    region = await loadRealRegion();
    source = RegionHeightSource.fromRegion(region);
  });

  it('açık deniz maxDepth kadar çukurdur (negatif), su seviyesinin altında', () => {
    const { x, z } = latLonToGame(41.9, 32.0, region.meta.originUtm);
    expect(source.heightAt(x, z)).toBeCloseTo(-SEABED.maxDepth, 2);
    expect(source.heightAt(x, z)).toBeLessThan(WATER.level);
  });

  it('kara yükseklikleri değişmez: Safranbolu 504 m civarı, pozitif', () => {
    const { x, z } = latLonToGame(41.2517, 32.6939, region.meta.originUtm);
    const elevation = source.elevationAt(x, z);
    expect(elevation).toBeGreaterThan(450);
    expect(elevation).toBeLessThan(560);
  });

  it('kıyıdan denize doğru taban kademeli derinleşir (Amasra açıkları)', () => {
    const coast = latLonToGame(41.7494, 32.3853, region.meta.originUtm);
    // Kuzeye (−z) doğru ilerle: yükseklik azalarak (derinleşerek) -maxDepth'e iner
    let previous = source.heightAt(coast.x, coast.z);
    let minSeen = previous;
    for (let dz = 0; dz >= -600; dz -= 20) {
      const h = source.heightAt(coast.x, coast.z + dz);
      minSeen = Math.min(minSeen, h);
      previous = h;
    }
    expect(previous).toBeLessThanOrEqual(0);
    expect(minSeen).toBeGreaterThanOrEqual(-SEABED.maxDepth - 1e-6);
  });

  it('su yüzeyi kıyı çizgisinin hemen üstündedir: kara hücreleri çoğunlukla su seviyesinin üstündedir', () => {
    // Tüm kara (heightmap değeri > 0) hücrelerinin yüksekliği ≥ 0; deniz (=0) hücreleri < 0.
    let seaBelowWater = 0;
    let sea = 0;
    for (const i of [0, 1000, 50000, 200000, 900000, 1500000, 1800000]) {
      const value = region.heights[i] as number;
      const row = Math.floor(i / source.width);
      const col = i % source.width;
      const h = source.sample(col, row);
      if (value === 0) {
        sea++;
        if (h < WATER.level) seaBelowWater++;
      } else {
        expect(h).toBeGreaterThanOrEqual(0);
      }
    }
    expect(seaBelowWater).toBe(sea);
  });
});

describe('Water', () => {
  const bounds = { minX: -1587, maxX: 1587, minZ: -1175, maxZ: 1175 };

  it('bölge + kenar payı kadar geniş, su seviyesinde yatay bir düzlem', () => {
    const water = new Water(bounds);
    const box = new THREE.Box3().setFromObject(water.mesh);
    expect(box.max.x - box.min.x).toBeCloseTo(3174 + 2 * WATER.margin, 3);
    expect(box.max.z - box.min.z).toBeCloseTo(2350 + 2 * WATER.margin, 3);
    expect(box.min.y).toBeCloseTo(WATER.level, 5);
    expect(box.max.y).toBeCloseTo(WATER.level, 5);
    water.dispose();
  });

  it("update zamanı shader uniform'una yazar", () => {
    const water = new Water(bounds);
    water.update(12.5);
    expect(water.uniforms.uTime.value).toBe(12.5);
    water.dispose();
  });

  it('yarı saydam ve derinlik yazmaz (kıyıda taban görünür)', () => {
    const water = new Water(bounds);
    expect(water.mesh.material.transparent).toBe(true);
    expect(water.mesh.material.opacity).toBeCloseTo(WATER.opacity);
    expect(water.mesh.material.depthWrite).toBe(false);
    water.dispose();
  });
});
