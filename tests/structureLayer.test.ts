import { describe, expect, it } from 'vitest';
import { Group, Mesh, PointLight, type Material, type BufferGeometry } from 'three';
import { FIRE, STRUCTURE_LOOK } from '../src/config';
import type { Ghost } from '../src/placement/PlacementController';
import { StructureSet } from '../src/placement/structures';
import { StructureLayer, flickerAt } from '../src/world/StructureLayer';

const POOL = STRUCTURE_LOOK.fire.lightPool;

function lightsOf(layer: StructureLayer): PointLight[] {
  return layer.group.children.filter((c): c is PointLight => c instanceof PointLight);
}

function meshesOf(layer: StructureLayer): Mesh[] {
  const out: Mesh[] = [];
  layer.group.traverse((o) => {
    if (o instanceof Mesh) out.push(o);
  });
  return out;
}

const ghost = (over: Partial<Ghost> = {}): Ghost => ({
  kind: 'campfire',
  x: 1,
  y: 2,
  z: 3,
  yaw: 0.5,
  valid: true,
  reason: null,
  ...over,
});

describe('StructureLayer', () => {
  it('ışık havuzu sabit boyuttadır; başlangıçta boş ve ışıksızdır', () => {
    const layer = new StructureLayer(new StructureSet());
    layer.update(0, 0, 0);
    expect(lightsOf(layer)).toHaveLength(POOL);
    expect(lightsOf(layer).every((l) => l.intensity === 0)).toBe(true);
    expect(layer.stats).toEqual({ structures: 0, lit: 0, lights: 0 });
  });

  it('yapı eklenince mesh oluşur: konum ve yön yapıdan; ateşte gövde + alev, sundurmada yalnızca gövde', () => {
    const set = new StructureSet();
    const layer = new StructureLayer(set);
    const fire = set.add('campfire', 4, 5, 6, 1.25);
    set.add('lean_to', 20, 1, 20, 0);
    layer.update(0, 0, 0);
    expect(layer.stats.structures).toBe(2);
    const roots = layer.group.children.filter((c): c is Group => c instanceof Group);
    expect(roots).toHaveLength(2);
    const fireRoot = roots.find((r) => r.position.x === fire.x)!;
    expect(fireRoot.position.toArray()).toEqual([4, 5, 6]);
    expect(fireRoot.rotation.y).toBe(1.25);
    expect(fireRoot.children).toHaveLength(2);
    const shelterRoot = roots.find((r) => r.position.x === 20)!;
    expect(shelterRoot.children).toHaveLength(1);
  });

  it('kümede değişiklik yoksa yeniden kurmaz (aynı nesneler)', () => {
    const set = new StructureSet();
    const layer = new StructureLayer(set);
    set.add('campfire', 0, 0, 0);
    layer.update(0, 0, 0);
    const before = meshesOf(layer);
    layer.update(1, 0, 0);
    expect(meshesOf(layer)).toEqual(before);
  });

  it('alev yanıkken görünür; ateş sönünce gizlenir ve ışığı kesilir; yakıt atılınca geri gelir', () => {
    const set = new StructureSet();
    const layer = new StructureLayer(set);
    const fire = set.add('campfire', 0, 0, 0);
    layer.update(0, 0, 0);
    const flame = layer.group.children.find((c): c is Group => c instanceof Group)!.children[1]!;
    expect(flame.visible).toBe(true);
    expect(layer.stats).toMatchObject({ lit: 1, lights: 1 });

    set.update(FIRE.burnSeconds);
    layer.update(1, 0, 0);
    expect(flame.visible).toBe(false);
    expect(layer.stats).toMatchObject({ lit: 0, lights: 0 });
    expect(lightsOf(layer).every((l) => l.intensity === 0)).toBe(true);

    set.refuel(fire.id, FIRE.fuel.log);
    layer.update(2, 0, 0);
    expect(flame.visible).toBe(true);
    expect(layer.stats.lights).toBe(1);
  });

  it('ışık yalnızca en yakın `lightPool` yanık ateşe verilir; sönükler ve uzaklar ışıksız', () => {
    const set = new StructureSet();
    const layer = new StructureLayer(set);
    const xs = [5, 10, 15, 20, 25];
    const fires = xs.map((x) => set.add('campfire', x, 1, 0));
    set.update(0);
    // en yakın ateşi (x=5) söndür
    set.update(FIRE.burnSeconds);
    set.refuel(fires[1]!.id, 100);
    set.refuel(fires[2]!.id, 100);
    set.refuel(fires[3]!.id, 100);
    set.refuel(fires[4]!.id, 100);
    layer.update(0, 0, 0);

    const active = lightsOf(layer).filter((l) => l.intensity > 0);
    expect(active).toHaveLength(POOL);
    const activeX = active.map((l) => l.position.x).sort((a, b) => a - b);
    expect(activeX).toEqual([10, 15, 20]); // x=5 sönük; x=25 havuza girmedi
    for (const l of active) expect(l.position.y).toBeCloseTo(1 + STRUCTURE_LOOK.fire.height, 6);
  });

  it('ışık menzili dışındaki ateşe ışık verilmez', () => {
    const set = new StructureSet();
    const layer = new StructureLayer(set);
    set.add('campfire', STRUCTURE_LOOK.fire.lightRange + 1, 0, 0);
    layer.update(0, 0, 0);
    expect(layer.stats.lights).toBe(0);
    layer.update(0, STRUCTURE_LOOK.fire.lightRange, 0);
    expect(layer.stats.lights).toBe(1);
  });

  it('ışık yoğunluğu titrer ama sınırlar içinde kalır', () => {
    const set = new StructureSet();
    const layer = new StructureLayer(set);
    set.add('campfire', 3, 0, 0);
    const { intensity, flicker } = STRUCTURE_LOOK.fire;
    const seen = new Set<number>();
    for (let t = 0; t < 10; t += 0.05) {
      layer.update(t, 0, 0);
      const i = lightsOf(layer).find((l) => l.intensity > 0)!.intensity;
      expect(i).toBeGreaterThanOrEqual(intensity * (1 - flicker) - 1e-9);
      expect(i).toBeLessThanOrEqual(intensity * (1 + flicker) + 1e-9);
      seen.add(Math.round(i * 1000));
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('flickerAt −1…1 aralığında ve kimliğe göre evreli', () => {
    for (let t = 0; t < 20; t += 0.1) {
      for (const id of [1, 2, 3, 40]) {
        const v = flickerAt(t, id);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(flickerAt(1, 1)).not.toBe(flickerAt(1, 2));
  });
});

describe('StructureLayer hayaleti', () => {
  const ghostMesh = (layer: StructureLayer, index: number) =>
    meshesOf(layer).filter((m) => m.parent === layer.group)[index]!;

  it('türüne göre tek hayalet görünür; konum/yön uygulanır; geçerlilikle renk değişir', () => {
    const layer = new StructureLayer(new StructureSet());
    const campfire = ghostMesh(layer, 0);
    const lean = ghostMesh(layer, 1);
    expect([campfire.visible, lean.visible]).toEqual([false, false]);

    layer.setGhost(ghost({ kind: 'campfire', valid: true }));
    expect([campfire.visible, lean.visible]).toEqual([true, false]);
    expect(campfire.position.toArray()).toEqual([1, 2, 3]);
    expect(campfire.rotation.y).toBe(0.5);
    const validMaterial = campfire.material;

    layer.setGhost(ghost({ kind: 'campfire', valid: false, reason: 'too_steep' }));
    expect(campfire.material).not.toBe(validMaterial);

    layer.setGhost(ghost({ kind: 'lean_to' }));
    expect([campfire.visible, lean.visible]).toEqual([false, true]);

    layer.setGhost(null);
    expect([campfire.visible, lean.visible]).toEqual([false, false]);
  });

  it('hayalet yapı sayılmaz (yalnızca gerçek yapılar sayılır)', () => {
    const layer = new StructureLayer(new StructureSet());
    layer.setGhost(ghost());
    layer.update(0, 0, 0);
    expect(layer.stats.structures).toBe(0);
  });
});

describe('StructureLayer.dispose', () => {
  it('tüm geometri ve materyalleri dispose eder ve sahneden çıkar', () => {
    const set = new StructureSet();
    const layer = new StructureLayer(set);
    const parent = new Group();
    parent.add(layer.group);
    set.add('campfire', 0, 0, 0);
    set.add('lean_to', 9, 0, 9);
    layer.update(0, 0, 0);

    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    for (const m of meshesOf(layer)) {
      geometries.add(m.geometry);
      materials.add(m.material as Material);
    }
    // hayalet materyalleri mesh'e ancak gösterilince bağlanır; ikisini de yakala
    layer.setGhost(ghost({ valid: false }));
    for (const m of meshesOf(layer)) materials.add(m.material as Material);
    layer.setGhost(ghost({ valid: true }));
    for (const m of meshesOf(layer)) materials.add(m.material as Material);

    let disposedGeometries = 0;
    let disposedMaterials = 0;
    for (const g of geometries) g.addEventListener('dispose', () => disposedGeometries++);
    for (const m of materials) m.addEventListener('dispose', () => disposedMaterials++);
    layer.dispose();

    expect(geometries.size).toBe(3); // ateş, sundurma, alev
    expect(disposedGeometries).toBe(geometries.size);
    expect(materials.size).toBe(4); // gövde, alev, geçerli/geçersiz hayalet
    expect(disposedMaterials).toBe(materials.size);
    expect(parent.children).toHaveLength(0);
  });
});
