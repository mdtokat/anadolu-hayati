import { describe, expect, it } from 'vitest';
import { PIECES, PIECES_II, VERTICAL_SCALE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory } from '../src/items/Inventory';
import { PlacementController } from '../src/placement/PlacementController';
import {
  STOREY,
  floorTopAt,
  foundationVariant,
  isPieceKind,
  pieceDistance,
  pieceRotation,
  pieceVariantKey,
  resolvePiece,
  stairLayout,
  type PiecePose,
} from '../src/placement/pieces';
import { pieceShelterAt } from '../src/placement/pieceShelter';
import type { PlaceContext } from '../src/placement/placeRules';
import { pieceColliderBoxes, solidBoxes } from '../src/placement/structureShapes';
import { structureInView } from '../src/placement/structureFocus';
import { StructureSet } from '../src/placement/structures';
import { aimPrompt } from '../src/placement/promptText';

const GROUND = 100 / VERTICAL_SCALE;
/** İlk taban zeminle hizalı (en yüksek örnek − floorSink). */
const FLOOR_Y = GROUND - PIECES.floorSink;
/** Bir üst kat tabanının yüksekliği. */
const UP = FLOOR_Y + STOREY;
const SLAB = PIECES.slab;
const X_AXIS = 0;
const Z_AXIS = Math.PI / 2;

function context(
  structures: StructureSet,
  heightAt: (x: number, z: number) => number = () => GROUND,
): PlaceContext {
  return { heightAt, structures };
}

/** (cx, cz) hücresinin dört kenarına `y` katında duvar (`skip`: atlanacak kenarlar "N/S/W/E"). */
function walls(set: StructureSet, cx: number, cz: number, y: number, skip = ''): void {
  if (!skip.includes('N')) set.add('wall', cx, y, cz - 1, X_AXIS);
  if (!skip.includes('S')) set.add('wall', cx, y, cz + 1, X_AXIS);
  if (!skip.includes('W')) set.add('wall', cx - 1, y, cz, Z_AXIS);
  if (!skip.includes('E')) set.add('wall', cx + 1, y, cz, Z_AXIS);
}

/** (0, −2) hücresi: taban + dört duvar. */
function room(): StructureSet {
  const set = new StructureSet();
  set.add('foundation', 0, FLOOR_Y, -2, 0);
  walls(set, 0, -2, FLOOR_Y);
  return set;
}

/** Zeminde duran, kuzeye bakan, yukarı bakan oyuncu (üst katı hedefler). */
const LOOK_UP: PiecePose = { x: 0, z: 1, yaw: 0, y: FLOOR_Y + SLAB, pitch: 0.5 };

describe('çatı en üst parçadır', () => {
  /** Oda + çatı; tabanın dört kenarı ve dört köşesi dolu (tek boş destek çatı). */
  function roofed(): StructureSet {
    const set = room();
    set.add('roof', 0, UP, -2, 0);
    return set;
  }
  const onRoof: PiecePose = { x: 0, z: 0.5, yaw: 0, y: UP + SLAB, pitch: 0 };

  it('duvar, korkuluk ve yarım duvar çatının kenarına kurulamaz (on_roof)', () => {
    for (const kind of ['wall', 'railing', 'half_wall'] as const) {
      expect(resolvePiece(kind, onRoof, false, context(roofed())).check).toEqual({
        ok: false,
        reason: 'on_roof',
      });
    }
  });

  it('direk çatının köşesine kurulamaz', () => {
    const set = roofed();
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, -3],
      [1, -3],
    ] as const) {
      set.add('pillar', x, FLOOR_Y, z, 0);
    }
    expect(resolvePiece('pillar', onRoof, false, context(set)).check).toEqual({
      ok: false,
      reason: 'on_roof',
    });
  });

  it('merdiven çatıya konamaz; çatının olduğu hücreye üst kat tabanı ya da ikinci çatı konamaz', () => {
    const set = roofed();
    expect(resolvePiece('stairs', onRoof, false, context(set)).check).toEqual({
      ok: false,
      reason: 'on_roof',
    });
    // Komşu hücreler odanın duvarını paylaşır (orada üst kat tabanı serbest); çatılı hücrenin kendisi değil.
    const floor = resolvePiece('foundation', LOOK_UP, false, context(set));
    expect(floor.check.ok && floor.target.x === 0 && floor.target.z === -2).toBe(false);
    const roof = resolvePiece('roof', LOOK_UP, false, context(set));
    expect(roof.check.ok && roof.target.x === 0 && roof.target.z === -2).toBe(false);
  });

  it('eski kayıtlardaki çatı üstü duvar olduğu gibi yüklenir', () => {
    const set = roofed();
    set.add('wall', 0, UP, -3, X_AXIS);
    const loaded = new StructureSet();
    loaded.loadSave(set.toJSON());
    expect(loaded.all().filter((s) => s.kind === 'wall')).toHaveLength(5);
  });
});

describe('üst kat tabanı', () => {
  it('duvarlı hücrenin üstüne bir kat yukarıya kurulur ve eteksiz (raised) olur', () => {
    const set = room();
    const r = resolvePiece('foundation', LOOK_UP, false, context(set));
    expect(r.check.ok).toBe(true);
    expect(r.target).toMatchObject({ x: 0, z: -2 });
    expect(r.target.y).toBeCloseTo(UP);
    expect(pieceVariantKey(set, { kind: 'foundation', ...r.target })).toBe('raised');
    // Zemindeki taban varsayılan (etekli) kalır.
    expect(pieceVariantKey(set, { kind: 'foundation', x: 0, y: FLOOR_Y, z: -2 })).toBe('');
  });

  it('tek kenarda duvar yeterlidir; duvarsız ve direksiz hücreye üst kat tabanı kurulmaz', () => {
    const one = new StructureSet();
    one.add('foundation', 0, FLOOR_Y, -2, 0);
    one.add('wall', 0, FLOOR_Y, -1, X_AXIS);
    const r = resolvePiece('foundation', LOOK_UP, false, context(one));
    expect(r.check.ok).toBe(true);
    expect(r.target.y).toBeCloseTo(UP);

    const bare = new StructureSet();
    bare.add('foundation', 0, FLOOR_Y, -2, 0);
    const b = resolvePiece('foundation', LOOK_UP, false, context(bare));
    // Tek aday zemindeki dolu hücre: havada taban yok.
    expect(b.check).toEqual({ ok: false, reason: 'occupied' });
    expect(b.target.y).toBeCloseTo(FLOOR_Y);
  });

  it('direk üst kat tabanını ve çatıyı taşır', () => {
    const set = new StructureSet();
    set.add('foundation', 0, FLOOR_Y, -2, 0);
    set.add('pillar', 1, FLOOR_Y, -1, 0);
    const floor = resolvePiece('foundation', LOOK_UP, false, context(set));
    expect(floor.check.ok).toBe(true);
    expect(floor.target.y).toBeCloseTo(UP);
    const roof = resolvePiece('roof', { ...LOOK_UP, pitch: 0.6 }, false, context(set));
    expect(roof.check.ok).toBe(true);
    expect(roof.target.y).toBeCloseTo(UP);
  });

  it('desteklenen üst tabandan bir hücre balkon çıkıntısı serbest, ikinci hücre değil', () => {
    const set = room();
    set.add('foundation', 0, UP, -2, 0);
    // (0, −4) odanın kuzey duvarını paylaşır: kendi desteği var.
    set.add('foundation', 0, UP, -4, 0);
    const upper: PiecePose = { x: 0, z: -3, yaw: 0, y: UP + SLAB, pitch: -0.3 };
    const balcony = resolvePiece('foundation', upper, false, context(set));
    expect(balcony.check.ok).toBe(true);
    expect(balcony.target).toMatchObject({ x: 0, z: -6 });
    expect(balcony.target.y).toBeCloseTo(UP);
    expect(foundationVariant(set, 0, UP, -6).raised).toBe(true);

    set.add('foundation', 0, UP, -6, 0);
    const further = resolvePiece('foundation', { ...upper, z: -5 }, false, context(set));
    // (0, −8): desteğe iki hücre; yalnızca zemin tabanı önerilebilir.
    if (further.target.z === -8) expect(further.target.y).toBeCloseTo(FLOOR_Y);
    expect(further.check.ok && Math.abs(further.target.y - UP) < 0.01).toBe(false);
  });

  it('zemin tabanı komşu üst kat tabanının yüksekliğini almaz', () => {
    const set = room();
    set.add('foundation', 0, UP, -4, 0);
    // (0, −4)'ün güneyindeki zemin hücresi değil, batısındaki (−2, −4) zemin hücresine bak.
    const pose: PiecePose = { x: -2, z: -1, yaw: 0, y: GROUND, pitch: -0.5 };
    const r = resolvePiece('foundation', pose, false, context(set));
    expect(r.target).toMatchObject({ x: -2, z: -4 });
    expect(r.check.ok).toBe(true);
    expect(r.target.y).toBeCloseTo(FLOOR_Y);
  });
});

describe('merdiven', () => {
  /** (0, 0) ve (0, −2) tabanları: merdiven (0, 0)'dan kuzeye çıkar. */
  function pair(): StructureSet {
    const set = new StructureSet();
    set.add('foundation', 0, FLOOR_Y, 0, 0);
    set.add('foundation', 0, FLOOR_Y, -2, 0);
    return set;
  }
  const FRONT: PiecePose = { x: 0, z: 2.5, yaw: 0, y: FLOOR_Y + SLAB };

  it('bakılan yöne bir kat çıkar; iki tabanlı hücreyi kaplar, konumu ortak kenardır', () => {
    const r = resolvePiece('stairs', FRONT, false, context(pair()));
    expect(r.check).toEqual({ ok: true, y: FLOOR_Y, slopeDeg: 0 });
    expect(r.target).toMatchObject({ x: 0, z: -1, yaw: 0 });
    const layout = stairLayout(r.target);
    expect(layout.low).toEqual({ x: 0, z: 0 });
    expect(layout.high).toEqual({ x: 0, z: -2 });
  });

  it('R (flip) çıkış yönünü tersine çevirir; tek tabanda destek yok', () => {
    const r = resolvePiece('stairs', FRONT, true, context(pair()));
    expect(r.check.ok).toBe(true);
    expect(r.target.yaw).toBeCloseTo(Math.PI);
    expect(stairLayout(r.target).low).toEqual({ x: 0, z: -2 });

    const single = new StructureSet();
    single.add('foundation', 0, FLOOR_Y, 0, 0);
    expect(resolvePiece('stairs', FRONT, false, context(single)).check).toEqual({
      ok: false,
      reason: 'no_support',
    });
  });

  it('girişte duvar ya da üstünde çatı varsa kurulamaz; ikinci merdiven aynı hücreye konamaz', () => {
    const entry = pair();
    entry.add('wall', 0, FLOOR_Y, 1, X_AXIS);
    expect(resolvePiece('stairs', FRONT, false, context(entry)).check).toEqual({
      ok: false,
      reason: 'stairwell',
    });
    const roofed = pair();
    roofed.add('roof', 0, UP, -2, 0);
    expect(resolvePiece('stairs', FRONT, false, context(roofed)).check).toEqual({
      ok: false,
      reason: 'stairwell',
    });
    const twice = pair();
    twice.add('stairs', 0, FLOOR_Y, -1, 0);
    expect(resolvePiece('stairs', FRONT, false, context(twice)).check.ok).toBe(false);
  });

  it('üstündeki taban merdiven boşluklu olur: iç kenar ve çıkış açık, diğer kenarlarda korkuluk', () => {
    const set = pair();
    set.add('stairs', 0, FLOOR_Y, -1, 0);
    // Önce konsa da sonra konsa da: tabanlar merdivenden sonra eklenir, varyant dizinden hesaplanır.
    set.add('foundation', 0, UP, 0, 0);
    set.add('foundation', 0, UP, -2, 0);
    // Alt uç (0, 0): kuzey iç kenar açık (şeritsiz, 1); güney, batı, doğu korkuluk (2 + 4 + 8).
    expect(pieceVariantKey(set, { kind: 'foundation', x: 0, y: UP, z: 0 })).toBe('well14-1');
    // Üst uç (0, −2): kuzey çıkış, güney iç kenar (şeritsiz, 2) açık; batı, doğu korkuluk (4 + 8).
    expect(pieceVariantKey(set, { kind: 'foundation', x: 0, y: UP, z: -2 })).toBe('well12-2');
    // Kenarda duvar varsa korkuluk çizilmez.
    set.add('wall', -1, UP, 0, Z_AXIS);
    expect(pieceVariantKey(set, { kind: 'foundation', x: 0, y: UP, z: 0 })).toBe('well10-1');
    // Boşluklu tabanın collider'ı deliksiz kısımdır: üç kenar şeridi (iç kenar şeritsiz) + korkuluklar.
    expect(pieceColliderBoxes('foundation', 'well14-1')).toHaveLength(3 + 3);
    expect(pieceColliderBoxes('foundation', 'raised')).toHaveLength(1);
    expect(pieceColliderBoxes('foundation', '')).toEqual(solidBoxes('foundation'));
  });

  it('merdiven hücresinin üstüne çatı konamaz', () => {
    const set = pair();
    set.add('stairs', 0, FLOOR_Y, -1, 0);
    set.add('wall', -1, FLOOR_Y, 0, Z_AXIS);
    set.add('wall', -1, FLOOR_Y, -2, Z_AXIS);
    // Çatı adayları: merdiven hücreleri (geçersiz) ya da duvarın öbür yanındaki hücreler (geçerli).
    const roof = resolvePiece(
      'roof',
      { x: 0, z: 2, yaw: 0, y: FLOOR_Y, pitch: 0.7 },
      false,
      context(set),
    );
    if (roof.check.ok) expect(roof.target.x).not.toBe(0);
    else expect(roof.check.reason).toBe('stairwell');
  });

  it('merdivenin çıkışına (üst katta) duvar konamaz', () => {
    const set = pair();
    set.add('stairs', 0, FLOOR_Y, -1, 0);
    // Zemin katın kalan kenarlarını doldur (giriş ve iç kenar zaten merdivenin).
    set.add('wall', -1, FLOOR_Y, 0, Z_AXIS);
    set.add('wall', 1, FLOOR_Y, 0, Z_AXIS);
    walls(set, 0, -2, FLOOR_Y, 'S');
    // Üst katta yalnızca çıkıştaki taban; kuzey, batı, doğu kenarları dolu.
    set.add('foundation', 0, UP, -4, 0);
    walls(set, 0, -4, UP, 'S');
    const exit = resolvePiece(
      'wall',
      { x: 0, z: -6.5, yaw: Math.PI, y: UP + SLAB },
      false,
      context(set),
    );
    expect(exit.target).toMatchObject({ x: 0, z: -3 });
    expect(exit.target.y).toBeCloseTo(UP);
    expect(exit.check).toEqual({ ok: false, reason: 'stairwell' });
  });

  it('merdivenin üstündeki boşluklu tabana küçük yapı oturmaz', () => {
    const set = pair();
    set.add('stairs', 0, FLOOR_Y, -1, 0);
    set.add('foundation', 0, UP, 0, 0);
    // Zemin katın üst yüzü seçilir (boşluk sayılmaz).
    expect(floorTopAt(set, 0, 0)).toBeCloseTo(FLOOR_Y + SLAB);
  });
});

describe('giriş basamağı', () => {
  /** Üst yüzü zeminden `rise` yüksekte taban (0, −2). */
  function raisedFoundation(rise: number): StructureSet {
    const set = new StructureSet();
    set.add('foundation', 0, GROUND + rise - SLAB, -2, 0);
    return set;
  }
  const SOUTH_OF: PiecePose = { x: 0, z: 2, yaw: 0, y: GROUND };

  it('tabanın kenarına dışarıdan kurulur (yerel +Z dışarı)', () => {
    const r = resolvePiece('entry_step', SOUTH_OF, false, context(raisedFoundation(1)));
    expect(r.check.ok).toBe(true);
    expect(r.target).toMatchObject({ x: 0, z: -1, yaw: 0 });
  });

  it('dış ucu zemine yetişmiyorsa (çok yüksek taban) kurulamaz', () => {
    const r = resolvePiece('entry_step', SOUTH_OF, false, context(raisedFoundation(2)));
    expect(r.check).toEqual({ ok: false, reason: 'too_steep' });
  });

  it('komşu hücrede taban olan kenara konmaz; aynı dış hücreye ikinci basamak konmaz', () => {
    const set = raisedFoundation(1);
    set.add('foundation', 0, GROUND + 1 - SLAB, 0, 0);
    const r = resolvePiece('entry_step', SOUTH_OF, false, context(set));
    if (r.check.ok) expect(r.target.z).not.toBe(-1);
    const single = raisedFoundation(1);
    single.add('entry_step', 0, GROUND + 1 - SLAB, -1, 0);
    const again = resolvePiece('entry_step', SOUTH_OF, false, context(single));
    expect(again.check.ok && again.target.z === -1).toBe(false);
  });
});

describe('beşik çatı ve alın duvarı', () => {
  /** (0, −2) ve (0, −4): taban + çevre duvarları (ortada duvar yok). */
  function longRoom(): StructureSet {
    const set = new StructureSet();
    set.add('foundation', 0, FLOOR_Y, -2, 0);
    set.add('foundation', 0, FLOOR_Y, -4, 0);
    walls(set, 0, -2, FLOOR_Y, 'N');
    walls(set, 0, -4, FLOOR_Y, 'S');
    return set;
  }
  const UNDER: PiecePose = { x: 0, z: 0.5, yaw: 0, y: FLOOR_Y + SLAB, pitch: 0.6 };

  it('iki hücreye oturur; mahya bakışa dik, R ile paralel', () => {
    const r = resolvePiece('gable_roof', UNDER, false, context(longRoom()));
    expect(r.check.ok).toBe(true);
    expect(r.target).toMatchObject({ x: 0, z: -3, yaw: 0 });
    expect(r.target.y).toBeCloseTo(UP);
    const flipped = resolvePiece('gable_roof', UNDER, true, context(longRoom()));
    expect(flipped.check.ok).toBe(true);
    expect(flipped.target.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('beşik çatının üstüne ve altındaki hücrelere başka çatı/taban kurulamaz', () => {
    const set = longRoom();
    set.add('gable_roof', 0, UP, -3, 0);
    for (const kind of ['roof', 'foundation', 'gable_roof'] as const) {
      const r = resolvePiece(kind, UNDER, false, context(set));
      const covered =
        r.target.x === 0 && (r.target.z === -2 || r.target.z === -4 || r.target.z === -3);
      expect(r.check.ok && covered).toBe(false);
    }
  });

  it('alın duvarı sıranın açık uçlarına; dolunca occupied', () => {
    const set = longRoom();
    set.add('gable_roof', 0, UP, -3, 0);
    // Batıya bakan oyuncu: bakış noktası (1, −3), doğu ucu.
    const pose: PiecePose = { x: 4.5, z: -3, yaw: Math.PI / 2, y: FLOOR_Y + SLAB, pitch: 0.6 };
    const r = resolvePiece('gable_wall', pose, false, context(set));
    expect(r.check.ok).toBe(true);
    expect(r.target).toMatchObject({ x: 1, z: -3 });
    expect(r.target.yaw).toBeCloseTo(Math.PI / 2);
    set.add('gable_wall', 1, UP, -3, Math.PI / 2);
    set.add('gable_wall', -1, UP, -3, Math.PI / 2);
    expect(resolvePiece('gable_wall', pose, false, context(set)).check).toEqual({
      ok: false,
      reason: 'occupied',
    });
  });

  it('beşik çatılı kapalı oda kulübedir; collider yüzleri eğiktir', () => {
    const set = longRoom();
    set.add('gable_roof', 0, UP, -3, 0);
    expect(pieceShelterAt(set, 0, FLOOR_Y + SLAB, -2)).toBe('hut');
    const slopes = pieceColliderBoxes('gable_roof', '');
    expect(slopes).toHaveLength(2);
    for (const b of slopes) expect(Math.abs(b.pitch ?? 0)).toBeGreaterThan(0.3);
  });
});

describe('korkuluk ve yarım duvar', () => {
  it('taban kenarına duvar yuvasında oturur; duvarla aynı kenara konamaz', () => {
    const set = new StructureSet();
    set.add('foundation', 0, FLOOR_Y, -2, 0);
    const pose: PiecePose = { x: 0, z: 1, yaw: 0, y: FLOOR_Y + SLAB };
    const r = resolvePiece('railing', pose, false, context(set));
    expect(r.check.ok).toBe(true);
    set.add('railing', r.target.x, r.target.y, r.target.z, r.target.yaw);
    const wall = resolvePiece('wall', pose, false, context(set));
    expect(wall.target.x === r.target.x && wall.target.z === r.target.z).toBe(false);
  });

  it('yarım duvar barınakta açıklıktır', () => {
    const set = room();
    set.add('roof', 0, UP, -2, 0);
    expect(pieceShelterAt(set, 0, FLOOR_Y + SLAB, -2)).toBe('hut');
    const open = room();
    open.add('roof', 0, UP, -2, 0);
    // Kuzey duvar yerine yarım duvar: tek açıklık serbest.
    const north = open.all().find((s) => s.kind === 'wall' && s.z === -3);
    open.remove(north!.id);
    open.add('half_wall', 0, FLOOR_Y, -3, X_AXIS);
    expect(pieceShelterAt(open, 0, FLOOR_Y + SLAB, -2)).toBe('hut');
    // Güney duvar yerine korkuluk: ikinci açıklık → yalnızca örtülü.
    const south = open.all().find((s) => s.kind === 'wall' && s.z === -1);
    open.remove(south!.id);
    open.add('railing', 0, FLOOR_Y, -1, X_AXIS);
    expect(pieceShelterAt(open, 0, FLOOR_Y + SLAB, -2)).toBe('lean_to');
  });
});

describe('iki katlı ev', () => {
  /**
   * 2 × 4 hücre (x ∈ {0, 2}, z ∈ {−2 … −8}); zemin ve üst kat çevresi duvarlı, güneyde kapılı duvar + kapı; merdiven
   * (2, −4) → (2, −6) kuzeye çıkar; üst katın üstü düz çatı.
   */
  function house(): { set: StructureSet; doorId: number } {
    const set = new StructureSet();
    const xs = [0, 2];
    const zs = [-2, -4, -6, -8];
    for (const level of [FLOOR_Y, UP]) {
      for (const x of xs) for (const z of zs) set.add('foundation', x, level, z, 0);
      for (const x of xs) {
        set.add('wall', x, level, -9, X_AXIS);
        if (!(level === FLOOR_Y && x === 0)) set.add('wall', x, level, -1, X_AXIS);
      }
      for (const z of zs) {
        set.add('wall', -1, level, z, Z_AXIS);
        set.add('wall', 3, level, z, Z_AXIS);
      }
    }
    set.add('doorway', 0, FLOOR_Y, -1, X_AXIS);
    const door = set.add('door', 0, FLOOR_Y, -1, X_AXIS);
    set.add('stairs', 2, FLOOR_Y, -5, 0);
    for (const x of xs) for (const z of zs) set.add('roof', x, UP + STOREY, z, 0);
    return { set, doorId: door.id };
  }

  it('kapalı iki katlı ev her iki katta ve merdivende kulübe barınağı verir', () => {
    const { set } = house();
    expect(pieceShelterAt(set, 0, FLOOR_Y + SLAB, -2)).toBe('hut');
    expect(pieceShelterAt(set, 0, UP + SLAB, -8)).toBe('hut');
    // Merdivenin ortasında (ayak iki kat arasında).
    expect(pieceShelterAt(set, 2, FLOOR_Y + SLAB + STOREY / 2, -5)).toBe('hut');
  });

  it('merdiven boşluğu iki katı tek oda yapar: açıklıklar katlar arası toplanır', () => {
    const { set, doorId } = house();
    set.toggleDoor(doorId); // zemin katta tek açıklık
    expect(pieceShelterAt(set, 0, UP + SLAB, -8)).toBe('hut');
    // Üst katta bir duvar yerine yarım duvar: ikinci açıklık → yalnızca örtülü.
    const wall = set.all().find((s) => s.kind === 'wall' && s.y === UP && s.x === 3 && s.z === -8);
    set.remove(wall!.id);
    set.add('half_wall', 3, UP, -8, Z_AXIS);
    expect(pieceShelterAt(set, 0, FLOOR_Y + SLAB, -2)).toBe('lean_to');
  });

  it('kat seçimi: küçük yapı oyuncunun katındaki tabana oturur', () => {
    const { set } = house();
    expect(floorTopAt(set, 0, -4, FLOOR_Y + SLAB)).toBeCloseTo(FLOOR_Y + SLAB);
    expect(floorTopAt(set, 0, -4, UP + SLAB)).toBeCloseTo(UP + SLAB);
    expect(floorTopAt(set, 0, -4)).toBeCloseTo(UP + SLAB);
  });
});

describe('odak, uzaklık, R ve ipucu', () => {
  it('yeni parçalar odakta seçilir; merdivenin yanındaki duvar merdivene yeğlenir', () => {
    const set = new StructureSet();
    set.add('foundation', 0, FLOOR_Y, 0, 0);
    set.add('foundation', 0, FLOOR_Y, -2, 0);
    const stairs = set.add('stairs', 0, FLOOR_Y, -1, 0);
    const rules = { reach: 2.5, viewConeDeg: 50 };
    expect(structureInView(set, { x: 0, z: 2.5, yaw: 0 }, rules)?.id).toBe(stairs.id);
    // Merdivende duran oyuncu çaprazdaki yan duvara bakıyor.
    const wall = set.add('wall', 1, FLOOR_Y, -2, Z_AXIS);
    expect(structureInView(set, { x: 0, z: -0.5, yaw: 0 }, rules)?.id).toBe(wall.id);
  });

  it('parça olmayan yapılar merdivenin ve basamağın ayak izine yaklaşamaz; beşik çatı engel değildir', () => {
    const set = new StructureSet();
    const stairs = set.add('stairs', 0, FLOOR_Y, -1, 0);
    expect(pieceDistance(stairs, 0, 0.5)).toBe(0);
    expect(pieceDistance(stairs, 0, 2)).toBeCloseTo(1);
    const step = set.add('entry_step', 0, FLOOR_Y, 1, 0);
    expect(pieceDistance(step, 0, 1 + PIECES_II.entryStep.depth + 0.5)).toBeCloseTo(0.5);
    const gable = set.add('gable_roof', 4, UP, -3, 0);
    expect(pieceDistance(gable, 4, -3)).toBe(Number.POSITIVE_INFINITY);
  });

  it('R: merdivende yön, beşik çatıda mahya, direkte yok; ipucu buna göre', () => {
    expect(pieceRotation('stairs')).toBe('direction');
    expect(pieceRotation('gable_roof')).toBe('ridge');
    expect(pieceRotation('pillar')).toBe('none');
    expect(pieceRotation('railing')).toBe('face');
    for (const kind of ['stairs', 'pillar', 'gable_wall'] as const)
      expect(isPieceKind(kind)).toBe(true);
    const ghost = { kind: 'stairs' as const, x: 0, y: 0, z: 0, yaw: 0, valid: true, reason: null };
    expect(aimPrompt(ghost)).toContain('R: yönü çevir');
    expect(aimPrompt({ ...ghost, kind: 'gable_roof' })).toContain('R: mahyayı çevir');
    expect(aimPrompt({ ...ghost, kind: 'pillar' })).not.toContain('R:');
    expect(aimPrompt({ ...ghost, valid: false, reason: 'on_roof' })).toBe(
      'Çatının üstüne bir şey kurulamaz',
    );
  });

  it('PlacementController: merdiven art arda kurulur, R yönünü çevirir; direkte R işlevsiz', () => {
    const structures = new StructureSet();
    structures.add('foundation', 0, FLOOR_Y, 0, 0);
    structures.add('foundation', 0, FLOOR_Y, -2, 0);
    const inventory = new Inventory();
    inventory.add('stairs', 1);
    inventory.add('pillar', 1);
    const controller = new PlacementController({
      events: new EventBus<GameEvents>(),
      inventory,
      structures,
      world: { heightAt: () => GROUND },
      isAlive: () => true,
    });
    const pose = { x: 0, z: 2.5, yaw: 0, y: FLOOR_Y + SLAB };
    expect(controller.toggle('stairs')).toBe('started');
    controller.update(pose);
    expect(controller.ghost?.yaw).toBeCloseTo(0);
    expect(controller.rotate()).toBe(true);
    expect(controller.ghost?.yaw).toBeCloseTo(Math.PI);
    controller.rotate();
    const result = controller.confirm();
    expect(result.ok).toBe(true);
    expect(structures.all().some((s) => s.kind === 'stairs')).toBe(true);
    expect(controller.toggle('pillar')).toBe('started');
    controller.update(pose);
    expect(controller.rotate()).toBe(false);
  });
});
