import { describe, expect, it } from 'vitest';
import { RangedSystem } from '../src/combat/RangedSystem';
import { creatureTargetProvider } from '../src/combat/targets';
import { RANGED } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import type { CreatureContext } from '../src/creatures/kinds';
import { Inventory } from '../src/items/Inventory';
import { WEAPON_IDS, WeaponState } from '../src/items/weaponState';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import { DT } from './helpers/encounter';
import { fakeTerrain } from './helpers/fakeTerrain';
import { runRangedEncounter } from './helpers/rangedEncounter';

/**
 * Faz 11.5 denge sözleşmesi: gerçek `CreatureSystem`/`CombatSystem`/`SurvivalSystem`/`RangedSystem` ile menzilli
 * bot karşılaşmaları (oyuncu yerinde, nişanlı, gövde ortasına ateş eder). Sayılar elle oyun denemesinin yerini
 * tutmaz; tasarım niyeti kilitlenir: ateşli silahlar yırtıcıyı uzaktan yener (mühimmat kıt tutulur), ilkel silahlar
 * yakın ve zayıftır, ok kavis ister. `WEAPON_REPORT=1` öldürme süresi tablosunu yazar.
 *
 * Not: atış gürültüsü (`noise:made`) yarıçapındaki canlıyı — kışkırtılmış yırtıcı dahil — ateşten kaçar gibi
 * kaçırır (11.0 canlı tepkisi); bu yüzden bu karşılaşmalarda oyuncu hasar almaz.
 */
describe('menzilli silah dengesi (düz arazi, başsız)', () => {
  it('keskin nişancı tüfeği boz ayıyı 150 m’den 3 atışta, ~3 sn’de yener', () => {
    const r = runRangedEncounter({
      kind: 'brown_bear',
      weapon: 'sniper_rifle',
      distance: 150,
      reserve: 10,
      provoke: true,
    });
    expect(r.kills).toBe(1);
    expect(r.shots).toBeLessThanOrEqual(4);
    expect(r.timeToKill!).toBeLessThan(5);
    expect(r.playerDied).toBe(false);
  });

  it('piyade tüfeği ayıyı 60 m’den bir şarjör + doldurmayla (~7 sn), kurt ve domuzu 2 atışta yener', () => {
    const bear = runRangedEncounter({
      kind: 'brown_bear',
      weapon: 'rifle',
      distance: 60,
      reserve: 10,
      provoke: true,
    });
    expect(bear.kills).toBe(1);
    expect(bear.shots).toBeGreaterThan(RANGED.weapons.rifle.magazine); // doldurma gerekti
    expect(bear.timeToKill!).toBeGreaterThan(5);
    expect(bear.timeToKill!).toBeLessThan(10);
    for (const kind of ['wolf', 'wild_boar'] as const) {
      const r = runRangedEncounter({
        kind,
        weapon: 'rifle',
        distance: 60,
        reserve: 5,
        provoke: true,
      });
      expect(r.kills, kind).toBe(1);
      expect(r.shots, kind).toBeLessThanOrEqual(2);
    }
  });

  it('av tüfeği yakında tek atışta kurdu düşürür, uzakta saçma etkisizdir', () => {
    const near = runRangedEncounter({
      kind: 'wolf',
      weapon: 'shotgun',
      distance: 8,
      provoke: true,
    });
    expect(near.kills).toBe(1);
    expect(near.shots).toBe(1);
    const far = runRangedEncounter({
      kind: 'wolf',
      weapon: 'shotgun',
      distance: 60,
      reserve: 20,
      provoke: true,
      seconds: 20,
    });
    expect(far.kills).toBe(0);
  });

  it('ok kavis ister: karacayı 25 m’de 2 okla vurur, 60 m’de gövdeye nişanla hep altından geçer', () => {
    const near = runRangedEncounter({ kind: 'roe_deer', weapon: 'bow', distance: 25, reserve: 5 });
    expect(near.kills).toBe(1);
    expect(near.shots).toBe(2);
    const far = runRangedEncounter({
      kind: 'roe_deer',
      weapon: 'bow',
      distance: 60,
      reserve: 10,
      seconds: 15,
    });
    expect(far.kills).toBe(0);
    expect(far.hits).toBe(0);
  });

  it('sapan zayıftır: yaban domuzunu öldüremez; tabanca menzili dışındaki karacaya erişmez', () => {
    const sling = runRangedEncounter({
      kind: 'wild_boar',
      weapon: 'slingshot',
      distance: 8,
      reserve: 30,
      provoke: true,
      seconds: 30,
    });
    expect(sling.kills).toBe(0);
    expect(sling.hits).toBeGreaterThan(1);
    const pistol = runRangedEncounter({
      kind: 'roe_deer',
      weapon: 'pistol',
      distance: RANGED.weapons.pistol.range + 40,
      reserve: 16,
      seconds: 15,
    });
    expect(pistol.kills).toBe(0);
  });

  it('sonuçlar tohumdan bağımsız (nişanda saçılma küçük): 5 tohumda aynı', () => {
    const runs = [1, 2, 3, 4, 5].map((seed) =>
      runRangedEncounter({
        kind: 'brown_bear',
        weapon: 'rifle',
        distance: 60,
        reserve: 10,
        provoke: true,
        seed,
      }),
    );
    for (const r of runs) expect(r.kills).toBe(1);
  });

  it('öldürme süresi tablosu (WEAPON_REPORT=1 ile yazılır)', () => {
    if (!process.env.WEAPON_REPORT) return;
    const rows: string[] = ['tür\tsilah\tuzaklık\töldü\tsüre(sn)\tatış'];
    for (const kind of ['roe_deer', 'wild_boar', 'wolf', 'brown_bear'] as const) {
      for (const weapon of WEAPON_IDS) {
        for (const distance of [8, 25, 60, 150]) {
          const r = runRangedEncounter({
            kind,
            weapon,
            distance,
            reserve: 40,
            provoke: kind !== 'roe_deer',
          });
          rows.push(
            `${kind}\t${weapon}\t${distance}\t${r.kills}\t${r.timeToKill?.toFixed(1) ?? '-'}\t${r.shots}`,
          );
        }
      }
    }
    console.log(rows.join('\n'));
  });
});

describe('atış gürültüsü', () => {
  it('yakına düşen tüfek atışı (ıska) 100 m’deki kurdu kaçırır; sapan sesi duyulmaz', () => {
    const distanceAfterShot = (weapon: 'rifle' | 'slingshot'): number => {
      const events = new EventBus<GameEvents>();
      const survival = new SurvivalSystem(events);
      const inventory = new Inventory();
      inventory.add(weapon, 1);
      const weapons = new WeaponState();
      weapons.set(weapon, 1);
      const creatures = new CreatureSystem(events);
      events.on('noise:made', ({ x, z, radius }) => creatures.hearNoise(x, z, radius));
      const ranged = new RangedSystem(events, inventory, weapons, survival, () => 0.5);
      const terrain = fakeTerrain({ half: 3000, cover: 'urban' });
      const ctx: CreatureContext = {
        player: { x: 0, y: 0, z: 0, activity: 'rest', alive: true, yaw: 0, weakness: 0 },
        hour: 12,
        sunAltitudeDeg: 50,
        isNight: false,
        fires: [],
        terrain,
      };
      creatures.update(DT, ctx);
      const id = creatures.spawnAt('wolf', 0, -100, Math.PI)!;
      const input = { held: weapon, aiming: false, steady: false, moving: false, running: false };
      ranged.update(DT, input);
      // Yere, yana ateş: isabet yok, yalnız gürültü.
      ranged.fire(
        { x: 0, y: 1.6, z: 0, yaw: Math.PI / 2, pitch: -0.3 },
        { heightAt: terrain.heightAt, targets: creatureTargetProvider(creatures) },
      );
      for (let t = 0; t < 4; t += DT) {
        ranged.update(DT, input);
        creatures.update(DT, ctx);
      }
      const v = creatures.views().find((c) => c.id === id)!;
      return Math.hypot(v.x, v.z);
    };
    expect(distanceAfterShot('rifle')).toBeGreaterThan(115);
    expect(distanceAfterShot('slingshot')).toBeLessThan(110);
  });
});
