import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config';
import { RegionDataError } from '../src/data/region';
import { loadWorld } from '../src/data/world';
import { gridOriginOf } from '../src/world/lattice';
import { FIXTURE_BASE, makeWorldFixture } from './helpers/worldFixture';

describe('loadWorld (sentetik karolarla)', () => {
  it('negatif karo indeksleri ve kısmi karolarla doğru birleştirir', async () => {
    const fx = makeWorldFixture(); // extent col −600…599, row −20…679 → tx −2…1, ty −1…1
    const world = await loadWorld(fx.id, FIXTURE_BASE, fx.fetch);
    const { extent } = fx.manifest;

    expect(world.meta.gridWidth).toBe(extent.cols);
    expect(world.meta.gridHeight).toBe(extent.rows);
    expect(world.heights).toHaveLength(extent.cols * extent.rows);
    expect(world.landcover).toHaveLength(extent.cols * extent.rows);

    // Köşeler, karo sınırları (col −512/−1/0/511/512, row −512…) ve ortadan örnekler.
    const samples: Array<[number, number]> = [
      [-600, -20],
      [599, 679],
      [-512, 0],
      [-513, 0],
      [-1, 0],
      [0, 0],
      [511, 511],
      [512, 512],
      [-1, 511],
      [0, 512],
      [123, 456],
    ];
    for (const [col, row] of samples) {
      const i = (row - extent.row0) * extent.cols + (col - extent.col0);
      expect(world.heights[i], `yükseklik (${col}, ${row})`).toBe(fx.heightAt(col, row));
      expect(world.landcover?.[i], `örtü (${col}, ${row})`).toBe(fx.coverAt(col, row));
    }
  });

  it('tüm dizi karo içeriğiyle birebir örtüşür (extent dışı karo kısmı sızmaz)', async () => {
    const fx = makeWorldFixture({ extent: { col0: 100, row0: 700, cols: 900, rows: 400 } });
    const world = await loadWorld(fx.id, FIXTURE_BASE, fx.fetch);
    const { extent } = fx.manifest;
    for (let r = 0; r < extent.rows; r += 7) {
      for (let c = 0; c < extent.cols; c += 5) {
        const i = r * extent.cols + c;
        expect(world.heights[i]).toBe(fx.heightAt(extent.col0 + c, extent.row0 + r));
        expect(world.landcover?.[i]).toBe(fx.coverAt(extent.col0 + c, extent.row0 + r));
      }
    }
  });

  it('gridOrigin = gridOriginOf(extent); meta alanları manifestten gelir', async () => {
    const fx = makeWorldFixture();
    const world = await loadWorld(fx.id, FIXTURE_BASE, fx.fetch);
    expect(world.meta.gridOrigin).toEqual(gridOriginOf(fx.manifest.extent));
    // x(0) = anchorX + col0·2
    expect(world.meta.gridOrigin.x).toBe(WORLD.lattice.anchorX + -600 * 2);
    expect(world.meta.gridOrigin.z).toBe(WORLD.lattice.anchorZ + -20 * 2);
    expect(world.meta.id).toBe(fx.id);
    expect(world.meta.originUtm).toEqual([434085, 4576261]);
    expect(world.meta.elevationMax).toBe(2500);
    expect(world.meta.cellSizeReal).toBe(100);
    expect(world.meta.features).toEqual(['water']);
    expect(world.meta.landcover?.classes).toHaveLength(9);
  });

  it('il ve özellik dosyalarını ayrıştırır', async () => {
    const fx = makeWorldFixture();
    const world = await loadWorld(fx.id, FIXTURE_BASE, fx.fetch);
    expect(world.provinces.map((p) => p.name)).toEqual(['Test']);
    expect(world.provinces[0]?.inRegion).toBe(true);
    // Fikstürdeki tek kısa dere yüklemede ayıklanır (WATER_THINNING); yalnızca nesne dağılımı onu görür.
    const lines = world.features?.water.lines ?? [];
    const minor = world.features?.minorStreams ?? [];
    expect(lines.length + minor.length).toBe(1);
  });

  it('özellik katmanı yoksa features null olur', async () => {
    const fx = makeWorldFixture();
    fx.manifest.features.layers = [];
    fx.files.set('world.json', JSON.stringify(fx.manifest));
    fx.files.delete('features.json');
    const world = await loadWorld(fx.id, FIXTURE_BASE, fx.fetch);
    expect(world.features).toBeNull();
  });

  it('dosya adlarına sha önbellek etiketi (?v=) ekler', async () => {
    const fx = makeWorldFixture({ extent: { col0: 0, row0: 0, cols: 10, rows: 10 } });
    const urls: string[] = [];
    await loadWorld(fx.id, FIXTURE_BASE, (url) => {
      urls.push(url);
      return fx.fetch(url);
    });
    const tile = fx.manifest.tiles[0];
    expect(tile).toBeDefined();
    const tag = `?v=${tile?.sha256.slice(0, 8)}`;
    expect(urls).toContain(`/data/world/${fx.id}/${tile?.height}${tag}`);
    expect(urls).toContain(`/data/world/${fx.id}/${tile?.cover}${tag}`);
  });

  it('karo dosyası eksikse (boşluk) hata verir', async () => {
    const fx = makeWorldFixture({ omitTiles: ['0_0'] });
    // Manifest'ten de çıkarıldığı için kapsama boşluğu → manifest hatası.
    await expect(loadWorld(fx.id, FIXTURE_BASE, fx.fetch)).rejects.toThrow(/boşluksuz/);
  });

  it('manifestte listeli ama sunucuda olmayan karo → indirme hatası', async () => {
    const fx = makeWorldFixture();
    fx.files.delete('tiles/0_0.height.bin');
    await expect(loadWorld(fx.id, FIXTURE_BASE, fx.fetch)).rejects.toThrow(/indirilemedi/);
  });

  it('karo boyutu manifestle uyuşmazsa hata verir', async () => {
    const fx = makeWorldFixture();
    fx.files.set('tiles/0_0.height.bin', new Uint8Array(100));
    await expect(loadWorld(fx.id, FIXTURE_BASE, fx.fetch)).rejects.toThrow(/bayt/);
  });

  it('karo içeriği bozuksa (sha) hata verir', async () => {
    const fx = makeWorldFixture();
    const bytes = (fx.files.get('tiles/0_0.height.bin') as Uint8Array).slice();
    bytes[10] = (bytes[10] as number) ^ 0xff;
    fx.files.set('tiles/0_0.height.bin', bytes);
    await expect(loadWorld(fx.id, FIXTURE_BASE, fx.fetch)).rejects.toThrow(/sha256/);
  });

  it('örtü karosunda bilinmeyen sınıf değeri hata verir', async () => {
    const fx = makeWorldFixture();
    const cover = (fx.files.get('tiles/0_0.cover.bin') as Uint8Array).slice();
    cover[5] = 200; // karo (0,0) satır 0 sütun 5 extent içinde
    fx.files.set('tiles/0_0.cover.bin', cover);
    await expect(loadWorld(fx.id, FIXTURE_BASE, fx.fetch)).rejects.toThrow(/bilinmeyen sınıf/);
  });

  it('örtü karosu yanlış boyutluysa hata verir', async () => {
    const fx = makeWorldFixture();
    fx.files.set('tiles/0_0.cover.bin', new Uint8Array(10));
    await expect(loadWorld(fx.id, FIXTURE_BASE, fx.fetch)).rejects.toThrow(/örtüsü/);
  });

  it('manifest kimliği istenenle uyuşmazsa ve lattice uyuşmazsa RegionDataError verir', async () => {
    const fx = makeWorldFixture();
    await expect(
      loadWorld('baska', FIXTURE_BASE, async (url) => fx.fetch(url.replace('baska', fx.id))),
    ).rejects.toThrow(/id'si/);

    const bad = makeWorldFixture();
    bad.manifest.lattice = { anchorX: 0, anchorZ: 0 };
    bad.files.set('world.json', JSON.stringify(bad.manifest));
    await expect(loadWorld(bad.id, FIXTURE_BASE, bad.fetch)).rejects.toBeInstanceOf(
      RegionDataError,
    );
  });

  it('world.json indirilemezse hata verir', async () => {
    const fx = makeWorldFixture();
    fx.files.delete('world.json');
    await expect(loadWorld(fx.id, FIXTURE_BASE, fx.fetch)).rejects.toThrow(/world\.json/);
  });
});
