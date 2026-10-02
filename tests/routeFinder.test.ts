import { describe, expect, it } from 'vitest';
import { findRoute, type RouteField } from '../src/settlements/routeFinder';

const open: RouteField = { cost: () => 1 };

function length(route: number[]): number {
  let l = 0;
  for (let i = 0; i + 3 < route.length; i += 2) {
    l += Math.hypot(route[i + 2]! - route[i]!, route[i + 3]! - route[i + 1]!);
  }
  return l;
}

describe('findRoute', () => {
  it('açık arazide uçlar tam verilen noktalardır ve rota kısadır', () => {
    const route = findRoute(0, 0, 100, 40, open)!;
    expect(route.slice(0, 2)).toEqual([0, 0]);
    expect(route.slice(-2)).toEqual([100, 40]);
    expect(length(route)).toBeLessThan(Math.hypot(100, 40) * 1.04);
  });

  it('duvarı dolanır, geçilemez hücreye girmez', () => {
    // x = 50'de z ∈ [−60, 30] arası duvar.
    const wall: RouteField = {
      cost: (x, z) => (Math.abs(x - 50) < 6 && z > -60 && z < 30 ? Infinity : 1),
    };
    const wallInner = (x: number, z: number) => Math.abs(x - 50) < 4 && z > -60 && z < 30;
    const route = findRoute(0, 0, 100, 0, wall, { pad: 90 })!;
    expect(route).not.toBeNull();
    // Rota boyunca (parçalar dahil) hiçbir örnek duvarın içinde değil.
    for (let i = 0; i + 3 < route.length; i += 2) {
      for (let t = 0; t <= 1; t += 0.05) {
        const x = route[i]! + (route[i + 2]! - route[i]!) * t;
        const z = route[i + 1]! + (route[i + 3]! - route[i + 1]!) * t;
        // Hücre merkezleriyle çalışan arama duvar köşesini en çok yarım hücre (2 m) kesebilir: 1 m daralmış duvar.
        expect(wallInner(x, z), `${x.toFixed(1)},${z.toFixed(1)}`).toBe(false);
      }
    }
    expect(length(route)).toBeGreaterThan(100);
  });

  it('kapalı bir kutuya hapsolmuşsa null', () => {
    const box: RouteField = {
      cost: (x, z) => {
        const d = Math.max(Math.abs(x - 100), Math.abs(z));
        return d > 10 && d < 30 ? Infinity : 1;
      },
    };
    expect(findRoute(0, 0, 100, 0, box, { pad: 80 })).toBeNull();
  });

  it('pahalı alandan kaçınır (maliyet alanı rotayı büker)', () => {
    const swamp: RouteField = {
      cost: (x, z) => (Math.abs(x - 50) < 10 && Math.abs(z) < 25 ? 40 : 1),
    };
    const route = findRoute(0, 0, 100, 0, swamp, { pad: 80 })!;
    let maxAbsZ = 0;
    for (let i = 1; i < route.length; i += 2) maxAbsZ = Math.max(maxAbsZ, Math.abs(route[i]!));
    expect(maxAbsZ).toBeGreaterThan(20);
  });

  it('düğüm sınırı aşılırsa vazgeçer (null)', () => {
    expect(findRoute(0, 0, 400, 400, open, { maxNodes: 50 })).toBeNull();
  });
});
