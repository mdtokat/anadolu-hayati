import { describe, expect, it } from 'vitest';
import { BANDITS } from '../src/config';
import { BanditSystem, type BanditContext, type BanditWorld } from '../src/bandits/BanditSystem';
import type { Camp } from '../src/bandits/camps';
import { rollBanditLoot, rollCampChest } from '../src/bandits/loot';
import { TargetRegistry, playerTargetProvider, type TargetProvider } from '../src/combat/targets';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Inventory } from '../src/items/Inventory';
import { takeAllStacks, takeStack } from '../src/items/lootTransfer';
import type { BanditPlayer } from '../src/bandits/perception';

const DT = 1 / 60;
const flat: BanditWorld = { heightAt: () => 0, slopeDegAt: () => 0, isSea: () => false };
const DAY = 86_400;

/** Kamp (0, 0): yol kuzeyde (−z); yaw 0 → ileri −z. */
function camp(patch: Partial<Camp> = {}): Camp {
  return {
    id: 77,
    x: 0,
    z: 0,
    yaw: 0,
    members: 4,
    leaderWeapon: 'shotgun',
    ambush: { x: 0, z: -90 },
    ...patch,
  };
}

function setup(camps: Camp[] = [camp()]) {
  const events = new EventBus<GameEvents>();
  const log: Array<{ name: string; payload: unknown }> = [];
  for (const name of [
    'bandit:noticed',
    'bandit:damaged',
    'bandit:surrendered',
    'bandit:spared',
    'bandit:searched',
    'camp:cleared',
    'camp:looted',
    'noise:made',
  ] as const) {
    events.on(name, (payload: unknown) => log.push({ name, payload }));
  }
  const system = new BanditSystem(events, camps, flat);
  const playerDamage: number[] = [];
  const player: BanditPlayer = {
    x: 0,
    y: 0,
    z: -60,
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
  const ctx = (patch: Partial<BanditContext> = {}): BanditContext => ({
    player,
    hour: 12,
    darkness: 0,
    now: 10 * DAY + 12 * 3600,
    targets: registry,
    prey: () => [],
    ...patch,
  });
  const run = (seconds: number, c: BanditContext = ctx()) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) system.update(DT, c);
  };
  return { events, log, system, player, playerDamage, registry, ctx, run };
}

describe('BanditSystem: kamp canlanması', () => {
  it('oyuncu yaklaşınca kamp üyeleri doğar (reis, nöbetçi, üyeler), uzaklaşınca kalkar', () => {
    const { system, player, run } = setup();
    player.z = -(BANDITS.activeRadius + 50);
    run(1);
    expect(system.views()).toHaveLength(0);
    player.z = -(BANDITS.activeRadius - 10);
    run(1);
    const views = system.views();
    expect(views).toHaveLength(4);
    expect(views.find((v) => v.role === 'leader')?.weapon).toBe('shotgun');
    expect(views.filter((v) => v.role === 'guard')).toHaveLength(1);
    expect(new Set(views.map((v) => v.id)).size).toBe(4);
    player.z = -(BANDITS.activeRadius + BANDITS.despawnMargin + 10);
    run(1);
    expect(system.views()).toHaveLength(0);
  });

  it('ayar kapalıyken hiç eşkıya yok; kapatınca mevcutlar kalkar', () => {
    const { system, run } = setup();
    run(1);
    expect(system.views().length).toBeGreaterThan(0);
    system.setEnabled(false);
    expect(system.views()).toHaveLength(0);
    run(2);
    expect(system.views()).toHaveLength(0);
    expect(system.targetsNear(0, 0, 100)).toEqual([]);
  });

  it('gece uyuyan kamp: gürültü uyandırır', () => {
    const { system, run, ctx, player } = setup();
    player.z = -200; // görüş dışı
    const night = ctx({ hour: 2, darkness: 1 });
    run(3, night);
    const sleepers = system.views().filter((v) => v.state === 'sleep');
    expect(sleepers.length).toBeGreaterThan(0);
    system.hearNoise(0, 0, 50);
    run(0.1, night);
    expect(system.views().filter((v) => v.state === 'sleep')).toHaveLength(0);
  });
});

describe('BanditSystem: savaş', () => {
  it('gündüz önünde duran oyuncuya ateş eder ve isabet ettirir; atış gürültü yayar', () => {
    const { system, run, player, playerDamage, log } = setup([
      camp({ members: 3, leaderWeapon: 'shotgun' }),
    ]);
    player.z = -20;
    run(12);
    expect(playerDamage.length).toBeGreaterThan(0);
    expect(log.some((e) => e.name === 'bandit:noticed')).toBe(true);
    expect(log.some((e) => e.name === 'noise:made')).toBe(true);
    expect(
      system
        .views()
        .some(
          (v) =>
            v.state === 'shoot' ||
            v.state === 'chase' ||
            v.state === 'attack' ||
            v.state === 'cover',
        ),
    ).toBe(true);
  });

  it('camideki oyuncuya saldırmaz: hiç hasar, hiç atış yok', () => {
    const { run, player, playerDamage, log } = setup();
    player.z = -15;
    player.sanctuary = true;
    run(15);
    expect(playerDamage).toEqual([]);
    expect(log.filter((e) => e.name === 'noise:made')).toEqual([]);
  });

  it('pala taşıyan serbest eşkıya kovalar ve yakın vurur', () => {
    const { system, run, player, playerDamage } = setup([]);
    player.z = 0;
    player.x = 0;
    system.spawnAt(0, -12, 'pala');
    run(8);
    expect(playerDamage.some((d) => d === BANDITS.melee.pala.damage)).toBe(true);
  });

  it('oyuncu ve eşkıya isabetleri: hedef sağlayıcısı vurulan eşkıyaya hasar verir', () => {
    const { system, run, registry } = setup();
    run(1);
    const target = registry.targetsNear(0, 0, 20).find((t) => t.kind === 'bandit')!;
    expect(target).toBeDefined();
    registry.applyHit(target.id, 5, { x: 0, y: 0, z: -30, by: 'player' });
    const id = Number(target.id.split(':')[1]);
    expect(system.get(id)!.health).toBe(system.get(id)!.maxHealth - 5);
  });
});

describe('BanditSystem: teslim, bağışlama, üst arama, kamp temizleme', () => {
  function weaken(system: BanditSystem, id: number) {
    const v = system.get(id)!;
    system.damage(id, v.health - v.maxHealth * BANDITS.surrenderHealthFraction * 0.5, {
      x: 0,
      z: -40,
    });
  }

  it('ağır yaralı teslim olur; bağışlanınca silahını bırakır, kaçar ve kaybolur', () => {
    const { system, run, log } = setup();
    run(1);
    const id = system.views()[2]!.id;
    weaken(system, id);
    run(0.2);
    expect(system.get(id)?.state).toBe('surrender');
    expect(log.some((e) => e.name === 'bandit:surrendered')).toBe(true);
    const weapon = system.spare(id);
    expect(weapon).toBe(system.views().find((v) => v.id === id)?.weapon);
    expect(system.spare(id)).toBeNull();
    run(BANDITS.fleeSeconds + 1);
    expect(system.get(id)).toBeNull();
  });

  it('üst arama atomik ve deterministik; yer yoksa hiçbir şey değişmez; ikinci arama boş', () => {
    const { system, run } = setup();
    run(1);
    const v = system.views()[1]!;
    system.damage(v.id, 1000, { x: 0, z: -30 });
    expect(system.get(v.id)?.state).toBe('dead');
    const expected = rollBanditLoot(v.id, v.weapon, BANDITS.seed);
    expect(system.lootOf(v.id)).toEqual(expected);
    const full = new Inventory({ slots: 1, maxWeightG: 100 });
    full.add('tinder', 1);
    expect(system.search(v.id, full)).toBe(expected.length === 0 ? 'ok' : 'full');
    expect(full.toJSON().slots).toEqual([{ id: 'tinder', count: 1 }]);
    const inventory = new Inventory();
    expect(system.search(v.id, inventory)).toBe('ok');
    for (const s of expected) expect(inventory.count(s.id)).toBe(s.count);
    expect(system.search(v.id, inventory)).toBe('empty');
  });

  it('bütün üyeler ölünce kamp temizlenir; kayda girer; yeniden dolma süresinden sonra kamp yeniden canlanır', () => {
    const { system, run, ctx, log } = setup();
    run(1);
    for (const v of system.views()) system.damage(v.id, 1000, { x: 0, z: -30 });
    expect(system.isCleared(77)).toBe(true);
    expect(log.filter((e) => e.name === 'camp:cleared')).toHaveLength(1);
    const save = system.toSave();
    expect(save.cleared).toEqual([{ camp: 77, at: ctx().now }]);
    // Yükleme sonrası temizlenmiş kamp boş kalır.
    const other = setup();
    other.system.loadSave(save);
    other.run(1);
    expect(other.system.views()).toHaveLength(0);
    // Süre dolunca yeniden dolar.
    const later = ctx({ now: ctx().now + BANDITS.reoccupyDays * DAY + 1 });
    other.run(1, later);
    expect(other.system.isCleared(77)).toBe(false);
    expect(other.system.views()).toHaveLength(4);
    expect(other.system.chestOf(77)).toEqual(
      rollCampChest(77, Math.floor(later.now / DAY), BANDITS.seed),
    );
  });

  it('temizlenen kampa dönünce cesetler aynı oturumda yerinde durur', () => {
    const { system, run, player } = setup();
    run(1);
    for (const v of system.views()) system.damage(v.id, 1000, { x: 0, z: -30 });
    player.z = -1000;
    run(1);
    expect(system.views()).toHaveLength(0);
    player.z = -60;
    run(1);
    expect(system.views().every((v) => v.state === 'dead')).toBe(true);
    expect(system.views()).toHaveLength(4);
  });
});

describe('BanditSystem: kamp sandığı ve kayıt', () => {
  it('sandıktan sığanlar alınır, kalanı sandıkta kalır; yankesici ganimeti en yakın sandığa düşer', () => {
    const { system } = setup([camp(), camp({ id: 88, x: 2000, z: 0 })]);
    const full = system.chestOf(77);
    expect(full).toEqual(rollCampChest(77, 0, BANDITS.seed));
    const small = new Inventory({ slots: 2, maxWeightG: 25_000 });
    const taken = system.takeFromChest(77, small);
    expect(taken.length).toBeGreaterThan(0);
    const total = (list: { count: number }[]) => list.reduce((a, s) => a + s.count, 0);
    expect(total(taken) + total(system.chestOf(77))).toBe(total(full));
    expect(system.depositToNearestChest([{ id: 'pekmez', count: 1 }], 1900, 0)).toBe(88);
    expect(system.chestOf(88).find((s) => s.id === 'pekmez')?.count).toBeGreaterThanOrEqual(1);
  });

  it('kayıt gidip gelir', () => {
    const { system } = setup();
    system.chestOf(77);
    system.depositToNearestChest([{ id: 'rifle', count: 1 }], 0, 0);
    const save = system.toSave();
    const other = setup();
    other.system.loadSave(save);
    expect(other.system.toSave()).toEqual(save);
    expect(other.system.chestOf(77)).toEqual(system.chestOf(77));
  });
});

describe('BanditSystem: ganimet paneli', () => {
  it('ceset: liste ilk açılışta zarlanır, kısmi alış korunur, boşalınca ceset aranmış olur', () => {
    const { system, run, log } = setup();
    run(1);
    const dead = system.views()[0]!;
    system.damage(dead.id, 1000, { x: 0, z: -30 });
    const list = system.corpseLoot(dead.id)!;
    expect(list).toEqual(rollBanditLoot(dead.id, dead.weapon, BANDITS.seed));
    expect(system.corpseLoot(dead.id)).toBe(list); // aynı liste (kısmi alış kalıcı)
    const inv = new Inventory();
    const first = takeStack(list, 0, inv);
    if (list.length > 0 || first) system.commitCorpse(dead.id, first ? [first] : []);
    if (list.length > 0) {
      expect(system.views().find((v) => v.id === dead.id)?.searched).toBe(false);
      expect(system.corpseLoot(dead.id)).toBe(list);
    }
    const rest = takeAllStacks(list, inv);
    system.commitCorpse(dead.id, rest);
    expect(system.views().find((v) => v.id === dead.id)?.searched).toBe(true);
    expect(system.corpseLoot(dead.id)).toBeNull();
    expect(log.some((e) => e.name === 'bandit:searched')).toBe(true);
  });

  it('kamp sandığı: panelden alınan yığın düşer, kalan sandıkta kalır', () => {
    const { system, log } = setup();
    const chest = system.chestLoot(77);
    const before = chest.length;
    expect(before).toBeGreaterThan(1);
    const inv = new Inventory();
    const got = takeStack(chest, 0, inv)!;
    system.commitChest(77, [got]);
    expect(system.chestOf(77)).toHaveLength(before - 1);
    const evt = log.find((e) => e.name === 'camp:looted')!.payload as { left: number };
    expect(evt.left).toBe(before - 1);
    // Hiçbir şey alınmadıysa olay yok.
    log.length = 0;
    system.commitChest(77, []);
    expect(log).toHaveLength(0);
  });
});

describe('BanditSystem: av', () => {
  it('avdaki eşkıya karacaya ateş eder (hedefe isabet uygulanır)', () => {
    const { system, ctx } = setup([]);
    const hits: string[] = [];
    const deer: TargetProvider = {
      targetsNear: (x, z, r) =>
        Math.hypot(20 - x, 0 - z) <= r + 1
          ? [{ id: 'creature:5', kind: 'creature', x: 20, y: 0, z: 0, radius: 0.5, height: 1.2 }]
          : [],
      applyHit: (id) => hits.push(id),
    };
    system.spawnAt(0, 0, 'rifle', 'hunt');
    const c = ctx({ targets: deer, prey: () => [{ id: 'creature:5', x: 20, z: 0 }] });
    c.player.z = -150; // görüş dışında ama etkin yarıçapta
    for (let i = 0; i < 60 * 12; i++) system.update(DT, c);
    expect(hits).toContain('creature:5');
  });
});
