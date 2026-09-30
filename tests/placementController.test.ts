import { describe, expect, it, vi } from 'vitest';
import { FIRE, PLACEMENT, VERTICAL_SCALE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory } from '../src/items/Inventory';
import { PlacementController, type AimPose } from '../src/placement/PlacementController';
import { StructureSystem } from '../src/placement/StructureSystem';
import { StructureSet } from '../src/placement/structures';

const FLAT_Y = 100 / VERTICAL_SCALE;

function setup(
  options: { heightAt?: (x: number, z: number) => number; alive?: { value: boolean } } = {},
) {
  const events = new EventBus<GameEvents>();
  const placed = vi.fn();
  events.on('structure:placed', placed);
  const inventory = new Inventory();
  const structures = new StructureSet();
  const alive = options.alive ?? { value: true };
  const controller = new PlacementController({
    events,
    inventory,
    structures,
    world: { heightAt: options.heightAt ?? (() => FLAT_Y) },
    isAlive: () => alive.value,
  });
  return { events, placed, inventory, structures, controller, alive };
}

/** Kuzeye (−Z) bakan oyuncu: hayalet (0, −aimDistance)'ta olur. */
const NORTH: AimPose = { x: 0, z: 0, yaw: 0 };

describe('PlacementController: hedefleme', () => {
  it('eşya yoksa başlamaz; varsa başlar ve aynı tuş iptal eder', () => {
    const { controller, inventory } = setup();
    expect(controller.toggle('campfire')).toBe('no_item');
    expect(controller.aiming).toBeNull();
    inventory.add('campfire', 1);
    expect(controller.toggle('campfire')).toBe('started');
    expect(controller.aiming).toBe('campfire');
    expect(controller.toggle('campfire')).toBe('cancelled');
    expect(controller.aiming).toBeNull();
    expect(inventory.count('campfire')).toBe(1);
  });

  it('başka türe basınca o türe geçer; eşyası yoksa mevcut hedefleme sürer', () => {
    const { controller, inventory } = setup();
    inventory.add('campfire', 1);
    inventory.add('lean_to', 1);
    controller.toggle('campfire');
    expect(controller.toggle('lean_to')).toBe('started');
    expect(controller.aiming).toBe('lean_to');
    inventory.remove('lean_to', 1);
    controller.cancel();
    controller.toggle('campfire');
    expect(controller.toggle('lean_to')).toBe('no_item');
    expect(controller.aiming).toBe('campfire');
  });

  it('hayalet oyuncunun önünde, bakış yönünde belirir ve yerden yüksekliği alır', () => {
    const { controller, inventory } = setup({ heightAt: (x) => FLAT_Y + x * 0 });
    inventory.add('campfire', 1);
    controller.toggle('campfire');
    expect(controller.ghost).toBeNull(); // henüz update yok
    controller.update({ x: 10, z: 20, yaw: 0 });
    expect(controller.ghost).toMatchObject({
      kind: 'campfire',
      valid: true,
      reason: null,
      y: FLAT_Y,
    });
    expect(controller.ghost?.x).toBeCloseTo(10, 6);
    expect(controller.ghost?.z).toBeCloseTo(20 - PLACEMENT.aimDistance, 6);
    controller.update({ x: 10, z: 20, yaw: Math.PI / 2 }); // yaw=π/2: ileri = (−1, 0), yani batıya
    expect(controller.ghost?.x).toBeCloseTo(10 - PLACEMENT.aimDistance, 6);
    expect(controller.ghost?.z).toBeCloseTo(20, 6);
  });

  it('geçersiz konumda hayalet geçersizdir ve nedeni taşır', () => {
    const { controller, inventory } = setup({ heightAt: () => 0 }); // deniz
    inventory.add('campfire', 1);
    controller.toggle('campfire');
    controller.update(NORTH);
    expect(controller.ghost).toMatchObject({ valid: false, reason: 'in_sea' });
  });

  it('hedeflerken eşya envanterden kaybolursa hedefleme kendiliğinden biter', () => {
    const { controller, inventory } = setup();
    inventory.add('campfire', 1);
    controller.toggle('campfire');
    controller.update(NORTH);
    inventory.remove('campfire', 1);
    controller.update(NORTH);
    expect(controller.aiming).toBeNull();
    expect(controller.ghost).toBeNull();
  });

  it('ölünce hedefleme biter; ölüyken başlatılamaz', () => {
    const { controller, inventory, alive } = setup();
    inventory.add('campfire', 1);
    controller.toggle('campfire');
    controller.update(NORTH);
    alive.value = false;
    controller.update(NORTH);
    expect(controller.aiming).toBeNull();
    expect(controller.toggle('campfire')).toBe('dead');
  });

  it('başlatmadan önce pose biliniyorsa hayalet hemen belirir', () => {
    const { controller, inventory } = setup();
    inventory.add('campfire', 1);
    controller.update(NORTH); // hedefleme yokken de pose hatırlanır
    controller.toggle('campfire');
    expect(controller.ghost).not.toBeNull();
  });
});

describe('PlacementController: yerleştirme', () => {
  it('başarılı: eşya bir adet düşer, yapı eklenir, olay tam bir kez yayınlanır, hedefleme biter', () => {
    const { controller, inventory, structures, placed } = setup();
    inventory.add('campfire', 2);
    controller.toggle('campfire');
    controller.update(NORTH);
    const result = controller.confirm();
    expect(result.ok).toBe(true);
    expect(inventory.count('campfire')).toBe(1);
    expect(structures.size).toBe(1);
    const s = structures.all()[0]!;
    expect(s).toMatchObject({ kind: 'campfire', y: FLAT_Y, fuelSeconds: FIRE.burnSeconds });
    expect(placed).toHaveBeenCalledTimes(1);
    expect(placed).toHaveBeenCalledWith({ id: s.id, kind: 'campfire', x: s.x, z: s.z });
    expect(controller.aiming).toBeNull();
  });

  it('sundurma yakıtsızdır; ikinci yapı ilkinin yakınına konamaz', () => {
    const { controller, inventory, structures } = setup();
    inventory.add('lean_to', 2);
    controller.toggle('lean_to');
    controller.update(NORTH);
    expect(controller.confirm().ok).toBe(true);
    expect(structures.all()[0]?.fuelSeconds).toBeUndefined();

    controller.toggle('lean_to');
    controller.update(NORTH);
    expect(controller.ghost).toMatchObject({ valid: false, reason: 'too_close' });
    const before = inventory.count('lean_to');
    expect(controller.confirm()).toEqual({ ok: false, reason: 'too_close' });
    expect(inventory.count('lean_to')).toBe(before);
    expect(structures.size).toBe(1);
  });

  it('geçersiz konumda eşya düşmez, olay yok, hedefleme sürer', () => {
    const { controller, inventory, structures, placed } = setup({ heightAt: () => 0 });
    inventory.add('campfire', 1);
    controller.toggle('campfire');
    controller.update(NORTH);
    expect(controller.confirm()).toEqual({ ok: false, reason: 'in_sea' });
    expect(inventory.count('campfire')).toBe(1);
    expect(structures.size).toBe(0);
    expect(placed).not.toHaveBeenCalled();
    expect(controller.aiming).toBe('campfire');
  });

  it('hedefleme yokken, hayalet yokken ve ölüyken yerleştirilemez; eşya düşmez', () => {
    const { controller, inventory, alive, placed } = setup();
    inventory.add('campfire', 1);
    expect(controller.confirm()).toEqual({ ok: false, reason: 'not_aiming' });
    controller.toggle('campfire');
    expect(controller.confirm()).toEqual({ ok: false, reason: 'no_target' });
    controller.update(NORTH);
    alive.value = false;
    expect(controller.confirm()).toEqual({ ok: false, reason: 'dead' });
    expect(controller.aiming).toBeNull();
    expect(inventory.count('campfire')).toBe(1);
    expect(placed).not.toHaveBeenCalled();
  });

  it('onay anında durum değişmişse yeniden doğrular (aradan başka yapı eklendi)', () => {
    const { controller, inventory, structures } = setup();
    inventory.add('campfire', 1);
    controller.toggle('campfire');
    controller.update(NORTH);
    expect(controller.ghost?.valid).toBe(true);
    structures.add('campfire', controller.ghost!.x, FLAT_Y, controller.ghost!.z);
    expect(controller.confirm()).toEqual({ ok: false, reason: 'too_close' });
    expect(inventory.count('campfire')).toBe(1);
  });

  it('eşya onaydan hemen önce kaybolmuşsa no_item ve hedefleme biter', () => {
    const { controller, inventory, structures } = setup();
    inventory.add('campfire', 1);
    controller.toggle('campfire');
    controller.update(NORTH);
    inventory.remove('campfire', 1);
    expect(controller.confirm()).toEqual({ ok: false, reason: 'no_item' });
    expect(structures.size).toBe(0);
    expect(controller.aiming).toBeNull();
  });
});

describe('StructureSystem', () => {
  it('ateş sönünce structure:extinguished tam bir kez yayınlanır', () => {
    const events = new EventBus<GameEvents>();
    const out = vi.fn();
    events.on('structure:extinguished', out);
    const system = new StructureSystem(events);
    const fire = system.structures.add('campfire', 0, 0, 0);
    system.structures.add('lean_to', 9, 0, 9);
    system.update(FIRE.burnSeconds - 1);
    expect(out).not.toHaveBeenCalled();
    system.update(2);
    system.update(2);
    expect(out).toHaveBeenCalledTimes(1);
    expect(out).toHaveBeenCalledWith({ id: fire.id });
  });
});
