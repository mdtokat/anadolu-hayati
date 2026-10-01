import type { DataTexture, Material, WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { CHUNK, HORIZONTAL_SCALE, SCATTER, VERTICAL_SCALE } from '../src/config';
import { cellKey, cellOf, cellRect, cellsNear, makeSpawnGrid } from '../src/creatures/spawn';
import { creatureId, decodeCreatureId } from '../src/creatures/species';
import { parseMeta } from '../src/data/region';
import { rollYield } from '../src/interaction/gather';
import { GATHER_RULES } from '../src/interaction/gatherRules';
import { absoluteChunkKey, decodeAbsoluteChunkKey } from '../src/world/chunkKeys';
import {
  chunkAnchor,
  chunkGridFor,
  chunkIndexAt,
  chunkKey,
  chunkRect,
  chunksWithin,
  inChunkGrid,
  makeChunkGrid,
} from '../src/world/chunks';
import { buildChunkMesh } from '../src/world/chunkGeometry';
import { LandCoverMap } from '../src/world/LandCoverMap';
import {
  gridOriginOf,
  latticeChunkOffset,
  latticeCol,
  latticeRow,
  latticeX,
  latticeZ,
} from '../src/world/lattice';
import { decodePropId, propId, PropIndex } from '../src/world/propIndex';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import type { ChunkProps } from '../src/world/scatter';
import { createTerrainMaterial } from '../src/world/TerrainMaterial';
import { seedFrom } from '../src/utils/random';

/**
 * 7.5: merkezli-orijin varsayımının kalktığı, kafese çapalı **asimetrik** ızgara (batıya/kuzeye negatif chunk
 * indeksleri). Dizi sütun −256…143, satır −128…171 (400 × 300 örnek): chunk −2…1 × −1…1.
 */
const EXTENT = { col0: -256, row0: -128, cols: 400, rows: 300 };
const ORIGIN = gridOriginOf(EXTENT);
const CELL = 100 / HORIZONTAL_SCALE;
/** Kafes chunk'ı (0, 0)'ın köşesi = kafes çapası. */
const WORLD_ANCHOR = { x: latticeX(0), z: latticeZ(0) };

const meta = parseMeta({
  id: 'asym',
  name: 'Asimetrik',
  crs: 'EPSG:32636',
  originUtm: [434085, 4576261],
  gridWidth: EXTENT.cols,
  gridHeight: EXTENT.rows,
  cellSizeReal: 100,
  elevationMin: 0,
  elevationMax: 65535, // uint16 değeri doğrudan metre
  elevationEncoding: 'uint16',
  horizontalScale: HORIZONTAL_SCALE,
  sources: [],
  gridOrigin: ORIGIN,
});

/** Kafes örneğinin (mutlak sütun/satır) yüksekliği (m): konumdan türer, böylece her ızgarada aynıdır. */
function elevationOf(col: number, row: number): number {
  return 100 + ((((col * 7 + row * 13) % 500) + 500) % 500);
}

const heights = new Uint16Array(EXTENT.cols * EXTENT.rows);
const classes = new Uint8Array(EXTENT.cols * EXTENT.rows);
for (let r = 0; r < EXTENT.rows; r++) {
  for (let c = 0; c < EXTENT.cols; c++) {
    heights[r * EXTENT.cols + c] = elevationOf(EXTENT.col0 + c, EXTENT.row0 + r);
    classes[r * EXTENT.cols + c] = 1 + ((c + 2 * r) % 8);
  }
}
const source = new RegionHeightSource(meta, heights);
const grid = chunkGridFor(source);

describe('kafese çapalı asimetrik ızgara: yükseklik kaynağı', () => {
  it('örnek konumları kafes formülüdür; sınırlar orijinden başlar', () => {
    expect(meta.gridOrigin).toEqual({ x: -2099, z: -1431 });
    for (const [c, r] of [
      [0, 0],
      [256, 128],
      [399, 299],
    ] as const) {
      expect(source.xAt(c)).toBe(latticeX(EXTENT.col0 + c));
      expect(source.zAt(r)).toBe(latticeZ(EXTENT.row0 + r));
    }
    expect(source.bounds).toEqual({
      minX: latticeX(-256),
      maxX: latticeX(143),
      minZ: latticeZ(-128),
      maxZ: latticeZ(171),
    });
  });

  it('heightAt örnek noktalarında kafes yüksekliğini verir (negatif kafes indeksleri dahil)', () => {
    for (const [col, row] of [
      [-256, -128],
      [-1, -1],
      [0, 0],
      [143, 171],
      [-100, 50],
    ] as const) {
      expect(source.heightAt(latticeX(col), latticeZ(row))).toBeCloseTo(
        elevationOf(col, row) / VERTICAL_SCALE,
        5,
      );
    }
  });

  it('ızgara dışında kenara sıkışır; contains orijin tabanlıdır', () => {
    expect(source.contains(latticeX(-256), latticeZ(-128))).toBe(true);
    expect(source.contains(latticeX(-257), 0)).toBe(false);
    expect(source.heightAt(-1e6, -1e6)).toBeCloseTo(elevationOf(-256, -128) / VERTICAL_SCALE, 5);
  });
});

describe('kafese çapalı asimetrik ızgara: chunk ızgarası', () => {
  it('ilk chunk kafes indeksidir (negatif), sayılar ve çapa doğru', () => {
    expect(grid).toMatchObject({ cx0: -2, cy0: -1, cols: 4, rows: 3, cells: CHUNK.cells });
    expect(chunkAnchor(grid)).toEqual({ x: WORLD_ANCHOR.x, z: WORLD_ANCHOR.z });
    expect(inChunkGrid(grid, -2, -1)).toBe(true);
    expect(inChunkGrid(grid, -3, 0)).toBe(false);
    expect(inChunkGrid(grid, 2, 0)).toBe(false);
  });

  it('chunk dikdörtgeni kafes formülüyle eşleşir; komşular kenarda birleşir', () => {
    for (let cy = -1; cy <= 1; cy++) {
      for (let cx = -2; cx <= 1; cx++) {
        const rect = chunkRect(grid, cx, cy);
        expect(rect.minX).toBe(latticeX(cx * CHUNK.cells));
        expect(rect.maxX).toBe(latticeX((cx + 1) * CHUNK.cells));
        expect(rect.minZ).toBe(latticeZ(cy * CHUNK.cells));
        expect(rect.maxZ).toBe(latticeZ((cy + 1) * CHUNK.cells));
      }
    }
  });

  it("chunkIndexAt konumu içeren chunk'ı verir, kapsam dışında kenara sıkışır", () => {
    for (let cy = -1; cy <= 1; cy++) {
      for (let cx = -2; cx <= 1; cx++) {
        const r = chunkRect(grid, cx, cy);
        expect(chunkIndexAt(grid, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2)).toEqual({
          cx,
          cy,
        });
      }
    }
    expect(chunkIndexAt(grid, -1e6, -1e6)).toEqual({ cx: -2, cy: -1 });
    expect(chunkIndexAt(grid, 1e6, 1e6)).toEqual({ cx: 1, cy: 1 });
  });

  it('chunksWithin negatif indeksleri de verir; anahtarlar tekil ve çözülebilir', () => {
    const all = chunksWithin(grid, 0, 0, 1e6);
    expect(all).toHaveLength(12);
    const keys = new Set(all.map(({ cx, cy }) => chunkKey(cx, cy)));
    expect(keys.size).toBe(12);
    for (const { cx, cy } of all) {
      expect(decodeAbsoluteChunkKey(chunkKey(cx, cy))).toEqual({ cx, cy });
    }
  });

  it('chunk mesh köşeleri kafes konumunda ve kaynak yüksekliğinde', () => {
    const mesh = buildChunkMesh(source, grid, -2, -1, 3);
    const first = [mesh.positions[0], mesh.positions[1], mesh.positions[2]];
    expect(first[0]).toBe(latticeX(-256));
    expect(first[2]).toBe(latticeZ(-128));
    expect(first[1]).toBeCloseTo(elevationOf(-256, -128) / VERTICAL_SCALE, 5);
  });

  it('kafese hizasız ızgara (sentetik test ızgarası) yerel indeks kullanır', () => {
    expect(makeChunkGrid(257, 257, 2)).toMatchObject({ cx0: 0, cy0: 0, originX: -256 });
    expect(latticeChunkOffset(-256, -256)).toBeNull();
    // örnek düzeyinde hizalı ama chunk'a hizasız köşe de yerel kalır
    expect(latticeChunkOffset(latticeX(-5), latticeZ(0))).toBeNull();
    // eski merkezli bölge kafesin (0, 0) chunk'ıdır
    expect(makeChunkGrid(1588, 1176, 2)).toMatchObject({ cx0: 0, cy0: 0, cols: 13, rows: 10 });
    expect(latticeChunkOffset(-1587, -1175)).toEqual({ cx: 0, cy: 0 });
  });
});

describe('kafese çapalı asimetrik ızgara: arazi örtüsü', () => {
  const map = new LandCoverMap(EXTENT.cols, EXTENT.rows, 100, classes, ORIGIN);

  it('örnek konumunda doğru hücreyi okur', () => {
    for (const [c, r] of [
      [0, 0],
      [17, 3],
      [399, 299],
    ] as const) {
      const x = latticeX(EXTENT.col0 + c);
      const z = latticeZ(EXTENT.row0 + r);
      expect(map.valueAt(x, z)).toBe(classes[r * EXTENT.cols + c]);
      expect(map.valueAt(x + 0.4 * CELL, z - 0.4 * CELL)).toBe(classes[r * EXTENT.cols + c]);
    }
    expect(map.valueAt(latticeX(-257), latticeZ(0))).toBe(0);
  });

  it('fromRegion orijini meta.gridOrigin’den alır', () => {
    const fromRegion = LandCoverMap.fromRegion({
      meta,
      heights,
      landcover: classes,
      provinces: [],
      features: null,
    });
    expect(fromRegion?.origin).toEqual(ORIGIN);
  });

  it('shader ızgara uniform’u orijin tabanlıdır: (c + 0.5) / W doku koordinatı', () => {
    const material = createTerrainMaterial({
      classes,
      width: EXTENT.cols,
      height: EXTENT.rows,
      cell: CELL,
      origin: ORIGIN,
    });
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader: 'void main() {\n#include <color_fragment>\n}',
    };
    material.onBeforeCompile(
      shader as unknown as Parameters<Material['onBeforeCompile']>[0],
      null as unknown as WebGLRenderer,
    );
    const [gx, gz, cell] = shader.uniforms.uCoverGrid?.value as number[];
    // GLSL: coverUv = (world.xz / cell + grid.xy + 0.5) / size
    const uv = (x: number, z: number) => [
      (x / (cell as number) + (gx as number) + 0.5) / EXTENT.cols,
      (z / (cell as number) + (gz as number) + 0.5) / EXTENT.rows,
    ];
    const [u0, v0] = uv(latticeX(EXTENT.col0 + 10), latticeZ(EXTENT.row0 + 20));
    expect(u0).toBeCloseTo(10.5 / EXTENT.cols, 9);
    expect(v0).toBeCloseTo(20.5 / EXTENT.rows, 9);
    expect((shader.uniforms.uCoverA?.value as DataTexture).image.width).toBe(EXTENT.cols);
    material.dispose();
  });
});

describe('kafese çapalı asimetrik ızgara: nesne indeksi', () => {
  function fakeChunk(cx: number, cy: number): ChunkProps {
    const rect = chunkRect(grid, cx, cy);
    const spacing = SCATTER.candidateSpacing;
    const rowCount = Math.round((rect.maxZ - rect.minZ) / spacing);
    const rowStart = new Uint32Array(rowCount + 1).fill(1);
    rowStart[0] = 0;
    return {
      cx,
      cy,
      count: 1,
      kind: new Uint8Array([0]),
      x: new Float32Array([rect.minX + 1]),
      y: new Float32Array([0]),
      z: new Float32Array([rect.minZ + 1]),
      yaw: new Float32Array([0]),
      scale: new Float32Array([1]),
      tone: new Float32Array([1]),
      rowStart,
      minZ: rect.minZ,
      spacing,
    };
  }

  it('negatif chunk nesnesi mutlak kimlikle bulunur ve kimlik chunk’ına çözülür', () => {
    const index = new PropIndex(grid);
    index.set(fakeChunk(-2, -1));
    index.set(fakeChunk(1, 1));
    const rect = chunkRect(grid, -2, -1);
    const [hit] = index.near(rect.minX + 1, rect.minZ + 1, 0.5);
    expect(hit).toBeDefined();
    const { chunkKey: key, index: i } = decodePropId(hit!.id);
    expect(decodeAbsoluteChunkKey(key)).toEqual({ cx: -2, cy: -1 });
    expect(i).toBe(0);
    expect(hit!.id).toBe(propId(absoluteChunkKey(-2, -1), 0));
    expect(Number.isSafeInteger(hit!.id)).toBe(true);
    expect(index.get(hit!.id)?.x).toBe(hit!.x);
    expect(index.has(-2, -1) && index.has(1, 1) && !index.has(0, 0)).toBe(true);
  });
});

describe('kafese çapalı asimetrik ızgara: doğma hücreleri (hücre ≡ chunk)', () => {
  const spawn = makeSpawnGrid(source.bounds);

  it('ilk hücre kafes chunk indeksidir; hücre dikdörtgeni chunk dikdörtgenidir', () => {
    expect(spawn).toMatchObject({ cx0: -2, cy0: -1, cols: 4, rows: 3, size: 256 });
    for (let cy = -1; cy <= 1; cy++) {
      for (let cx = -2; cx <= 1; cx++) {
        expect(cellRect(spawn, cx, cy)).toEqual(chunkRect(grid, cx, cy));
      }
    }
  });

  it('cellOf/cellsNear negatif hücreleri verir, ızgara dışını vermez', () => {
    expect(cellOf(spawn, latticeX(-256) + 1, latticeZ(-128) + 1)).toEqual({ cx: -2, cy: -1 });
    expect(cellOf(spawn, latticeX(-256) - 1, 0)).toBeNull();
    const near = cellsNear(spawn, latticeX(-256), latticeZ(-128), 300);
    expect(near).toContainEqual({ cx: -2, cy: -1 });
    expect(near.every(({ cx, cy }) => cx >= -2 && cy >= -1)).toBe(true);
  });

  it('hücre anahtarı = mutlak chunk anahtarı; canlı kimliği hücreye çözülür', () => {
    const key = cellKey(-2, -1);
    expect(key).toBe(absoluteChunkKey(-2, -1));
    const id = creatureId(key, 7);
    expect(Number.isSafeInteger(id)).toBe(true);
    expect(decodeCreatureId(id)).toEqual({ cellKey: key, index: 7 });
  });
});

describe('seedFrom 32 bit ve kimlik tohumları', () => {
  it('seedFrom girdileri 32 bit tam sayıya keser (davranış kilidi)', () => {
    expect(seedFrom(-1)).toBe(seedFrom(0xffffffff));
    expect(seedFrom(2 ** 32 + 5)).toBe(seedFrom(5));
    expect(seedFrom(-5, 3)).not.toBe(seedFrom(5, 3));
    expect(seedFrom(1, 2)).not.toBe(seedFrom(2, 1));
  });

  it('mutlak kimlikler 32 bit’te çakışır: kimliği doğrudan tohum yapmak satırı kaybeder', () => {
    // Aynı sütun ve indeks, farklı satır: anahtar farkı 65536 → kimlik farkı 2³².
    const a = propId(absoluteChunkKey(3, 0), 42);
    const b = propId(absoluteChunkKey(3, 1), 42);
    expect(b - a).toBe(2 ** 32);
    expect(seedFrom(SCATTER.seed, a, 0)).toBe(seedFrom(SCATTER.seed, b, 0));
  });

  it('rollYield tohumu (cx, cy, indeks)’ten türer: satırı farklı nesneler farklı verim dizisi alır', () => {
    const rule = GATHER_RULES.berry_bush.hand!;
    const rolls = (cy: number) =>
      Array.from({ length: 64 }, (_, i) =>
        rollYield(propId(absoluteChunkKey(3, cy), i), 'hand', rule)
          .map((item) => item.count)
          .join(','),
      ).join(';');
    expect(rolls(0)).not.toBe(rolls(1));
    expect(rolls(-4)).not.toBe(rolls(0));
    // deterministik
    expect(rolls(1)).toBe(rolls(1));
  });

  it('kafes yardımcıları tutarlı (sütun ↔ X)', () => {
    expect(latticeCol(latticeX(-640))).toBe(-640);
    expect(latticeRow(latticeZ(1961))).toBe(1961);
  });
});
