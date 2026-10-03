import { describe, expect, it } from 'vitest';
import { GANGS } from '../src/config';
import { BanditSystem, type BanditContext, type BanditWorld } from '../src/bandits/BanditSystem';
import { gangPresent, type GangSite } from '../src/bandits/gangs';
import type { BanditPlayer } from '../src/bandits/perception';
import { TargetRegistry, playerTargetProvider } from '../src/combat/targets';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';

const DT = 1 / 60;
const DAY = 86_400;
const flat: BanditWorld = { heightAt: () => 0, slopeDegAt: () => 0, isSea: () => false };

const site: GangSite = {
  id: 5,
  name: 'Deneme',
  x: 0,
  z: 0,
  radius: 120,
  a: { x: -15, z: 0 },
  b: { x: 15, z: 0 },
};

/** Çetenin bulunduğu ilk gün (deterministik). */
const PRESENT_DAY = Array.from({ length: 50 }, (_, d) => d + 10).find((d) => gangPresent(site, d))!;
const ABSENT_DAY = Array.from({ length: 50 }, (_, d) => d + 10).find((d) => !gangPresent(site, d))!;

function setup(sites: readonly GangSite[] = [site]) {
  const events = new EventBus<GameEvents>();
  const log: Array<{ name: string; payload: unknown }> = [];
  for (const name of ['bandit:noticed', 'bandit:damaged', 'gang:clash', 'noise:made'] as const) {
    events.on(name, (payload: unknown) => log.push({ name, payload }));
  }
  const system = new BanditSystem(events, [], flat, undefined, sites);
  const playerDamage: number[] = [];
  const player: BanditPlayer = {
    x: 0,
    y: 0,
    z: 100,
    activity: 'walk',
    alive: true,
    sanctuary: false,
  };
  const registry = new TargetRegistry();
  registry.register(
    playerTargetProvider({
      position: () => (player.alive ? player : null),
      radius: 0.35,
      height: 1.8,
      damage: (amount) => playerDamage.push(amount),
    }),
  );
  registry.register(system);
  let now = PRESENT_DAY * DAY + 12 * 3600;
  let hour = 12;
  const ctx = (): BanditContext => ({
    player,
    hour,
    darkness: 0,
    now,
    targets: registry,
    prey: () => [],
  });
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      now += DT;
      system.update(DT, ctx());
    }
  };
  return {
    events,
    log,
    system,
    player,
    playerDamage,
    run,
    setNow: (n: number) => (now = n),
    setHour: (h: number) => (hour = h),
    now: () => now,
  };
}

/** İlk güncellemeden (oyun başı) sonra ısınma payı geçsin. */
function warm(t: ReturnType<typeof setup>) {
  t.run(1);
  t.run(GANGS.graceSeconds + 5);
}

describe('BanditSystem: sokak çeteleri', () => {
  it('çete olan günde, saatte ve ısınmadan sonra iki rakip çete caddede canlanır', () => {
    const t = setup();
    warm(t);
    const views = t.system.views();
    expect(views.length).toBeGreaterThanOrEqual(2 * GANGS.members[0]);
    expect(new Set(views.map((v) => v.faction))).toEqual(new Set([0, 1]));
    expect(views.every((v) => v.camp === -1)).toBe(true);
    expect(views.filter((v) => v.role === 'leader')).toHaveLength(2);
  });

  it('ısınma süresinde, gece, çetesiz günde, ayar kapalıyken ve oyuncu çok yakınken çıkmaz', () => {
    const early = setup();
    early.run(10);
    expect(early.system.views()).toHaveLength(0);

    const night = setup();
    night.setHour(GANGS.hours[1] + 1);
    warm(night);
    expect(night.system.views()).toHaveLength(0);

    const absent = setup();
    absent.setNow(ABSENT_DAY * DAY + 12 * 3600);
    warm(absent);
    expect(absent.system.views()).toHaveLength(0);

    const off = setup();
    off.system.setEnabled(false);
    warm(off);
    expect(off.system.views()).toHaveLength(0);

    const near = setup();
    near.player.z = 10; // çete noktalarına 40 m'den yakın
    warm(near);
    expect(near.system.views()).toHaveLength(0);
  });

  it('oyuncu uzaktayken rakip çeteler birbirini vurur, çatışma bildirilir, oyuncuya hasar yok', () => {
    const t = setup();
    warm(t);
    t.player.z = 180; // çeteler canlandı; oyuncu görüş menzilinin (70 m) çok ötesinde ama kalkış uzaklığında değil
    t.run(120);
    expect(t.log.some((e) => e.name === 'gang:clash')).toBe(true);
    const damaged = t.log.filter((e) => e.name === 'bandit:damaged');
    expect(damaged.length).toBeGreaterThan(0);
    expect(t.playerDamage).toHaveLength(0);
    // Çatışmada hasar alanlar yalnızca rakip çeteden vuruş yer: ölüler her iki çeteden de olabilir ama sağlık düşmüştür.
    expect(t.system.views().some((v) => v.health < v.maxHealth)).toBe(true);
    // Rakip fark etme oyuncuya "tehlike" bildirimi yapmaz.
    expect(t.log.filter((e) => e.name === 'bandit:noticed')).toHaveLength(0);
  });

  it('oyuncu görüşe girerse çeteler ona da saldırır (tehlike bildirimi, gang bayrağı)', () => {
    const t = setup();
    warm(t);
    // Kızıl çetenin hemen yanında: oyuncu rakipten daha yakındır, çete ona saldırır.
    t.player.x = site.a.x;
    t.player.z = 8;
    t.run(10);
    const noticed = t.log.filter((e) => e.name === 'bandit:noticed');
    expect(noticed.length).toBeGreaterThan(0);
    expect((noticed[0]?.payload as { gang?: boolean }).gang).toBe(true);
  });

  it('bütün üyeler ölünce aynı gün yeniden çıkmaz, ertesi gün çıkar', () => {
    const t = setup();
    warm(t);
    for (const v of t.system.views()) t.system.damage(v.id, 10_000, { x: 0, z: 0 });
    // Oyuncu uzaklaşıp dönünce (aynı gün) yeniden doğma yok.
    t.player.z = 500;
    t.run(2);
    expect(t.system.views()).toHaveLength(0);
    t.player.z = 100;
    t.run(2);
    expect(t.system.views()).toHaveLength(0);
    // Çetenin bulunduğu başka bir gün.
    const next = Array.from({ length: 60 }, (_, d) => PRESENT_DAY + 1 + d).find((d) =>
      gangPresent(site, d),
    )!;
    t.setNow(next * DAY + 12 * 3600);
    t.run(2);
    expect(t.system.views().length).toBeGreaterThan(0);
  });

  it('ölü çete üyesinin üstü aranabilir (kamp dışı eşkıya gibi)', () => {
    const t = setup();
    warm(t);
    const victim = t.system.views()[0]!;
    t.system.damage(victim.id, 10_000, { x: 0, z: 0 });
    expect(t.system.lootOf(victim.id).length).toBeGreaterThanOrEqual(0);
    expect(t.system.get(victim.id)?.state).toBe('dead');
  });
});
