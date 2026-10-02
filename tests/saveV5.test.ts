import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRONE, WORLD } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import { GatherSystem } from '../src/interaction/gather';
import { Hotbar } from '../src/items/hotbar';
import { Inventory } from '../src/items/Inventory';
import { WeaponState } from '../src/items/weaponState';
import { StructureSet } from '../src/placement/structures';
import { applySave, captureSave, type SaveSection, type SaveTargets } from '../src/save/gameState';
import { createNewGameSave } from '../src/save/newGame';
import {
  MIGRATIONS,
  SAVE_FORMAT_VERSION,
  SaveError,
  emptyFaz11Save,
  parseSave,
  type BanditsSave,
  type DroneSave,
  type FarmSave,
} from '../src/save/saveGame';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import { sampleSave } from './helpers/sampleSave';

/** Faz 11 (11.0): kayıt v5 alanları ve v4 → v5 göçü. */

type Raw = Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const V1 = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'save-v1.json'), 'utf-8')) as Raw;

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
  } catch (error) {
    return error instanceof SaveError ? error.code : 'other';
  }
  return null;
}

/** v4 biçiminde (Faz 10) kayıt: v5 alanları yok. */
function v4(): Raw {
  const save = clone(sampleSave()) as unknown as Raw;
  for (const key of ['farm', 'weapons', 'bandits', 'drone']) delete save[key];
  save.settlements = { searched: (save.settlements as { searched: number[] }).searched };
  save.version = 4;
  return save;
}

describe('kayıt v4 → v5 göçü (Faz 11)', () => {
  it('sürüm 5; zincirin son adımı v4 → v5', () => {
    expect(SAVE_FORMAT_VERSION).toBe(6);
    expect(typeof MIGRATIONS[4]).toBe('function');
  });

  it('v4 kayıt yüklenir: tarla/silah/eşkıya/drone boş eklenir, geri kalanı aynen kalır', () => {
    const raw = v4();
    const parsed = parseSave(raw);
    expect(parsed.version).toBe(SAVE_FORMAT_VERSION);
    expect({
      farm: parsed.farm,
      weapons: parsed.weapons,
      bandits: parsed.bandits,
      drone: parsed.drone,
    }).toEqual(emptyFaz11Save());
    for (const key of ['player', 'survival', 'inventory', 'structures', 'hotbar']) {
      expect(parsed[key as keyof typeof parsed]).toEqual(raw[key]);
    }
    // v5 → v6: aranmış yapılar korunur, kap listesi boş ve namaz kılınmamış eklenir.
    expect(parsed.settlements).toEqual({
      ...(raw.settlements as object),
      containers: [],
      lastPrayer: -1,
    });
    expect(raw.version).toBe(4); // göç girdiyi değiştirmez
  });

  it('v1 (Faz 6) kayıt tüm zincirden geçip boş v5 alanlarıyla yüklenir', () => {
    const parsed = parseSave(clone(V1));
    expect(parsed.version).toBe(SAVE_FORMAT_VERSION);
    expect(parsed.farm.plots).toEqual([]);
    expect(parsed.drone.state).toBe('stowed');
  });

  it('dolu v5 kayıt kendisine ayrışır (idempotent)', () => {
    const save = sampleSave();
    expect(parseSave(clone(save))).toEqual(save);
  });

  it('yeni oyun kaydı boş v5 alanlarıyla başlar', () => {
    const save = createNewGameSave(WORLD.id, { x: 0, y: 1, z: 0 }, new Date());
    expect(parseSave(save).farm).toEqual({ plots: [] });
    expect(save.drone.battery).toBe(1);
  });
});

describe('v5 alan doğrulaması', () => {
  const withPatch = (patch: (save: Raw) => void): string | null => {
    const raw = clone(sampleSave()) as unknown as Raw;
    patch(raw);
    return codeOf(() => parseSave(raw));
  };

  it('bozuk tarla reddedilir', () => {
    expect(withPatch((s) => ((s.farm as FarmSave).plots[0]!.crop = 'rice' as never))).toBe(
      'invalid',
    );
    expect(withPatch((s) => ((s.farm as FarmSave).plots[1]!.id = 1))).toBe('invalid');
    expect(withPatch((s) => ((s.farm as FarmSave).plots[0]!.stage = -1))).toBe('invalid');
    expect(withPatch((s) => delete s.farm)).toBe('invalid');
  });

  it('tanınmayan silah ya da negatif mermi reddedilir', () => {
    expect(withPatch((s) => (s.weapons = { loaded: { club: 1 } }))).toBe('invalid');
    expect(withPatch((s) => (s.weapons = { loaded: { pistol: -1 } }))).toBe('invalid');
  });

  it('eşkıya bölümünde bozuk eşya yığını reddedilir', () => {
    expect(
      withPatch((s) => ((s.bandits as BanditsSave).stolen = [{ id: 'altın' as never, count: 1 }])),
    ).toBe('invalid');
    expect(
      withPatch((s) => ((s.bandits as BanditsSave).chests[0]!.items = [{ id: 'log', count: 0 }])),
    ).toBe('invalid');
    expect(withPatch((s) => ((s.bandits as BanditsSave).cleared = [{ camp: -1, at: 0 }]))).toBe(
      'invalid',
    );
  });

  it('drone: durum, pil aralığı ve işaret sınırı denetlenir', () => {
    expect(withPatch((s) => ((s.drone as DroneSave).state = 'flying' as never))).toBe('invalid');
    expect(withPatch((s) => ((s.drone as DroneSave).battery = 1.5))).toBe('invalid');
    expect(
      withPatch(
        (s) =>
          ((s.drone as DroneSave).marks = Array.from({ length: DRONE.maxMarks + 1 }, () => ({
            x: 0,
            z: 0,
            label: 'x',
          }))),
      ),
    ).toBe('invalid');
  });
});

describe('v5 bölümleri capture/apply ile', () => {
  function targets(extra: Partial<SaveTargets>): SaveTargets {
    const events = new EventBus<GameEvents>();
    const inventory = new Inventory();
    let pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    return {
      regionId: WORLD.id,
      player: { read: () => ({ ...pose }), apply: (p) => (pose = { ...p }) },
      survival: new SurvivalSystem(events),
      inventory,
      structures: new StructureSet(),
      gather: new GatherSystem(events, inventory),
      creatures: new CreatureSystem(events),
      hotbar: new Hotbar(),
      ...extra,
    };
  }

  it('bağlı bölümler yazılır ve geri yüklenir; bağlanmamışlar boş yazılır, yüklemede atlanır', () => {
    const weapons = new WeaponState();
    weapons.set('rifle', 3);
    let farm: FarmSave = { plots: [] };
    const farmSection: SaveSection<FarmSave> = {
      toSave: () => farm,
      loadSave: (s) => (farm = s),
    };
    const save = captureSave(targets({ weapons, farm: farmSection }));
    expect(save.weapons).toEqual({ loaded: { rifle: 3 } });
    expect(save.bandits).toEqual(emptyFaz11Save().bandits);

    const loadedWeapons = new WeaponState();
    applySave(sampleSave(), targets({ weapons: loadedWeapons, farm: farmSection }));
    expect(loadedWeapons.loaded('pistol')).toBe(5);
    expect(farm.plots).toHaveLength(2);
    // Bölümü bağlı olmayan oyun da v5 kaydını yükler.
    expect(() => applySave(sampleSave(), targets({}))).not.toThrow();
  });
});
