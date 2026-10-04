import { describe, expect, it } from 'vitest';
import type { RoadData } from '../src/data/settlements';
import {
  alongLine,
  formatPopulation,
  placeRoadSigns,
  realKm,
  signPosts,
  signText,
  type DirectionSign,
  type EntranceSign,
  type SignTown,
} from '../src/settlements/roadSigns';
import { buildSignVertices, signFaces, type SignSlot } from '../src/world/roadSignGeometry';

/** T kavşağı: doğuda Ankara (il), batıda Bolu (il), güneyde Gerede (ilçe); yollar kesim dairelerinde biter. */
function tJunction(): { roads: RoadData[]; towns: SignTown[] } {
  const line = (...pts: number[]): RoadData => ({ cls: 0, xz: Float32Array.from(pts) });
  const roads = [
    line(0, 0, 550, 0),
    line(0, 0, -550, 0),
    { ...line(0, 0, 0, 550), cls: 1 as const },
  ];
  const town = (name: string, x: number, z: number, rank: 'il' | 'ilce'): SignTown => ({
    x,
    z,
    r: 50,
    name,
    rank,
    population: rank === 'il' ? 104276 : null,
    elevation: 900,
  });
  return {
    roads,
    towns: [
      town('Ankara', 600, 0, 'il'),
      town('Bolu', -600, 0, 'il'),
      town('Gerede', 0, 600, 'ilce'),
    ],
  };
}

const flat = {
  heightAt: () => 1,
  // Yollar: x ekseni boyunca ve güneye giden kol (yarı genişlik + pay).
  blocked: (x: number, z: number) => Math.abs(z) < 2.5 || (z > 0 && Math.abs(x) < 2.5),
};

describe('yol levhaları', () => {
  it('kavşakta her kola o yoldan ulaşılan il/ilçe merkezini ve yol üzerinden uzaklığını yazar', () => {
    const { roads, towns } = tJunction();
    const signs = placeRoadSigns(roads, towns, flat);
    const dir = signs.filter((s): s is DirectionSign => s.kind === 'direction');
    expect(dir).toHaveLength(1);
    const sign = dir[0]!;
    const byName = new Map(
      sign.arms.flatMap((a) => a.lines.map((l) => [l.name, { ...l, dir: a.dir }])),
    );
    // 550 m yol + 50 m kent içi = 600 oyun m = 30 gerçek km.
    expect(byName.get('Ankara')).toMatchObject({ km: 30 });
    expect(byName.get('Bolu')).toMatchObject({ km: 30 });
    // Kolda il yoksa yakın ilçe yazılır.
    expect(byName.get('Gerede')).toMatchObject({ km: 30 });
    expect(Math.cos(byName.get('Ankara')!.dir)).toBeCloseTo(1, 3);
    expect(Math.cos(byName.get('Bolu')!.dir)).toBeCloseTo(-1, 3);
    expect(Math.sin(byName.get('Gerede')!.dir)).toBeCloseTo(1, 3);
    // Direk yolda değil; kolların arasındaki en geniş açıda (kuzey, −z).
    expect(flat.blocked(sign.x, sign.z)).toBe(false);
    expect(sign.z).toBeLessThan(0);
  });

  it('il/ilçe girişinde gelen sürücünün sağında, ona bakan ad/nüfus levhası', () => {
    const { roads, towns } = tJunction();
    const ent = placeRoadSigns(roads, towns, flat).filter(
      (s): s is EntranceSign => s.kind === 'entrance',
    );
    expect(ent.map((s) => s.name).sort()).toEqual(['Ankara', 'Bolu', 'Gerede']);
    const ankara = ent.find((s) => s.name === 'Ankara')!;
    // Doğuya giden sürücünün sağı güneydir (+z); levha batıya (gelen sürücüye) bakar.
    expect(ankara.z).toBeGreaterThan(2.5);
    expect(ankara.x).toBeCloseTo(538, 0);
    expect(Math.cos(ankara.face)).toBeCloseTo(-1, 3);
    expect(ankara).toMatchObject({ rank: 'il', population: 104276, elevation: 900 });
    for (const s of ent) for (const p of signPosts(s)) expect(flat.blocked(p.x, p.z)).toBe(false);
  });

  it('kent içindeki ve iki kollu düğümlere yön levhası konmaz', () => {
    const roads: RoadData[] = [
      { cls: 0, xz: Float32Array.from([0, 0, 100, 0]) },
      { cls: 0, xz: Float32Array.from([100, 0, 200, 0]) },
    ];
    expect(placeRoadSigns(roads, [], flat)).toEqual([]);
  });

  it('yardımcılar: gerçek km, Türkçe büyük harf, nüfus biçimi, çizgi boyunca nokta', () => {
    expect(realKm(600)).toBe(30);
    expect(realKm(3)).toBe(1);
    expect(signText('İzmit')).toBe('İZMİT');
    expect(signText('Çankırı')).toBe('ÇANKIRI');
    expect(formatPopulation(5864049)).toBe('5.864.049');
    expect(formatPopulation(950)).toBe('950');
    const p = alongLine([0, 0, 10, 0, 10, 10], 15, true);
    expect(p).toMatchObject({ x: 10, z: 5, dx: 0, dz: 1 });
    const q = alongLine([0, 0, 10, 0, 10, 10], 4, false);
    expect(q.x).toBeCloseTo(10);
    expect(q.z).toBeCloseTo(6);
  });

  it('geometri: her yazı yüzü kendi slotuna eşlenir, gövde ve yüz köşe sayıları tutarlı', () => {
    const { roads, towns } = tJunction();
    const signs = placeRoadSigns(roads, towns, flat);
    for (const sign of signs) {
      const faces = signFaces(sign);
      const slots: SignSlot[] = faces.map((_, k) => ({
        u0: 0,
        u1: 0.25,
        v0: k / 16,
        v1: (k + 1) / 16,
      }));
      const v = buildSignVertices(sign, slots);
      expect(v.body.position.length % 9).toBe(0);
      expect(v.body.color.length).toBe(v.body.position.length);
      // Yön plakası iki yüzlü (2 × 2 üçgen), giriş levhası ön + arka.
      const quads = sign.kind === 'direction' ? faces.length * 2 : 2;
      expect(v.face.position.length).toBe(quads * 6 * 3);
      expect(v.face.uv.length).toBe(quads * 6 * 2);
      for (const u of v.face.uv) expect(u).toBeGreaterThanOrEqual(0);
      // Direğin dibi zeminde.
      let minY = Infinity;
      for (let i = 1; i < v.body.position.length; i += 3)
        minY = Math.min(minY, v.body.position[i]!);
      expect(minY).toBeLessThan(sign.y);
    }
  });
});
