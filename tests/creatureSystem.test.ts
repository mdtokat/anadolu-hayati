import { describe, expect, it } from 'vitest';
import { CREATURES } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import type { CreatureContext, CreatureTerrain, CreatureView } from '../src/creatures/kinds';
import { SPECIES } from '../src/creatures/species';
import { fakeTerrain } from './helpers/fakeTerrain';

const DT = 1 / 60;

function context(
  patch: Partial<CreatureContext> & { terrain?: CreatureTerrain | null } = {},
): CreatureContext {
  return {
    player: { x: 0, y: 0, z: 0, activity: 'walk', alive: true, yaw: 0, ...patch.player },
    hour: 12,
    sunAltitudeDeg: 50,
    isNight: false,
    fires: [],
    terrain: patch.terrain === undefined ? fakeTerrain() : patch.terrain,
    ...(patch.fires ? { fires: patch.fires } : {}),
    ...(patch.sunAltitudeDeg !== undefined ? { sunAltitudeDeg: patch.sunAltitudeDeg } : {}),
    ...(patch.structures ? { structures: patch.structures } : {}),
  };
}

function run(system: CreatureSystem, seconds: number, ctx: CreatureContext): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) system.update(DT, ctx);
}

/** Olayları toplayan sistem. */
function setup() {
  const events = new EventBus<GameEvents>();
  const log: Array<{ type: string; payload: unknown }> = [];
  for (const type of [
    'creature:attacked',
    'creature:damaged',
    'creature:died',
    'creature:noticed',
  ] as const) {
    events.on(type, (payload) => log.push({ type, payload }));
  }
  return { events, log, system: new CreatureSystem(events) };
}

/** Kalabalık: çok sayıda aday (her yer orman, kuzeyi görmeyen oyuncu). */
function populate(system: CreatureSystem, ctx = context()): void {
  run(system, 2, ctx);
}

describe('CreatureSystem: akış', () => {
  it('arazi yoksa canlı oluşmaz', () => {
    const { system } = setup();
    run(system, 3, context({ terrain: null }));
    expect(system.views()).toEqual([]);
    expect(system.stats).toEqual({ active: 0, carcasses: 0 });
  });

  it('oyuncu çevresinde canlı doğar; her biri minSpawnDistance–simRadius arasındadır', () => {
    const { system } = setup();
    populate(system);
    const views = system.views();
    expect(views.length).toBeGreaterThan(0);
    for (const v of views) {
      const d = Math.hypot(v.x, v.z);
      expect(d).toBeGreaterThanOrEqual(CREATURES.minSpawnDistance - 1e-6);
      expect(d).toBeLessThanOrEqual(CREATURES.simRadius + 1e-6);
    }
  });

  it('oyuncunun görüş konisinde yakın yerde doğmaz (yaw 0 = kuzey)', () => {
    const { system } = setup();
    populate(system);
    for (const v of system.views()) {
      const d = Math.hypot(v.x, v.z);
      if (d < CREATURES.spawnHiddenDistance) {
        const angle = Math.abs(Math.atan2(-v.x, -v.z)); // yaw'a göre fark (yaw = 0)
        expect(angle).toBeGreaterThan((CREATURES.spawnViewHalfAngleDeg * Math.PI) / 180 - 0.2);
      }
    }
  });

  it('maxActive aşılmaz', () => {
    const { system } = setup();
    const t = fakeTerrain({ half: 4000 });
    const ctx = context({ terrain: t });
    // Oyuncu dolaşarak birçok hücreden canlı toplar.
    for (let i = 0; i < 40; i++) {
      ctx.player.x = -3000 + i * 150;
      ctx.player.z = -1000 + (i % 7) * 300;
      run(system, 1, ctx);
      expect(system.stats.active).toBeLessThanOrEqual(CREATURES.maxActive);
    }
  });

  it('deterministik: aynı girdi → aynı canlılar ve konumlar', () => {
    const a = setup().system;
    const b = setup().system;
    const ctx = context();
    run(a, 20, ctx);
    run(b, 20, ctx);
    const snap = (system: CreatureSystem) =>
      JSON.stringify(system.views().map((v) => ({ ...v, x: +v.x.toFixed(5), z: +v.z.toFixed(5) })));
    expect(a.views().length).toBeGreaterThan(0);
    expect(snap(a)).toBe(snap(b));
  });

  it('kurt gündüz yok/az, gece var (zaman penceresi)', () => {
    const counts = (alt: number) => {
      let total = 0;
      for (let epoch = 0; epoch < 6; epoch++) {
        const { system } = setup();
        const ctx = context({ terrain: fakeTerrain({ half: 3000 }), sunAltitudeDeg: alt });
        // Dönemleri kaydırmak için oyuncuyu farklı yerlere koy.
        ctx.player.x = epoch * 700 - 1500;
        ctx.player.z = 300;
        run(system, 8, ctx);
        total += system.views().filter((v) => v.kind === 'wolf').length;
      }
      return total;
    };
    const day = counts(50);
    const night = counts(-30);
    expect(night).toBeGreaterThan(day);
    expect(night).toBeGreaterThan(0);
  });

  it('pencere dışına çıkan canlı görünmüyorsa sessizce kaldırılır', () => {
    const { system } = setup();
    const t = fakeTerrain({ half: 3000 });
    const night = context({ terrain: t, sunAltitudeDeg: -30 });
    night.player.x = 200;
    run(system, 2, night);
    const wolves = system.views().filter((v) => v.kind === 'wolf').length;
    // Gündüze geç: oyuncu kuzeye bakıyor; kurtlar (görüş dışında ve 90 m'den uzak) kalkmalı.
    const day = context({ terrain: t, sunAltitudeDeg: 50 });
    day.player.x = 200;
    run(system, 3, day);
    const after = system.views().filter((v) => v.kind === 'wolf').length;
    expect(after).toBeLessThanOrEqual(wolves);
  });

  it('yapıların çevresinde doğmaz', () => {
    const { system } = setup();
    const structures = [{ x: 0, z: 150 }];
    const ctx = context({ structures });
    run(system, 2, ctx);
    for (const v of system.views()) {
      expect(Math.hypot(v.x - 0, v.z - 150)).toBeGreaterThanOrEqual(
        CREATURES.structureClearance - 1e-6,
      );
    }
  });

  it('oyuncu ölüyken yeni canlı doğmaz', () => {
    const { system } = setup();
    const ctx = context();
    ctx.player.alive = false;
    run(system, 3, ctx);
    expect(system.views()).toHaveLength(0);
  });

  it('despawnRadius dışındaki canlılar kaldırılır; durum haritası büyümez', () => {
    const { system } = setup();
    const t = fakeTerrain({ half: 6000 });
    const ctx = context({ terrain: t });
    let maxActive = 0;
    for (let i = 0; i < 60; i++) {
      ctx.player.x = -5000 + i * 160;
      run(system, 1, ctx);
      maxActive = Math.max(maxActive, system.stats.active);
      for (const v of system.views()) {
        expect(Math.hypot(v.x - ctx.player.x, v.z - ctx.player.z)).toBeLessThanOrEqual(
          CREATURES.despawnRadius + 5,
        );
      }
    }
    expect(maxActive).toBeLessThanOrEqual(CREATURES.maxActive);
    expect(system.stats.active).toBeLessThanOrEqual(CREATURES.maxActive);
  });

  it('dispose durumu temizler', () => {
    const { system } = setup();
    populate(system);
    expect(system.stats.active).toBeGreaterThan(0);
    system.dispose();
    expect(system.views()).toEqual([]);
    expect(system.stats.active).toBe(0);
  });
});

describe('CreatureSystem: hasar, ölüm ve leş', () => {
  function firstOf(system: CreatureSystem, kind?: string): CreatureView {
    const v = system.views().find((x) => !kind || x.kind === kind) ?? system.views()[0];
    if (!v) throw new Error('canlı yok');
    return v;
  }

  it('damage: sağlık düşer, parlama, `creature:damaged`; ölünce `creature:died` bir kez ve leş kalır', () => {
    const { system, log } = setup();
    populate(system);
    const v = firstOf(system);
    const id = v.id;
    const max = v.maxHealth;

    const first = system.damage(id, 5, { x: 0, z: 0 });
    expect(first).toEqual({ killed: false });
    expect(system.views().find((x) => x.id === id)?.health).toBe(max - 5);
    expect(system.views().find((x) => x.id === id)?.hitFlash).toBe(1);
    expect(log.filter((e) => e.type === 'creature:damaged')).toHaveLength(1);
    expect(log.some((e) => e.type === 'creature:died')).toBe(false);

    const killed = system.damage(id, 1000, { x: 0, z: 0 });
    expect(killed).toEqual({ killed: true });
    const died = log.filter((e) => e.type === 'creature:died');
    expect(died).toHaveLength(1);
    expect(died[0]?.payload).toMatchObject({ id });
    const carcass = system.views().find((x) => x.id === id)!;
    expect(carcass).toMatchObject({ dead: true, state: 'dead', health: 0, speed: 0 });
    expect(system.stats.carcasses).toBe(1);

    // Ölüye hasar: null, olay yok.
    expect(system.damage(id, 10, { x: 0, z: 0 })).toBeNull();
    expect(log.filter((e) => e.type === 'creature:died')).toHaveLength(1);
    // Var olmayan kimlik.
    expect(system.damage(-5, 10, { x: 0, z: 0 })).toBeNull();
  });

  it('hasar ≤ 0 etkisiz', () => {
    const { system, log } = setup();
    populate(system);
    const v = firstOf(system);
    expect(system.damage(v.id, 0, { x: 0, z: 0 })).toEqual({ killed: false });
    expect(system.damage(v.id, -3, { x: 0, z: 0 })).toEqual({ killed: false });
    expect(system.views().find((x) => x.id === v.id)?.health).toBe(v.maxHealth);
    expect(log.filter((e) => e.type === 'creature:damaged')).toHaveLength(0);
  });

  it('removeCarcass yalnızca leşi kaldırır', () => {
    const { system } = setup();
    populate(system);
    const [a, b] = system.views();
    expect(a && b).toBeTruthy();
    expect(system.removeCarcass(a!.id)).toBe(false); // canlı
    expect(system.views().some((x) => x.id === a!.id)).toBe(true);
    system.damage(a!.id, 1e6, { x: 0, z: 0 });
    expect(system.removeCarcass(a!.id)).toBe(true);
    expect(system.views().some((x) => x.id === a!.id)).toBe(false);
    expect(system.removeCarcass(a!.id)).toBe(false); // zaten yok
    expect(system.views().some((x) => x.id === b!.id)).toBe(true);
  });

  it('leş carcassSeconds sonra kendiliğinden kaybolur; deadSeconds artar', () => {
    const { system } = setup();
    const ctx = context();
    populate(system, ctx);
    const v = firstOf(system);
    system.damage(v.id, 1e6, { x: 0, z: 0 });
    run(system, 5, ctx);
    expect(system.views().find((x) => x.id === v.id)?.deadSeconds).toBeGreaterThan(4.5);
    // Zamanı hızlandır: büyük adımlarla.
    for (let i = 0; i < CREATURES.carcassSeconds + 10; i++) system.update(1, ctx);
    expect(system.views().some((x) => x.id === v.id)).toBe(false);
  });

  it('öldürülen canlının hücresi respawnCooldownSeconds boyunca yeniden doğurmaz', () => {
    const { system } = setup();
    const ctx = context();
    populate(system, ctx);
    const victims = system.views().slice();
    for (const v of victims) {
      system.damage(v.id, 1e6, { x: 0, z: 0 });
      system.removeCarcass(v.id);
    }
    const killedIds = new Set(victims.map((v) => v.id));
    run(system, 10, ctx);
    expect(system.views().some((v) => killedIds.has(v.id))).toBe(false);
    expect(system.killedSnapshot().length).toBeGreaterThan(0);
    // Bekleme dolunca hücreler yeniden doğurur.
    for (let i = 0; i < CREATURES.respawnCooldownSeconds + 5; i++) system.update(1, ctx);
    expect(system.killedSnapshot()).toHaveLength(0);
  });

  it('kaydedilen bekleme listesi geri yüklenir', () => {
    const { system } = setup();
    system.restoreKilled([{ cell: 7, remainingSeconds: 30 }]);
    expect(system.killedSnapshot()).toEqual([{ cell: 7, remainingSeconds: 30 }]);
  });

  it('vurulan karaca kaçar, vurulan domuz kovalar; geri tepme yön verir', () => {
    const { system } = setup();
    const ctx = context({ terrain: fakeTerrain({ half: 3000 }) });
    // Kabaca hedef türleri bulana dek oyuncuyu gezdir.
    let deer: CreatureView | undefined;
    let boar: CreatureView | undefined;
    for (let i = 0; i < 60 && !(deer && boar); i++) {
      ctx.player.x = i * 400 - 2000;
      run(system, 3, ctx);
      deer = system.views().find((v) => v.kind === 'roe_deer');
      boar = system.views().find((v) => v.kind === 'wild_boar');
    }
    expect(deer).toBeTruthy();
    expect(boar).toBeTruthy();
    const from = { x: ctx.player.x, z: ctx.player.z };
    system.damage(deer!.id, 1, from);
    system.damage(boar!.id, 1, from);
    run(system, 0.2, ctx);
    const d = system.views().find((v) => v.id === deer!.id)!;
    const b = system.views().find((v) => v.id === boar!.id)!;
    expect(d.state).toBe('flee');
    expect(['chase', 'attack']).toContain(b.state);
  });

  it('`near` yakından uzağa sıralar', () => {
    const { system } = setup();
    populate(system);
    const list = system.near(0, 0, CREATURES.simRadius + 10);
    expect(list.length).toBe(system.views().length);
    for (let i = 1; i < list.length; i++) {
      expect(Math.hypot(list[i]!.x, list[i]!.z)).toBeGreaterThanOrEqual(
        Math.hypot(list[i - 1]!.x, list[i - 1]!.z),
      );
    }
    expect(system.near(0, 0, 1)).toEqual([]);
  });
});

describe('CreatureSystem: spawnAt ve yaralı kaçış (5.12)', () => {
  const quiet = () => context({ terrain: fakeTerrain({ half: 3000, cover: 'urban' }) });

  it('spawnAt belirtilen noktada canlı doğurur (kimlik aday kimlikleriyle çakışmaz); arazi yoksa null', () => {
    const { system } = setup();
    expect(system.spawnAt('wolf', 0, -50)).toBeNull(); // henüz güncellenmedi: ızgara yok
    system.update(DT, quiet());
    const id = system.spawnAt('wolf', 10, -50, 1);
    expect(id).not.toBeNull();
    const v = system.views().find((x) => x.id === id)!;
    expect(v).toMatchObject({ kind: 'wolf', x: 10, z: -50, dead: false });
    expect(v.yaw).toBeCloseTo(1);
    expect(system.spawnAt('wolf', 99999, 0)).toBeNull(); // bölge dışı
    const other = system.spawnAt('wolf', 10, -50)!;
    expect(other).not.toBe(id);
  });

  it('yaralı kaçan karaca sağlam olandan yavaştır ve oyuncu yetişebilir', () => {
    const speedOf = (damage: number) => {
      const { system } = setup();
      const ctx = quiet();
      system.update(DT, ctx);
      const id = system.spawnAt('roe_deer', 0, -20, 0)!;
      if (damage > 0) system.damage(id, damage, { x: 0, z: 0 });
      else ctx.fires = [{ x: 0, z: -18 }]; // sağlam karaca: ateşten kaçar (aynı kaçış hızı)
      run(system, 1.5, ctx);
      const v = system.views().find((x) => x.id === id)!;
      expect(v.state).toBe('flee');
      return v.speed;
    };
    const healthy = speedOf(0);
    const hurt = speedOf(28);
    expect(healthy).toBeCloseTo(SPECIES.roe_deer.runSpeed, 0);
    expect(hurt).toBeLessThan(healthy);
    expect(hurt).toBeLessThan(7); // oyuncunun koşu hızı
  });
});

describe('CreatureSystem: saldırı olayı', () => {
  it('kışkırtılan domuz oyuncuya saldırır: `creature:attacked` ham hasarla, bekleme aralığıyla', () => {
    const { system, log } = setup();
    const t = fakeTerrain({ half: 3000 });
    const ctx = context({ terrain: t });
    let boar: CreatureView | undefined;
    for (let i = 0; i < 100 && !boar; i++) {
      ctx.player.x = -2500 + i * 40;
      ctx.player.z = ((i * 37) % 600) - 300;
      run(system, 1, ctx);
      boar = system.views().find((v) => v.kind === 'wild_boar');
    }
    expect(boar).toBeTruthy();

    // Oyuncuyu domuzun yanına taşı ve vur (kışkırt).
    ctx.player.x = boar!.x + 1;
    ctx.player.z = boar!.z;
    system.damage(boar!.id, 1, { x: ctx.player.x, z: ctx.player.z });
    log.length = 0;
    run(system, 6, ctx);
    const attacks = log.filter((e) => e.type === 'creature:attacked');
    const own = attacks.filter((e) => (e.payload as { id: number }).id === boar!.id);
    expect(own.length).toBeGreaterThanOrEqual(2);
    for (const a of attacks) {
      expect(a.payload).toMatchObject({
        kind: 'wild_boar',
        damage: SPECIES.wild_boar.attackDamage,
      });
    }
    // Oyuncuyu fark ettiği bildirildi (bir kez).
    expect(
      log.filter(
        (e) => e.type === 'creature:noticed' && (e.payload as { id: number }).id === boar!.id,
      ),
    ).toHaveLength(1);
  });

  it('ölü oyuncuya saldırmaz', () => {
    const { system, log } = setup();
    const ctx = context({ terrain: fakeTerrain({ half: 3000 }) });
    let boar: CreatureView | undefined;
    for (let i = 0; i < 100 && !boar; i++) {
      ctx.player.x = -2500 + i * 40;
      run(system, 1, ctx);
      boar = system.views().find((v) => v.kind === 'wild_boar');
    }
    ctx.player.x = boar!.x + 1;
    ctx.player.z = boar!.z;
    system.damage(boar!.id, 1, { x: ctx.player.x, z: ctx.player.z });
    ctx.player.alive = false;
    log.length = 0;
    run(system, 5, ctx);
    expect(log.filter((e) => e.type === 'creature:attacked')).toHaveLength(0);
  });
});

describe('CreatureSystem: cami kutsal alandır (Faz 10)', () => {
  const night = (sanctuary: boolean) => {
    const base = context({
      terrain: fakeTerrain({ half: 3000, cover: 'urban' }),
      sunAltitudeDeg: -20,
    });
    return { ...base, hour: 23, isNight: true, player: { ...base.player, sanctuary } };
  };

  it('camideki oyuncuyu kurt algılamaz ve saldırmaz; dışarıdaki oyuncuya saldırır', () => {
    const attacks = (sanctuary: boolean) => {
      const { system, log } = setup();
      const ctx = night(sanctuary);
      system.update(DT, ctx);
      system.spawnAt('wolf', 0, -6, 0);
      run(system, 8, ctx);
      return log.filter((e) => e.type === 'creature:attacked').length;
    };
    expect(attacks(true)).toBe(0);
    expect(attacks(false)).toBeGreaterThan(0);
  });
});
