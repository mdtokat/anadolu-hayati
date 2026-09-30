import { describe, expect, it } from 'vitest';
import { OBSTACLES, PLAYER, TERRAIN_TEST } from '../src/config';
import { generateObstacles } from '../src/world/obstacleLayout';
import { ProceduralHeightSource } from '../src/world/ProceduralHeightSource';

const source = new ProceduralHeightSource();

describe('generateObstacles', () => {
  it('aynı seed aynı yerleşimi verir, farklı seed farklı', () => {
    expect(generateObstacles(source, 5)).toEqual(generateObstacles(source, 5));
    expect(generateObstacles(source, 5)).not.toEqual(generateObstacles(source, 6));
  });

  it('parkur + istenen sayıda kaya üretir', () => {
    const all = generateObstacles(source);
    expect(all.filter((o) => o.course)).toHaveLength(OBSTACLES.course.length);
    expect(all.filter((o) => !o.course)).toHaveLength(OBSTACLES.rockCount);
  });

  it('kayalar doğma alanının dışında ve arazi sınırları içindedir', () => {
    const limit = TERRAIN_TEST.size / 2;
    for (const rock of generateObstacles(source).filter((o) => !o.course)) {
      expect(Math.hypot(rock.x, rock.z)).toBeGreaterThanOrEqual(TERRAIN_TEST.spawnFlatRadius);
      expect(Math.abs(rock.x)).toBeLessThan(limit);
      expect(Math.abs(rock.z)).toBeLessThan(limit);
    }
  });

  it('doğma noktasının etrafı (oyuncu yarıçapı + pay) engelsizdir', () => {
    for (const o of generateObstacles(source)) {
      const reach = Math.hypot(o.sx, o.sz) / 2;
      expect(
        Math.hypot(o.x - TERRAIN_TEST.spawn.x, o.z - TERRAIN_TEST.spawn.z) - reach,
      ).toBeGreaterThan(PLAYER.radius + 2);
    }
  });

  it('parkur blokları test rampalarıyla çakışmaz', () => {
    const course = generateObstacles(source).filter((o) => o.course);
    for (const block of course) {
      for (const ramp of TERRAIN_TEST.ramps) {
        const xOverlap =
          block.x + block.sx / 2 > ramp.x - 1 && block.x - block.sx / 2 < ramp.x + 30;
        const zOverlap =
          block.z + block.sz / 2 > ramp.z - ramp.width / 2 &&
          block.z - block.sz / 2 < ramp.z + ramp.width / 2;
        expect(xOverlap && zOverlap).toBe(false);
      }
    }
  });

  it('parkur bloklarının üst yüzü tanımlı yüksekliktedir (düz zeminde)', () => {
    OBSTACLES.course.forEach((block, i) => {
      const o = generateObstacles(source)[i];
      expect(o?.y).toBeCloseTo(block.h / 2, 6);
      expect((o?.y ?? 0) + (o?.sy ?? 0) / 2).toBeCloseTo(block.h, 6);
    });
  });
});
