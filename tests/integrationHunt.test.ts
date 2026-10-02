import { beforeAll, describe, expect, it } from 'vitest';
import { CarcassButcher, pickCarcass } from '../src/combat/carcass';
import { CombatSystem } from '../src/combat/CombatSystem';
import { CookingSystem } from '../src/combat/cooking';
import { updateInteractions, type InteractionSystems } from '../src/combat/interactChain';
import { COOKING, FRESH_WATER, LOOT } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import type { CreatureContext, CreatureKind, CreatureTerrain } from '../src/creatures/kinds';
import { yawOf } from '../src/creatures/perception';
import { createRegionCreatureTerrain } from '../src/creatures/regionTerrain';
import { candidatesForCell, makeSpawnGrid } from '../src/creatures/spawn';
import { GatherSystem } from '../src/interaction/gather';
import { eatItem } from '../src/items/eatItem';
import { Inventory } from '../src/items/Inventory';
import { StructureSet } from '../src/placement/structures';
import { FireTender } from '../src/placement/tend';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealRegion } from './helpers/realRegion';

const DT = 1 / 60;

let terrain: CreatureTerrain;
let spots: Array<{ x: number; z: number }>;

beforeAll(async () => {
  const region = await loadRealRegion();
  terrain = createRegionCreatureTerrain({
    source: RegionHeightSource.fromRegion(region),
    cover: LandCoverMap.fromRegion(region),
    freshWater: new FreshWaterIndex(region.features!.water, FRESH_WATER.indexCellSize),
  });
  // Karaca adayı olan (yani ormanlık, yürünebilir) birkaç gerçek nokta.
  const grid = makeSpawnGrid(terrain.bounds);
  spots = [];
  for (let cy = grid.cy0; cy < grid.cy0 + grid.rows && spots.length < 5; cy++) {
    for (let cx = grid.cx0; cx < grid.cx0 + grid.cols && spots.length < 5; cx++) {
      const c = candidatesForCell({ grid, terrain, cx, cy, epoch: 0 }).find(
        (x) => x.kind === 'roe_deer',
      );
      if (c && terrain.slopeDegAt(c.x, c.z) < 20) spots.push({ x: c.x, z: c.z });
    }
  }
});

/** Gerçek bölge arazisinde, gerçek sistemlerle tam bir oyun kesiti. */
function setup(spot: { x: number; z: number }) {
  const events = new EventBus<GameEvents>();
  const survival = new SurvivalSystem(events);
  const inventory = new Inventory();
  const structures = new StructureSet();
  const creatures = new CreatureSystem(events);
  const combat = new CombatSystem(events, inventory, creatures, survival);
  const systems: InteractionSystems = {
    gather: new GatherSystem(events, inventory),
    butcher: new CarcassButcher(events, inventory, creatures),
    cooking: new CookingSystem(events, inventory, structures),
    fireTender: new FireTender(events, inventory, structures),
  };
  const player = { x: spot.x, z: spot.z };
  const ctx: CreatureContext = {
    player: {
      x: player.x,
      y: terrain.heightAt(player.x, player.z),
      z: player.z,
      activity: 'rest',
      alive: true,
      yaw: 0,
    },
    hour: 12,
    sunAltitudeDeg: 50,
    isNight: false,
    fires: [],
    terrain,
  };
  const log: string[] = [];
  for (const type of [
    'creature:noticed',
    'creature:attacked',
    'creature:died',
    'carcass:butchered',
    'item:cooked',
    'player:died',
  ] as const) {
    events.on(type, () => log.push(type));
  }

  const aimAt = (target: { x: number; z: number }) => ({
    x: player.x,
    y: ctx.player.y,
    z: player.z,
    eyeY: ctx.player.y + 1.65,
    yaw: yawOf(target.x - player.x, target.z - player.z),
    pitch: 0,
  });
  const step = (activity: CreatureContext['player']['activity'] = 'rest') => {
    ctx.player = {
      ...ctx.player,
      x: player.x,
      z: player.z,
      y: terrain.heightAt(player.x, player.z),
      activity,
    };
    ctx.fires = structures
      .all()
      .filter((s) => (s.fuelSeconds ?? 0) > 0)
      .map((s) => ({ x: s.x, z: s.z }));
    creatures.update(DT, ctx);
    combat.update(DT);
    survival.update(DT, {
      activity,
      elevationM: terrain.elevationAt(player.x, player.z),
      drinking: false,
    });
  };
  return {
    events,
    survival,
    inventory,
    structures,
    creatures,
    combat,
    systems,
    player,
    ctx,
    log,
    aimAt,
    step,
  };
}

describe('gerçek bölgede uçtan uca av zinciri', () => {
  it('domuzla dövüş (leşi kesilmez: necis) → karaca avla → kes → ateşte pişir → ye', () => {
    const w = setup(spots[0]!);
    w.step(); // ızgarayı kur
    w.inventory.add('stone_spear', 1);

    // Domuz oyuncunun 8 m kuzeyinde; kışkırtılır ve oyuncuya gelir.
    const boarId = w.creatures.spawnAt('wild_boar', w.player.x, w.player.z - 8, Math.PI)!;
    expect(boarId).not.toBeNull();
    w.creatures.damage(boarId, 1, { x: w.player.x, z: w.player.z });

    let t = 0;
    while (t < 40 && w.survival.alive && !w.log.includes('creature:died')) {
      t += DT;
      const boar = w.creatures.views().find((v) => v.id === boarId)!;
      w.combat.attack(w.aimAt(boar));
      w.step();
    }
    expect(w.survival.alive).toBe(true);
    expect(w.log).toContain('creature:noticed');
    expect(w.log).toContain('creature:attacked');
    expect(w.log).toContain('creature:died');
    expect(w.survival.state.health).toBeLessThan(100); // hayvan hasar verdi

    // Leş: bakılarak kesilir (E basılı).
    const carcassView = w.creatures.views().find((v) => v.id === boarId)!;
    expect(carcassView.dead).toBe(true);
    const aim = w.aimAt(carcassView);
    const carcass = pickCarcass(w.creatures.near(w.player.x, w.player.z, 5), aim)?.view ?? null;
    expect(carcass?.id).toBe(boarId);
    const held = (seconds: number, view = carcass) => {
      for (let s = 0; s < seconds; s += DT) {
        updateInteractions(DT, w.systems, {
          held: true,
          feet: w.player,
          prop: null,
          carcass: view,
          alive: true,
        });
        w.step();
      }
    };
    // Faz 10 (helal/haram): yaban domuzu necistir, leşi kesilmez; eti ve derisi alınmaz.
    held(LOOT.butcherSeconds + 0.5);
    expect(w.log).not.toContain('carcass:butchered');
    expect(w.inventory.count('raw_meat')).toBe(0);
    expect(w.inventory.count('hide')).toBe(0);

    // Karaca (helal av): öldürülür, kesilir.
    const deerId = w.creatures.spawnAt('roe_deer', w.player.x, w.player.z - 1.5, 0)!;
    expect(deerId).not.toBeNull();
    w.creatures.damage(deerId, 1000, { x: w.player.x, z: w.player.z });
    w.step();
    const deerView = w.creatures.views().find((v) => v.id === deerId)!;
    expect(deerView.dead).toBe(true);
    const deer =
      pickCarcass(w.creatures.near(w.player.x, w.player.z, 5), w.aimAt(deerView))?.view ?? null;
    expect(deer?.id).toBe(deerId);
    held(LOOT.butcherSeconds + 0.5, deer);
    expect(w.log).toContain('carcass:butchered');
    expect(w.inventory.count('raw_meat')).toBe(3);
    expect(w.inventory.count('hide')).toBe(1);
    expect(w.creatures.views().some((v) => v.id === deerId)).toBe(false);

    // Yanık ateşte pişir.
    w.structures.add('campfire', w.player.x, terrain.heightAt(w.player.x, w.player.z), w.player.z);
    held(COOKING.seconds * 3 + 0.5, null);
    expect(w.inventory.count('cooked_meat')).toBe(3);
    expect(w.inventory.count('raw_meat')).toBe(0);

    // Ye.
    w.survival.setVitals({ satiety: 40, health: 60 });
    expect(eatItem(w.inventory, w.survival, 'cooked_meat')).toBe('cooked_meat');
    expect(w.survival.state.satiety).toBeGreaterThan(65);
    expect(w.survival.state.health).toBeGreaterThan(60);
  });

  it('kışkırtılan boz ayı oyuncuyu öldürür (ölüm nedeni: hayvan saldırısı)', () => {
    const w = setup(spots[1]!);
    w.step();
    const deaths: Array<{ cause: string }> = [];
    w.events.on('player:died', (d) => deaths.push(d));

    const bearId = w.creatures.spawnAt('brown_bear', w.player.x, w.player.z - 6, Math.PI)!;
    w.creatures.damage(bearId, 1, { x: w.player.x, z: w.player.z });
    let t = 0;
    while (t < 60 && w.survival.alive) {
      t += DT;
      w.step();
    }
    expect(w.survival.alive).toBe(false);
    expect(deaths).toHaveLength(1);
    expect(deaths[0]?.cause).toBe('mauled');
    expect(w.log.filter((e) => e === 'creature:attacked').length).toBeGreaterThanOrEqual(3);
  });

  it('ateşin başında durmak kurt sürüsünden korur (gece, gerçek arazi)', () => {
    const w = setup(spots[2]!);
    w.ctx.sunAltitudeDeg = -30;
    w.ctx.hour = 23;
    w.ctx.isNight = true;
    w.step();
    w.structures.add('campfire', w.player.x, terrain.heightAt(w.player.x, w.player.z), w.player.z);
    // Ateş yanık kalsın: yakıt verilmiş eşdeğeri.
    const fire = w.structures.all().find((s) => s.kind === 'campfire')!;
    w.structures.refuel(fire.id, 1000);
    const kinds: CreatureKind[] = ['wolf', 'wolf', 'wolf'];
    kinds.forEach((k, i) =>
      w.creatures.spawnAt(k, w.player.x + (i - 1) * 3, w.player.z - 40, Math.PI),
    );

    let t = 0;
    while (t < 60 && w.survival.alive) {
      t += DT;
      w.step();
    }
    expect(w.survival.alive).toBe(true);
    expect(w.survival.state.health).toBeGreaterThan(95);
    expect(w.log).not.toContain('creature:attacked');
  });
});
