import { describe, expect, it } from 'vitest';
import { PERF_OVERLAY } from '../src/config';
import { PerfStats } from '../src/core/perfStats';
import { perfView } from '../src/ui/perfView';

function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe('PerfStats', () => {
  it('bölümleri toplar; aynı etiket bir karede birden çok kez açılırsa süreler toplanır', () => {
    const c = clock();
    const p = new PerfStats(c.now);
    p.section('simülasyon');
    c.advance(2);
    p.section('çizim');
    c.advance(5);
    p.section('simülasyon');
    c.advance(1);
    p.endFrame(16.7);
    const s = p.summary();
    expect(s.sections).toEqual([
      { label: 'çizim', ms: 5 },
      { label: 'simülasyon', ms: 3 },
    ]);
    expect(s.cpuMs).toBe(8);
  });

  it('istatistik: ortalama FPS, en uzun, en kötü %1', () => {
    const p = new PerfStats(() => 0);
    for (let i = 0; i < 199; i++) p.endFrame(10);
    p.endFrame(100);
    const s = p.summary();
    expect(s.maxMs).toBe(100);
    expect(s.avgMs).toBeCloseTo((199 * 10 + 100) / 200);
    // En kötü %1 = 2 kare: (100 + 10) / 2 = 55 ms → ~18 FPS.
    expect(s.lowFps).toBeCloseTo(1000 / 55);
    expect(p.history()).toHaveLength(200);
  });

  it('uzun kare takılma olarak o karenin bölümleriyle kaydedilir', () => {
    const c = clock();
    const p = new PerfStats(c.now);
    p.section('nesneler');
    c.advance(30);
    p.section('çizim');
    c.advance(4);
    p.endFrame(PERF_OVERLAY.spikeMs + 10);
    p.section('çizim');
    c.advance(4);
    p.endFrame(16);
    const spike = p.spike!;
    expect(spike.frameMs).toBe(PERF_OVERLAY.spikeMs + 10);
    expect(spike.cpuMs).toBe(34);
    expect(spike.sections[0]).toEqual({ label: 'nesneler', ms: 30 });
  });

  it('pencere dolunca en eski kareler düşer', () => {
    const p = new PerfStats(() => 0);
    for (let i = 0; i < PERF_OVERLAY.windowFrames + 10; i++) p.endFrame(i + 1);
    const h = p.history();
    expect(h).toHaveLength(PERF_OVERLAY.windowFrames);
    expect(h[h.length - 1]).toBe(PERF_OVERLAY.windowFrames + 10);
    expect(h[0]).toBe(11);
  });
});

describe('perfView', () => {
  it('metinler: FPS başlığı, çözünürlük, takılma dökümü (GPU ipucu)', () => {
    const c = clock();
    const p = new PerfStats(c.now);
    p.section('nesneler');
    c.advance(5);
    p.endFrame(80); // işlemci 5 ms, kare 80 ms → çoğu GPU/tarayıcı
    for (let i = 0; i < 10; i++) p.endFrame(16);
    c.advance(3000);
    const view = perfView({
      summary: p.summary(),
      spike: p.spike,
      now: c.now(),
      drawCalls: 140,
      triangles: 412_000,
      pixelRatio: 1.7,
      resolutionScale: 0.85,
      heapMb: 380.4,
      deferred: 2,
    });
    expect(view.head).toMatch(/FPS/);
    expect(view.rows).toContainEqual(['Draw call · üçgen', '140 · 412 bin']);
    expect(view.rows).toContainEqual(['Çözünürlük', '×1.70 (%85)']);
    expect(view.rows).toContainEqual(['JS belleği', '380 MB']);
    expect(view.spike).toBe('Son takılma: 80 ms, 3 sn önce · çoğu GPU/tarayıcı — nesneler 5');
  });

  it('takılma yoksa ve ölçüm yokken sade metin', () => {
    const view = perfView({
      summary: new PerfStats(() => 0).summary(),
      spike: null,
      now: 0,
      drawCalls: 0,
      triangles: 0,
      pixelRatio: 1,
      resolutionScale: null,
      heapMb: null,
      deferred: 0,
    });
    expect(view.head).toBe('— FPS');
    expect(view.spike).toBe('Takılma yok');
    expect(view.rows.find(([l]) => l === 'JS belleği')).toBeUndefined();
    expect(view.rows).toContainEqual(['Çözünürlük', '×1.00 (sabit)']);
  });
});
