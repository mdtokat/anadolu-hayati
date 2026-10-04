import { describe, expect, it } from 'vitest';
import { COAST_SHAPING, ROAD_STRUCTURES, VERTICAL_SCALE, WATER } from '../src/config';
import type { RoadData } from '../src/data/settlements';
import {
  SPAN_KIND,
  bridgeTypeFor,
  planRoadProfiles,
  type ProfileTerrain,
} from '../src/settlements/roadProfile';
import { cutRoads } from '../src/settlements/SettlementMap';
import { shapeCoastSteps } from '../src/world/coastShaping';
import { structureShape } from '../src/world/roadStructureGeometry';

/**
 * Deniz geçişi ve kıyı (kullanıcı talimatı: "Osman Gazi Köprüsü'nü ekle; Kocaeli körfezindeki ve Samsun/Sinop sahil
 * şeridindeki hataları düzelt, deniz kesik kesik görünüyor").
 */

const road = (cls: 0 | 1 | 2, ...xz: number[]): RoadData => ({ cls, xz: Float32Array.from(xz) });

function terrain(h: (x: number, z: number) => number): ProfileTerrain {
  return { heightAt: h, elevationAt: (x, z) => h(x, z) * VERTICAL_SCALE };
}

/** x ∈ (−w, w) boğaz (deniz, taban `depth`), dışı 2 m kara. */
const strait =
  (w: number, depth = -4) =>
  (x: number) =>
    Math.abs(x) < w ? depth : 2;

describe('deniz köprüsü', () => {
  it('anayol uzun deniz geçişini asma köprüyle geçer; güverte suyun üstünde', () => {
    const plan = planRoadProfiles([road(0, -120, 0, 120, 0)], terrain(strait(30)));
    const spans = plan.spans.filter((s) => s.kind === SPAN_KIND.bridge);
    expect(spans).toHaveLength(1);
    const span = spans[0]!;
    expect(span.type).toBe('suspension');
    const r = plan.roads[0]!;
    for (let i = span.i0; i <= span.i1; i++) {
      const x = r.xz[i * 2]!;
      if (Math.abs(x) < 29) {
        expect(r.kind[i]).toBe(SPAN_KIND.bridge);
        expect(r.bed[i]).toBeGreaterThanOrEqual(
          WATER.level + ROAD_STRUCTURES.suspensionClearance - 1e-3,
        );
      }
    }
    // Asma köprü: iki kule (gri), kablolar, askılar; güverte yolun renginde ve katı.
    const shape = structureShape(plan, span);
    const C = ROAD_STRUCTURES.colors;
    expect(shape.boxes.filter((b) => b.color === C.cable).length).toBeGreaterThan(20);
    const towerTops = shape.boxes.filter(
      (b) => b.color === C.tower && b.y + b.hh > r.bed[span.i0]! + ROAD_STRUCTURES.towerHeight - 1,
    );
    expect(towerTops.length).toBeGreaterThanOrEqual(4); // iki kule × (iki bacak + tepe kirişi)
    expect(shape.boxes.some((b) => b.solid && b.hw > 3)).toBe(true);
  });

  it('köy yolu ve kısa deniz geçişi alçak köprüdür; çok kısa kıyı dalışı zeminde kalır', () => {
    const village = planRoadProfiles([road(1, -120, 0, 120, 0)], terrain(strait(30)));
    expect(village.spans.find((s) => s.kind === SPAN_KIND.bridge)?.type).not.toBe('suspension');
    const short = planRoadProfiles([road(0, -120, 0, 120, 0)], terrain(strait(6)));
    const span = short.spans.find((s) => s.kind === SPAN_KIND.bridge);
    expect(span?.type).not.toBe('suspension');
    const r = short.roads[0]!;
    for (let i = 0; i < r.bed.length; i++) {
      if (Math.abs(r.xz[i * 2]!) < 5) {
        expect(r.bed[i]).toBeGreaterThan(WATER.level + ROAD_STRUCTURES.seaClearance - 1e-3);
      }
    }
    // Kıyıda tek örneklik sığ dalış (ilk deniz hücresi ≈ −0,4 m).
    const dip = planRoadProfiles([road(0, -120, 0, 120, 0)], terrain(strait(1, -0.4)));
    expect(dip.spans.filter((s) => s.kind === SPAN_KIND.bridge)).toHaveLength(0);
  });

  it('türü: anayolda deniz kesimi ≥ suspensionMinLength ise asma', () => {
    const min = ROAD_STRUCTURES.suspensionMinLength;
    expect(bridgeTypeFor(0, 80, 5, false, 0, 0, min)).toBe('suspension');
    expect(bridgeTypeFor(0, 80, 5, false, 0, 0, min - 1)).not.toBe('suspension');
    expect(bridgeTypeFor(1, 80, 5, false, 0, 0, min + 10)).not.toBe('suspension');
  });

  it('kent dairesindeki uzun deniz geçişi cadde olmaz (anayol kalır, tek parça); kısa kıyı dalışı cadde kalır', () => {
    const circle = [{ x: 0, z: 0, r: 200 }];
    const sea = {
      isSea: (x: number) => Math.abs(x) < 30,
      minLength: ROAD_STRUCTURES.suspensionMinLength,
      approach: ROAD_STRUCTURES.seaApproach,
    };
    const cut = cutRoads([road(0, -300, 0, 300, 0)], circle, sea);
    const trunk = cut.filter((r) => r.cls === 0);
    const crossing = trunk.find((r) => {
      const xs = Array.from(r.xz).filter((_, i) => i % 2 === 0);
      return Math.min(...xs) <= -30 && Math.max(...xs) >= 30;
    });
    expect(crossing).toBeDefined();
    expect(cut.some((r) => r.cls === 3)).toBe(true); // denizden uzak kent içi kısım hâlâ cadde
    const shortSea = { ...sea, isSea: (x: number) => Math.abs(x) < 4 };
    const plain = cutRoads([road(0, -300, 0, 300, 0)], circle, shortSea);
    expect(plain.filter((r) => r.cls === 0)).toHaveLength(2); // yalnız dairenin dışındaki iki uç
  });
});

describe('kıyı biçimlendirme', () => {
  /** Ham maske (1 kara) → oyun yüksekliği (kara 0,03 m, deniz −0,5 m), biçimlendirilmiş. */
  function shaped(width: number, height: number, land: (c: number, r: number) => boolean) {
    const game = new Float32Array(width * height);
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++) game[r * width + c] = land(c, r) ? 0.03 : -0.5;
    const steps = shapeCoastSteps(
      game,
      (i) => land(i % width, Math.floor(i / width)),
      width,
      height,
    );
    while (!steps.next().done) {
      // dilimler
    }
    return game;
  }

  it('karadaki tek hücrelik deniz beneği ve denizdeki tek hücrelik kara beneği kalkar', () => {
    const W = 20;
    const g = shaped(W, W, (c, r) => (c < 10 ? !(c === 4 && r === 10) : c === 15 && r === 10));
    expect(g[10 * W + 4]!).toBeGreaterThan(WATER.level); // deniz beneği kara oldu
    expect(g[10 * W + 15]!).toBeLessThan(WATER.level); // kara beneği su altında
  });

  it('alçak kıyı ovası su düzleminin belirgin üstünde; iç kesimde en az su + relief/2', () => {
    const W = 30;
    const g = shaped(W, 5, (c) => c < 15);
    expect(g[2 * W + 2]!).toBeCloseTo(WATER.level + COAST_SHAPING.relief / 2, 3);
    // Kıyıdaki ilk kara hücresi suyun üstünde, ilk deniz hücresi altında: su çizgisi aralarında.
    expect(g[2 * W + 14]!).toBeGreaterThan(WATER.level);
    expect(g[2 * W + 15]!).toBeLessThan(WATER.level);
    // Açık deniz tabanı değişmez.
    expect(g[2 * W + 28]!).toBeCloseTo(-0.5, 6);
  });

  it('çapraz kıyıda su çizgisi hücre kenarını değil yumuşatılmış maskeyi izler', () => {
    const W = 24;
    // Merdiven biçimli kıyı: c + r < 24 kara.
    const g = shaped(W, W, (c, r) => c + r < 24);
    // Köşegene simetrik: (c, r) ve (r, c) aynı yükseklikte; su çizgisinin iki yanı hep ters işaretli.
    for (let k = 4; k < 20; k++) {
      const land = g[k * W + (23 - k)]!;
      const sea = g[k * W + (24 - k)]!;
      expect(land).toBeGreaterThan(WATER.level);
      expect(sea).toBeLessThan(WATER.level);
      expect(Math.abs(land - g[(23 - k) * W + k]!)).toBeLessThan(1e-6);
    }
  });
});
