import { describe, expect, it } from 'vitest';
import { MINIMAP } from '../src/config';
import { RECIPES } from '../src/items/recipes';
import { ITEMS } from '../src/items/itemDefs';
import {
  boundsTouch,
  circleToPx,
  frameAround,
  lineBounds,
  mapTransform,
  minimapVisible,
  needsRebase,
  rasterColor,
} from '../src/ui/minimapView';

/** Mini harita (kullanıcı talimatı): görünürlük kuralı, taban görüntüsü, dönüşüm. */

describe('mini harita', () => {
  it('Son Kalan’da her zaman, hayatta kalmada yalnızca Harita varken görünür; ölü/duraklıyken gizli', () => {
    const base = { battleRoyale: false, hasMap: false, alive: true, paused: false };
    expect(minimapVisible(base)).toBe(false);
    expect(minimapVisible({ ...base, hasMap: true })).toBe(true);
    expect(minimapVisible({ ...base, battleRoyale: true })).toBe(true);
    expect(minimapVisible({ ...base, battleRoyale: true, alive: false })).toBe(false);
    expect(minimapVisible({ ...base, hasMap: true, paused: true })).toBe(false);
  });

  it('Harita tezgâhta üretilir (hayatta kalma)', () => {
    const recipe = RECIPES.map;
    expect(recipe.output).toEqual({ id: 'map', count: 1 });
    expect(recipe.station).toBe('workbench');
    expect(ITEMS.map.category).toBe('tool');
  });

  it('deniz mavidir, kara örtü rengindedir; ışığa dönük yamaç daha açık', () => {
    const sea = rasterColor('none', -3, 0);
    expect(sea[2]).toBeGreaterThan(sea[0]);
    const lit = rasterColor('forest', 20, 1);
    const dark = rasterColor('forest', 20, -1);
    expect(lit[1]).toBeGreaterThan(dark[1]);
    const grass = rasterColor('grass', 5, 0);
    expect(grass[1]).toBeGreaterThan(grass[2]);
  });

  it('taban görüntüsü oyuncu kenara yaklaşınca yeniden örneklenir', () => {
    const r = MINIMAP.radius;
    expect(needsRebase(null, 0, 0, r)).toBe(true);
    const frame = frameAround(0, 0, r);
    expect(frame.span).toBeCloseTo(2 * r * MINIMAP.rasterSpan, 9);
    expect(needsRebase(frame, 0, 0, r)).toBe(false);
    expect(needsRebase(frame, r * 0.2, 0, r)).toBe(false);
    expect(needsRebase(frame, r * 0.6, 0, r)).toBe(true);
  });

  it('dönüşüm: oyuncu ortada, kuzey (−Z) yukarı, doğu (+X) sağda', () => {
    const t = mapTransform({ x: 100, z: 50 }, 200, 400);
    expect(t.toPx(100, 50)).toEqual({ x: 200, y: 200 });
    expect(t.toPx(100, 0).y).toBeLessThan(200);
    expect(t.toPx(150, 50).x).toBeGreaterThan(200);
    expect(circleToPx(t, { x: 100, z: 50, r: 100 }).r).toBe(100);
  });

  it('çizgi sınır kutusu ve kare kesişimi', () => {
    const b = lineBounds([0, 0, 10, -5, 20, 5]);
    expect(b).toEqual({ minX: 0, minZ: -5, maxX: 20, maxZ: 5 });
    expect(boundsTouch(b, 30, 0, 11)).toBe(true);
    expect(boundsTouch(b, 40, 0, 11)).toBe(false);
  });
});
