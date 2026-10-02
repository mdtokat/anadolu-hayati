import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CREATURE_LOOK, CREATURES } from '../src/config';
import { CREATURE_KINDS, type CreatureKind } from '../src/creatures/kinds';
import { CreatureLayer } from '../src/world/CreatureLayer';
import { demoViews } from '../src/world/creatureDemo';
import {
  buildBoxGeometry,
  buildTaperGeometry,
  CREATURE_SHAPES,
  MAX_PARTS,
  MODELS,
} from '../src/world/creatureGeometry';
import {
  InstanceBuffer,
  phaseDelta,
  writeCreature,
  type PoseBuffers,
} from '../src/world/creaturePose';
import { makeView } from './helpers/fakeCreatures';

function buffers(capacity = 64): PoseBuffers {
  return { box: new InstanceBuffer(capacity), taper: new InstanceBuffer(capacity) };
}

/** Parça örneklerinin dünya konumları (merkezler). */
function centers(buf: InstanceBuffer): Vector3[] {
  const out: Vector3[] = [];
  const m = new Matrix4();
  for (let i = 0; i < buf.count; i += 1) {
    m.fromArray(buf.matrices, i * 16);
    out.push(new Vector3().setFromMatrixPosition(m));
  }
  return out;
}

function allCenters(b: PoseBuffers): Vector3[] {
  return CREATURE_SHAPES.flatMap((shape) => centers(b[shape]));
}

describe('modeller (creatureGeometry)', () => {
  it('her tür için model var; parça sayısı makul ve en çok MAX_PARTS', () => {
    for (const kind of CREATURE_KINDS) {
      const { parts } = MODELS[kind];
      expect(parts.length, kind).toBeGreaterThanOrEqual(8);
      expect(parts.length, kind).toBeLessThanOrEqual(MAX_PARTS);
    }
  });

  it('boyutlar ve merkezler sonlu, parça boyutları pozitif; dört bacak (kuşta iki bacak, iki kanat)', () => {
    for (const kind of CREATURE_KINDS) {
      const { parts } = MODELS[kind];
      for (const part of parts) {
        for (const v of [...part.size, ...part.center]) expect(Number.isFinite(v), kind).toBe(true);
        for (const v of part.size) expect(v, kind).toBeGreaterThan(0);
        if (part.motion !== 'none') expect(part.pivot, kind).toBeDefined();
      }
      const bird = kind === 'pheasant';
      expect(
        parts.filter((p) => p.motion === 'leg'),
        kind,
      ).toHaveLength(bird ? 2 : 4);
      expect(parts.filter((p) => p.motion === 'wing')).toHaveLength(bird ? 2 : 0);
    }
  });

  it('gerçek boyut: omuz yüksekliği türe göre ayı > domuz > kurt/karaca civarı', () => {
    const shoulder = (kind: CreatureKind) => {
      const body = MODELS[kind].parts[0];
      return (body?.center[1] ?? 0) + (body?.size[1] ?? 0) / 2;
    };
    expect(shoulder('brown_bear')).toBeGreaterThan(1.1);
    expect(shoulder('brown_bear')).toBeLessThan(1.4);
    for (const kind of ['roe_deer', 'wild_boar', 'wolf'] as const) {
      expect(shoulder(kind), kind).toBeGreaterThan(0.6);
      expect(shoulder(kind), kind).toBeLessThan(1.05);
    }
  });

  it('şekil geometrileri düşük poligonlu (≤ 12 üçgen) ve dispose edilebilir', () => {
    for (const geometry of [buildBoxGeometry(), buildTaperGeometry()]) {
      expect((geometry.index?.count ?? 0) / 3).toBeLessThanOrEqual(12);
      geometry.dispose();
    }
  });
});

describe('poz (creaturePose)', () => {
  it('bir canlının tüm parçalarını yazar; sayı modelle eşit', () => {
    for (const kind of CREATURE_KINDS) {
      const b = buffers();
      const written = writeCreature(makeView({ kind }), 0, b);
      expect(written, kind).toBe(MODELS[kind].parts.length);
      expect(b.box.count + b.taper.count, kind).toBe(written);
    }
  });

  it('aynı girdi → aynı tampon (belirleyici)', () => {
    const view = makeView({ kind: 'wild_boar', x: 12, y: 3, z: -7, yaw: 1.1, speed: 3 });
    const a = buffers();
    const b = buffers();
    writeCreature(view, 2.4, a);
    writeCreature(view, 2.4, b);
    expect(Array.from(a.box.matrices)).toEqual(Array.from(b.box.matrices));
    expect(Array.from(a.taper.colors)).toEqual(Array.from(b.taper.colors));
  });

  it('parçalar canlının konumunda, zeminin üstünde ve makul uzaklıkta durur', () => {
    const view = makeView({ kind: 'brown_bear', x: 100, y: 40, z: -30, yaw: 0.7 });
    const b = buffers();
    writeCreature(view, 0, b);
    for (const c of allCenters(b)) {
      expect(c.y).toBeGreaterThan(40 - 1e-6);
      expect(Math.hypot(c.x - 100, c.z + 30)).toBeLessThan(2.5);
    }
  });

  it('yaw canlıyı döndürür: yaw 0 ön −Z, yaw π/2 ön −X (sola)', () => {
    const extent = (yaw: number) => {
      const b = buffers();
      writeCreature(makeView({ kind: 'wolf', yaw }), 0, b);
      const cs = allCenters(b);
      return {
        minX: Math.min(...cs.map((c) => c.x)),
        minZ: Math.min(...cs.map((c) => c.z)),
      };
    };
    // Baş gövdenin önündedir: ön yönde en uzak parça başa aittir (≥ 0,5 m).
    expect(extent(0).minZ).toBeLessThan(-0.5);
    expect(extent(Math.PI / 2).minX).toBeLessThan(-0.5);
    expect(extent(Math.PI / 2).minZ).toBeGreaterThan(-0.5);
  });

  it('yürürken bacaklar sallanır: aynı canlı farklı fazda farklı poz, dururken faz etkisiz', () => {
    const walking = makeView({ kind: 'wolf', speed: 3 });
    const a = buffers();
    const b = buffers();
    writeCreature(walking, 0.6, a);
    writeCreature(walking, 2.0, b);
    expect(Array.from(a.taper.matrices)).not.toEqual(Array.from(b.taper.matrices));

    const still = makeView({ kind: 'wolf', speed: 0 });
    const c = buffers();
    const d = buffers();
    writeCreature(still, 0.6, c);
    writeCreature(still, 2.0, d);
    // Durgun canlıda bacak sabit (kuyruk/gövde de fazdan bağımsız).
    expect(Array.from(c.taper.matrices)).toEqual(Array.from(d.taper.matrices));
  });

  it('saldırı hamlesi canlıyı öne atar (attackPhase 0,5 ≠ 0)', () => {
    const at = (attackPhase: number) => {
      const b = buffers();
      writeCreature(makeView({ kind: 'brown_bear', state: 'attack', attackPhase }), 0, b);
      const cs = allCenters(b);
      return cs.reduce((min, c) => Math.min(min, c.z), Infinity);
    };
    expect(at(0.5)).toBeLessThan(at(0) - 0.1);
    expect(at(1)).toBeCloseTo(at(0), 5);
  });

  it('leş yan yatar: hiçbir parça zeminin altına girmez, gövde alçakta kalır', () => {
    for (const kind of CREATURE_KINDS) {
      const b = buffers();
      writeCreature(makeView({ kind, y: 5, dead: true, state: 'dead' }), 0, b);
      const ys = allCenters(b).map((c) => c.y);
      expect(Math.min(...ys), kind).toBeGreaterThan(5 - 1e-6);
      expect(Math.max(...ys), kind).toBeLessThan(5 + 0.9);
    }
  });

  it('hitFlash rengi vuruş rengine karıştırır; leş koyulaşır', () => {
    const red = (flash: number) => {
      const b = buffers();
      writeCreature(makeView({ kind: 'wolf', hitFlash: flash }), 0, b);
      return [b.box.colors[0] ?? 0, b.box.colors[1] ?? 0] as const;
    };
    const [r0, g0] = red(0);
    const [r1, g1] = red(1);
    expect(r1).toBeGreaterThan(r0);
    expect(g1).toBeLessThan(g0);

    const live = buffers();
    const dead = buffers();
    writeCreature(makeView({ kind: 'wolf' }), 0, live);
    writeCreature(makeView({ kind: 'wolf', dead: true, state: 'dead' }), 0, dead);
    expect(dead.box.colors[0] ?? 0).toBeLessThan(live.box.colors[0] ?? 0);
  });

  it('tampon kapasitesi aşılırsa taşmaz', () => {
    const b = buffers(3);
    writeCreature(makeView({ kind: 'wolf' }), 0, b);
    expect(b.box.count).toBeLessThanOrEqual(3);
    expect(b.taper.count).toBeLessThanOrEqual(3);
  });

  it('phaseDelta hızla orantılı, dururken 0, negatif dt 0', () => {
    expect(phaseDelta('wolf', 0, 1)).toBe(0);
    expect(phaseDelta('wolf', 2, 1)).toBeCloseTo(phaseDelta('wolf', 1, 2));
    expect(phaseDelta('wolf', 2, -1)).toBe(0);
    expect(phaseDelta('wolf', 4, 0.1)).toBeGreaterThan(phaseDelta('wolf', 2, 0.1));
  });
});

describe('CreatureLayer', () => {
  it('draw call (mesh) sayısı şekil sayısı kadar, canlı sayısından bağımsız', () => {
    const layer = new CreatureLayer();
    expect(layer.group.children).toHaveLength(CREATURE_SHAPES.length);
    layer.update([makeView({ id: 1 })], 0);
    const few = layer.stats.meshes;
    layer.update(
      Array.from({ length: CREATURES.maxActive }, (_, i) => makeView({ id: i + 1 })),
      1,
    );
    expect(layer.stats.meshes).toBe(few);
    expect(few).toBeLessThanOrEqual(CREATURE_KINDS.length * MAX_PARTS);
    layer.dispose();
  });

  it('görünümleri çizer, fazlasını sınırlar, boşalınca sıfırlar', () => {
    const layer = new CreatureLayer();
    layer.update(
      [
        makeView({ id: 1, kind: 'wolf' }),
        makeView({ id: 2, kind: 'wolf', dead: true, state: 'dead', hitFlash: 1 }),
        makeView({ id: 3, kind: 'brown_bear' }),
      ],
      0,
    );
    expect(layer.stats.instances).toBe(3);
    const expected = 2 * MODELS.wolf.parts.length + MODELS.brown_bear.parts.length;
    expect(layer.stats.parts).toBe(expected);
    layer.update([], 1);
    expect(layer.stats.instances).toBe(0);
    expect(layer.stats.parts).toBe(0);

    const many = Array.from({ length: CREATURES.maxActive + 10 }, (_, i) =>
      makeView({ id: i + 1 }),
    );
    layer.update(many, 2);
    expect(layer.stats.instances).toBe(CREATURES.maxActive);
    layer.dispose();
  });

  it('üçgen bütçesi: en kötü durumda (maxActive ayı) ≤ 60 bin üçgen', () => {
    const layer = new CreatureLayer();
    layer.update(
      Array.from({ length: CREATURES.maxActive }, (_, i) =>
        makeView({ id: i + 1, kind: 'brown_bear' }),
      ),
      0,
    );
    expect(layer.stats.parts * 12).toBeLessThanOrEqual(60_000);
    layer.dispose();
  });

  it('aynı görünüm ve zaman → iki katmanda aynı örnek tamponu', () => {
    const views = [
      makeView({ id: 1, kind: 'wild_boar', speed: 2, x: 4 }),
      makeView({ id: 2, kind: 'roe_deer', z: -3 }),
    ];
    const a = new CreatureLayer();
    const b = new CreatureLayer();
    for (const t of [0, 0.016, 0.033]) {
      a.update(views, t);
      b.update(views, t);
    }
    const arr = (layer: CreatureLayer) =>
      layer.group.children.map((child) => {
        const mesh = child as import('three').InstancedMesh;
        return Array.from(mesh.instanceMatrix.array.subarray(0, mesh.count * 16));
      });
    expect(arr(a)).toEqual(arr(b));
    a.dispose();
    b.dispose();
  });

  it('animasyon fazı zamanla ilerler; görünümden çıkan canlının fazı unutulur', () => {
    const layer = new CreatureLayer();
    const walker = makeView({ id: 7, kind: 'wolf', speed: 4 });
    layer.update([walker], 0);
    const first = Array.from(
      (layer.group.children[1] as import('three').InstancedMesh).instanceMatrix.array.subarray(
        0,
        16,
      ),
    );
    layer.update([walker], 0.1);
    const second = Array.from(
      (layer.group.children[1] as import('three').InstancedMesh).instanceMatrix.array.subarray(
        0,
        16,
      ),
    );
    expect(second).not.toEqual(first);
    layer.update([], 0.2);
    expect((layer as unknown as { phases: Map<number, number> }).phases.size).toBe(0);
    layer.dispose();
  });

  it('kare atlaması animasyonu sıçratmaz (dt sınırlı)', () => {
    const layer = new CreatureLayer();
    const walker = makeView({ id: 1, kind: 'wolf', speed: 4 });
    layer.update([walker], 0);
    layer.update([walker], 1000);
    const phase = (layer as unknown as { phases: Map<number, number> }).phases.get(1) ?? 0;
    const limit = 0.7 + phaseDelta('wolf', 4, CREATURE_LOOK.maxFrameSeconds) + 1e-9;
    expect(phase).toBeLessThanOrEqual(limit);
    layer.dispose();
  });

  it('dispose sonrası mesh ve faz kaynakları temizlenir', () => {
    const layer = new CreatureLayer();
    layer.update([makeView({ id: 1 })], 0);
    layer.dispose();
    expect(layer.group.children).toHaveLength(0);
    expect((layer as unknown as { phases: Map<number, number> }).phases.size).toBe(0);
  });
});

describe('demo (creatureDemo)', () => {
  const flat = () => 10;
  it('her tür için yürüyen canlılar ve bir leş üretir; kimlikler benzersiz', () => {
    const views = demoViews(3, { x: 0, z: 0 }, flat);
    for (const kind of CREATURE_KINDS) {
      expect(views.filter((v) => v.kind === kind && !v.dead).length, kind).toBeGreaterThan(0);
      expect(views.filter((v) => v.kind === kind && v.dead).length, kind).toBe(1);
    }
    expect(new Set(views.map((v) => v.id)).size).toBe(views.length);
    expect(views.length).toBeLessThanOrEqual(CREATURES.maxActive);
    for (const v of views) expect(v.y).toBe(10);
  });

  it('zamanla hareket eder ve saf: aynı zaman → aynı sonuç', () => {
    const a = demoViews(5, { x: 0, z: 0 }, flat);
    const b = demoViews(5, { x: 0, z: 0 }, flat);
    const c = demoViews(9, { x: 0, z: 0 }, flat);
    expect(a).toEqual(b);
    const live = (vs: typeof a) => vs.filter((v) => !v.dead).map((v) => [v.x, v.z]);
    expect(live(c)).not.toEqual(live(a));
  });

  it('saldırı durumunda attackPhase 0–1 içinde, diğerlerinde 0', () => {
    for (let t = 0; t < 30; t += 0.25) {
      for (const v of demoViews(t, { x: 0, z: 0 }, flat)) {
        expect(v.attackPhase).toBeGreaterThanOrEqual(0);
        expect(v.attackPhase).toBeLessThanOrEqual(1);
        if (v.state !== 'attack') expect(v.attackPhase).toBe(0);
      }
    }
  });
});
