import { INVENTORY, WORLD } from '../../src/config';
import { Inventory } from '../../src/items/Inventory';
import { StructureSet } from '../../src/placement/structures';
import { SAVE_FORMAT_VERSION, type SaveGame } from '../../src/save/saveGame';
import { initialVitals } from '../../src/survival/vitals';
import { absoluteChunkKey, absolutePropId } from '../../src/world/chunkKeys';

/** Örnek kimlikler (v2: mutlak); negatif chunk dahil. */
export const SAMPLE_IDS = {
  bush: absolutePropId(absoluteChunkKey(1, 0), 0),
  stick: absolutePropId(absoluteChunkKey(1, 0), 1),
  tree: absolutePropId(absoluteChunkKey(-2, 3), 0),
  cell: absoluteChunkKey(4, 2),
};

/** Her bölümü dolu, geçerli bir kayıt (kayıt testleri için ortak örnek). */
export function sampleSave(): SaveGame {
  const inventory = new Inventory({ slots: INVENTORY.slots });
  inventory.add('stick', 7);
  inventory.add('stone_axe', 1);
  const structures = new StructureSet();
  structures.add('campfire', 12.5, 3, -40, 1.2);
  structures.add('lean_to', 20, 3.5, -38, 0);
  const chest = structures.add('storage_chest', 15, 3.2, -44, 0.5);
  structures.storageOf(chest.id)?.add('log', 2);
  structures.add('wooden_hut', 30, 3.6, -30, 1.57);
  return {
    version: SAVE_FORMAT_VERSION,
    savedAt: '2026-10-01T09:30:00.000Z',
    regionId: WORLD.id,
    player: { x: 10, y: 4.2, z: -35, yaw: 2.1, pitch: -0.3 },
    survival: {
      vitals: { ...initialVitals(), health: 80, hydration: 42.5, exhausted: true },
      aliveSeconds: 913.4,
      deaths: 2,
      clockHour: 14.25,
      clockDay: 3,
    },
    inventory: inventory.toJSON(),
    structures: structures.toJSON(),
    world: {
      handDone: [SAMPLE_IDS.bush, SAMPLE_IDS.stick],
      axeDone: [SAMPLE_IDS.tree],
      removed: [SAMPLE_IDS.tree],
    },
    creatures: { killed: [{ cell: SAMPLE_IDS.cell, remainingSeconds: 411.5 }] },
    hotbar: { slots: ['stone_axe', null, 'campfire', null, null, null, null, null], selected: 0 },
    settlements: {
      searched: [5 * 1024 + 2, 7 * 1024],
      containers: [9 * 1024 * 8 + 1],
      lastPrayer: 44,
      leftovers: [{ key: -1 - 5 * 1024, items: [{ id: 'peksimet', count: 2 }] }],
    },
    // Faz 11 (v5): her bölüm dolu.
    farm: {
      plots: [
        {
          id: 1,
          x: 14,
          z: -50,
          crop: 'wheat_seed',
          plantedAt: 3600 * 80,
          wateredAt: 3600 * 82,
          stage: 2,
          dead: false,
        },
        { id: 2, x: 16, z: -50, crop: null, plantedAt: 0, wateredAt: 0, stage: 0, dead: false },
      ],
    },
    weapons: { loaded: { pistol: 5, shotgun: 1 }, suppressed: ['pistol'] },
    bandits: {
      cleared: [{ camp: 3, at: 3600 * 70 }],
      chests: [{ camp: 3, items: [{ id: 'rifle_ammo', count: 4 }] }],
      stolen: [{ id: 'pekmez', count: 1 }],
    },
    drone: {
      state: 'landed',
      x: 40,
      y: 5.5,
      z: -60,
      battery: 0.35,
      marks: [{ x: 120, z: -300, label: 'Eşkıya kampı' }],
    },
    // v8: para ve tapular.
    economy: { money: 1725, owned: [12 * 1024 + 4, 3 * 1024] },
  };
}
