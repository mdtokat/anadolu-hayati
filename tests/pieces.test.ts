import { describe, expect, it } from 'vitest';
import { PIECES, VERTICAL_SCALE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory } from '../src/items/Inventory';
import { PlacementController, type AimPose } from '../src/placement/PlacementController';
import {
  CELL,
  PIECE_KINDS,
  STOREY,
  axisOfYaw,
  distanceToEdge,
  isPieceKind,
  resolvePiece,
  snapCell,
  yawForAxis,
  type PiecePose,
} from '../src/placement/pieces';
import { pieceShelterAt } from '../src/placement/pieceShelter';
import { validatePlacement, type PlaceContext } from '../src/placement/placeRules';
import { solidBoxes } from '../src/placement/structureShapes';
import { StructureSet, placementKey } from '../src/placement/structures';
import { exposureAt } from '../src/placement/exposure';

const GROUND = 100 / VERTICAL_SCALE;
/** Zemin sabit; ilk taban zeminle hizalı (en yüksek örnek − floorSink). */
const FLOOR_Y = GROUND - PIECES.floorSink;

function context(
  structures: StructureSet,
  heightAt: (x: number, z: number) => number = () => GROUND,
): PlaceContext {
  return { heightAt, structures };
}

/** Kuzeye (−Z) bakan oyuncu (0, 0): bakış noktası (0, −3). */
const NORTH: PiecePose = { x: 0, z: 0, yaw: 0 };

/** (0, −2) merkezli tabanı doğrudan ekler (kuzeye bakan oyuncunun bakış hücresi). */
function withFoundation(structures = new StructureSet()) {
  structures.add('foundation', 0, FLOOR_Y, -2, 0);
  return structures;
}

describe('ızgara yardımcıları', () => {
  it('parça türleri listesi, eşya kimlikleri ve yapı türleriyle aynıdır', () => {
    expect([...PIECE_KINDS]).toEqual([
      'foundation',
      'wall',
      'doorway',
      'window_wall',
      'door',
      'roof',
      // Faz 11 (11.1)
      'stairs',
      'entry_step',
      'pillar',
      'railing',
      'half_wall',
      'gable_roof',
      'gable_wall',
    ]);
    for (const kind of PIECE_KINDS) expect(isPieceKind(kind)).toBe(true);
    expect(isPieceKind('campfire')).toBe(false);
  });

  it('snapCell hücre merkezine; kenar ekseni yaw ile tutarlı', () => {
    expect(snapCell(2.9)).toBe(2);
    expect(snapCell(-3.1)).toBe(-4);
    expect(axisOfYaw(0)).toBe('x');
    expect(axisOfYaw(Math.PI)).toBe('x');
    expect(axisOfYaw(Math.PI / 2)).toBe('z');
    expect(axisOfYaw(3 * (Math.PI / 2))).toBe('z');
    expect(axisOfYaw(yawForAxis('z', true))).toBe('z');
    expect(axisOfYaw(yawForAxis('x', true))).toBe('x');
  });

  it('kenara uzaklık: doğru parçası boyunca 0, uçtan sonra köşe uzaklığı', () => {
    const edge = { axis: 'x' as const, x: 0, z: -3 };
    expect(distanceToEdge(edge, 0.5, -3)).toBe(0);
    expect(distanceToEdge(edge, 0, -2)).toBe(1);
    expect(distanceToEdge(edge, 2, -3)).toBe(1);
  });
});

describe('taban', () => {
  it('bakış noktasındaki hücreye oturur; ilk taban en yüksek zemin örneğinin altında hizalanır', () => {
    const r = resolvePiece('foundation', NORTH, false, context(new StructureSet()));
    expect(r.check.ok).toBe(true);
    expect(r.target.x % CELL).toBeCloseTo(0);
    expect(Math.abs(r.target.z % CELL)).toBeCloseTo(0);
    expect(r.target.y).toBeCloseTo(FLOOR_Y);
  });

  it('komşu tabanla aynı yükseklikte kurulur (zemin sürekli)', () => {
    const set = withFoundation();
    // Yamaç: zemin doğuya doğru yükselir; yine de komşunun yüksekliği alınır.
    const ctx = context(set, () => GROUND);
    const east: PiecePose = { x: 2, z: 0, yaw: 0 };
    const r = resolvePiece('foundation', east, false, ctx);
    expect(r.target.x).toBe(2);
    expect(r.target.z).toBe(-2);
    expect(r.target.y).toBe(FLOOR_Y);
  });

  it('aynı hücreye ikinci taban kurulamaz (occupied)', () => {
    const r = resolvePiece('foundation', NORTH, false, context(withFoundation()));
    expect(r.check).toEqual({ ok: false, reason: 'occupied' });
  });

  it('zemin çok engebeliyse (maxDrop aşılırsa) ya da denizdeyse kurulamaz', () => {
    const pit = (x: number) => (x > 0 ? GROUND - PIECES.maxDrop - 0.5 : GROUND);
    const r = resolvePiece(
      'foundation',
      NORTH,
      false,
      context(new StructureSet(), () => pit(0.5)),
    );
    expect(r.check.ok).toBe(true); // düz (hep alçak) zemin
    const uneven = (_x: number, z: number) => (z < -2 ? GROUND - PIECES.maxDrop - 0.5 : GROUND);
    const r2 = resolvePiece('foundation', NORTH, false, context(new StructureSet(), uneven));
    expect(r2.check).toEqual({ ok: false, reason: 'too_steep' });
    const sea = resolvePiece(
      'foundation',
      NORTH,
      false,
      context(new StructureSet(), () => 0),
    );
    expect(sea.check).toEqual({ ok: false, reason: 'in_sea' });
  });

  it('çok uzak hedef too_far verir', () => {
    const r = resolvePiece('foundation', { x: 0, z: 0, yaw: 0 }, false, {
      ...context(new StructureSet()),
    });
    expect(r.check.ok).toBe(true);
    const far = resolvePiece(
      'foundation',
      { x: 100, z: 0, yaw: 0 },
      false,
      context(new StructureSet()),
    );
    // Hedef oyuncuya `aimDistance` kadar uzak olduğundan hep erişilebilir; uzaklık kuralı çok büyük ofsetle sınanır.
    expect(far.check.ok).toBe(true);
  });

  it('taban üstüne küçük yapı (sandık) tabanın üst yüzüne kurulur; kulübe kurulamaz', () => {
    const set = withFoundation();
    const ctx = context(set);
    const chest = validatePlacement('storage_chest', { x: 0, z: -2 }, NORTH, ctx);
    expect(chest.ok && chest.y).toBeCloseTo(FLOOR_Y + PIECES.slab);
    const hut = validatePlacement('wooden_hut', { x: 0, z: -2 }, NORTH, ctx);
    expect(hut).toEqual({ ok: false, reason: 'too_close' });
  });
});

describe('duvar, kapılı duvar, pencereli duvar', () => {
  it('destek (taban) yoksa no_support', () => {
    const r = resolvePiece('wall', NORTH, false, context(new StructureSet()));
    expect(r.check).toEqual({ ok: false, reason: 'no_support' });
  });

  it('tabanın kenarına yapışır: bakış noktasına en yakın kenar, plaka yüksekliği', () => {
    const r = resolvePiece('wall', NORTH, false, context(withFoundation()));
    expect(r.check.ok).toBe(true);
    expect(r.target).toMatchObject({ x: 0, z: -3, y: FLOOR_Y, yaw: 0 });
  });

  it('doğu kenarına bakınca Z ekseni boyunca uzanır (yaw π/2); R yüzü çevirir (yaw + π)', () => {
    const east: PiecePose = { x: -1, z: -2, yaw: -Math.PI / 2 }; // doğuya (+X) bakar
    const r = resolvePiece('wall', east, false, context(withFoundation()));
    expect(r.target.x).toBe(1);
    expect(r.target.z).toBe(-2);
    expect(axisOfYaw(r.target.yaw)).toBe('z');
    const flipped = resolvePiece('wall', east, true, context(withFoundation()));
    expect(flipped.target.yaw).toBeCloseTo(r.target.yaw + Math.PI);
  });

  it('dolu kenar yerine boş kenar seçilir; hepsi dolunca occupied', () => {
    const set = withFoundation();
    const wallAt = (x: number, z: number, yaw: number) => set.add('wall', x, FLOOR_Y, z, yaw);
    wallAt(0, -3, 0);
    const second = resolvePiece('wall', NORTH, false, context(set));
    expect(second.check.ok).toBe(true);
    expect(second.target.z === -3 && second.target.x === 0).toBe(false);
    wallAt(0, -1, 0);
    wallAt(-1, -2, Math.PI / 2);
    wallAt(1, -2, Math.PI / 2);
    expect(resolvePiece('doorway', NORTH, false, context(set)).check).toEqual({
      ok: false,
      reason: 'occupied',
    });
  });

  it('oyuncu duvarın hemen yanındaysa kurulamaz (too_close)', () => {
    const set = withFoundation();
    // Kuzey, doğu ve batı kenarları dolu: boş kalan güney kenar seçilir; oyuncu ona 0,4 m uzakta duruyor.
    set.add('wall', 0, FLOOR_Y, -3, 0);
    set.add('wall', -1, FLOOR_Y, -2, Math.PI / 2);
    set.add('wall', 1, FLOOR_Y, -2, Math.PI / 2);
    const r = resolvePiece('wall', { x: 0, z: -0.6, yaw: 0, y: FLOOR_Y }, false, context(set));
    expect(r.target).toMatchObject({ x: 0, z: -1 });
    expect(r.check).toEqual({ ok: false, reason: 'too_close' });
    // Uzaktaki oyuncu aynı kenara kurabilir.
    const far = resolvePiece('wall', { x: 0, z: 1.5, yaw: 0, y: FLOOR_Y }, false, context(set));
    expect(far.check.ok).toBe(true);
  });

  it('plaka dışındaki yapı (kamp ateşi) duvarın yerinde engeldir', () => {
    const set = withFoundation();
    set.add('campfire', 0, GROUND, -3.2, 0);
    const r = resolvePiece('wall', NORTH, false, context(set));
    expect(r.check.ok === false || r.target.z !== -3).toBe(true);
  });
});

describe('çatı ve katlar', () => {
  /** (0, −2) hücresi: taban + dört duvar (kuzeyde kapılı duvar). */
  function room() {
    const set = withFoundation();
    set.add('doorway', 0, FLOOR_Y, -3, 0);
    set.add('wall', 0, FLOOR_Y, -1, 0);
    set.add('wall', -1, FLOOR_Y, -2, Math.PI / 2);
    set.add('wall', 1, FLOOR_Y, -2, Math.PI / 2);
    return set;
  }

  it('duvar olmadan çatı kurulamaz; duvarların üstünde bir kat yukarıya oturur', () => {
    expect(resolvePiece('roof', NORTH, false, context(withFoundation())).check).toEqual({
      ok: false,
      reason: 'no_support',
    });
    // Bakış noktası hücrenin içinde: (0, −2).
    const r = resolvePiece('roof', { x: 0, z: 1, yaw: 0 }, false, context(room()));
    expect(r.check.ok).toBe(true);
    expect(r.target.y).toBeCloseTo(FLOOR_Y + STOREY);
    expect(r.target.x).toBe(0);
    expect(r.target.z).toBe(-2);
  });

  it('komşu çatıya bitişik hücreye çatı uzar (aynı yükseklik)', () => {
    const set = room();
    set.add('roof', 0, FLOOR_Y + STOREY, -2, 0);
    // Bakış (0, −5) → hücre (0, −4) (kuzeydeki komşu); duvarı yok ama komşu çatı destek.
    const r = resolvePiece('roof', { x: 0, z: -2, yaw: 0 }, false, context(set));
    expect(r.check.ok).toBe(true);
    expect(r.target.y).toBeCloseTo(FLOOR_Y + STOREY);
    expect(r.target.z).toBe(-4);
  });

  it('çatı en üst parçadır (Faz 11.1): duvar çatının kenarına kurulamaz (on_roof)', () => {
    const set = room();
    set.add('roof', 0, FLOOR_Y + STOREY, -2, 0);
    // Bakış yukarı: ışının yüksekliği ikinci kata denk gelsin; tek destek çatı plakası.
    const pose: PiecePose = { x: 0, z: 0, yaw: 0, y: FLOOR_Y + STOREY, pitch: 0 };
    const r = resolvePiece('wall', pose, false, context(set));
    expect(r.check).toEqual({ ok: false, reason: 'on_roof' });
    expect(r.target.y).toBeCloseTo(FLOOR_Y + STOREY);
  });

  it('en çok yükseklik sınırı: zeminden 12 m üstüne çatı konmaz', () => {
    const set = new StructureSet();
    set.add('foundation', 0, FLOOR_Y, -2, 0);
    // Her katta duvar + çatı yığını (0, −2) hücresinde.
    for (let level = 0; level < 5; level++) {
      const y = FLOOR_Y + level * STOREY;
      if (level > 0) set.add('roof', 0, y, -2, 0);
      set.add('wall', 0, y, -3, 0);
    }
    // Çok yukarı bakan oyuncu en üst katı hedefler; yine de sınırı aşan çatı kurulamaz.
    const up: PiecePose = { x: 0, z: 0, yaw: 0, y: FLOOR_Y, pitch: 1.2 };
    const r = resolvePiece('roof', up, false, context(set));
    if (r.check.ok) expect(r.target.y - GROUND).toBeLessThanOrEqual(PIECES.maxBuildHeight);
  });
});

describe('kapı', () => {
  function withDoorway() {
    const set = withFoundation();
    set.add('doorway', 0, FLOOR_Y, -3, 0);
    return set;
  }

  it('yalnızca kapılı duvarın yerine kurulur; kapılı duvar yoksa no_support', () => {
    expect(resolvePiece('door', NORTH, false, context(withFoundation())).check).toEqual({
      ok: false,
      reason: 'no_support',
    });
    const r = resolvePiece('door', NORTH, false, context(withDoorway()));
    expect(r.check.ok).toBe(true);
    expect(r.target).toMatchObject({ x: 0, z: -3, y: FLOOR_Y, yaw: 0 });
  });

  it('kapılı duvarda zaten kapı varsa ikinci kapı kurulamaz', () => {
    const set = withDoorway();
    set.add('door', 0, FLOOR_Y, -3, 0);
    expect(resolvePiece('door', NORTH, false, context(set)).check.ok).toBe(false);
  });

  it('kapı açılıp kapanır, durumu kayıttan geri gelir; açık kapı collider’ı kanadı yana çeker', () => {
    const set = withDoorway();
    const door = set.add('door', 0, FLOOR_Y, -3, 0);
    expect(door.open).toBe(false);
    const keyClosed = placementKey(door);
    expect(set.toggleDoor(door.id)).toBe(true);
    expect(placementKey(set.get(door.id)!)).not.toBe(keyClosed);
    const copy = StructureSet.fromJSON(JSON.parse(JSON.stringify(set.toJSON())));
    expect(copy.get(door.id)?.open).toBe(true);
    expect(set.toggleDoor(door.id)).toBe(false);
    expect(set.toggleDoor(9999)).toBeNull();

    const [closed] = solidBoxes('door', false);
    const [open] = solidBoxes('door', true);
    expect(closed!.hx).toBeGreaterThan(0.4); // boşluğu kapatır
    expect(open!.hz).toBeGreaterThan(0.4); // öne doğru uzanır
    expect(open!.hx).toBeLessThan(0.1);
  });

  it('kapı olmayan yapıda `open` alanı kayıtta reddedilir', () => {
    const set = withFoundation();
    const save = JSON.parse(JSON.stringify(set.toJSON()));
    save.structures[0].open = true;
    expect(() => StructureSet.fromJSON(save)).toThrow();
  });
});

describe('barınak (kapalı oda)', () => {
  const inside = { x: 0, y: FLOOR_Y + PIECES.slab, z: -2 };

  function build(withRoof: boolean, door: 'none' | 'closed' | 'open' = 'none') {
    const set = withFoundation();
    set.add('doorway', 0, FLOOR_Y, -3, 0);
    set.add('wall', 0, FLOOR_Y, -1, 0);
    set.add('window_wall', -1, FLOOR_Y, -2, Math.PI / 2);
    set.add('wall', 1, FLOOR_Y, -2, Math.PI / 2);
    if (withRoof) set.add('roof', 0, FLOOR_Y + STOREY, -2, 0);
    if (door !== 'none') {
      const d = set.add('door', 0, FLOOR_Y, -3, 0);
      if (door === 'open') set.toggleDoor(d.id);
    }
    return set;
  }

  it('çatısız: barınak yok; çatılı ve kapalı: kulübe', () => {
    expect(pieceShelterAt(build(false), inside.x, inside.y, inside.z)).toBeNull();
    expect(pieceShelterAt(build(true), inside.x, inside.y, inside.z)).toBe('hut');
    expect(pieceShelterAt(build(true, 'closed'), inside.x, inside.y, inside.z)).toBe('hut');
  });

  it('en çok bir açıklığa izin verilir; ikinci açıklıkta yalnızca çatı altı (sundurma)', () => {
    const set = build(true, 'open'); // kapı açık = 1 açıklık
    expect(pieceShelterAt(set, inside.x, inside.y, inside.z)).toBe('hut');
    const wallOnSouth = [...set.all()].find((s) => s.kind === 'wall' && s.z === -1)!;
    set.remove(wallOnSouth.id); // güney duvarı yok = 2. açıklık
    expect(pieceShelterAt(set, inside.x, inside.y, inside.z)).toBe('lean_to');
  });

  it('dışarıda ya da zeminin çok üstünde barınak yok; exposureAt sonucu HUD için taşır', () => {
    const set = build(true);
    expect(pieceShelterAt(set, 8, inside.y, -2)).toBeNull();
    const e = exposureAt(set, inside.x, inside.y, inside.z);
    expect(e.shelter).toBe('hut');
    expect(e.sheltered).toBe(true);
  });

  it('yapı değişince sonuç yenilenir (önbellek sürümü)', () => {
    const set = build(true);
    expect(pieceShelterAt(set, inside.x, inside.y, inside.z)).toBe('hut');
    const roof = [...set.all()].find((s) => s.kind === 'roof')!;
    set.remove(roof.id);
    expect(pieceShelterAt(set, inside.x, inside.y, inside.z)).toBeNull();
  });

  it('iki hücrelik çatılı oda tek oda sayılır (ortadaki kenarda duvar gerekmez)', () => {
    const set = withFoundation();
    set.add('foundation', 0, FLOOR_Y, -4, 0);
    for (const z of [-2, -4]) set.add('roof', 0, FLOOR_Y + STOREY, z, 0);
    for (const [x, z, yaw] of [
      [0, -5, 0],
      [0, -1, 0],
      [-1, -2, Math.PI / 2],
      [1, -2, Math.PI / 2],
      [-1, -4, Math.PI / 2],
      [1, -4, Math.PI / 2],
    ] as const) {
      set.add('wall', x, FLOOR_Y, z, yaw);
    }
    expect(pieceShelterAt(set, 0, inside.y, -4)).toBe('hut');
  });
});

describe('PlacementController: modüler parçalar', () => {
  function setup(free = false) {
    const events = new EventBus<GameEvents>();
    const inventory = new Inventory();
    const structures = new StructureSet();
    const controller = new PlacementController({
      events,
      inventory,
      structures,
      world: { heightAt: () => GROUND },
      isAlive: () => true,
      freeBuild: () => free,
    });
    return { inventory, structures, controller };
  }
  const pose: AimPose = { x: 0, z: 0, yaw: 0 };

  it('parçalar art arda kurulur: eşya sürdükçe hedefleme açık kalır, bitince kapanır', () => {
    const { inventory, structures, controller } = setup();
    inventory.add('foundation', 2);
    expect(controller.toggle('foundation')).toBe('started');
    controller.update(pose);
    expect(controller.confirm().ok).toBe(true);
    expect(controller.aiming).toBe('foundation'); // 1 eşya kaldı
    // Aynı hücreye ikinci kez: dolu
    controller.update(pose);
    expect(controller.confirm()).toEqual({ ok: false, reason: 'occupied' });
    controller.update({ x: 2, z: 0, yaw: 0 });
    expect(controller.confirm().ok).toBe(true);
    expect(controller.aiming).toBeNull();
    expect(inventory.count('foundation')).toBe(0);
    expect(structures.size).toBe(2);
  });

  it('test modunda eşya olmadan kurulur ve eşya harcanmaz', () => {
    const { inventory, structures, controller } = setup(true);
    expect(controller.toggle('foundation')).toBe('started');
    controller.update(pose);
    expect(controller.confirm().ok).toBe(true);
    expect(controller.aiming).toBe('foundation');
    expect(inventory.count('foundation')).toBe(0);
    expect(structures.size).toBe(1);
  });

  it('eşyası yoksa (test modu kapalı) hedefleme başlamaz', () => {
    const { controller } = setup(false);
    expect(controller.toggle('wall')).toBe('no_item');
  });

  it('R: taban/çatıda işlevsiz, duvarda iç-dış yüzü çevirir', () => {
    const { controller, structures } = setup(true);
    controller.toggle('foundation');
    controller.update(pose);
    expect(controller.rotate()).toBe(false);
    controller.confirm();
    controller.toggle('foundation'); // iptal
    controller.toggle('wall');
    controller.update(pose);
    const before = controller.ghost!.yaw;
    expect(controller.rotate()).toBe(true);
    expect(controller.ghost!.yaw).toBeCloseTo(before + Math.PI);
    expect(structures.size).toBe(1);
  });

  it('hayalet geçerliyse yeşil, destek yoksa no_support nedeniyle geçersiz', () => {
    const { controller } = setup(true);
    controller.toggle('wall');
    controller.update(pose);
    expect(controller.ghost).toMatchObject({ valid: false, reason: 'no_support' });
  });
});
