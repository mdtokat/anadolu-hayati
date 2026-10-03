import { describe, expect, it } from 'vitest';
import type { WaterLine } from '../src/data/region';
import { thinWaterLines } from '../src/data/waterThinning';
import { loadRealWorld } from './helpers/realRegion';

const line = (kind: WaterLine['kind'], xz: number[], intermittent = false): WaterLine => ({
  kind,
  intermittent,
  xz: Float64Array.from(xz),
});

const options = {
  minNetworkLength: 100,
  minIntermittentLength: 200,
  minRiverNetworkLength: 50,
  minAnchoredLength: 10,
  joinTolerance: 1.5,
  anchorReach: 20,
};

describe('thinWaterLines (küçük derelerin ayıklanması)', () => {
  it('kısa, tek başına dereyi kaldırır; uzun nehir ve kanalı korur', () => {
    const lines = [
      line('stream', [0, 0, 30, 0]),
      line('river', [0, 10, 60, 10]),
      line('canal', [0, 20, 30, 20]),
      line('canal', [30, 20, 55, 20]),
    ];
    expect(thinWaterLines(lines, options).map((l) => l.kind)).toEqual(['river', 'canal', 'canal']);
  });

  it('kısa nehir ve kanal parçalarını da kaldırır (birkaç hücrelik su)', () => {
    const lines = [line('river', [0, 10, 5, 10]), line('canal', [0, 20, 3, 20])];
    expect(thinWaterLines(lines, options)).toHaveLength(0);
  });

  it('nehre bağlanan kısa dere kolu nehirle kurtulmaz', () => {
    const lines = [line('river', [0, 0, 80, 0]), line('stream', [40, 0, 40, 20])];
    expect(thinWaterLines(lines, options).map((l) => l.kind)).toEqual(['river']);
  });

  it('bağlı parçaların toplamı eşiği aşarsa hepsi kalır', () => {
    const lines = [
      line('stream', [0, 0, 40, 0]),
      line('stream', [40.5, 0, 80, 0]),
      line('stream', [80, 0.4, 120, 0]),
    ];
    expect(thinWaterLines(lines, options)).toHaveLength(3);
  });

  it('tamamen mevsimlik öbek daha yüksek eşik ister', () => {
    const seasonal = [line('stream', [0, 0, 150, 0], true)];
    expect(thinWaterLines(seasonal, options)).toHaveLength(0);
    const mixed = [line('stream', [0, 0, 75, 0], true), line('stream', [75, 0, 150, 0])];
    expect(thinWaterLines(mixed, options)).toHaveLength(2);
  });

  it('yerleşim merkezine yakın geçen kısa dere kalır, birkaç hücrelik parça kalmaz', () => {
    const lines = [
      line('stream', [0, 0, 30, 0]),
      line('stream', [500, 0, 530, 0]),
      line('stream', [0, 30, 4, 30]),
    ];
    const kept = thinWaterLines(lines, options, [{ x: 10, z: 15 }]);
    expect(kept).toEqual([lines[0]]);
  });

  it('yer adı/ışınlanma noktasının yanında su kalmadıysa en uzun kısa öbek kalır', () => {
    const lines = [
      line('stream', [0, 0, 4, 0]),
      line('stream', [0, 10, 6, 10]),
      line('river', [100, 0, 103, 0]),
    ];
    const kept = thinWaterLines(lines, options, [
      { x: 2, z: 5, keepShort: true },
      { x: 101, z: 5 },
    ]);
    expect(kept).toEqual([lines[1]]);
    // Yakında zaten uzun su varsa kısa olanlar korunmaz.
    const withRiver = [...lines, line('river', [0, -10, 60, -10])];
    const kept2 = thinWaterLines(withRiver, options, [{ x: 2, z: 5, keepShort: true }]);
    expect(kept2).toEqual([withRiver[3]]);
  });

  it('gerçek dünyada dere sayısını belirgin azaltır, uzun nehirler kalır', async () => {
    const world = await loadRealWorld();
    const lines = world.features!.water.lines;
    const streams = lines.filter((l) => l.kind === 'stream').length;
    const rivers = lines.filter((l) => l.kind === 'river').length;
    // Ham veride (Faz 12 dünyası: 16 il) çok sayıda nehir parçası var; dereler ayıklanınca ~2 400 dere kalır.
    expect(streams).toBeLessThan(3000);
    expect(streams).toBeGreaterThan(400);
    // Kısa nehir parçaları da kalkar (1 690 → ~1 055), uzun nehirler (Sakarya, Kızılırmak, Filyos…) kalır.
    expect(rivers).toBeLessThan(1300);
    expect(rivers).toBeGreaterThan(800);
    const length = (xz: Float64Array) => {
      let sum = 0;
      for (let i = 0; i + 3 < xz.length; i += 2)
        sum += Math.hypot(xz[i + 2]! - xz[i]!, xz[i + 3]! - xz[i + 1]!);
      return sum;
    };
    const riverLength = lines
      .filter((l) => l.kind === 'river')
      .reduce((s, l) => s + length(l.xz), 0);
    expect(riverLength).toBeGreaterThan(140_000);
  });
});
