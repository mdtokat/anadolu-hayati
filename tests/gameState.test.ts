import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import { GatherSystem } from '../src/interaction/gather';
import { Inventory } from '../src/items/Inventory';
import { StructureSet } from '../src/placement/structures';
import { applySave, captureSave, type SaveTargets } from '../src/save/gameState';
import { SaveError, type PlayerSave } from '../src/save/saveGame';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import type { PropRef } from '../src/world/propKinds';

const REGION = 'zonguldak-bartin-karabuk';
const NOW = new Date('2026-10-01T10:00:00.000Z');
const DT = 1 / 60;

/** Gerçek sistemlerle (yalnızca oyuncu konumu sahte) bir "oyun" kurar. */
function makeGame() {
  const events = new EventBus<GameEvents>();
  const inventory = new Inventory();
  const structures = new StructureSet();
  const gather = new GatherSystem(events, inventory);
  const survival = new SurvivalSystem(events);
  const creatures = new CreatureSystem(events);
  const pose: { current: PlayerSave } = {
    current: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
  };
  const targets: SaveTargets = {
    regionId: REGION,
    player: { read: () => ({ ...pose.current }), apply: (p) => (pose.current = { ...p }) },
    survival,
    inventory,
    structures,
    gather,
    creatures,
  };
  const hold = (prop: PropRef, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) gather.update(DT, true, prop);
  };
  return { events, inventory, structures, gather, survival, creatures, pose, targets, hold };
}

const prop = (kind: PropRef['kind'], id: number): PropRef => ({
  id,
  kind,
  x: 0,
  y: 0,
  z: -2,
  scale: 1,
});

/** Oynanmış, her sistemde izi olan bir oyun durumu. */
function playedGame() {
  const g = makeGame();
  g.pose.current = { x: 123.4, y: 17.25, z: -987.6, yaw: 2.5, pitch: -0.4 };
  g.survival.update(1, { activity: 'walk', elevationM: 600, drinking: false });
  g.survival.clock.skipHours(30); // 1 gün 6 saat
  g.survival.setVitals({ health: 71, satiety: 40, hydration: 33.5, energy: 12, bodyTemp: 35.8 });
  g.inventory.add('stick', 13);
  g.inventory.add('stone', 4);
  g.inventory.add('hazelnut', 9);
  const fire = g.structures.add('campfire', 10, 2, -30, 0.5);
  g.structures.update(100); // yakıt azalsın
  g.structures.add('lean_to', 14, 2, -31, 1);
  g.hold(prop('bush', 70_001), 5); // elle toplama: handDone
  g.hold(prop('rock', 70_002), 5);
  g.creatures.restoreKilled([{ cell: 4097, remainingSeconds: 222.5 }]);
  return { ...g, fireId: fire.id };
}

describe('captureSave / applySave: gidiş-dönüş', () => {
  it('kaydedilip yeni bir oyuna yüklenen durum birebir aynıdır', () => {
    const a = playedGame();
    const save = captureSave(a.targets, NOW);

    const b = makeGame();
    applySave(save, b.targets);
    expect(captureSave(b.targets, NOW)).toEqual(save);
  });

  it('JSON üzerinden (IndexedDB benzeri serileştirme) de birebir aynıdır', () => {
    const a = playedGame();
    const save = captureSave(a.targets, NOW);
    const b = makeGame();
    applySave(JSON.parse(JSON.stringify(save)), b.targets);
    expect(captureSave(b.targets, NOW)).toEqual(save);
  });

  it('kayıt gerçekten oynanmış durumu taşır (boş değil)', () => {
    const save = captureSave(playedGame().targets, NOW);
    expect(save.player).toEqual({ x: 123.4, y: 17.25, z: -987.6, yaw: 2.5, pitch: -0.4 });
    expect(save.survival.clockDay).toBe(1);
    expect(save.survival.vitals.hydration).toBe(33.5);
    expect(save.inventory.slots.some((s) => s?.id === 'stick')).toBe(true);
    expect(save.structures.structures).toHaveLength(2);
    expect(save.world.handDone).toEqual([70_001, 70_002]);
    expect(save.creatures.killed).toEqual([{ cell: 4097, remainingSeconds: 222.5 }]);
  });

  it('yükleme, dolu bir oyunun üzerine yazar (eski durum kalmaz)', () => {
    const empty = makeGame();
    const save = captureSave(empty.targets, NOW);

    const busy = playedGame();
    applySave(save, busy.targets);
    expect(captureSave(busy.targets, NOW)).toEqual(save);
    expect(busy.structures.toJSON().structures).toHaveLength(0);
    expect(busy.inventory.totalWeightG).toBe(0);
    expect(busy.gather.isRemoved(70_001)).toBe(false);
  });
});

describe('applySave: yerinde yükleme', () => {
  it('başka nesnelerin tuttuğu örnekler aynı kalır; sürüm artar (arayüz/görsel yenilenir)', () => {
    const save = captureSave(playedGame().targets, NOW);
    const b = makeGame();
    const invVersion = b.inventory.version;
    const structVersion = b.structures.version;
    applySave(save, b.targets);
    expect(b.inventory.version).toBeGreaterThan(invVersion);
    expect(b.structures.version).toBeGreaterThan(structVersion);
  });

  it('yüklemeden sonra yapı kimlikleri devam eder (çakışma yok)', () => {
    const a = playedGame();
    const save = captureSave(a.targets, NOW);
    const b = makeGame();
    applySave(save, b.targets);
    const next = b.structures.add('lean_to', 0, 0, 0);
    expect(next.id).toBe(3);
  });

  it('yüklenen ateş yakıtı kayıttaki kadardır ve yanmaya devam eder', () => {
    const a = playedGame();
    const fuel = a.structures.get(a.fireId)?.fuelSeconds as number;
    const b = makeGame();
    applySave(captureSave(a.targets, NOW), b.targets);
    expect(b.structures.get(a.fireId)?.fuelSeconds).toBe(fuel);
    b.structures.update(10);
    expect(b.structures.get(a.fireId)?.fuelSeconds).toBeCloseTo(fuel - 10, 6);
  });

  it('toplanmış nesne yüklemeden sonra yeniden toplanamaz', () => {
    const a = playedGame();
    const b = makeGame();
    applySave(captureSave(a.targets, NOW), b.targets);
    expect(b.gather.inspect(prop('bush', 70_001))).toBeNull();
    expect(b.gather.inspect(prop('bush', 70_999))?.status).toBe('ready');
  });

  it('yükleme sürmekte olan toplama ilerlemesini sıfırlar', () => {
    const b = makeGame();
    const target = prop('bush', 1);
    for (let i = 0; i < 30; i++) b.gather.update(DT, true, target);
    expect(b.gather.progress).toBeGreaterThan(0);
    applySave(captureSave(makeGame().targets, NOW), b.targets);
    expect(b.gather.progress).toBe(0);
    expect(b.gather.offer).toBeNull();
  });
});

describe('applySave: hayatta kalma', () => {
  it('ölü oyuncu yüklenince canlanır', () => {
    const save = captureSave(playedGame().targets, NOW);
    const dead = makeGame();
    dead.survival.setVitals({ health: 0, hydration: 0 });
    dead.survival.update(1, { activity: 'rest', elevationM: 0, drinking: false });
    expect(dead.survival.alive).toBe(false);
    applySave(save, dead.targets);
    expect(dead.survival.alive).toBe(true);
    expect(dead.survival.state.health).toBe(71);
  });

  it('yükleme gece/gündüz olayı yayınlamaz ama bayrak saate uyar', () => {
    const day = makeGame();
    day.survival.clock.setHour(12);
    const save = captureSave(day.targets, NOW);

    const night = makeGame();
    night.survival.clock.setHour(2);
    expect(night.survival.clock.isNight).toBe(true);
    const seen: string[] = [];
    night.events.on('time:dayStarted', () => seen.push('day'));
    night.events.on('time:nightStarted', () => seen.push('night'));
    applySave(save, night.targets);
    expect(night.survival.clock.hour).toBe(12);
    expect(night.survival.clock.isNight).toBe(false);
    expect(seen).toEqual([]);
  });

  it('ölüm sayısı ve yaşam süresi korunur (yeniden doğma noktası tohumu)', () => {
    const a = makeGame();
    a.survival.setVitals({ health: 0, hydration: 0 });
    a.survival.update(1, { activity: 'rest', elevationM: 0, drinking: false });
    expect(a.survival.alive).toBe(false);
    a.survival.respawn();
    a.survival.update(5, { activity: 'rest', elevationM: 0, drinking: false });
    const b = makeGame();
    applySave(captureSave(a.targets, NOW), b.targets);
    expect(b.survival.deathCount).toBe(1);
    expect(b.survival.toSave().aliveSeconds).toBeCloseTo(5, 6);
  });
});

describe('applySave: hata durumu', () => {
  it('bozuk kayıt SaveError fırlatır ve oyun durumu değişmez', () => {
    const g = playedGame();
    const before = captureSave(g.targets, NOW);
    const bad = JSON.parse(JSON.stringify(captureSave(makeGame().targets, NOW)));
    bad.inventory.slots[0] = { id: 'ejderha', count: 1 };
    expect(() => applySave(bad, g.targets)).toThrow(SaveError);
    expect(captureSave(g.targets, NOW)).toEqual(before);
  });

  it('başka bölgenin kaydı reddedilir ve oyun durumu değişmez', () => {
    const g = playedGame();
    const before = captureSave(g.targets, NOW);
    const other = { ...captureSave(makeGame().targets, NOW), regionId: 'duzce-bolu' };
    expect(() => applySave(other, g.targets)).toThrow(/başka bir bölge/);
    expect(captureSave(g.targets, NOW)).toEqual(before);
  });
});

describe('CreatureSystem.loadSave', () => {
  it('bekleme listesini yazar; öncekini siler', () => {
    const c = new CreatureSystem();
    c.restoreKilled([{ cell: 1, remainingSeconds: 50 }]);
    c.loadSave({ killed: [{ cell: 2, remainingSeconds: 80 }] });
    expect(c.toSave().killed).toEqual([{ cell: 2, remainingSeconds: 80 }]);
  });
});
