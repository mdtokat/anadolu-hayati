import { describe, expect, it, vi } from 'vitest';
import { CarcassButcher, pickCarcass } from '../src/combat/carcass';
import { LOOT_TABLE } from '../src/combat/loot';
import { butcherPrompt, butcheredToast } from '../src/combat/promptText';
import { LOOT } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import type { CreatureSystem } from '../src/creatures/CreatureSystem';
import type { CreatureView } from '../src/creatures/kinds';
import { Inventory } from '../src/items/Inventory';
import { FakeCreatures, makeView } from './helpers/fakeCreatures';

const DT = 1 / 60;
const aim = { x: 0, y: 0, z: 0, eyeY: 1.65, yaw: 0, pitch: 0 };

function setup(patch: Partial<CreatureView> = {}) {
  const events = new EventBus<GameEvents>();
  const butchered = vi.fn();
  events.on('carcass:butchered', butchered);
  const inventory = new Inventory();
  const creatures = new FakeCreatures(events);
  const id = creatures.add({
    kind: 'brown_bear',
    z: -1.5,
    dead: true,
    state: 'dead',
    health: 0,
    ...patch,
  });
  const butcher = new CarcassButcher(events, inventory, creatures as unknown as CreatureSystem);
  const view = (): CreatureView => creatures.views().find((v) => v.id === id) as CreatureView;
  return { events, butchered, inventory, creatures, id, butcher, view };
}

function hold(
  butcher: CarcassButcher,
  seconds: number,
  target: CreatureView | null,
  alive = true,
): void {
  for (let t = 0; t < seconds; t += DT) butcher.update(DT, true, target, alive);
}

describe('pickCarcass', () => {
  it('yalnızca ölü canlıları, menzil ve koni içinde seçer', () => {
    const live = makeView({ id: 1, z: -1.5 });
    const dead = makeView({ id: 2, z: -2, dead: true, state: 'dead' });
    const far = makeView({ id: 3, z: -8, dead: true, state: 'dead' });
    const behind = makeView({ id: 4, z: 2, dead: true, state: 'dead' });
    expect(pickCarcass([live, far, behind], aim)).toBeNull();
    expect(pickCarcass([live, far, behind, dead], aim)?.view.id).toBe(2);
  });

  it('bakışa en yakın leşi seçer', () => {
    const side = makeView({ id: 1, x: 1.4, z: -1.2, dead: true, state: 'dead' });
    const ahead = makeView({ id: 2, x: 0, z: -2, dead: true, state: 'dead' });
    expect(pickCarcass([side, ahead], aim)?.view.id).toBe(2);
  });
});

describe('CarcassButcher', () => {
  it('canlıya teklif yok; ölüye var', () => {
    const { butcher, creatures } = setup();
    const live = makeView({ id: 9 });
    expect(butcher.inspect(live)).toBeNull();
    expect(butcher.inspect(creatures.views()[0] as CreatureView)).toMatchObject({
      status: 'ready',
    });
  });

  it('elle süre LOOT.butcherSeconds, baltayla kısa', () => {
    const { butcher, inventory, view } = setup();
    expect(butcher.inspect(view())?.seconds).toBe(LOOT.butcherSeconds);
    inventory.add('stone_axe', 1);
    expect(butcher.inspect(view())?.seconds).toBe(LOOT.butcherSecondsAxe);
    expect(butcher.inspect(view())?.withAxe).toBe(true);
  });

  it('süre dolunca yük atomik eklenir, leş kaldırılır, olay bir kez yayınlanır', () => {
    const { butcher, inventory, creatures, id, butchered, view } = setup();
    hold(butcher, LOOT.butcherSeconds - 0.2, view());
    expect(inventory.count('hide')).toBe(0);
    expect(butcher.progress).toBeGreaterThan(0.9);
    hold(butcher, 0.4, view());
    // Ayı (Faz 10): eti haram; deri ve kemik alınır.
    expect(inventory.count('raw_meat')).toBe(0);
    expect(inventory.count('hide')).toBe(2);
    expect(inventory.count('bone')).toBe(2);
    expect(creatures.views().some((v) => v.id === id)).toBe(false);
    expect(butchered).toHaveBeenCalledTimes(1);
    expect(butchered.mock.calls[0]?.[0]).toMatchObject({ id, kind: 'brown_bear' });
    expect(butchered.mock.calls[0]?.[0].items).toEqual(LOOT_TABLE.brown_bear);
  });

  it('tuş bırakılınca ilerleme sıfırlanır', () => {
    const { butcher, inventory, view } = setup();
    hold(butcher, LOOT.butcherSeconds - 0.5, view());
    butcher.update(DT, false, view());
    expect(butcher.progress).toBe(0);
    hold(butcher, LOOT.butcherSeconds - 0.5, view());
    expect(inventory.count('raw_meat')).toBe(0);
  });

  it('hedef değişirse ilerleme sıfırlanır', () => {
    const { butcher, creatures, inventory, view } = setup();
    const other = creatures.add({ kind: 'wolf', z: -1.5, x: 1, dead: true, state: 'dead' });
    const otherView = creatures.views().find((v) => v.id === other) as CreatureView;
    hold(butcher, LOOT.butcherSeconds - 0.5, view());
    hold(butcher, 1, otherView);
    expect(inventory.count('raw_meat')).toBe(0);
  });

  it('ölü oyuncu kesemez', () => {
    const { butcher, inventory, view } = setup();
    hold(butcher, LOOT.butcherSeconds + 1, view(), false);
    expect(butcher.offer).toBeNull();
    expect(inventory.count('raw_meat')).toBe(0);
  });

  it('envanterde hiçbir şeye yer yoksa teklif full, eşya eklenmez', () => {
    const { butcher, inventory, view } = setup();
    // 25 kg ağırlık sınırını tam doldur: hiçbir eşyaya yer kalmaz.
    inventory.add('log', 8);
    inventory.add('stone', 2);
    butcher.update(DT, true, view());
    expect(butcher.offer?.status).toBe('full');
    expect(butcherPrompt(butcher.offer as NonNullable<typeof butcher.offer>)).toBe('Envanter dolu');
  });

  it('yer kısıtlıysa kısmi alınır, kalan leşte durur ve yer açılınca sürer', () => {
    const { butcher, inventory, creatures, id, butchered, view } = setup({ kind: 'brown_bear' });
    // 25 kg sınırına yakın doldur: ayı yükünün (2 deri 3 kg + 2 kemik 0,6 kg) hepsi sığmaz.
    inventory.add('log', 3); // 9 kg
    inventory.add('stone', 10); // 5 kg
    inventory.add('hide', 5); // 7,5 kg
    inventory.add('stick', 7); // 2,1 kg → 23,6 kg
    hold(butcher, LOOT.butcherSeconds + 0.3, view());
    expect(butchered).toHaveBeenCalledTimes(1);
    expect(butcher.hasRemaining(id)).toBe(true);
    expect(creatures.views().some((v) => v.id === id)).toBe(true); // leş durur
    const takenFirst = butchered.mock.calls[0]?.[0].items as Array<{ id: string; count: number }>;
    const taken = takenFirst.reduce((n, s) => n + s.count, 0);
    const total = LOOT_TABLE.brown_bear.reduce((n, s) => n + s.count, 0);
    expect(taken).toBeLessThan(total);

    // Yer aç, yeniden kes: kalan yük alınır ve leş kalkar.
    inventory.remove('log', 3);
    inventory.remove('stone', 10);
    inventory.remove('hide', 5);
    inventory.remove('stick', 7);
    hold(butcher, LOOT.butcherSeconds + 0.3, view());
    expect(butcher.hasRemaining(id)).toBe(false);
    expect(creatures.views().some((v) => v.id === id)).toBe(false);
    expect(inventory.count('hide') + inventory.count('bone')).toBe(4);
  });

  it('dünyadan kalkan leşin kalan yükü unutulur', () => {
    const { butcher, inventory, creatures, id, view } = setup({ kind: 'brown_bear' });
    inventory.add('log', 3);
    inventory.add('stone', 10);
    inventory.add('hide', 5);
    inventory.add('stick', 7);
    hold(butcher, LOOT.butcherSeconds + 0.3, view());
    expect(butcher.hasRemaining(id)).toBe(true);
    creatures.removeCarcass(id); // süresi doldu
    butcher.update(DT, false, null);
    expect(butcher.hasRemaining(id)).toBe(false);
  });
});

describe('kesim metinleri', () => {
  it('ipucu tür adını ve baltayı söyler', () => {
    expect(
      butcherPrompt({ status: 'ready', id: 1, kind: 'roe_deer', seconds: 6, withAxe: false }),
    ).toBe('E (basılı tut): Bismillah — Karaca leşini kes');
    expect(
      butcherPrompt({ status: 'ready', id: 1, kind: 'wolf', seconds: 3, withAxe: true }),
    ).toContain('baltayla');
  });

  it('bildirim eşyaları sayar; kalan varsa uyarır', () => {
    const items = [
      { id: 'raw_meat', count: 3 },
      { id: 'hide', count: 1 },
    ] as const;
    expect(butcheredToast(items, false)).toBe('Kesildi: +3 Çiğ Et, +1 Deri');
    expect(butcheredToast(items, true)).toContain('envanter dolu');
  });
});
