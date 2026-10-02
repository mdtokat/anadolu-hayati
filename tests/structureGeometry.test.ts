import { describe, expect, it } from 'vitest';
import { PLACEMENT } from '../src/config';
import { PIECE_KINDS } from '../src/placement/pieces';
import { STRUCTURE_KINDS } from '../src/placement/structures';

const isPiece = (kind: string): boolean => (PIECE_KINDS as readonly string[]).includes(kind);
import { triangleCount } from '../src/world/propGeometry';
import {
  buildFlameGeometry,
  buildOpenDoorGeometry,
  buildStructureGeometry,
} from '../src/world/structureGeometry';

/** Üçgen bütçeleri: yapı sayısı azdır ama her biri ayrı draw call'dur; ucuz kalmalı. */
const BUDGET = {
  campfire: 400,
  lean_to: 200,
  workbench: 200,
  storage_chest: 100,
  wooden_hut: 400,
  // Modüler parçalar (her biri ayrı mesh; sahada onlarca olabilir: ucuz kalmalı).
  foundation: 120,
  wall: 220,
  doorway: 300,
  window_wall: 400,
  door: 100,
  roof: 200,
  // Faz 11 (11.0): yer tutucu kutular; sahibi akış gerçek geometriyle bütçesini ayarlar.
  stairs: 200,
  entry_step: 120,
  pillar: 120,
  railing: 120,
  half_wall: 220,
  gable_roof: 200,
  gable_wall: 220,
  forge: 300,
  stone_oven: 300,
  hand_mill: 200,
  drying_rack: 200,
  bedroll: 100,
  solar_panel: 200,
  wood_fence: 120,
  stone_fence: 200,
  fence_gate: 120,
  farm_plot: 200,
  drone: 200,
  flame: 120,
} as const;

describe('structureGeometry', () => {
  it.each(STRUCTURE_KINDS.map((k) => [k]))('%s: bütçe içinde, renkli, normalli, sonlu', (kind) => {
    const g = buildStructureGeometry(kind);
    expect(triangleCount(g)).toBeGreaterThan(20);
    expect(triangleCount(g)).toBeLessThanOrEqual(BUDGET[kind]);
    const position = g.getAttribute('position');
    expect(g.getAttribute('color').count).toBe(position.count);
    expect(g.getAttribute('normal').count).toBe(position.count);
    for (let i = 0; i < position.array.length; i++) {
      expect(Number.isFinite(position.array[i])).toBe(true);
    }
    g.dispose();
  });

  it.each(STRUCTURE_KINDS.filter((k) => !isPiece(k)).map((k) => [k]))(
    '%s: zemine gömülen etek var (y < 0) ve yapı zeminden yükselir; ayak izi yarıçapa yakın',
    (kind) => {
      const g = buildStructureGeometry(kind);
      const box = g.boundingBox!;
      expect(box.min.y).toBeLessThan(-0.3); // etek
      expect(box.max.y).toBeGreaterThan(0.3);
      const radius = PLACEMENT.kinds[kind].radius;
      // Yarıçap çarpışma/aralık kuralı içindir; görsel ayak izi en çok %20 taşabilir.
      expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(radius * 1.2);
      expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual(radius * 1.2);
      g.dispose();
    },
  );

  it.each(PIECE_KINDS.map((k) => [k]))(
    '%s: modüler parça ızgaraya sığar (yarıçap içinde), plaka ya da duvar yerden yükselir',
    (kind) => {
      const g = buildStructureGeometry(kind);
      const box = g.boundingBox!;
      const radius = PLACEMENT.kinds[kind].radius;
      expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(radius);
      expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual(radius);
      expect(box.max.y).toBeGreaterThan(0.15);
      if (kind === 'foundation') expect(box.min.y).toBeLessThan(-1); // etek yamaçta boşluğu kapatır
      g.dispose();
    },
  );

  it('açık kapı kanadı menteşe yanında öne (+Z) açılır, kapalısı boşluğu kapatır', () => {
    const closed = buildStructureGeometry('door').boundingBox!;
    const open = buildOpenDoorGeometry().boundingBox!;
    expect(closed.max.z - closed.min.z).toBeLessThan(0.2);
    expect(open.max.z).toBeGreaterThan(0.9);
    expect(open.max.x - open.min.x).toBeLessThan(0.2);
  });

  it('sundurmanın açık yüzü +Z: çatı ön (+Z) kenarda arkadan yüksektir', () => {
    const g = buildStructureGeometry('lean_to');
    const p = g.getAttribute('position');
    let frontTop = -Infinity;
    let backTop = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (z > 0.5) frontTop = Math.max(frontTop, p.getY(i));
      if (z < -0.5) backTop = Math.max(backTop, p.getY(i));
    }
    expect(frontTop).toBeGreaterThan(backTop);
    g.dispose();
  });

  it('alev: bütçe içinde, zeminin üstünde, renkli', () => {
    const g = buildFlameGeometry();
    expect(triangleCount(g)).toBeLessThanOrEqual(BUDGET.flame);
    expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(0);
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    g.dispose();
  });

  it('deterministik: aynı tür aynı köşeleri verir', () => {
    const a = buildStructureGeometry('campfire');
    const b = buildStructureGeometry('campfire');
    expect(Array.from(a.getAttribute('position').array)).toEqual(
      Array.from(b.getAttribute('position').array),
    );
    a.dispose();
    b.dispose();
  });
});
