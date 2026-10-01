import { describe, expect, it } from 'vitest';
import { ROADS } from '../src/config';
import { buildRoadGroups, densify } from '../src/world/roadGeometry';

describe('yol şeritleri (Faz 10)', () => {
  it('çizgiyi en çok `step` aralıkla sıklaştırır, uçları korur', () => {
    const pts = densify(Float32Array.from([0, 0, 10, 0]), 3);
    expect(pts.slice(0, 2)).toEqual([0, 0]);
    expect(pts.slice(-2)).toEqual([10, 0]);
    for (let i = 2; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!)).toBeLessThanOrEqual(
        3 + 1e-6,
      );
    }
  });

  it('şerit zemine oturur (+lift), genişlik sınıftan, normal yukarı; gruplara bölünür', () => {
    const height = (x: number, z: number) => 0.1 * x + 0.05 * z;
    const groups = buildRoadGroups(
      [{ cls: 0, xz: Float32Array.from([10, 10, 30, 10, 1100, 10]) }],
      height,
      512,
    );
    expect(groups.length).toBe(3); // 0..512, 512..1024, 1024..
    const g = groups[0]!;
    // ilk kesit: sol ve sağ köşe arası genişlik
    const w = Math.hypot(g.positions[0]! - g.positions[3]!, g.positions[2]! - g.positions[5]!);
    expect(w).toBeCloseTo(ROADS.width[0] as number, 4);
    // yükseklik ≥ orta zemin + lift
    expect(g.positions[1]!).toBeGreaterThanOrEqual(height(10, 10) + ROADS.lift - 1e-6);
    // üçgen sarımı +Y normal verir
    const [a, b, c] = [g.indices[0]!, g.indices[1]!, g.indices[2]!];
    const p = (i: number) => [
      g.positions[i * 3]!,
      g.positions[i * 3 + 1]!,
      g.positions[i * 3 + 2]!,
    ];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
    const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
    const ny = u[2]! * v[0]! - u[0]! * v[2]!;
    expect(ny).toBeGreaterThan(0);
  });
});
