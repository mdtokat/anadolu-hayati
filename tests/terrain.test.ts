import { beforeAll, describe, expect, it } from 'vitest';
import { TERRAIN_TEST } from '../src/config';
import { createHeightfieldDesc, toColumnMajor } from '../src/physics/heightfield';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';
import {
  gridCells,
  gridCoord,
  gridVertices,
  sampleGrid,
  type GridSpec,
} from '../src/world/HeightSource';
import { ProceduralHeightSource } from '../src/world/ProceduralHeightSource';
import { createTerrainGeometry } from '../src/world/TerrainMesh';

const GRID: GridSpec = { size: TERRAIN_TEST.size, cellSize: TERRAIN_TEST.cellSize };

beforeAll(async () => {
  await initPhysics();
});

describe('grid yardımcıları', () => {
  it('hücre/köşe sayısını ve koordinatı hesaplar', () => {
    const grid: GridSpec = { size: 400, cellSize: 1 };
    expect(gridCells(grid)).toBe(400);
    expect(gridVertices(grid)).toBe(401);
    expect(gridCoord(grid, 0)).toBe(-200);
    expect(gridCoord(grid, 200)).toBe(0);
    expect(gridCoord(grid, 400)).toBe(200);
  });

  it('toColumnMajor satır-öncelikli diziyi doğru çevirir', () => {
    // 2x2: [[1,2],[3,4]] (satır satır) → sütun sütun [1,3,2,4]
    expect(Array.from(toColumnMajor(new Float32Array([1, 2, 3, 4]), 2))).toEqual([1, 3, 2, 4]);
  });
});

describe('ProceduralHeightSource', () => {
  it('aynı seed aynı araziyi, farklı seed farklı araziyi verir', () => {
    const a = new ProceduralHeightSource(1);
    const b = new ProceduralHeightSource(1);
    const c = new ProceduralHeightSource(2);
    expect(a.heightAt(80, -60)).toBe(b.heightAt(80, -60));
    expect(a.heightAt(80, -60)).not.toBe(c.heightAt(80, -60));
  });

  it('doğma noktası çevresi düzdür (y = 0)', () => {
    const source = new ProceduralHeightSource();
    for (const [x, z] of [
      [0, 0],
      [5, 5],
      [-7, 3],
      [0, -9],
    ] as const) {
      expect(source.heightAt(x, z)).toBeCloseTo(0, 6);
    }
  });

  it('tepe yüksekliği amplitude ve rampa yüksekliğini aşmaz, negatif olmaz', () => {
    const source = new ProceduralHeightSource();
    const rampMax = Math.max(...TERRAIN_TEST.ramps.map((r) => r.height));
    const limit = Math.max(TERRAIN_TEST.amplitude, rampMax) + 1e-6;
    for (let x = -200; x <= 200; x += 7) {
      for (let z = -200; z <= 200; z += 7) {
        const h = source.heightAt(x, z);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('test rampaları beklenen eğimde yükselir ve platoda düzdür', () => {
    const source = new ProceduralHeightSource();
    for (const ramp of TERRAIN_TEST.ramps) {
      const tan = Math.tan((ramp.angleDeg * Math.PI) / 180);
      const run = ramp.height / tan;

      // Yamacın ortasında ölçülen eğim açısı
      const x = ramp.x + run / 2;
      const dx = 0.05;
      const slope = (source.heightAt(x + dx, ramp.z) - source.heightAt(x, ramp.z)) / dx;
      expect(Math.atan(slope) * (180 / Math.PI)).toBeCloseTo(ramp.angleDeg, 1);

      // Plato ortası ramp yüksekliğindedir
      expect(source.heightAt(ramp.x + run + ramp.plateau / 2, ramp.z)).toBeCloseTo(ramp.height, 4);
      // Rampanın önü ve arkası zemine iner
      expect(source.heightAt(ramp.x - 1, ramp.z)).toBeCloseTo(0, 6);
      expect(source.heightAt(ramp.x + 2 * run + ramp.plateau + 1, ramp.z)).toBeCloseTo(0, 6);
    }
  });
});

describe('arazi mesh ve collider tutarlılığı', () => {
  const source = new ProceduralHeightSource();
  const heights = sampleGrid(source, GRID);

  it('mesh köşe yükseklikleri ızgarayla birebir eşleşir', () => {
    const geometry = createTerrainGeometry(heights, GRID);
    const position = geometry.getAttribute('position');
    const n = gridVertices(GRID);
    expect(position.count).toBe(n * n);
    for (const [r, c] of [
      [0, 0],
      [0, n - 1],
      [n - 1, 0],
      [n - 1, n - 1],
      [120, 310],
      [305, 87],
    ] as const) {
      const i = r * n + c;
      expect(position.getX(i)).toBeCloseTo(gridCoord(GRID, c), 4);
      expect(position.getZ(i)).toBeCloseTo(gridCoord(GRID, r), 4);
      expect(position.getY(i)).toBeCloseTo(
        source.heightAt(gridCoord(GRID, c), gridCoord(GRID, r)),
        4,
      );
    }
    geometry.dispose();
  });

  it('Rapier heightfield yüzeyi HeightSource ile aynı yerde (eksenler doğru)', () => {
    const physics = new PhysicsWorld();
    physics.addStaticCollider(createHeightfieldDesc(heights, GRID));
    physics.step(); // sahne sorgu yapısını güncelle

    // Izgara köşesine çok yakın (ama tam üstünde olmayan) noktalar: ışın köşe/kenar
    // dejenere durumuna düşmez, hücre içi yükseklik farkı da ihmal edilebilir kalır.
    const probes: Array<[number, number]> = [
      [30.03, 55.04],
      [-80.03, 22.04],
      [120.03, -140.04],
      [-150.03, -60.04],
      [TERRAIN_TEST.ramps[0].x + 2.03, TERRAIN_TEST.ramps[0].z + 0.04], // 30° yamaç
      [TERRAIN_TEST.ramps[1].x + 1.03, TERRAIN_TEST.ramps[1].z + 0.04], // 60° yamaç
    ];
    for (const [x, z] of probes) {
      const ray = new RAPIER.Ray({ x, y: 100, z }, { x: 0, y: -1, z: 0 });
      const hit = physics.world.castRay(ray, 200, true);
      expect(hit, `(${x}, ${z}) ışını zemine çarpmalı`).not.toBeNull();
      const hitY = 100 - (hit as { timeOfImpact: number }).timeOfImpact;
      expect(Math.abs(hitY - source.heightAt(x, z))).toBeLessThan(0.15);
    }

    // Testin gücü: her nokta yukarıda tek tek doğrulandı; x/z takası en az bir noktada belirgin
    // fark yaratıyor, yani yanlış eksen eşlemesi bu testi geçemezdi.
    const swapped = probes
      .slice(0, 4)
      .map(([x, z]) => Math.abs(source.heightAt(z, x) - source.heightAt(x, z)));
    expect(Math.max(...swapped)).toBeGreaterThan(0.5);
    physics.dispose();
  });
});
