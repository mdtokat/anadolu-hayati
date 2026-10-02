import { describe, expect, it } from 'vitest';
import { ROADS } from '../src/config';
import { levelPad, lockFootprint, type PadGrid } from '../src/world/buildingPads';
import { applyRoadGrading } from '../src/world/roadGrading';
import { SPAN_KIND, type PlannedRoad, type RoadPlan } from '../src/settlements/roadProfile';

/** Küçük sentetik ızgara (2 m hücre, orijin −60,−60); yükseklik fonksiyonuyla başlar. */
class Grid implements PadGrid {
  readonly width = 61;
  readonly height = 61;
  readonly cell = 2;
  readonly origin = { x: -60, z: -60 };
  private readonly data: Float32Array;
  private readonly locked = new Uint8Array(61 * 61);

  constructor(h: (x: number, z: number) => number) {
    this.data = new Float32Array(61 * 61);
    for (let r = 0; r < 61; r++) {
      for (let c = 0; c < 61; c++) this.data[r * 61 + c] = h(-60 + c * 2, -60 + r * 2);
    }
  }
  sample(c: number, r: number): number {
    return this.data[r * 61 + c]!;
  }
  setSample(c: number, r: number, v: number): void {
    this.data[r * 61 + c] = v;
  }
  isLocked(c: number, r: number): boolean {
    return this.locked[r * 61 + c] === 1;
  }
  lock(c: number, r: number): void {
    this.locked[r * 61 + c] = 1;
  }
  at(x: number, z: number): number {
    return this.sample(Math.round((x + 60) / 2), Math.round((z + 60) / 2));
  }
}

/** z = 0 boyunca doğuya giden, sabit yatak yüksekliğinde bir yol (uçları ızgara dışına taşar). */
function straightPlan(bed: number, kind: number[] = []): RoadPlan {
  const count = 41; // 3 m aralık, x = −60 … 60
  const xz = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    xz[i * 2] = -60 + i * 3;
    xz[i * 2 + 1] = 0;
  }
  const road: PlannedRoad = {
    cls: 1,
    xz,
    step: 3,
    natural: new Float32Array(count),
    bed: new Float32Array(count).fill(bed),
    kind: Uint8Array.from({ length: count }, (_, i) => kind[i] ?? 0),
  };
  return { roads: [road], spans: [] };
}

describe('applyRoadGrading', () => {
  it('yol ekseni ve banket yatak yüksekliğine gelir; uzakta zemin değişmez', () => {
    const g = new Grid((_x, z) => 10 + 0.8 * z); // yola dik yamaç
    applyRoadGrading(g, straightPlan(10));
    for (const x of [-30, 0, 30]) {
      expect(g.at(x, 0)).toBeCloseTo(10, 3);
      expect(g.at(x, 2)).toBeCloseTo(10, 3); // banket (≈ 0,7 m) + yarı genişlik (2 m)
    }
    expect(g.at(0, 40)).toBeCloseTo(10 + 0.8 * 40, 3);
    expect(g.at(0, -40)).toBeCloseTo(10 - 0.8 * 40, 3);
  });

  it('yamaç eksenden uzaklaştıkça yumuşakça doğal zemine bağlanır (basamak yok)', () => {
    const g = new Grid((_x, z) => 10 + 0.8 * z);
    const natural = new Grid((_x, z) => 10 + 0.8 * z);
    applyRoadGrading(g, straightPlan(10));
    // Kazı tarafı (z > 0): düzeltilen zemin hiçbir yerde doğaldan yüksek değil ve komşu hücre farkı sınırlı.
    let prev = g.at(0, 4);
    for (let z = 6; z <= 40; z += 2) {
      expect(g.at(0, z)).toBeLessThanOrEqual(natural.at(0, z) + 1e-6);
      expect(Math.abs(g.at(0, z) - prev)).toBeLessThan(3.2);
      prev = g.at(0, z);
    }
    // Dolgu tarafı (z < 0): zemin doğaldan alçak değil.
    for (let z = -6; z >= -40; z -= 2)
      expect(g.at(0, z)).toBeGreaterThanOrEqual(natural.at(0, z) - 1e-6);
  });

  it('yol dışında hücre değişimi `maxEdgeChange` ile sınırlı', () => {
    const g = new Grid(() => 40); // yatak 0,5 m: 39,5 m kazı gerekir
    applyRoadGrading(g, straightPlan(0.5));
    expect(g.at(0, 0)).toBeCloseTo(0.5, 3);
    for (let z = 4; z <= 30; z += 2) {
      expect(40 - g.at(0, z)).toBeLessThanOrEqual(ROADS.maxEdgeChange + 1e-6);
    }
  });

  it('köprü/tünel kesiminin altındaki zemin değişmez; deniz hücrelerine dokunulmaz', () => {
    const kinds = Array.from({ length: 41 }, (_, i) => (i >= 15 && i <= 25 ? SPAN_KIND.bridge : 0));
    const g = new Grid((x, z) => (x < -50 ? 0 : 6 + 0.2 * z));
    const before = new Grid((x, z) => (x < -50 ? 0 : 6 + 0.2 * z));
    applyRoadGrading(g, straightPlan(9, kinds));
    // Köprü altı (x ≈ 0 civarı, kesim 15–25 → x −15 … 15): ekseni dahil değişmez.
    expect(g.at(0, 0)).toBe(before.at(0, 0));
    expect(g.at(6, 1)).toBe(before.at(6, 1));
    // Yatak yüksekliği zemin ekseninde: kesimin dışında uygulanır.
    expect(g.at(40, 0)).toBeCloseTo(9, 3);
    // Deniz (x < −50, h = 0) olduğu gibi.
    expect(g.at(-56, 0)).toBe(0);
  });

  it('yol yatağı hücreleri kilitlenir', () => {
    const g = new Grid(() => 5);
    applyRoadGrading(g, straightPlan(6));
    expect(g.isLocked(30, 30)).toBe(true); // x = 0, z = 0
    expect(g.isLocked(30, 50)).toBe(false);
  });
});

describe('levelPad (yapı terası)', () => {
  const box = { x: 0, z: 0, hx: 5, hz: 4, yaw: 0 };

  it('ayak izini seviyeye getirir, çevresine yumuşak bağlar, ayak izini kilitler', () => {
    const g = new Grid((x) => 20 + 0.5 * x); // doğu yönünde yükselen yamaç
    levelPad(g, box, 20);
    for (const x of [-4, 0, 4]) for (const z of [-3, 0, 3]) expect(g.at(x, z)).toBeCloseTo(20, 3);
    expect(g.isLocked(30, 30)).toBe(true);
    // Şev: doğuya doğru zemin 20'den doğala monoton yükselir.
    let prev = g.at(6, 0);
    for (let x = 8; x <= 24; x += 2) {
      expect(g.at(x, 0)).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = g.at(x, 0);
    }
    // Çok uzakta doğal.
    expect(g.at(50, 0)).toBeCloseTo(20 + 25, 3);
  });

  it('kilitli hücreleri (yol yatağı, başka yapı) değiştirmez', () => {
    const g = new Grid(() => 12);
    lockFootprint(g, { x: 14, z: 0, hx: 3, hz: 3, yaw: 0 });
    const locked = g.at(14, 0);
    levelPad(g, box, 18);
    expect(g.at(14, 0)).toBe(locked);
    expect(g.at(0, 0)).toBeCloseTo(18, 3);
  });
});
