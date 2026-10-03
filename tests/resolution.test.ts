import { describe, expect, it } from 'vitest';
import { ADAPTIVE_RESOLUTION } from '../src/config';
import { pixelRatioFor, ResolutionGovernor } from '../src/core/resolution';

/** `seconds` boyunca `ms` süreli kareler verir; ölçek değişim sayısını döndürür. */
function run(g: ResolutionGovernor, ms: number, seconds: number): number {
  let changes = 0;
  for (let t = 0; t < seconds * 1000; t += ms) if (g.sample(ms)) changes++;
  return changes;
}

const SLOW = 33.3; // 30 FPS
const FAST = 16.7; // 60 FPS (dikey eşitleme)

describe('ResolutionGovernor', () => {
  it('rahat oyunda tam çözünürlükte kalır', () => {
    const g = new ResolutionGovernor();
    expect(run(g, FAST, 30)).toBe(0);
    expect(g.scale).toBe(1);
  });

  it('sürekli yavaşlıkta kademe kademe düşer, en alt kademede durur', () => {
    const g = new ResolutionGovernor();
    run(g, SLOW, 4);
    expect(g.currentLevel).toBe(1);
    run(g, SLOW, 60);
    expect(g.scale).toBe(ADAPTIVE_RESOLUTION.scales.at(-1));
  });

  it('tekil takılmalar (medyan) çözünürlüğü düşürmez', () => {
    const g = new ResolutionGovernor();
    for (let i = 0; i < 2000; i++) g.sample(i % 20 === 0 ? 200 : FAST);
    expect(g.scale).toBe(1);
  });

  it('rahatlayınca bekleme sonrası kademe yükseltir', () => {
    const g = new ResolutionGovernor();
    run(g, SLOW, 8);
    const low = g.currentLevel;
    expect(low).toBeGreaterThan(0);
    run(g, FAST, ADAPTIVE_RESOLUTION.upHoldSeconds + 3);
    expect(g.currentLevel).toBe(low - 1);
  });

  it('başarısız yükseltme denemesi o kademenin beklemesini katlar (titreme olmaz)', () => {
    const g = new ResolutionGovernor();
    run(g, SLOW, 4); // seviye 1
    expect(g.currentLevel).toBe(1);
    run(g, FAST, ADAPTIVE_RESOLUTION.upHoldSeconds + 2); // 0'a deneme
    expect(g.currentLevel).toBe(0);
    run(g, SLOW, 4); // deneme hemen yavaşladı → 1
    expect(g.currentLevel).toBe(1);
    // Aynı bekleme süresi artık yetmez (katlandı).
    run(g, FAST, ADAPTIVE_RESOLUTION.upHoldSeconds + 2);
    expect(g.currentLevel).toBe(1);
    run(g, FAST, ADAPTIVE_RESOLUTION.upHoldSeconds * 2);
    expect(g.currentLevel).toBe(0);
  });

  it('reset tam çözünürlüğe döner', () => {
    const g = new ResolutionGovernor();
    run(g, SLOW, 20);
    g.reset();
    expect(g.scale).toBe(1);
  });
});

describe('pixelRatioFor', () => {
  it('cihaz ve ön ayar sınırının küçüğü × ölçek; alt sınır', () => {
    expect(pixelRatioFor(2, 2, 1)).toBe(2);
    expect(pixelRatioFor(2, 1.5, 1)).toBe(1.5);
    expect(pixelRatioFor(1, 2, 0.7)).toBeCloseTo(0.7);
    expect(pixelRatioFor(1, 2, 0.3)).toBe(ADAPTIVE_RESOLUTION.minPixelRatio);
    // Zaten alt sınırın altındaki cihaz oranı yükseltilmez.
    expect(pixelRatioFor(0.4, 2, 0.5)).toBe(0.4);
  });
});
