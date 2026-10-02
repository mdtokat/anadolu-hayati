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
  joinTolerance: 1.5,
  anchorReach: 20,
};

describe('thinWaterLines (küçük derelerin ayıklanması)', () => {
  it('kısa, tek başına dereyi kaldırır; nehir ve kanalı korur', () => {
    const lines = [
      line('stream', [0, 0, 30, 0]),
      line('river', [0, 10, 5, 10]),
      line('canal', [0, 20, 3, 20]),
    ];
    expect(thinWaterLines(lines, options).map((l) => l.kind)).toEqual(['river', 'canal']);
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

  it('yerleşim merkezine yakın geçen kısa dere kalır', () => {
    const lines = [line('stream', [0, 0, 30, 0]), line('stream', [500, 0, 530, 0])];
    const kept = thinWaterLines(lines, options, [{ x: 10, z: 15 }]);
    expect(kept).toEqual([lines[0]]);
  });

  it('gerçek dünyada dere sayısını belirgin azaltır, nehirler aynen kalır', async () => {
    const world = await loadRealWorld();
    const lines = world.features!.water.lines;
    const streams = lines.filter((l) => l.kind === 'stream').length;
    const rivers = lines.filter((l) => l.kind === 'river').length;
    // Ham veride 1 854 dere, 392 nehir parçası vardı.
    expect(streams).toBeLessThan(700);
    expect(streams).toBeGreaterThan(200);
    expect(rivers).toBe(392);
  });
});
