import { describe, expect, it } from 'vitest';
import {
  SILENT,
  ambientMix,
  clamp01,
  daylight,
  eventChances,
  nightness,
  smoothstep,
  type AmbientInput,
} from '../src/audio/ambientMix';
import { AMBIENT } from '../src/config';
import { LANDCOVER_CLASSES } from '../src/data/landcover';

const base: AmbientInput = {
  elevationM: 100,
  seaDistance: 5000,
  cover: 'grass',
  sunAltitudeDeg: 40,
  sheltered: false,
};
const mix = (patch: Partial<AmbientInput>) => ambientMix({ ...base, ...patch });

describe('smoothstep / clamp', () => {
  it('sınırlarda 0 ve 1, ortada yumuşak; ters aralıkta da çalışır', () => {
    expect(smoothstep(0, 10, -5)).toBe(0);
    expect(smoothstep(0, 10, 15)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBeCloseTo(0.5, 6);
    expect(smoothstep(10, 0, 10)).toBe(0);
    expect(smoothstep(10, 0, 0)).toBe(1);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });

  it('gündüz/gece dereceleri güneş yüksekliğiyle tutarlı ve birbirinin tersi yönde', () => {
    expect(daylight(40)).toBe(1);
    expect(daylight(-20)).toBe(0);
    expect(nightness(40)).toBe(0);
    expect(nightness(-20)).toBe(1);
    for (let alt = -20; alt <= 40; alt += 2) {
      // Hiçbir an hem tam gündüz hem tam gece olmaz.
      expect(daylight(alt) * nightness(alt)).toBeLessThan(0.25);
    }
  });
});

describe('ambientMix: rüzgâr', () => {
  it('deniz seviyesinde hafif, rakımla monoton artar, tam rakımda 1', () => {
    const w = (e: number) => mix({ elevationM: e }).wind;
    expect(w(0)).toBeCloseTo(AMBIENT.windBase, 6);
    expect(w(300)).toBeGreaterThan(w(0));
    expect(w(800)).toBeGreaterThan(w(300));
    expect(w(AMBIENT.windFullElevationM)).toBe(1);
    expect(w(3000)).toBe(1);
  });

  it('sık ormanda boğulur, sundurma altında azalır', () => {
    const open = mix({ elevationM: 900 }).wind;
    expect(mix({ elevationM: 900, cover: 'forest' }).wind).toBeCloseTo(
      open * AMBIENT.windForestMuffle,
      6,
    );
    expect(mix({ elevationM: 900, sheltered: true }).wind).toBeCloseTo(
      open * AMBIENT.windShelterMuffle,
      6,
    );
  });
});

describe('ambientMix: deniz', () => {
  it('yakında tam, uzakta sessiz, aradaki monoton azalır', () => {
    const s = (d: number) => mix({ seaDistance: d }).sea;
    expect(s(0)).toBe(1);
    expect(s(AMBIENT.seaNearDistance)).toBe(1);
    expect(s(AMBIENT.seaFarDistance)).toBe(0);
    expect(s(10_000)).toBe(0);
    let previous = 1;
    for (let d = AMBIENT.seaNearDistance; d <= AMBIENT.seaFarDistance; d += 10) {
      expect(s(d)).toBeLessThanOrEqual(previous + 1e-12);
      previous = s(d);
    }
  });

  it('denizin içindeyken karasal sesler (yaprak, kuş, gece) kesilir, deniz tam', () => {
    const levels = mix({ seaDistance: 0, cover: 'forest', sunAltitudeDeg: 40 });
    expect(levels.sea).toBe(1);
    expect(levels.leaves).toBe(0);
    expect(levels.birds).toBe(0);
    expect(levels.night).toBe(0);
  });
});

describe('ambientMix: orman, kuş ve gece', () => {
  it('yaprak yalnızca bitki örtülü yerde; ormanda en güçlü', () => {
    expect(mix({ cover: 'forest' }).leaves).toBeGreaterThan(mix({ cover: 'shrub' }).leaves);
    expect(mix({ cover: 'shrub' }).leaves).toBeGreaterThan(mix({ cover: 'grass' }).leaves);
    expect(mix({ cover: 'barren' }).leaves).toBe(0);
    expect(mix({ cover: 'snow' }).leaves).toBe(0);
  });

  it('kuşlar gündüz ormanda yüksek, geceleyin ve çıplak yerde sessiz', () => {
    expect(mix({ cover: 'forest', sunAltitudeDeg: 40 }).birds).toBeGreaterThan(0.9);
    expect(mix({ cover: 'forest', sunAltitudeDeg: -30 }).birds).toBe(0);
    expect(mix({ cover: 'snow', sunAltitudeDeg: 40 }).birds).toBe(0);
    expect(mix({ cover: 'forest', sunAltitudeDeg: 40, elevationM: 2500 }).birds).toBe(0);
  });

  it('gece sesleri geceleyin açık, gündüz kapalı; rakım sınırında kesilir', () => {
    expect(mix({ cover: 'forest', sunAltitudeDeg: -30 }).night).toBeGreaterThan(0.9);
    expect(mix({ cover: 'forest', sunAltitudeDeg: 40 }).night).toBe(0);
    expect(
      mix({ cover: 'forest', sunAltitudeDeg: -30, elevationM: AMBIENT.insectMaxElevationM }).night,
    ).toBe(0);
    expect(mix({ cover: 'snow', sunAltitudeDeg: -30 }).night).toBe(0);
  });

  it('alacakaranlıkta kuşlar kısılırken gece sesleri artar (geçiş sürekli)', () => {
    let prevBird = Infinity;
    let prevNight = -Infinity;
    for (let alt = 15; alt >= -15; alt -= 1) {
      const m = mix({ cover: 'forest', sunAltitudeDeg: alt });
      expect(m.birds).toBeLessThanOrEqual(prevBird + 1e-12);
      expect(m.night).toBeGreaterThanOrEqual(prevNight - 1e-12);
      prevBird = m.birds;
      prevNight = m.night;
    }
  });
});

describe('ambientMix: genel', () => {
  it('her girdi birleşiminde seviyeler [0, 1] aralığındadır ve sonludur', () => {
    for (const cover of LANDCOVER_CLASSES) {
      for (const elevationM of [-50, 0, 500, 1200, 2500]) {
        for (const seaDistance of [0, 20, 200, 1e6, Number.POSITIVE_INFINITY]) {
          for (const sunAltitudeDeg of [-60, -6, 0, 10, 70]) {
            for (const sheltered of [false, true]) {
              const m = ambientMix({ elevationM, seaDistance, cover, sunAltitudeDeg, sheltered });
              for (const v of Object.values(m)) {
                expect(Number.isFinite(v)).toBe(true);
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
              }
            }
          }
        }
      }
    }
  });

  it('SILENT tüm katmanları sıfır verir', () => {
    expect(Object.values(SILENT).every((v) => v === 0)).toBe(true);
  });
});

describe('eventChances', () => {
  it('sessiz ortamda olay yok; kuş seviyesiyle ve süreyle orantılı artar', () => {
    expect(eventChances(SILENT, 0.2)).toEqual({ bird: 0, owl: 0 });
    const full = eventChances({ ...SILENT, birds: 1 }, 1);
    expect(full.bird).toBeCloseTo(AMBIENT.birdPerSecondAtFull, 6);
    const half = eventChances({ ...SILENT, birds: 0.5 }, 1);
    expect(half.bird).toBeCloseTo(full.bird / 2, 6);
    expect(eventChances({ ...SILENT, birds: 1 }, 0.5).bird).toBeCloseTo(full.bird / 2, 6);
  });

  it('baykuş gece ve ormanda; açık arazide seyrek', () => {
    const forest = eventChances({ ...SILENT, night: 1, leaves: 1 }, 1).owl;
    const open = eventChances({ ...SILENT, night: 1, leaves: 0 }, 1).owl;
    expect(forest).toBeCloseTo(AMBIENT.owlPerSecondAtFull, 6);
    expect(open).toBeCloseTo(forest * 0.2, 6);
    expect(eventChances({ ...SILENT, night: 0, leaves: 1 }, 1).owl).toBe(0);
  });

  it('olasılık 1 üstüne çıkmaz', () => {
    expect(eventChances({ ...SILENT, birds: 1 }, 1000).bird).toBe(1);
  });
});
