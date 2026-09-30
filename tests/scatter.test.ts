import { describe, expect, it } from 'vitest';
import { CHUNK, SCATTER } from '../src/config';
import { LANDCOVER_CLASSES, type LandCoverClass } from '../src/data/landcover';
import { makeChunkGrid, chunkIndexAt, chunkRect } from '../src/world/chunks';
import { PROP_KINDS, type PropKind } from '../src/world/propKinds';
import {
  kindDensity,
  scatterChunk,
  trapezoid,
  type ChunkProps,
  type ScatterHeight,
  type ScatterInput,
} from '../src/world/scatter';

const grid = makeChunkGrid(1588, 1176, 2);
const CHUNK_AREA = (CHUNK.cells * 2) ** 2; // oyun m²

function flatHeight(elevation: number, slopeDeg = 0): ScatterHeight {
  return {
    heightAt: () => elevation / 15,
    elevationAt: () => elevation,
    slopeDegAt: () => slopeDeg,
  };
}

function input(overrides: Partial<ScatterInput> = {}): ScatterInput {
  return {
    cx: 5,
    cy: 4,
    grid,
    seed: SCATTER.seed,
    cover: { classAt: () => 'forest' },
    height: flatHeight(400),
    isWater: () => false,
    ...overrides,
  };
}

function countKind(props: ChunkProps, kind: PropKind): number {
  const index = PROP_KINDS.indexOf(kind);
  let n = 0;
  for (let i = 0; i < props.count; i++) if (props.kind[i] === index) n++;
  return n;
}

function kindsOf(props: ChunkProps): Set<PropKind> {
  const set = new Set<PropKind>();
  for (let i = 0; i < props.count; i++) set.add(PROP_KINDS[props.kind[i] as number] as PropKind);
  return set;
}

describe('scatter ayarları', () => {
  it('aday aralığı chunk kenarını tam böler', () => {
    expect((CHUNK.cells * 2) % SCATTER.candidateSpacing).toBe(0);
  });

  it('her tür için ayar var; yoğunluk tabloları geçerli sınıf/tür adları kullanır', () => {
    for (const kind of PROP_KINDS) expect(SCATTER.kinds).toHaveProperty(kind);
    for (const [cover, table] of Object.entries(SCATTER.density)) {
      expect(LANDCOVER_CLASSES).toContain(cover);
      for (const kind of Object.keys(table)) expect(PROP_KINDS).toContain(kind);
    }
  });

  it('sınıf başına toplam yoğunluk aday başına tek nesne sınırını aşmaz', () => {
    const limit = 100 / SCATTER.candidateSpacing ** 2;
    for (const table of Object.values(SCATTER.density)) {
      const total = Object.values(table).reduce((sum, d) => sum + d, 0);
      expect(total).toBeLessThanOrEqual(limit);
    }
  });

  it('yerleşim, kar ve veri-yok sınıflarında tür tanımlı değildir', () => {
    for (const cover of ['urban', 'snow', 'none'] as const) {
      expect(SCATTER.density).not.toHaveProperty(cover);
    }
  });
});

describe('trapezoid', () => {
  it('kenarlarda 0, plato 1, rampada doğrusal', () => {
    const t: [number, number, number, number] = [0, 10, 20, 40];
    expect(trapezoid(-1, t)).toBe(0);
    expect(trapezoid(5, t)).toBeCloseTo(0.5);
    expect(trapezoid(10, t)).toBe(1);
    expect(trapezoid(20, t)).toBe(1);
    expect(trapezoid(30, t)).toBeCloseTo(0.5);
    expect(trapezoid(41, t)).toBe(0);
  });
});

describe('scatterChunk (sentetik arazi)', () => {
  it('aynı (seed, cx, cy) bit bit aynı çıktıyı verir; hesaplama sırası sonucu değiştirmez', () => {
    const a1 = scatterChunk(input());
    scatterChunk(input({ cx: 6, cy: 4 })); // arada başka chunk
    scatterChunk(input({ cx: 4, cy: 4 }));
    const a2 = scatterChunk(input());
    expect(a2.count).toBe(a1.count);
    for (const key of ['kind', 'x', 'y', 'z', 'yaw', 'scale', 'tone', 'rowStart'] as const) {
      expect(Buffer.from(a2[key].buffer)).toEqual(Buffer.from(a1[key].buffer));
    }
    expect(a1.count).toBeGreaterThan(500);
  });

  it('farklı tohum veya chunk farklı yerleşim verir', () => {
    const base = scatterChunk(input());
    expect(scatterChunk(input({ seed: SCATTER.seed + 1 })).x).not.toEqual(base.x);
    expect(scatterChunk(input({ cx: 6 })).x).not.toEqual(base.x);
  });

  it('dikiş: her nesne yalnızca kendi chunk içindedir (konum → chunk sahipliği tek)', () => {
    for (const [cx, cy] of [
      [0, 0],
      [5, 4],
      [12, 9],
    ] as const) {
      const props = scatterChunk(input({ cx, cy }));
      const rect = chunkRect(grid, cx, cy);
      for (let i = 0; i < props.count; i++) {
        const x = props.x[i] as number;
        const z = props.z[i] as number;
        expect(x).toBeGreaterThanOrEqual(rect.minX);
        expect(x).toBeLessThan(rect.maxX);
        expect(z).toBeGreaterThanOrEqual(rect.minZ);
        expect(z).toBeLessThan(rect.maxZ);
        expect(chunkIndexAt(grid, x, z)).toEqual({ cx, cy });
      }
    }
  });

  it('komşu chunk sınırında boşluk yok: nesneler sınıra kadar uzanır', () => {
    const left = scatterChunk(input({ cx: 5 }));
    const right = scatterChunk(input({ cx: 6 }));
    const edge = chunkRect(grid, 5, 4).maxX;
    const nearEdge = (p: ChunkProps, side: 1 | -1) => {
      let n = 0;
      for (let i = 0; i < p.count; i++) if (Math.abs((p.x[i] as number) - edge) < 4 && side) n++;
      return n;
    };
    // her iki yanda da sınıra 4 m içinde nesne var, çiftleme yok (aynı konum iki chunk'ta tekrarlanmaz)
    expect(nearEdge(left, 1)).toBeGreaterThan(10);
    expect(nearEdge(right, -1)).toBeGreaterThan(10);
    const leftKeys = new Set(Array.from(left.x, (x, i) => `${x},${left.z[i]}`));
    for (let i = 0; i < right.count; i++) {
      expect(leftKeys.has(`${right.x[i]},${right.z[i]}`)).toBe(false);
    }
  });

  it("ormanlık yerde ağaç yoğunluğu hedefin ±%15'inde (yapraklı, 400 m)", () => {
    const props = scatterChunk(input({ height: flatHeight(400) }));
    const target = (kindDensity('forest', 'tree_broadleaf', 400) * CHUNK_AREA) / 100;
    expect(target).toBeGreaterThan(0);
    // 400 m ± jitter (≤ 160 m) yapraklı platosunun içinde: yoğunluk sabit
    expect(countKind(props, 'tree_broadleaf')).toBeGreaterThan(target * 0.85);
    expect(countKind(props, 'tree_broadleaf')).toBeLessThan(target * 1.15);
  });

  it('yüksekte (1400 m) iğne yapraklı baskındır, yapraklı yoktur', () => {
    const props = scatterChunk(input({ height: flatHeight(1400) }));
    const target = (kindDensity('forest', 'tree_conifer', 1400) * CHUNK_AREA) / 100;
    expect(countKind(props, 'tree_conifer')).toBeGreaterThan(target * 0.85);
    expect(countKind(props, 'tree_conifer')).toBeLessThan(target * 1.15);
    expect(countKind(props, 'tree_broadleaf')).toBe(0);
  });

  it('alçakta (400 m) iğne yapraklı yapraklıdan az, kestane yalnızca kendi bandında', () => {
    const low = scatterChunk(input({ height: flatHeight(400) }));
    expect(countKind(low, 'tree_conifer')).toBeLessThan(countKind(low, 'tree_broadleaf'));
    const high = scatterChunk(input({ height: flatHeight(1400) }));
    expect(countKind(high, 'chestnut')).toBe(0);
    expect(countKind(low, 'chestnut')).toBeGreaterThan(0);
  });

  it('ağaç sınırının (1700 m) üstünde ağaç yok', () => {
    const props = scatterChunk(input({ height: flatHeight(1800) }));
    const kinds = kindsOf(props);
    for (const tree of ['tree_broadleaf', 'tree_conifer', 'chestnut'] as const) {
      expect(kinds.has(tree)).toBe(false);
    }
  });

  it('deniz/kıyı (≤ minElevation) ve sınıfsız/yerleşim/kar yerlerinde nesne yok', () => {
    expect(scatterChunk(input({ height: flatHeight(SCATTER.minElevation) })).count).toBe(0);
    expect(scatterChunk(input({ height: flatHeight(-20) })).count).toBe(0);
    for (const cover of ['none', 'urban', 'snow'] as const) {
      expect(scatterChunk(input({ cover: { classAt: () => cover } })).count).toBe(0);
    }
  });

  it('tarım ve çıplak yerde ağaç yok; çıplakta yalnızca kaya/taş', () => {
    const crop = kindsOf(scatterChunk(input({ cover: { classAt: () => 'crop' } })));
    expect([...crop].sort()).toEqual(['hazel', 'stick']);
    const barren = kindsOf(scatterChunk(input({ cover: { classAt: () => 'barren' } })));
    expect([...barren].sort()).toEqual(['rock', 'stone']);
  });

  it('dik yamaçta yalnızca eğim sınırı yeten türler (kaya/taş) kalır', () => {
    const props = scatterChunk(input({ height: flatHeight(400, 75) }));
    expect(props.count).toBeGreaterThan(0);
    for (const kind of kindsOf(props)) expect(['rock', 'stone']).toContain(kind);
  });

  it('suyun yanında (isWater) nesne yok; tür başına farklı mesafe iletilir', () => {
    expect(scatterChunk(input({ isWater: () => true })).count).toBe(0);
    const seen = new Set<number>();
    scatterChunk(
      input({
        isWater: (_x, _z, clearance) => {
          seen.add(clearance);
          return false;
        },
      }),
    );
    expect(seen.has(SCATTER.kinds.tree_broadleaf.waterClearance)).toBe(true);
    expect(seen.has(SCATTER.kinds.stone.waterClearance)).toBe(true);
  });

  it('y = zemin yüksekliği, ölçek tür aralığında, satır dizini tutarlı', () => {
    const props = scatterChunk(input({ height: flatHeight(450) }));
    for (let i = 0; i < props.count; i++) {
      expect(props.y[i]).toBeCloseTo(450 / 15, 4);
      const spec = SCATTER.kinds[PROP_KINDS[props.kind[i] as number] as PropKind];
      expect(props.scale[i]).toBeGreaterThanOrEqual(spec.scale[0] - 1e-6);
      expect(props.scale[i]).toBeLessThanOrEqual(spec.scale[1] + 1e-6);
    }
    expect(props.rowStart[props.rowStart.length - 1]).toBe(props.count);
    for (let j = 0; j < props.rowStart.length - 1; j++) {
      for (let i = props.rowStart[j] as number; i < (props.rowStart[j + 1] as number); i++) {
        const row = Math.floor(((props.z[i] as number) - props.minZ) / props.spacing);
        expect(row).toBe(j);
      }
    }
  });

  it('chunk başına nesne sayısı kimlik sınırının altında', () => {
    expect(scatterChunk(input()).count).toBeLessThanOrEqual(
      ((CHUNK.cells * 2) / SCATTER.candidateSpacing) ** 2,
    );
  });
});

describe('kindDensity', () => {
  it('tablo dışı sınıf/tür için 0', () => {
    const covers: LandCoverClass[] = ['urban', 'snow', 'none'];
    for (const cover of covers) expect(kindDensity(cover, 'tree_broadleaf', 400)).toBe(0);
    expect(kindDensity('barren', 'tree_conifer', 1000)).toBe(0);
  });
});
