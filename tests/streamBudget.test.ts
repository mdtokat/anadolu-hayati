import { describe, expect, it } from 'vitest';
import {
  evaluateBuild,
  startupDataTransfer,
  type BudgetShape,
  type DataRole,
  type DataStat,
} from '../scripts/buildReport';

const stat = (file: string, raw: number, gzip = raw): DataStat => ({ file, raw, gzip });

const budget: BudgetShape = {
  chunks: {},
  otherChunk: { gzipKB: 1000 },
  initialGzipKB: 1000,
  data: { totalKB: 1_000_000, maxFileKB: 1_000_000 },
  load: { referenceMbps: 8, maxSeconds: 100 },
  stream: { startTiles: 2, maxSeconds: 5 },
  warnRatio: 0.9,
};

const data = [
  stat('data/world/w/world.json', 10_000, 2_000),
  stat('data/world/w/stream/overview.bin', 500_000),
  stat('data/world/w/stream/t_0_0.bin', 600_000),
  stat('data/world/w/stream/t_1_0.bin', 800_000),
  stat('data/world/w/stream/t_2_0.bin', 700_000),
  stat('data/world/w/tiles/0_0.height.bin', 524_288),
  stat('data/world/w/tiles/0_0.cover.bin', 262_144),
];

const roles = new Map<string, DataRole>([
  ['data/world/w/stream/t_0_0.bin', 'streamTile'],
  ['data/world/w/stream/t_1_0.bin', 'streamTile'],
  ['data/world/w/stream/t_2_0.bin', 'streamTile'],
  ['data/world/w/tiles/0_0.height.bin', 'legacyTile'],
  ['data/world/w/tiles/0_0.cover.bin', 'legacyTile'],
]);

describe('karo akışlı derleme bütçesi', () => {
  it('rol verilmezse tüm veri açılışta iner (eski davranış)', () => {
    expect(startupDataTransfer(data, undefined, 2)).toBe(
      2_000 + 500_000 + 600_000 + 800_000 + 700_000 + 524_288 + 262_144,
    );
  });

  it('akışta: küçük dosyalar + startTiles ortalama karo; eski karolar inmez', () => {
    const mean = (600_000 + 800_000 + 700_000) / 3;
    expect(startupDataTransfer(data, roles, 2)).toBeCloseTo(2_000 + 500_000 + 2 * mean, 3);
    // startTiles karo sayısını aşarsa kırpılır.
    expect(startupDataTransfer(data, roles, 99)).toBeCloseTo(2_000 + 500_000 + 3 * mean, 3);
  });

  it('akışlı dünyada ilk yükleme sınırı stream.maxSeconds, yoksa load.maxSeconds', () => {
    const asStream = evaluateBuild(
      { assets: [], initialFiles: [], data, dataRoles: roles },
      budget,
    );
    const check = asStream.find((c) => c.label.startsWith('tahmini ilk yükleme'))!;
    expect(check.limit).toBe(5);
    expect(check.label).toContain('karo akışı');
    const legacy = evaluateBuild({ assets: [], initialFiles: [], data }, budget);
    expect(legacy.find((c) => c.label.startsWith('tahmini ilk yükleme'))!.limit).toBe(100);
  });
});
