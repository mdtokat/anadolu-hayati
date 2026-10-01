import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { WORLD } from '../src/config';
import type { RegionData } from '../src/data/region';
import { loadWorld, parseWorldManifest } from '../src/data/world';
import type { WorldManifest } from '../src/data/worldTypes';
import { CHUNK_CELLS, LATTICE_CELL, gridOriginOf, tileRangeOf } from '../src/world/lattice';
import { provinceAt } from '../src/world/provinces';
import { publicFsFetch } from './helpers/fsFetch';

/**
 * Gerçek Faz 7 dünyası (public/data/world/bati-karadeniz): manifest, karo dosyaları, iller, göller, yükseklikler,
 * eski/yeni alan sürekliliği. (Veri hattı: tools/build_world.py; kalite raporu: tools/qa_world.py.)
 */
const WORLD_DIR = resolve(__dirname, '../public/data/world', WORLD.id);

/** Plan §1.4'te hesaplanan kapsam (5 hedef il + 2 km pay; batı kenarı chunk'a hizalı). */
const EXPECTED_EXTENT = { col0: -640, row0: 0, cols: 2228, rows: 1962 };
/** Eski bölgenin kafesteki alanı (7.2: extent 0,0,1588,1176). */
const LEGACY = { col0: 0, row0: 0, cols: 1588, rows: 1176 };

let world: RegionData;
let manifest: WorldManifest;

/** Örnek (col, row) için yükseklik (gerçek metre). */
function elevationAtSample(col: number, row: number): number {
  const { cols } = manifest.extent;
  const index = (row - manifest.extent.row0) * cols + (col - manifest.extent.col0);
  return ((world.heights[index] as number) / 65535) * manifest.elevation.max;
}

/** Oyun (x, z) → en yakın örnek yüksekliği (gerçek metre). */
function elevationAt(x: number, z: number): number {
  const origin = gridOriginOf(manifest.extent);
  const col = Math.round((x - origin.x) / LATTICE_CELL) + manifest.extent.col0;
  const row = Math.round((z - origin.z) / LATTICE_CELL) + manifest.extent.row0;
  return elevationAtSample(col, row);
}

beforeAll(async () => {
  const fetchFn = publicFsFetch();
  world = await loadWorld(WORLD.id, '/', fetchFn);
  const response = await fetchFn(`/${WORLD.basePath}/${WORLD.id}/world.json`);
  manifest = parseWorldManifest(await response.json());
});

describe('manifest ve karo dosyaları', () => {
  it('geçerli, dikdörtgen ve boşluksuz; kapsam plana uygun', () => {
    expect(manifest.id).toBe(WORLD.id);
    expect(manifest.extent).toEqual(EXPECTED_EXTENT);
    expect(Math.abs(manifest.extent.col0 % CHUNK_CELLS)).toBe(0);
    expect(Math.abs(manifest.extent.row0 % CHUNK_CELLS)).toBe(0);
    const range = tileRangeOf(manifest.extent);
    expect(range).toEqual({ tx0: -2, tx1: 3, ty0: 0, ty1: 3 });
    expect(manifest.tiles).toHaveLength(24);
    expect(manifest.overtureRelease).toBe('2026-09-23.1');
    expect(world.meta.gridWidth).toBe(EXPECTED_EXTENT.cols);
    expect(world.meta.gridHeight).toBe(EXPECTED_EXTENT.rows);
    expect(world.meta.gridOrigin).toEqual({ x: -2867, z: -1175 });
  });

  it('dünya geneli yükseklik aralığı: max yukarı 100e yuvarlı ve en yüksek noktayı kapsar', () => {
    expect(manifest.elevation.min).toBe(0);
    expect(manifest.elevation.max % 100).toBe(0);
    let highest = 0;
    for (const v of world.heights) if (v > highest) highest = v;
    expect(highest).toBeGreaterThan(60000); // aralığın büyük kısmı kullanılır (max 100'e yuvarlı olduğundan tam 65535 değil)
    expect((highest / 65535) * manifest.elevation.max).toBeLessThanOrEqual(manifest.elevation.max);
  });

  it('her karo ≤ 1 MB, sha256 doğru ve boyut beklenen', async () => {
    for (const tile of manifest.tiles) {
      const height = await readFile(resolve(WORLD_DIR, tile.height));
      const cover = await readFile(resolve(WORLD_DIR, tile.cover));
      expect(height.byteLength, tile.height).toBe(tile.bytes);
      expect(height.byteLength).toBeLessThanOrEqual(1024 * 1024);
      expect(cover.byteLength).toBeLessThanOrEqual(1024 * 1024);
      expect(createHash('sha256').update(height).digest('hex'), tile.height).toBe(tile.sha256);
    }
    for (const file of [manifest.provinces, manifest.features.file]) {
      expect((await stat(resolve(WORLD_DIR, file))).size).toBeLessThan(20 * 1024 * 1024);
    }
  });
});

describe('iller', () => {
  it('beş hedef il inRegion=true; komşular false', () => {
    const targets = world.provinces.filter((p) => p.inRegion).map((p) => p.name);
    expect(targets.sort()).toEqual(['Bartın', 'Bolu', 'Düzce', 'Karabük', 'Zonguldak'].sort());
    const neighbors = world.provinces.filter((p) => !p.inRegion).map((p) => p.name);
    for (const name of ['Kastamonu', 'Çankırı', 'Ankara', 'Sakarya', 'Bilecik']) {
      expect(neighbors, name).toContain(name);
    }
  });

  it('komşu il parçaları gürültü yaratacak kadar küçük değil (≥ 1 km²-eşdeğeri sınır kutusu)', () => {
    for (const province of world.provinces.filter((p) => !p.inRegion)) {
      const { minX, maxX, minZ, maxZ } = province.bounds;
      const km2 = (((maxX - minX) * (maxZ - minZ)) / 1e6) * 2500; // oyun m² → gerçek km² (50×50)
      expect(km2, province.name).toBeGreaterThan(1);
    }
  });

  it('plan noktaları doğru ilde: Düzce, Bolu, Abant, Yedigöller, Akçakoca', () => {
    const at = (x: number, z: number) => provinceAt(world.provinces, x, z)?.name;
    expect(at(-1790, 1064)).toBe('Düzce');
    expect(at(-1846, 531)).toBe('Düzce'); // Akçakoca
    expect(at(-1031, 1310)).toBe('Bolu');
    expect(at(-1587, 1610)).toBe('Bolu'); // Abant
    expect(at(-776, 849)).toBe('Bolu'); // Yedigöller
  });
});

describe('yükseklikler', () => {
  it('Düzce kıyısı deniz seviyesine yakın; Bolu ve Abant makul rakımda', () => {
    expect(elevationAt(-1846, 531)).toBeLessThan(150); // Akçakoca
    expect(elevationAt(-1790, 1064)).toBeLessThan(400); // Düzce merkez
    expect(elevationAt(-1031, 1310)).toBeGreaterThan(500); // Bolu merkez (~725 m)
    expect(elevationAt(-1031, 1310)).toBeLessThan(1000);
    expect(Math.abs(elevationAt(-1587, 1610) - 1300)).toBeLessThan(200); // Abant Gölü
  });

  it('Köroğlu yöresinde 2000 m üstü zirve var ve Bolu sınırları içinde', () => {
    let best = 0;
    for (let i = 1; i < world.heights.length; i++) {
      if ((world.heights[i] as number) > (world.heights[best] as number)) best = i;
    }
    const { cols, col0, row0 } = manifest.extent;
    const origin = gridOriginOf(manifest.extent);
    const col = best % cols;
    const row = Math.floor(best / cols);
    const x = origin.x + col * LATTICE_CELL;
    const z = origin.z + row * LATTICE_CELL;
    expect(col + col0).toBeGreaterThanOrEqual(manifest.extent.col0);
    expect(row + row0).toBeGreaterThanOrEqual(0);
    expect(elevationAtSample(col + col0, row + row0)).toBeGreaterThan(2000);
    expect(provinceAt(world.provinces, x, z)?.name).toBe('Bolu');
  });
});

describe('göller', () => {
  const water = () => world.features?.water;
  const centroid = (ring: Float64Array) => {
    let sx = 0;
    let sz = 0;
    const n = ring.length / 2;
    for (let i = 0; i < ring.length; i += 2) {
      sx += ring[i] as number;
      sz += ring[i + 1] as number;
    }
    return { x: sx / n, z: sz / n };
  };
  const near = (x: number, z: number, radius: number) =>
    (water()?.polygons ?? []).filter((p) => {
      const c = centroid(p.rings[0] as Float64Array);
      return Math.hypot(c.x - x, c.z - z) <= radius;
    });

  it('Abant Gölü yakınında lake çokgeni var', () => {
    const lakes = near(-1587, 1610, 100).filter((p) => p.kind === 'lake');
    expect(lakes.map((p) => p.name)).toContain('Abant Gölü');
  });

  it('Yedigöller yakınında durgun su çokgenleri var (Seringöl, Büyükgöl… OSM’de pond)', () => {
    const named = near(-776, 849, 150).filter((p) => /göl/i.test(p.name ?? ''));
    expect(named.length).toBeGreaterThanOrEqual(3);
  });

  it('özellik dosyası eski ve yeni alanda su içerir (sınırdan geçen akarsular var)', () => {
    const lines = water()?.lines ?? [];
    expect(lines.length).toBeGreaterThan(1000);
    const seamX = gridOriginOf({ col0: LEGACY.col0, row0: LEGACY.row0 }).x - LATTICE_CELL / 2;
    const crossing = lines.filter((l) => {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < l.xz.length; i += 2) {
        min = Math.min(min, l.xz[i] as number);
        max = Math.max(max, l.xz[i] as number);
      }
      return min < seamX && max > seamX;
    });
    expect(crossing.length).toBeGreaterThan(0);
  });
});

describe('arazi örtüsü', () => {
  it('karada (yükseklik > 0) `none` oranı çok düşük ve 128×128 blokların hiçbirinde şerit yok', () => {
    const { cols, rows } = manifest.extent;
    const cover = world.landcover as Uint8Array;
    let land = 0;
    let none = 0;
    for (let i = 0; i < world.heights.length; i++) {
      if ((world.heights[i] as number) > 0) {
        land++;
        if (cover[i] === 0) none++;
      }
    }
    expect(none / land).toBeLessThan(0.01);

    for (let r0 = 0; r0 < rows; r0 += CHUNK_CELLS) {
      for (let c0 = 0; c0 < cols; c0 += CHUNK_CELLS) {
        let blockLand = 0;
        let blockNone = 0;
        for (let r = r0; r < Math.min(r0 + CHUNK_CELLS, rows); r++) {
          for (let c = c0; c < Math.min(c0 + CHUNK_CELLS, cols); c++) {
            const i = r * cols + c;
            if ((world.heights[i] as number) > 0) {
              blockLand++;
              if (cover[i] === 0) blockNone++;
            }
          }
        }
        // Kıyı blokları az kara içerir; oran blok alanına göredir (kıyıdaki `none` hücreler şerit sayılmaz).
        if (blockLand > 0)
          expect(blockNone / CHUNK_CELLS ** 2, `blok (${c0}, ${r0})`).toBeLessThan(0.2);
      }
    }
  });
});

describe('eski/yeni alan sınır sürekliliği', () => {
  it('batı dikişi (sütun −1 ↔ 0): komşu örnek farkı iç gradyanı aşmaz', () => {
    const rows: number[] = [];
    for (let r = LEGACY.row0; r < LEGACY.row0 + LEGACY.rows; r++) rows.push(r);
    const seam =
      rows.reduce(
        (s, r) =>
          s + Math.abs(elevationAtSample(LEGACY.col0, r) - elevationAtSample(LEGACY.col0 - 1, r)),
        0,
      ) / rows.length;
    const interior =
      rows.reduce((s, r) => {
        let d = 0;
        for (let c = 1; c <= 20; c++) {
          d += Math.abs(elevationAtSample(c + 1, r) - elevationAtSample(c, r));
        }
        return s + d / 20;
      }, 0) / rows.length;
    expect(seam).toBeLessThan(interior * 1.5 + 1);
  });

  it('güney dikişi (satır 1175 ↔ 1176): komşu örnek farkı iç gradyanı aşmaz', () => {
    const last = LEGACY.row0 + LEGACY.rows - 1;
    const cols: number[] = [];
    for (let c = LEGACY.col0; c < LEGACY.col0 + LEGACY.cols; c++) cols.push(c);
    const seam =
      cols.reduce(
        (s, c) => s + Math.abs(elevationAtSample(c, last + 1) - elevationAtSample(c, last)),
        0,
      ) / cols.length;
    const interior =
      cols.reduce((s, c) => {
        let d = 0;
        for (let r = last - 20; r < last - 1; r++) {
          d += Math.abs(elevationAtSample(c, r + 1) - elevationAtSample(c, r));
        }
        return s + d / 19;
      }, 0) / cols.length;
    expect(seam).toBeLessThan(interior * 1.5 + 1);
  });
});
