import { describe, expect, it, vi } from 'vitest';
import { CLIMATE, CLOCK, SHELTER_EFFECTS, SURVIVAL } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { ambientTemperature } from '../src/survival/climate';
import { SurvivalSystem, type SurvivalContext } from '../src/survival/SurvivalSystem';

const DT = 1 / 60;
const idle = (elevationM = 50): SurvivalContext => ({
  activity: 'rest',
  elevationM,
  drinking: false,
});

function setup() {
  const bus = new EventBus<GameEvents>();
  const died = vi.fn();
  const respawned = vi.fn();
  const drank = vi.fn();
  bus.on('player:died', died);
  bus.on('player:respawned', respawned);
  bus.on('player:drank', drank);
  const system = new SurvivalSystem(bus);
  return { bus, system, died, respawned, drank };
}

/** Ölene ya da `maxSeconds` dolana dek çalıştırır. */
function run(
  system: SurvivalSystem,
  context: SurvivalContext,
  maxSeconds: number,
  dt = DT,
): number {
  let t = 0;
  while (system.alive && t < maxSeconds) {
    system.update(dt, context);
    t += dt;
  }
  return t;
}

describe('SurvivalSystem: temel akış', () => {
  it('canlı, dolu göstergelerle ve config saatinde başlar', () => {
    const { system } = setup();
    expect(system.alive).toBe(true);
    expect(system.state.health).toBe(100);
    expect(system.clock.hour).toBe(CLOCK.startHour);
    expect(system.deathInfo).toBeNull();
    expect(system.deathCount).toBe(0);
  });

  it('update saati ilerletir ve ortam sıcaklığını rakıma göre hesaplar', () => {
    const { system } = setup();
    system.update(60, idle(0));
    expect(system.clock.hour).toBeCloseTo(CLOCK.startHour + 1, 6); // 1 gerçek dk = 1 oyun saati
    const low = ambientTemperature({
      hour: system.clock.hour,
      dayOfYear: CLOCK.dayOfYear,
      elevationM: 0,
    });
    expect(system.ambientC).toBeCloseTo(low, 9);
    system.update(DT, idle(1500));
    expect(system.ambientC).toBeLessThan(low - 8);
  });

  it('deniz altı (negatif rakım) deniz seviyesi gibi', () => {
    const a = new SurvivalSystem();
    const b = new SurvivalSystem();
    a.update(DT, idle(-40));
    b.update(DT, idle(0));
    expect(a.ambientC).toBe(b.ambientC);
  });
});

describe('SurvivalSystem: ölüm ve yeniden doğma', () => {
  it('hareketsiz oyuncu ~20 dk içinde ölür; player:died bir kez, nedenle yayınlanır', () => {
    const { system, died } = setup();
    // Aynı rakımda (kıyı) tüm gün döngüsü içinde: gece kıyıda güvenli, ölüm susuzluktan
    const t = run(system, idle(50), 40 * 60, 1 / 10);
    expect(system.alive).toBe(false);
    expect(t / 60).toBeGreaterThan(19);
    expect(t / 60).toBeLessThan(22);
    expect(died).toHaveBeenCalledTimes(1);
    const payload = died.mock.calls[0]?.[0] as {
      cause: string;
      survivedSeconds: number;
      day: number;
    };
    expect(payload.cause).toBe('dehydration');
    expect(payload.survivedSeconds).toBeCloseTo(t, 0);
    expect(payload.day).toBeGreaterThanOrEqual(0);
    expect(system.deathInfo?.cause).toBe('dehydration');
  });

  it('ölüyken update hiçbir şeyi değiştirmez (saat dondu, tekrar olay yok)', () => {
    const { system, died } = setup();
    run(system, idle(), 40 * 60, 1 / 10);
    const hour = system.clock.hour;
    const health = system.state.health;
    system.update(600, idle());
    expect(system.clock.hour).toBe(hour);
    expect(system.state.health).toBe(health);
    expect(died).toHaveBeenCalledTimes(1);
  });

  it('respawn göstergeleri doldurur, saati korur, olay yayınlar, ölüm sayısını artırır', () => {
    const { system, respawned } = setup();
    run(system, idle(), 40 * 60, 1 / 10);
    const hour = system.clock.hour;
    system.respawn();
    expect(system.alive).toBe(true);
    expect(system.state).toEqual({
      health: 100,
      satiety: 100,
      hydration: 100,
      energy: 100,
      bodyTemp: SURVIVAL.bodyTempNormalC,
      exhausted: false,
    });
    expect(system.clock.hour).toBe(hour);
    expect(system.deathCount).toBe(1);
    expect(respawned).toHaveBeenCalledWith({ deaths: 1 });
    expect(system.deathInfo).toBeNull();
  });

  it('canlıyken respawn etkisizdir', () => {
    const { system, respawned } = setup();
    system.respawn();
    expect(system.deathCount).toBe(0);
    expect(respawned).not.toHaveBeenCalled();
  });

  it('ikinci yaşamda hayatta kalma süresi sıfırdan sayılır', () => {
    const { system, died } = setup();
    run(system, idle(), 40 * 60, 1 / 10);
    system.respawn();
    run(system, idle(), 40 * 60, 1 / 10);
    const second = died.mock.calls[1]?.[0] as { survivedSeconds: number };
    expect(died).toHaveBeenCalledTimes(2);
    expect(second.survivedSeconds / 60).toBeGreaterThan(19);
    expect(second.survivedSeconds / 60).toBeLessThan(22);
    expect(system.deathCount).toBe(1);
  });
});

describe('SurvivalSystem: içme', () => {
  it('içme oturumu suyu doldurur ve bitince player:drank yayınlar', () => {
    const { system, drank } = setup();
    system.setVitals({ hydration: 20 });
    for (let i = 0; i < 60 * 5; i++)
      system.update(DT, { activity: 'rest', elevationM: 50, drinking: true });
    expect(system.state.hydration).toBeGreaterThan(50);
    expect(system.drinking).toBe(true);
    expect(drank).not.toHaveBeenCalled(); // oturum sürüyor
    system.update(DT, idle());
    expect(system.drinking).toBe(false);
    expect(drank).toHaveBeenCalledTimes(1);
    expect((drank.mock.calls[0]?.[0] as { amount: number }).amount).toBeGreaterThan(30);
  });

  it('eksiklik eşiğin altındaysa (doluya yakın) içme oturumu başlamaz; eşiği aşınca başlar', () => {
    const { system } = setup();
    system.setVitals({ hydration: 100 - SURVIVAL.drinkMinDeficit + 0.1 });
    system.update(DT, { activity: 'rest', elevationM: 50, drinking: true });
    expect(system.drinking).toBe(false);
    system.setVitals({ hydration: 100 - SURVIVAL.drinkMinDeficit - 0.5 });
    system.update(DT, { activity: 'rest', elevationM: 50, drinking: true });
    expect(system.drinking).toBe(true);
  });

  it('su zaten doluysa içme oturumu başlamaz', () => {
    const { system, drank } = setup();
    for (let i = 0; i < 60; i++)
      system.update(DT, { activity: 'rest', elevationM: 50, drinking: true });
    expect(system.drinking).toBe(false);
    expect(drank).not.toHaveBeenCalled();
  });

  it('içerek susuzluk ölümü önlenir: 30 dk hareketsiz yaşar (yemek dışında)', () => {
    const { system } = setup();
    let t = 0;
    while (system.alive && t < 30 * 60) {
      const thirsty = system.state.hydration < 60;
      system.update(1 / 10, { activity: 'rest', elevationM: 50, drinking: thirsty });
      t += 1 / 10;
    }
    expect(system.alive).toBe(true);
    expect(system.state.hydration).toBeGreaterThan(20);
  });
});

describe('SurvivalSystem: dinamik gün döngüsünde rakım tehlikesi (gerçek saat + iklim)', () => {
  /** Bir tam oyun günü (24 gerçek dk) boyunca hareketsiz, aç/susuz kalmadan: en düşük ısı ve toplam hasar. */
  function dayAt(elevationM: number) {
    const system = new SurvivalSystem(undefined, { startHour: 12 });
    let minTemp = Infinity;
    let minHealth = 100;
    const steps = CLOCK.dayLengthSeconds * 10; // 0,1 sn adım
    for (let i = 0; i < steps && system.alive; i++) {
      system.setVitals({ hydration: 100, satiety: 100 });
      system.update(0.1, { activity: 'rest', elevationM, drinking: false });
      minTemp = Math.min(minTemp, system.state.bodyTemp);
      minHealth = Math.min(minHealth, system.state.health);
    }
    return { alive: system.alive, minTemp, minHealth, death: system.deathInfo };
  }

  it('kıyıda bir tam gün: ısı ve can etkilenmez', () => {
    const r = dayAt(50);
    expect(r.alive).toBe(true);
    expect(r.minHealth).toBe(100);
    expect(r.minTemp).toBeGreaterThan(SURVIVAL.hypothermiaBelowC);
  });

  it('rakım arttıkça en düşük vücut ısısı tekdüze düşer; zirvede gece belirgin tehlikeli', () => {
    const temps = [50, 500, 1000, 1500, 2000].map((m) => dayAt(m).minTemp);
    for (let i = 1; i < temps.length; i++) expect(temps[i]).toBeLessThan(temps[i - 1] as number);
    // 2000 m'de en düşük ısı, kıyıdakinden ≥ 3 °C daha düşük
    expect((temps[0] as number) - (temps[4] as number)).toBeGreaterThan(3);
  });

  it('zirvede (2000 m) bir gün içinde gece hipotermi hasarı görülür', () => {
    const r = dayAt(2000);
    expect(r.minHealth).toBeLessThan(100);
    expect(r.minTemp).toBeLessThan(SURVIVAL.hypothermiaBelowC);
  });

  it('ambient gece sıcaklığı gündüzden düşük (saat + iklim entegrasyonu)', () => {
    const noon = ambientTemperature({
      hour: CLIMATE.warmestHour,
      dayOfYear: CLOCK.dayOfYear,
      elevationM: 0,
    });
    const system = new SurvivalSystem(undefined, { startHour: CLIMATE.warmestHour + 12 });
    system.update(DT, idle(0));
    expect(system.ambientC).toBeLessThan(noon - 7);
  });
});

describe('ateş ve barınak bağlamı (Faz 4.9)', () => {
  /** Geceyarısı, 1500 m: korunmasız oyuncu için ölümcül. */
  const freezing = (extra: Partial<SurvivalContext>): SurvivalContext => ({
    ...idle(1500),
    ...extra,
  });
  const startAtNight = () => new SurvivalSystem(undefined, { startHour: CLIMATE.warmestHour - 12 });
  const keepFed = (system: SurvivalSystem) => system.setVitals({ hydration: 100, satiety: 100 });

  function survive(context: SurvivalContext, seconds: number): SurvivalSystem {
    const system = startAtNight();
    for (let t = 0; t < seconds && system.alive; t += 1) {
      keepFed(system);
      system.update(1, context);
    }
    return system;
  }

  it('bağlam alanları verilmezse, açık 0/false ile birebir aynı sonuç', () => {
    const implicit = survive(freezing({}), 300);
    const explicit = survive(freezing({ warmthC: 0, sheltered: false }), 300);
    expect(explicit.state).toEqual(implicit.state);
    expect(implicit.state.bodyTemp).toBeLessThan(SURVIVAL.bodyTempNormalC - 1);
  });

  it('warmthC ısıyı dengeye yansıtır; ateş başında vücut ısısı normale yakın kalır', () => {
    const system = survive(freezing({ warmthC: SHELTER_EFFECTS.fireWarmth.maxC }), 600);
    expect(system.alive).toBe(true);
    expect(system.state.bodyTemp).toBeGreaterThan(36);
    expect(system.state.health).toBe(100);
  });

  it('sheltered soğuğu yumuşatır: aynı sürede korunmasıza göre daha yüksek vücut ısısı', () => {
    const bare = survive(freezing({}), 400);
    const covered = survive(freezing({ sheltered: true }), 400);
    expect(covered.state.bodyTemp).toBeGreaterThan(bare.state.bodyTemp + 0.5);
  });
});
