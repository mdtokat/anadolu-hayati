import { describe, expect, it } from 'vitest';
import { FENCES, VERTICAL_SCALE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory } from '../src/items/Inventory';
import {
  distanceToFence,
  fenceAxisOf,
  fenceEnds,
  fenceVariantKey,
  fenceYawForAxis,
  parseFenceVariant,
  quantizeRise,
  resolveFence,
} from '../src/placement/fences';
import { PlacementController } from '../src/placement/PlacementController';
import type { PlaceContext } from '../src/placement/placeRules';
import { FENCE_SHAPE, fenceColliderBoxes, solidBoxes } from '../src/placement/structureShapes';
import { StructureSet } from '../src/placement/structures';

const FLAT = 100 / VERTICAL_SCALE;

function ctx(
  structures = new StructureSet(),
  heightAt: (x: number, z: number) => number = () => FLAT,
): PlaceContext {
  return { heightAt, structures };
}

/** Kuzeye (−Z) bakan oyuncu: nişan noktası (0, −3) = çit kenarı (0, −3). */
const NORTH = { x: 0, z: 0, yaw: 0 };

describe('çit: yuva ve eğim', () => {
  it('kenar ekseni ↔ yaw gidiş-dönüş yapar; uçlar kenar boyunca ±1 m', () => {
    for (const axis of ['x', 'z'] as const) {
      expect(fenceAxisOf({ yaw: fenceYawForAxis(axis) })).toBe(axis);
    }
    const onX = fenceEnds({ x: 4, z: 6, yaw: fenceYawForAxis('x') });
    expect(onX.a.x).toBeCloseTo(3);
    expect(onX.b.x).toBeCloseTo(5);
    expect(onX.a.z).toBeCloseTo(6);
    const onZ = fenceEnds({ x: 4, z: 6, yaw: fenceYawForAxis('z') });
    expect(onZ.a.z).toBeCloseTo(5);
    expect(onZ.b.z).toBeCloseTo(7);
  });

  it('uç yükseklik farkı adıma yuvarlanır; varyant anahtarı gidiş-dönüş yapar (−0 olmaz)', () => {
    expect(quantizeRise(0.04)).toBe(0);
    expect(Object.is(quantizeRise(-0.04), 0)).toBe(true);
    expect(quantizeRise(0.26)).toBeCloseTo(0.3);
    expect(quantizeRise(-1.04)).toBeCloseTo(-1);
    expect(fenceVariantKey({})).toBe('');
    expect(fenceVariantKey({ rise: 0.5 })).toBe('r5');
    expect(fenceVariantKey({ rise: -0.7, open: true })).toBe('r-7o');
    expect(parseFenceVariant('r-7o')).toEqual({ rise: -0.7, open: true });
    expect(parseFenceVariant('')).toEqual({ rise: 0, open: false });
  });

  it('düz zeminde bakışa dik kenarı seçer; R tercihi paralel kenara çevirir', () => {
    const near = resolveFence('wood_fence', NORTH, false, ctx());
    expect(near.check.ok).toBe(true);
    expect(near.target).toMatchObject({ x: 0, z: -3, rise: 0 });
    expect(fenceAxisOf(near.target)).toBe('x'); // kuzeye bakarken çit X boyunca uzanır
    const flipped = resolveFence('wood_fence', NORTH, true, ctx());
    expect(fenceAxisOf(flipped.target)).toBe('z');
  });

  it('eğimli zeminde orta nokta iki ucun ortalaması, rise uçlar arası fark (yerel +Z − −Z)', () => {
    const slope = (x: number) => FLAT + 0.5 * x;
    const result = resolveFence('wood_fence', NORTH, false, ctx(undefined, slope));
    expect(result.check.ok).toBe(true);
    // Kenar X boyunca (yaw π/2): +Z yerel ucu +X'tedir → rise = 0,5 · 2 = 1.
    expect(result.target.rise).toBeCloseTo(1);
    expect(result.target.y).toBeCloseTo(FLAT);
  });

  it('uçlar arası fark FENCES.maxEndRise üstündeyse reddeder (dik yamaç)', () => {
    const steep = (x: number, z: number) => FLAT + x + z;
    const result = resolveFence('wood_fence', NORTH, false, ctx(undefined, steep));
    expect(result.check).toEqual({ ok: false, reason: 'too_steep' });
    expect(Math.abs(result.target.rise)).toBeGreaterThan(FENCES.maxEndRise);
  });

  it('denizde kurulmaz', () => {
    expect(
      resolveFence(
        'wood_fence',
        NORTH,
        false,
        ctx(undefined, () => 0),
      ).check,
    ).toEqual({
      ok: false,
      reason: 'in_sea',
    });
  });

  it('dolu kenara ikinci çit konmaz (başka kenar seçilir); tabana ve ateşe yaklaşılmaz', () => {
    const structures = new StructureSet();
    structures.add('wood_fence', 0, FLAT, -3, fenceYawForAxis('x'));
    const second = resolveFence('wood_fence', NORTH, false, ctx(structures));
    expect(second.check.ok).toBe(true);
    expect(second.target.x === 0 && second.target.z === -3).toBe(false);

    // Taban üstüne/yanına çit kurulmaz (plakaya gömülür).
    const withFloor = new StructureSet();
    withFloor.add('foundation', 0, FLAT, -2, 0); // hücre (0,−2): kenarlar (0,−3) (0,−1) (±1,−2)
    const onFloor = resolveFence('wood_fence', NORTH, false, ctx(withFloor));
    expect(onFloor.check.ok).toBe(false);

    const withFire = new StructureSet();
    withFire.add('campfire', 0, FLAT, -3, 0);
    const nearFire = resolveFence('wood_fence', NORTH, false, ctx(withFire));
    expect(nearFire.target.x === 0 && nearFire.target.z === -3).toBe(false);
  });

  it('aynı kenardaki duvar yuvayı doldurur', () => {
    const structures = new StructureSet();
    structures.add('wall', 0, FLAT, -3, 0); // yaw 0 = X boyunca
    const result = resolveFence('wood_fence', NORTH, false, ctx(structures));
    expect(result.target.x === 0 && result.target.z === -3).toBe(false);
  });

  it('çit doğru parçasına uzaklık uçların ötesinde yarım daire gibi büyür', () => {
    const fence = { x: 0, z: 0, yaw: fenceYawForAxis('x') };
    expect(distanceToFence(fence, 0, 0.7)).toBeCloseTo(0.7);
    expect(distanceToFence(fence, 1.5, 0)).toBeCloseTo(0.5);
    expect(distanceToFence(fence, 2, 1)).toBeCloseTo(Math.hypot(1, 1));
  });
});

describe('çit: PlacementController', () => {
  function setup(heightAt: (x: number, z: number) => number = () => FLAT) {
    const events = new EventBus<GameEvents>();
    const inventory = new Inventory();
    const structures = new StructureSet();
    const controller = new PlacementController({
      events,
      inventory,
      structures,
      world: { heightAt },
      isAlive: () => true,
    });
    return { inventory, structures, controller };
  }

  it('eşya sürdükçe art arda kurulur; son çitten sonra hedefleme biter; uç farkı kayda girer', () => {
    const { inventory, structures, controller } = setup((x) => FLAT + 0.5 * x);
    inventory.add('wood_fence', 2);
    expect(controller.toggle('wood_fence')).toBe('started');
    controller.update(NORTH);
    expect(controller.ghost?.valid).toBe(true);
    expect(controller.ghost?.rise).toBeCloseTo(1);

    const first = controller.confirm();
    expect(first.ok).toBe(true);
    expect(controller.aiming).toBe('wood_fence'); // eşya sürüyor
    expect(inventory.count('wood_fence')).toBe(1);

    // İkinci çit başka kenara oturur (aynı kenar dolu).
    controller.update({ x: 4, z: 0, yaw: 0 });
    const second = controller.confirm();
    expect(second.ok).toBe(true);
    expect(controller.aiming).toBeNull(); // eşya bitti
    const placed = structures.all().filter((s) => s.kind === 'wood_fence');
    expect(placed).toHaveLength(2);
    expect(placed[0]?.rise).toBeCloseTo(1);
  });

  it('serbest inşada (test modu) eşya gerekmez ve hedefleme sürer', () => {
    const events = new EventBus<GameEvents>();
    const structures = new StructureSet();
    const controller = new PlacementController({
      events,
      inventory: new Inventory(),
      structures,
      world: { heightAt: () => FLAT },
      isAlive: () => true,
      freeBuild: () => true,
    });
    expect(controller.toggle('stone_fence')).toBe('started');
    controller.update(NORTH);
    expect(controller.confirm().ok).toBe(true);
    expect(controller.aiming).toBe('stone_fence');
  });

  it('R yuva tercihini çevirir', () => {
    const { inventory, controller } = setup();
    inventory.add('wood_fence', 1);
    controller.toggle('wood_fence');
    controller.update(NORTH);
    const before = controller.ghost?.yaw;
    expect(controller.rotate()).toBe(true);
    expect(controller.ghost?.yaw).not.toBeCloseTo(before ?? 0);
  });
});

describe('çit: yapı kümesi ve kayıt', () => {
  it('çit kapısı açılıp kapanır; çit ve duvar açılmaz', () => {
    const set = new StructureSet();
    const gate = set.add('fence_gate', 0, 0, 0, 0);
    const fence = set.add('wood_fence', 4, 0, 0, 0);
    expect(set.toggleDoor(gate.id)).toBe(true);
    expect(set.get(gate.id)?.open).toBe(true);
    expect(set.toggleDoor(gate.id)).toBe(false);
    expect(set.toggleDoor(fence.id)).toBeNull();
  });

  it('uç farkı ve kapı durumu kayıttan geri gelir; bozuk değer reddedilir', () => {
    const set = new StructureSet();
    const a = set.add('wood_fence', 1, 2, 3, 0, 0.7);
    const g = set.add('fence_gate', 5, 2, 3, Math.PI / 2, -0.4);
    set.toggleDoor(g.id);
    const loaded = StructureSet.fromJSON(JSON.parse(JSON.stringify(set.toJSON())));
    expect(loaded.get(a.id)?.rise).toBeCloseTo(0.7);
    expect(loaded.get(g.id)).toMatchObject({ open: true });
    expect(loaded.get(g.id)?.rise).toBeCloseTo(-0.4);

    const save = set.toJSON();
    const bad = JSON.parse(JSON.stringify(save));
    bad.structures[0].rise = 9;
    expect(() => StructureSet.fromJSON(bad)).toThrow(/çit eğimi/);
    const bad2 = JSON.parse(JSON.stringify(save));
    set.add('wall', 9, 0, 9, 0);
    const wallSave = JSON.parse(JSON.stringify(set.toJSON()));
    wallSave.structures[2].rise = 0.2;
    expect(() => StructureSet.fromJSON(wallSave)).toThrow(/çit değildir/);
    expect(bad2).toBeDefined();
  });

  it('eğim yerleşim imzasına girer (kayıt yüklenince görsel/collider yenilenir)', () => {
    const set = new StructureSet();
    const flat = set.add('wood_fence', 0, 0, 0, 0);
    const tilted = set.add('wood_fence', 0, 0, 0, 0, 0.8);
    expect(flat.rise).toBeUndefined();
    expect(tilted.rise).toBeCloseTo(0.8);
  });
});

describe('çit: collider kutuları', () => {
  it('düz kapalı çit tek kutudur; eğimli çit dikey dilimlere bölünür ve her dilim kendi zeminine kayar', () => {
    expect(fenceColliderBoxes('wood_fence', 0)).toHaveLength(1);
    const boxes = fenceColliderBoxes('wood_fence', 1);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    // Hiçbir kutu dönmez (direkler dikey); dilimler Z boyunca ardışık ve toplam uzunluk 2 m.
    for (const b of boxes) expect(b.pitch).toBeUndefined();
    const total = boxes.reduce((sum, b) => sum + 2 * b.hz, 0);
    expect(total).toBeCloseTo(FENCE_SHAPE.half * 2);
    // +Z ucundaki dilim −Z ucundakinden `rise` · (aralık / 2) kadar yüksektir.
    const first = boxes[0]!;
    const last = boxes[boxes.length - 1]!;
    expect(last.cy - first.cy).toBeCloseTo(1 * ((last.cz - first.cz) / 2));
  });

  it('açık çit kapısı iki uç direk ve dik açılan kanattır; kapalıda tam boy', () => {
    expect(fenceColliderBoxes('fence_gate', 0, false)).toHaveLength(1);
    const open = fenceColliderBoxes('fence_gate', 0, true);
    expect(open).toHaveLength(3);
    // Orta açıklık (z ≈ 0) açık kalır: hiçbir kutu x = 0, z = 0 noktasını içermez... kanat menteşe ucundadır.
    const middleBlocked = open.some(
      (b) => Math.abs(b.cx) - b.hx < 0 && Math.abs(b.cz) - b.hz < 0 && b.cy - b.hy < 0.5,
    );
    expect(middleBlocked).toBe(false);
  });

  it('düz çit solidBoxes ile aynı uzunluk/kalınlıktadır (engel sorgusu ve mermi için)', () => {
    const [flat] = solidBoxes('wood_fence');
    expect(flat?.hz).toBeCloseTo(FENCE_SHAPE.half);
    expect(flat?.hx).toBeCloseTo(FENCES.wood.thickness / 2);
  });
});
