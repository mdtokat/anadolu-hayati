import { describe, expect, it } from 'vitest';
import { INVENTORY, PEOPLE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory } from '../src/items/Inventory';
import { directionsAnswer, executeTrade, tradeText } from '../src/people/dialog';
import { PeopleSystem, personInView, type PeopleWorld } from '../src/people/PeopleSystem';
import { PERSON_ROLES, ROLES, directionName, distanceWords, personName } from '../src/people/roles';
import { isItemId } from '../src/items/itemDefs';

const DT = 1 / 60;

/** Düz, kuru, yolsuz dünya; `road` verilirse her yerde doğu-batı yol. */
function flatWorld(patch: Partial<PeopleWorld> = {}): PeopleWorld {
  return {
    heightAt: () => 10,
    elevationAt: () => 150,
    slopeDegAt: () => 2,
    roadNear: () => null,
    settlementRankAt: () => null,
    blocked: () => false,
    ...patch,
  };
}

function setup() {
  const events = new EventBus<GameEvents>();
  const greeted: string[] = [];
  events.on('person:greeted', ({ name }) => greeted.push(name));
  return { events, greeted, system: new PeopleSystem(events, 1234) };
}

describe('roller ve metinler (Faz 10)', () => {
  it('her rolün adı, hikâyesi ve geçerli eşyalarla takası var', () => {
    for (const role of PERSON_ROLES) {
      const def = ROLES[role];
      expect(def.names.length).toBeGreaterThan(0);
      expect(def.lore.length).toBeGreaterThan(0);
      for (const t of def.trades)
        for (const s of [...t.give, ...t.get]) expect(isItemId(s.id)).toBe(true);
    }
    expect(personName('coban', 'Hasan')).toBe('Çoban Hasan');
    expect(personName('yasli', 'Hatice')).toBe('Hatice Teyze');
  });

  it('yön ve uzaklık sözleri (+X doğu, −Z kuzey; 1 oyun m = 50 gerçek m)', () => {
    expect(directionName(0, -10)).toBe('kuzey');
    expect(directionName(10, -10)).toBe('kuzeydoğu');
    expect(directionName(0, 10)).toBe('güney');
    expect(directionName(-10, 0)).toBe('batı');
    expect(distanceWords(10, 50)).toBe('500 metre kadar');
    expect(distanceWords(24, 50)).toBe('1,2 kilometre kadar');
    expect(directionsAnswer('coban', { x: 0, z: 0 }, { x: 0, z: -20, what: 'bir çeşme' })).toBe(
      'Kuzey tarafında, 1 kilometre kadar ötede bir çeşme var evladım.',
    );
    expect(directionsAnswer('yolcu', { x: 0, z: 0 }, null)).toContain('Bilmiyorum');
  });

  it('takas atomiktir; hediye bir kez', () => {
    const inv = new Inventory({ slots: INVENTORY.slots });
    const offer = ROLES.coban.trades[0]!;
    expect(executeTrade(inv, offer)).toBe('missing');
    inv.add('hide', 2);
    expect(executeTrade(inv, offer)).toBe('ok');
    expect(inv.count('hide')).toBe(0);
    expect(inv.count('wool_blanket')).toBe(1);
    const gift = ROLES.dervis.trades[0]!;
    expect(tradeText(gift)).toContain('Hediye');
    expect(executeTrade(inv, gift)).toBe('ok');
    expect(executeTrade(inv, gift, true)).toBe('used');
    // Sığmayan alış: envanter değişmez.
    const full = new Inventory({ slots: 1 });
    full.add('hide', 2);
    const before = full.toJSON();
    expect(
      executeTrade(full, {
        give: [{ id: 'hide', count: 1 }],
        get: [
          { id: 'log', count: 3 },
          { id: 'stone', count: 3 },
        ],
      }),
    ).toBe('full');
    expect(full.toJSON()).toEqual(before);
  });
});

describe('PeopleSystem', () => {
  it('kişi yaklaşır, bir kez selam verir, oyuncu yanındayken durup bakar, uzaklaşınca yoluna gider', () => {
    const { system, greeted } = setup();
    const world = flatWorld();
    const p = system.spawnAt('coban', 0, -15, world);
    const player = { x: 0, z: 0, alive: true };
    for (let i = 0; i < 60 * 20; i++) system.update(DT, player, world);
    expect(greeted).toEqual([p.name]);
    expect(p.state).toBe('attend');
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(PEOPLE.greetDistance + 0.1);
    expect(p.moving).toBe(false);
    // Oyuncu uzaklaşır.
    const far = { x: 200, z: 0, alive: true };
    for (let i = 0; i < 60 * 3; i++) system.update(DT, far, world);
    expect(p.state).toBe('wander');
    // Geri gelse de bir daha selam vermez.
    for (let i = 0; i < 60 * 20; i++) system.update(DT, player, world);
    expect(greeted.length).toBe(1);
  });

  it('yapıya/denize girmez; uzakta kaybolur', () => {
    const { system } = setup();
    const world = flatWorld({ blocked: (x) => x > 5, elevationAt: (_x, z) => (z > 20 ? -3 : 150) });
    const p = system.spawnAt('yolcu', 0, 0, world);
    const player = { x: 0, z: -400, alive: true };
    for (let i = 0; i < 60 * 30; i++) {
      system.update(DT, { ...player, z: -400 }, world);
      expect(p.x).toBeLessThanOrEqual(5);
      expect(p.z).toBeLessThanOrEqual(20);
    }
    // 320 m'den uzak: kaybolur (ömürle ya da uzaklıkla).
    expect(system.list().length).toBe(0);
  });

  it('çok nadir doğar: yol yakınında ~20 dk’da bir, en çok iki kişi', () => {
    const { system } = setup();
    const world = flatWorld({ roadNear: () => ({ edgeDistance: 2, angle: 0 }) });
    let spawned = 0;
    const seen = new Set<number>();
    for (let t = 0; t < 4 * 3600; t += 1) {
      system.update(1, { x: 0, z: 0, alive: true }, world);
      for (const p of system.list()) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        spawned++;
      }
      expect(system.list().length).toBeLessThanOrEqual(PEOPLE.maxActive);
    }
    // 4 saatte (240 deneme × 0,05) ≈ 12 kişi
    expect(spawned).toBeGreaterThan(4);
    expect(spawned).toBeLessThan(25);
  });

  it('ölüyken hiçbir şey olmaz; konuşulan kişi kaybolmaz', () => {
    const { system } = setup();
    const world = flatWorld();
    const p = system.spawnAt('dervis', 0, -2, world);
    system.update(5, { x: 0, z: 0, alive: false }, world);
    expect(p.age).toBe(0);
    p.talking = true;
    for (let i = 0; i < 60 * 20; i++) system.update(DT * 60, { x: 0, z: 0, alive: true }, world);
    expect(system.get(p.id)).not.toBeNull();
  });

  it('konuşma hedefi: erişimde ve bakış konisinde', () => {
    const { system } = setup();
    const p = system.spawnAt('yolcu', 0, -2, flatWorld());
    expect(personInView([p], { x: 0, z: 0, yaw: 0 })?.id).toBe(p.id); // yaw 0 = −Z
    expect(personInView([p], { x: 0, z: 0, yaw: Math.PI })).toBeNull();
    expect(personInView([p], { x: 0, z: 10, yaw: 0 })).toBeNull();
  });
});
