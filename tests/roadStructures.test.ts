import { describe, expect, it } from 'vitest';
import { ROADS, ROAD_STRUCTURES, TERRAIN_OVERLAY } from '../src/config';
import { SPAN_KIND, type PlannedRoad, type RoadPlan } from '../src/settlements/roadProfile';
import {
  StructureIndex,
  boxBasis,
  buildBoxVertices,
  roadSurfaceColor,
  structureShape,
} from '../src/world/roadStructureGeometry';
import { dashWave } from '../src/world/terrainOverlay';

/** x ekseninde 30 m'lik düz bir köprü (noktalar 3 m), güverte 5 m yükseklikte, altta 0–5 m'lik vadi. */
function bridgePlan(
  cls: 0 | 1 | 2 = 0,
  high = false,
  type: 'beam' | 'viaduct' | 'arch' | 'wooden' = high ? 'viaduct' : 'beam',
): RoadPlan {
  const count = 15;
  const xz = new Float32Array(count * 2);
  const natural = new Float32Array(count);
  const bed = new Float32Array(count);
  const kind = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    xz[i * 2] = i * 3;
    xz[i * 2 + 1] = 0;
    natural[i] = i < 3 || i > 11 ? 5 : high ? -10 : 4;
    bed[i] = 5;
    if (i >= 3 && i <= 11) kind[i] = SPAN_KIND.bridge;
  }
  const plan: RoadPlan = {
    roads: [{ cls, xz, step: 3, natural, bed, kind } satisfies PlannedRoad],
    spans: [{ road: 0, i0: 2, i1: 12, kind: SPAN_KIND.bridge, viaduct: high, type }],
  };
  return plan;
}

describe('köprü şekli', () => {
  it('beton köprü: güverte üst yüzü yatakta, iki yan çelik korkuluk; viyadükte çarpışmayan ayaklar', () => {
    const plan = bridgePlan(0);
    const shape = structureShape(plan, plan.spans[0]!);
    const S = ROAD_STRUCTURES;
    // Beton güverte gri değil, yolun renginde (anayol asfaltı); 10 parça (i0 … i1) + iki yaklaşım plakası.
    const paved = shape.boxes.filter((b) => b.color === roadSurfaceColor(0) && b.solid);
    expect(paved).toHaveLength(12);
    const deck = paved.filter((b) => b.x > 6 && b.x < 36);
    expect(deck).toHaveLength(10);
    // Yaklaşım plakaları ayakların dışında (2–3 ve 11–12. parça değil: 1–2 ve 12–13), güverteyle aynı üst yüzde:
    // zemindeki yol ile güverte arasında basamak yok.
    const approach = paved.filter((b) => b.x < 6 || b.x > 36);
    expect(approach.map((b) => b.x).sort((a, b) => a - b)).toEqual([4.5, 37.5]);
    for (const b of approach) {
      expect(b.y + b.hh).toBeCloseTo(5, 3);
      expect(b.hh * 2).toBeCloseTo(S.deckThickness, 3);
      expect(b.hw).toBeCloseTo((ROADS.width[0] as number) / 2 + S.approachPad, 3);
    }
    for (const b of deck) {
      expect(b.y + b.hh).toBeCloseTo(5, 3); // üst yüz yatak seviyesinde
      expect(b.hw).toBeCloseTo((ROADS.width[0] as number) / 2 + (S.widthPad[0] as number), 3);
      expect(b.solid).toBe(true);
    }
    const rails = shape.boxes.filter((b) => b.color === S.colors.guardRail && b.solid);
    expect(rails).toHaveLength(20);
    const tall = bridgePlan(0, true);
    const tallShape = structureShape(tall, tall.spans[0]!);
    const parapets = tallShape.boxes.filter((b) => b.color === S.colors.parapet);
    expect(parapets).toHaveLength(20);
    for (const b of parapets) expect(b.y + b.hh).toBeCloseTo(5 + S.parapetHeight, 3);
    // Viyadükte ayaklar var ve çarpışmaz.
    const piers = tallShape.boxes.filter((b) => b.color === S.colors.pier && !b.solid);
    expect(piers.length).toBeGreaterThan(0);
  });

  it('taş kemer köprü: taş güverte, yanlarda kemere inen duvar (kemerin altı boş)', () => {
    const plan = bridgePlan(1, true, 'arch'); // derin dere yatağı: kemer yükselir
    const S = ROAD_STRUCTURES;
    const shape = structureShape(plan, plan.spans[0]!);
    // 10 güverte parçası + 2 ayak (istinat) bloğu.
    expect(shape.boxes.filter((b) => b.color === S.colors.stone && b.solid).length).toBe(12);
    const walls = shape.boxes.filter((b) => b.color === S.colors.stone && !b.solid);
    expect(walls.length).toBeGreaterThan(0);
    // Ortadaki duvar parçası kenardakilerden kısa (kemer ortada yükselir).
    const heights = walls.map((b) => b.hh);
    expect(Math.min(...heights)).toBeLessThan(Math.max(...heights));
  });

  it('ahşap patika köprüsü: kalas güverte, dikmeler, dar', () => {
    const plan = bridgePlan(2, false, 'wooden');
    const S = ROAD_STRUCTURES;
    const shape = structureShape(plan, plan.spans[0]!);
    const deck = shape.boxes.filter((b) => b.color === S.colors.wood && b.solid);
    expect(deck).toHaveLength(10);
    expect(shape.boxes.filter((b) => b.color === S.colors.woodLight).length).toBeGreaterThan(20);
  });

  it('tünel: zemin, kalın duvarlar ve tavan çarpışır; lambalar ışıklı; iki ağız cephesi', () => {
    const plan = bridgePlan(0);
    const road = plan.roads[0]!;
    for (let i = 3; i <= 11; i++) road.kind[i] = SPAN_KIND.tunnel;
    plan.spans[0] = {
      road: 0,
      i0: 2,
      i1: 12,
      kind: SPAN_KIND.tunnel,
      viaduct: false,
      type: 'beam',
    };
    const S = ROAD_STRUCTURES;
    const shape = structureShape(plan, plan.spans[0]!);
    const floor = shape.boxes.filter((b) => b.color === S.colors.tunnelFloor);
    expect(floor).toHaveLength(12); // 10 parça + iki ağız önü
    for (const b of floor) expect(b.y + b.hh).toBeCloseTo(5, 3);
    const shell = shape.boxes.filter((b) => b.color === S.colors.tunnel);
    expect(shell).toHaveLength(30); // iki duvar + tavan × 10
    expect(shell.every((b) => b.solid)).toBe(true);
    const roof = shell.filter((b) => b.y > 5 + S.tunnelHeight);
    expect(roof).toHaveLength(10);
    expect(shape.boxes.some((b) => b.emissive)).toBe(true);
    expect(shape.boxes.filter((b) => b.color === S.colors.portal).length).toBe(6);
  });

  it('köprü ve tünelin üstündeki yol, yolun tipinin renginde; anayolda çizgiler; ayaklar gri', () => {
    const S = ROAD_STRUCTURES;
    const O = TERRAIN_OVERLAY;
    const surfaceTop = 5 + S.surfaceThickness;
    const tops = (cls: 0 | 1 | 2, type?: 'beam' | 'viaduct' | 'arch' | 'wooden') => {
      const plan = bridgePlan(cls, false, type);
      return structureShape(plan, plan.spans[0]!).boxes.filter(
        (b) => !b.solid && b.hh < 0.05 && Math.abs(b.y + b.hh - surfaceTop) < 1e-3,
      );
    };
    expect(tops(0).every((b) => b.color === O.asphalt)).toBe(true);
    expect(tops(0)).toHaveLength(12); // 10 güverte parçası + iki yaklaşım plakası
    expect(tops(1, 'arch').every((b) => b.color === O.villageAsphalt)).toBe(true);
    expect(tops(2, 'wooden').every((b) => b.color === O.dirt)).toBe(true);
    // Anayol: iki kenar çizgisi + kesik orta şerit (yaklaşımlarla 36 m'de 7 m dönemli, yarısı çizgi).
    const beam = structureShape(bridgePlan(0), bridgePlan(0).spans[0]!);
    const marks = beam.boxes.filter((b) => b.y + b.hh > surfaceTop + 1e-4 && b.hh < 0.05);
    expect(marks.filter((b) => b.color === O.edgeLine)).toHaveLength(24);
    const dashes = marks.filter((b) => b.color === O.centerLine);
    const dashLength = dashes.reduce((sum, b) => sum + 2 * b.hl, 0);
    expect(dashLength).toBeGreaterThan(15);
    expect(dashLength).toBeLessThan(21);
    // Çizgiler arazi kaplamasındaki kesik şeritle aynı evrede: çizgi parçalarının ortası dalganın < 0,5 kesiminde.
    for (const b of dashes) expect(dashWave(b.x, O.dashPeriod)).toBeLessThan(0.5);
    // Köy yolunda çizgi yok.
    const village = structureShape(bridgePlan(1), bridgePlan(1).spans[0]!);
    expect(village.boxes.some((b) => b.color === O.centerLine || b.color === O.edgeLine)).toBe(
      false,
    );
    // Viyadükte ayaklar gri kalır.
    const tall = bridgePlan(0, true);
    const piers = structureShape(tall, tall.spans[0]!).boxes.filter(
      (b) => b.color === S.colors.pier,
    );
    expect(piers.length).toBeGreaterThan(0);
    // Tünel zemininin üstünde de yol yüzeyi (10 parça + iki ağız önü).
    const plan = bridgePlan(1);
    for (let i = 3; i <= 11; i++) plan.roads[0]!.kind[i] = SPAN_KIND.tunnel;
    plan.spans[0] = {
      road: 0,
      i0: 2,
      i1: 12,
      kind: SPAN_KIND.tunnel,
      viaduct: false,
      type: 'beam',
    };
    const tunnel = structureShape(plan, plan.spans[0]!).boxes.filter(
      (b) => b.color === O.villageAsphalt && Math.abs(b.y + b.hh - surfaceTop) < 1e-3,
    );
    expect(tunnel).toHaveLength(12);
  });

  it('patika köprüsü ana yol köprüsünden dar', () => {
    const wide = structureShape(bridgePlan(0), bridgePlan(0).spans[0]!).boxes[0]!;
    const narrow = structureShape(bridgePlan(2), bridgePlan(2).spans[0]!).boxes[0]!;
    expect(narrow.hw).toBeLessThan(wide.hw);
  });

  it('kutu tabanı sağ-el dik birim vektörlerdir (eğimli güvertede de)', () => {
    const plan = bridgePlan(1);
    plan.roads[0]!.bed[6] = 6.2; // eğim
    const shape = structureShape(plan, plan.spans[0]!);
    for (const b of shape.boxes) {
      const { r, u, f } = boxBasis(b);
      const len = (v: readonly number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);
      const dot = (a: readonly number[], c: readonly number[]) =>
        a[0]! * c[0]! + a[1]! * c[1]! + a[2]! * c[2]!;
      expect(len(r)).toBeCloseTo(1, 5);
      expect(len(u)).toBeCloseTo(1, 5);
      expect(len(f)).toBeCloseTo(1, 5);
      expect(Math.abs(dot(r, u))).toBeLessThan(1e-6);
      expect(Math.abs(dot(r, f))).toBeLessThan(1e-6);
      expect(Math.abs(dot(u, f))).toBeLessThan(1e-6);
      // r × u = f (sağ-el)
      const cross = [
        r[1] * u[2] - r[2] * u[1],
        r[2] * u[0] - r[0] * u[2],
        r[0] * u[1] - r[1] * u[0],
      ];
      expect(dot(cross, f)).toBeGreaterThan(0.999);
    }
  });
});

describe('kutu köşe verisi', () => {
  it('her yüzün normali dışa bakar ve üçgen sargısı normalle uyumlu', () => {
    const plan = bridgePlan(0);
    const shape = structureShape(plan, plan.spans[0]!);
    const box = shape.boxes[0]!;
    const { position, normal, color } = buildBoxVertices([box]);
    expect(position.length).toBe(36 * 3);
    expect(normal.length).toBe(36 * 3);
    expect(color.length).toBe(36 * 3);
    for (let t = 0; t < 12; t++) {
      const p = (k: number) => [
        position[(t * 3 + k) * 3]!,
        position[(t * 3 + k) * 3 + 1]!,
        position[(t * 3 + k) * 3 + 2]!,
      ];
      const a = p(0);
      const b = p(1);
      const c = p(2);
      const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const n = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const given = [normal[t * 9]!, normal[t * 9 + 1]!, normal[t * 9 + 2]!];
      expect(n[0]! * given[0]! + n[1]! * given[1]! + n[2]! * given[2]!).toBeGreaterThan(0);
      // Normal, kutu merkezinden yüze doğru (dışa) bakar.
      const centroid = [
        (a[0]! + b[0]! + c[0]!) / 3 - box.x,
        (a[1]! + b[1]! + c[1]!) / 3 - box.y,
        (a[2]! + b[2]! + c[2]!) / 3 - box.z,
      ];
      expect(
        centroid[0]! * given[0]! + centroid[1]! * given[1]! + centroid[2]! * given[2]!,
      ).toBeGreaterThan(0);
    }
  });
});

describe('StructureIndex', () => {
  it('yakındaki yapıları bulur, uzaktakini bulmaz; şekil önbellekli', () => {
    const plan = bridgePlan(1);
    const index = new StructureIndex(plan);
    expect(index.count).toBe(1);
    expect(index.near(15, 0, 40)).toEqual([0]);
    expect(index.near(2000, 2000, 100)).toEqual([]);
    expect(index.shape(0)).toBe(index.shape(0));
  });
});
