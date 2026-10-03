import { describe, expect, it } from 'vitest';
import { Scene, type Light } from 'three';
import { Environment } from '../src/world/Environment';

/** Görünür ışık sayısı (three bu sayı değişince tüm malzemeleri yeniden derler). */
function visibleLights(scene: Scene): number {
  let n = 0;
  scene.traverseVisible((o) => {
    if ((o as Light).isLight) n++;
  });
  return n;
}

describe('Environment — ışık sayısı sabit (gölgelendirici yeniden derlemesi olmasın)', () => {
  it('gece, alacakaranlık ve gündüz aynı sayıda görünür ışık', () => {
    const scene = new Scene();
    const env = new Environment(scene);
    const counts = new Set<number>();
    for (const altitudeDeg of [-40, -12, -4, 0, 3, 15, 60]) {
      env.setSun({ altitudeDeg, azimuthDeg: 180 });
      counts.add(visibleLights(scene));
    }
    expect(counts.size).toBe(1);
  });
});
