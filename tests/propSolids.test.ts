import { describe, expect, it } from 'vitest';
import { PROP_SOLIDS, SCATTER } from '../src/config';
import { makeChunkGrid } from '../src/world/chunks';
import { PropIndex } from '../src/world/propIndex';
import { PROP_KINDS } from '../src/world/propKinds';
import { MAX_PROP_SOLID_RADIUS, propSolid } from '../src/world/propSolids';
import { scatterChunk } from '../src/world/scatter';
import { walkBoxBlocks, yawBox } from '../src/world/walkSolids';

describe('propSolid', () => {
  it('ağaç, kaya ve çalı katı; dal, taş ve mantar geçilir', () => {
    for (const kind of [
      'tree_broadleaf',
      'tree_conifer',
      'chestnut',
      'hazel',
      'bush',
      'berry_bush',
      'rock',
    ] as const) {
      expect(propSolid(kind, 1)).not.toBeNull();
    }
    for (const kind of ['mushroom', 'stick', 'stone'] as const) {
      expect(propSolid(kind, 1)).toBeNull();
    }
  });

  it('yarıçap ölçekle büyür ama alt sınırın altına inmez', () => {
    const small = propSolid('rock', 0.4)!;
    const large = propSolid('rock', 1.8)!;
    expect(large.radius).toBeGreaterThan(small.radius);
    expect(small.radius).toBeGreaterThanOrEqual(PROP_SOLIDS.minRadius);
  });

  it('ağaç gövdesi oyuncunun aşamayacağı kadar yüksek', () => {
    expect(propSolid('tree_conifer', 0.75)!.height).toBeGreaterThan(3);
  });

  it('arama payı en büyük katı yarıçapı kapsar', () => {
    for (const kind of PROP_KINDS) {
      const solid = propSolid(kind, SCATTER.kinds[kind].scale[1]);
      if (solid) expect(solid.radius).toBeLessThanOrEqual(MAX_PROP_SOLID_RADIUS);
    }
  });
});

describe('PropIndex.someNear', () => {
  const grid = makeChunkGrid(1588, 1176, 2);
  const props = scatterChunk({
    cx: 5,
    cy: 4,
    grid,
    seed: SCATTER.seed,
    cover: { classAt: () => 'forest' },
    height: { heightAt: () => 27, elevationAt: () => 400, slopeDegAt: () => 0 },
    isWater: () => false,
  });
  const index = new PropIndex(grid);
  index.set(props);

  it('yarıçap içindeki nesneyi bulur, boş yerde false verir', () => {
    const x = props.x[50] as number;
    const z = props.z[50] as number;
    expect(index.someNear(x, z, 0.5, () => true)).toBe(true);
    expect(index.someNear(x + 5000, z, 5, () => true)).toBe(false);
  });

  it('sınama işlevi her adayda çağrılır ve sonucu belirler', () => {
    const x = props.x[50] as number;
    const z = props.z[50] as number;
    let seen = 0;
    const none = index.someNear(x, z, 12, () => {
      seen++;
      return false;
    });
    expect(none).toBe(false);
    expect(seen).toBeGreaterThan(1);
  });

  it('chunk yüklü mü sorgusu', () => {
    expect(index.hasChunkAt(props.x[0] as number, props.z[0] as number)).toBe(true);
    expect(index.hasChunkAt(1e6, 1e6)).toBe(false);
  });
});

describe('walkBoxBlocks', () => {
  // 2 × 2 m kutu, yerden 0 … 2 m (çadır gibi).
  const tent = yawBox({ x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1, yaw: 0.6 });

  it('kutudan geçen yürüyüşü keser, yandan geçeni kesmez', () => {
    expect(walkBoxBlocks(tent, -4, 0, 4, 0, 0.3, 0)).toBe(true);
    expect(walkBoxBlocks(tent, -4, 6, 4, 6, 0.3, 0)).toBe(false);
  });

  it('kutunun altından/üstünden (dikey aralık dışında) yürünür', () => {
    const roof = yawBox({ x: 0, y: 6, z: 0, hx: 3, hy: 0.3, hz: 3, yaw: 0 });
    expect(walkBoxBlocks(roof, -6, 0, 6, 0, 0.3, 0)).toBe(false);
    const plate = yawBox({ x: 0, y: -0.1, z: 0, hx: 3, hy: 0.2, hz: 3, yaw: 0 });
    expect(walkBoxBlocks(plate, -6, 0, 6, 0, 0.3, 0)).toBe(false);
  });

  it('içeride başlayan gövde dışarı çıkabilir, derine gidemez', () => {
    expect(walkBoxBlocks(tent, 0, 0, 3, 0, 0.3, 0)).toBe(false);
    expect(walkBoxBlocks(tent, 0.9, 0, 0.1, 0, 0.3, 0)).toBe(true);
  });
});
