import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER, INTERACT, PLAYER } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { lookDirection, pickFocus } from '../src/interaction/focus';
import { GatherSystem } from '../src/interaction/gather';
import { GATHER_RULES } from '../src/interaction/gatherRules';
import { Inventory } from '../src/items/Inventory';
import type { RegionData } from '../src/data/region';
import { latLonToGame } from '../src/world/geo';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { PropLayer } from '../src/world/PropLayer';
import type { PropRef } from '../src/world/propKinds';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadRealRegion } from './helpers/realRegion';

const DT = 1 / 60;
let region: RegionData;
let source: RegionHeightSource;
let layer: PropLayer;
let forest: { x: number; z: number };

beforeAll(async () => {
  region = await loadRealRegion();
  source = RegionHeightSource.fromRegion(region);
  const cover = LandCoverMap.fromRegion(region)!;
  const water = new FreshWaterIndex(region.features!.water, FRESH_WATER.indexCellSize);
  layer = new PropLayer(source, cover, water);
  forest = latLonToGame(41.2, 32.34, region.meta.originUtm);
  layer.prepare(forest.x, forest.z);
}, 60_000);

/** Game.update'teki toplama akışının aynısı: propsNear → pickFocus → GatherSystem.update. */
function session() {
  const events = new EventBus<GameEvents>();
  const inventory = new Inventory();
  const gather = new GatherSystem(events, inventory);
  events.on('item:collected', ({ propId, removed }) => {
    if (removed) layer.setPropDepleted(propId, true);
  });
  const step = (
    feet: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
    held: boolean,
  ) => {
    const nearby = layer.propsNear(feet.x, feet.z, INTERACT.reach);
    const focus = pickFocus(
      nearby,
      {
        eye: { x: feet.x, y: feet.y + PLAYER.eyeHeight, z: feet.z },
        forward: lookDirection(yaw, pitch),
      },
      (prop) => gather.inspect(prop) !== null,
    );
    gather.update(DT, held, focus?.prop ?? null);
    return focus;
  };
  return { events, inventory, gather, step };
}

/** Hedefe bakan yaw (yaw 0 = −Z, pozitif sola): ileri = (−sin yaw, −cos yaw). */
const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** `target`'a `distance` kadar yaklaşmış ayak konumu (hedefin güney/doğu tarafından). */
function standNear(target: PropRef, distance: number) {
  const x = target.x + distance;
  const z = target.z;
  return { x, y: source.heightAt(x, z), z };
}

describe('toplama akışı (gerçek bölge, PropLayer)', () => {
  it('yerdeki dalı bakıp E ile alır: envantere girer, nesne dünyadan kalkar', () => {
    const { inventory, step, gather } = session();
    const stick = layer
      .propsNear(forest.x, forest.z, 400)
      .find((p) => p.kind === 'stick' && source.slopeDegAt(p.x, p.z) < 30);
    expect(stick).toBeDefined();

    const feet = standNear(stick!, 2.5);
    const yaw = yawToward(stick!.x - feet.x, stick!.z - feet.z);
    const pitch = -0.4; // yere doğru bak
    let focus = null as PropRef | null;
    for (let i = 0; i < Math.ceil(GATHER_RULES.stick.hand.seconds / DT) + 5; i++) {
      focus = step(feet, yaw, pitch, true)?.prop ?? focus;
    }
    expect(focus?.id).toBe(stick!.id);
    expect(inventory.count('stick')).toBe(1);
    expect(gather.isRemoved(stick!.id)).toBe(true);
    expect(layer.propsNear(stick!.x, stick!.z, 0.01).some((p) => p.id === stick!.id)).toBe(false);
  });

  it('ters yöne bakarken veya tuş basılı değilken toplanmaz', () => {
    const { inventory, step } = session();
    const bush = layer.propsNear(forest.x, forest.z, 400).find((p) => p.kind === 'bush')!;
    const feet = standNear(bush, 2);
    const yawAway = yawToward(bush.x - feet.x, bush.z - feet.z) + Math.PI;
    for (let i = 0; i < 300; i++) step(feet, yawAway, 0, true);
    expect(inventory.count('stick')).toBe(0);
    const yaw = yawToward(bush.x - feet.x, bush.z - feet.z);
    for (let i = 0; i < 300; i++) step(feet, yaw, 0, false);
    expect(inventory.count('stick')).toBe(0);
  });

  it('kesilen ağaç kalkar ve çevre sorgusundan düşer (balta ile)', () => {
    const { inventory, step } = session();
    inventory.add('stone_axe', 1);
    const tree = layer
      .propsNear(forest.x, forest.z, 400)
      .find((p) => p.kind === 'tree_broadleaf' && source.slopeDegAt(p.x, p.z) < 30)!;
    const feet = standNear(tree, 2);
    const yaw = yawToward(tree.x - feet.x, tree.z - feet.z);
    const total =
      GATHER_RULES.tree_broadleaf.hand.seconds + GATHER_RULES.tree_broadleaf.axe!.seconds;
    for (let i = 0; i < Math.ceil((total + 0.5) / DT); i++) step(feet, yaw, 0, true);

    expect(inventory.count('stick')).toBeGreaterThan(0);
    expect(inventory.count('log')).toBe(1);
    expect(layer.propsNear(tree.x, tree.z, 0.01).some((p) => p.id === tree.id)).toBe(false);
  });

  it('yeniden yüklemede (aynı seed) aynı nesne aynı verimi verir', () => {
    const stick = layer.propsNear(forest.x, forest.z, 400).find((p) => p.kind === 'berry_bush')!;
    const a = session();
    const feet = standNear(stick, 2);
    const yaw = yawToward(stick.x - feet.x, stick.z - feet.z);
    for (let i = 0; i < 120; i++) a.step(feet, yaw, 0, true);
    const b = session();
    for (let i = 0; i < 120; i++) b.step(feet, yaw, 0, true);
    expect(b.inventory.count('blackberry')).toBe(a.inventory.count('blackberry'));
    expect(a.inventory.count('blackberry')).toBeGreaterThan(0);
  });
});
