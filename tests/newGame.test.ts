import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import { GatherSystem } from '../src/interaction/gather';
import { Inventory } from '../src/items/Inventory';
import { StructureSet } from '../src/placement/structures';
import { applySave, captureSave, type SaveTargets } from '../src/save/gameState';
import { createNewGameSave } from '../src/save/newGame';
import { parseSave, type PlayerSave } from '../src/save/saveGame';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import { sampleSave } from './helpers/sampleSave';

const REGION = 'zonguldak-bartin-karabuk';
const NOW = new Date('2026-10-01T10:00:00.000Z');
const SPAWN = { x: -688.3, y: 9.04, z: -277.2 };

function makeTargets(pose: PlayerSave = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }) {
  const events = new EventBus<GameEvents>();
  const inventory = new Inventory();
  const state = { pose };
  const targets: SaveTargets = {
    regionId: REGION,
    player: { read: () => ({ ...state.pose }), apply: (p) => (state.pose = { ...p }) },
    survival: new SurvivalSystem(events),
    inventory,
    structures: new StructureSet(),
    gather: new GatherSystem(events, inventory),
    creatures: new CreatureSystem(events),
  };
  return { targets, state };
}

describe('createNewGameSave', () => {
  it('geçerli bir kayıttır (parseSave kabul eder)', () => {
    const save = createNewGameSave(REGION, SPAWN, NOW);
    expect(parseSave(save)).toEqual(save);
  });

  it('oyuncu doğma noktasında, ileriye bakarak başlar', () => {
    expect(createNewGameSave(REGION, SPAWN, NOW).player).toEqual({ ...SPAWN, yaw: 0, pitch: 0 });
  });

  it('taze kurulmuş sistemlerin başlangıç durumuyla birebir aynıdır (tek doğruluk kaynağı)', () => {
    const fresh = makeTargets({ ...SPAWN, yaw: 0, pitch: 0 });
    expect(createNewGameSave(REGION, SPAWN, NOW)).toEqual(captureSave(fresh.targets, NOW));
  });

  it('oynanmış bir oyuna uygulanınca her şeyi başlangıca döndürür', () => {
    const played = makeTargets();
    applySave(sampleSave(), played.targets);
    expect(played.targets.inventory.toJSON().slots.some(Boolean)).toBe(true);

    applySave(createNewGameSave(REGION, SPAWN, NOW), played.targets);
    expect(captureSave(played.targets, NOW)).toEqual(createNewGameSave(REGION, SPAWN, NOW));
    expect(played.state.pose).toEqual({ ...SPAWN, yaw: 0, pitch: 0 });
  });
});
