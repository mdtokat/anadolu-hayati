import { describe, expect, it } from 'vitest';
import { RegionDataError } from '../src/data/region';
import { parseWorldManifest } from '../src/data/world';
import { makeWorldFixture } from './helpers/worldFixture';

function manifestJson(mutate?: (m: Record<string, unknown>) => void): unknown {
  const m = JSON.parse(JSON.stringify(makeWorldFixture().manifest)) as Record<string, unknown>;
  mutate?.(m);
  return m;
}

describe('parseWorldManifest', () => {
  it('geçerli manifesti olduğu gibi döndürür', () => {
    const fixture = makeWorldFixture();
    const parsed = parseWorldManifest(JSON.parse(JSON.stringify(fixture.manifest)));
    expect(parsed).toEqual(fixture.manifest);
    expect(parsed.tiles).toHaveLength(12);
  });

  it('nesne olmayan girdiyi reddeder', () => {
    for (const bad of [null, 5, 'x', []]) {
      expect(() => parseWorldManifest(bad)).toThrow(RegionDataError);
    }
  });

  it('bilinmeyen sürümü reddeder', () => {
    expect(() => parseWorldManifest(manifestJson((m) => (m.version = 2)))).toThrow(/version/);
  });

  it('kafes çapası config ile uyuşmuyorsa reddeder', () => {
    expect(() =>
      parseWorldManifest(manifestJson((m) => (m.lattice = { anchorX: -1586, anchorZ: -1175 }))),
    ).toThrow(/kafes çapası/);
    expect(() => parseWorldManifest(manifestJson((m) => delete m.lattice))).toThrow(/lattice/);
  });

  it('yatay ölçek, hücre boyu ve karo boyu uyuşmazlığını reddeder', () => {
    expect(() => parseWorldManifest(manifestJson((m) => (m.horizontalScale = 25)))).toThrow(
      /yatay ölçeği/,
    );
    expect(() => parseWorldManifest(manifestJson((m) => (m.cellSizeReal = 50)))).toThrow(
      /cellSizeReal/,
    );
    expect(() => parseWorldManifest(manifestJson((m) => (m.tileSize = 256)))).toThrow(/tileSize/);
  });

  it('extent geçersizse reddeder', () => {
    expect(() =>
      parseWorldManifest(manifestJson((m) => (m.extent = { col0: 0, row0: 0, cols: 0, rows: 5 }))),
    ).toThrow(/extent/);
    expect(() =>
      parseWorldManifest(
        manifestJson((m) => (m.extent = { col0: 0.5, row0: 0, cols: 5, rows: 5 })),
      ),
    ).toThrow(/tam sayı/);
  });

  it('yükseklik aralığı ve kodlamasını denetler', () => {
    expect(() =>
      parseWorldManifest(
        manifestJson((m) => (m.elevation = { min: 0, max: 0, encoding: 'uint16' })),
      ),
    ).toThrow(/elevation/);
    expect(() =>
      parseWorldManifest(manifestJson((m) => (m.elevation = { min: 0, max: 9, encoding: 'f32' }))),
    ).toThrow(/encoding/);
  });

  it('karo kapsamı boşluksuz olmalı: eksik, fazla ve yinelenen karoyu reddeder', () => {
    expect(() =>
      parseWorldManifest(manifestJson((m) => (m.tiles = (m.tiles as unknown[]).slice(0, -1)))),
    ).toThrow(/boşluksuz/);
    expect(() =>
      parseWorldManifest(
        manifestJson((m) => {
          const tiles = m.tiles as Record<string, unknown>[];
          m.tiles = [...tiles, { ...tiles[0], tx: 40 }];
        }),
      ),
    ).toThrow(/kesişmiyor/);
    expect(() =>
      parseWorldManifest(
        manifestJson((m) => {
          const tiles = m.tiles as unknown[];
          m.tiles = [...tiles, tiles[0]];
        }),
      ),
    ).toThrow(/birden fazla/);
  });

  it('karo bayt sayısı, sha ve yolunu denetler', () => {
    const withTile = (patch: Record<string, unknown>) =>
      manifestJson((m) => {
        const tiles = m.tiles as Record<string, unknown>[];
        tiles[0] = { ...tiles[0], ...patch };
      });
    expect(() => parseWorldManifest(withTile({ bytes: 100 }))).toThrow(/bytes/);
    expect(() => parseWorldManifest(withTile({ sha256: 'abc' }))).toThrow(/sha256/);
    expect(() => parseWorldManifest(withTile({ height: '../dışarı.bin' }))).toThrow(/göreli/);
    expect(() => parseWorldManifest(withTile({ cover: '/mutlak.bin' }))).toThrow(/göreli/);
  });

  it('arazi örtüsü sınıf tablosu kodla uyuşmalı', () => {
    expect(() =>
      parseWorldManifest(manifestJson((m) => (m.landcover = { classes: ['none', 'forest'] }))),
    ).toThrow(/sınıf tablosu/);
  });

  it('il/özellik yolları kökten çıkamaz', () => {
    expect(() => parseWorldManifest(manifestJson((m) => (m.provinces = '../x.geojson')))).toThrow(
      /göreli/,
    );
  });
});
