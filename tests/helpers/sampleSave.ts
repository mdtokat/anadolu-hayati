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
  };
}
