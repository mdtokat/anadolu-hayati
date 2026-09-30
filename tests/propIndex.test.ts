import { describe, expect, it } from 'vitest';
import { SCATTER } from '../src/config';
import { makeChunkGrid } from '../src/world/chunks';
import { decodePropId, PROP_INDEX_LIMIT, PropIndex, propId } from '../src/world/propIndex';
import { scatterChunk, type ChunkProps } from '../src/world/scatter';

const grid = makeChunkGrid(1588, 1176, 2);

function chunk(cx: number, cy: number): ChunkProps {
  return scatterChunk({
    cx,
    cy,
    grid,
    seed: SCATTER.seed,
    cover: { classAt: () => 'forest' },
    height: { heightAt: () => 27, elevationAt: () => 400, slopeDegAt: () => 0 },
    isWater: () => false,
  });
}

describe('propId', () => {
  it('kodlama gidiş-dönüş', () => {
    for (const [key, index] of [
      [0, 0],
      [7, 65535],
      [129, 1234],
    ] as const) {
      expect(decodePropId(propId(key, index))).toEqual({ chunkKey: key, index });
    }
  });

  it('sınır dışı indeks hata verir', () => {
    expect(() => propId(1, PROP_INDEX_LIMIT)).toThrow(RangeError);
    expect(() => propId(1, -1)).toThrow(RangeError);
    expect(() => propId(1, 1.5)).toThrow(RangeError);
  });

  it('kimlik yeniden hesaplamada aynı nesneyi gösterir (aynı seed → aynı kimlik)', () => {
    const a = new PropIndex(grid);
    const b = new PropIndex(grid);
    a.set(chunk(5, 4));
    b.set(chunk(5, 4));
    const ref = a.near(chunk(5, 4).x[100] as number, chunk(5, 4).z[100] as number, 0.01)[0];
    expect(ref).toBeDefined();
    expect(b.get(ref!.id)).toEqual(ref);
  });
});

describe('PropIndex.near', () => {
  const index = new PropIndex(grid);
  const props = chunk(5, 4);
  index.set(props);

  /** Kaba kuvvetle yarıçap sorgusu (referans). */
  function brute(x: number, z: number, r: number): number {
    let n = 0;
    for (let i = 0; i < props.count; i++) {
      if (Math.hypot((props.x[i] as number) - x, (props.z[i] as number) - z) <= r) n++;
    }
    return n;
  }

  it('kaba kuvvetle aynı sonucu verir ve yakından uzağa sıralar', () => {
    const cx = (props.x[300] as number) + 3;
    const cz = (props.z[300] as number) - 2;
    for (const r of [5, 20, 60]) {
      const hits = index.near(cx, cz, r);
      expect(hits).toHaveLength(brute(cx, cz, r));
      let last = -1;
      for (const hit of hits) {
        const d = Math.hypot(hit.x - cx, hit.z - cz);
        expect(d).toBeLessThanOrEqual(r);
        expect(d).toBeGreaterThanOrEqual(last);
        last = d;
      }
    }
  });

  it('yarıçap dışını dışlar, kenar (tam yarıçap) dahildir', () => {
    const x = props.x[10] as number;
    const z = props.z[10] as number;
    expect(index.near(x, z, 0).length).toBeGreaterThanOrEqual(1); // kendisi, uzaklık 0
    const other = index.near(x, z, 30).find((r) => Math.hypot(r.x - x, r.z - z) > 0);
    expect(other).toBeDefined();
    const d = Math.hypot(other!.x - x, other!.z - z);
    expect(index.near(x, z, d).some((r) => r.id === other!.id)).toBe(true);
    expect(index.near(x, z, d * 0.999).some((r) => r.id === other!.id)).toBe(false);
  });

  it("chunk sınırını aşan sorgu iki chunk'tan toplar; yüklü olmayan chunk boş döner", () => {
    const two = new PropIndex(grid);
    two.set(chunk(5, 4));
    const edgeX = (props.x[0] as number) > 0 ? 0 : 0; // yalnızca tür uyumu
    void edgeX;
    const right = chunk(6, 4);
    const boundary = right.x.reduce((m, v) => Math.min(m, v), Infinity);
    const before = two.near(boundary, props.z[0] as number, 40).length;
    two.set(right);
    const after = two.near(boundary, props.z[0] as number, 40).length;
    expect(after).toBeGreaterThan(before);
    two.delete(6, 4);
    expect(two.near(boundary, props.z[0] as number, 40)).toHaveLength(before);
    expect(two.has(6, 4)).toBe(false);
  });

  it('bölge dışı sorgu hata vermez', () => {
    expect(index.near(1e6, 1e6, 10)).toEqual([]);
    expect(index.near(-1e6, 0, 5)).toEqual([]);
  });

  it('yüklü olmayan kimlik null verir', () => {
    expect(index.get(propId(99, 3))).toBeNull();
    expect(index.get(propId(0, 65000))).toBeNull();
  });
});
