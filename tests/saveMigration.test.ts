import { scatterWaterOf } from '../src/data/waterThinning';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FRESH_WATER, SCATTER, WORLD } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import { createRegionCreatureTerrain } from '../src/creatures/regionTerrain';
import { cellKey, cellOf, makeSpawnGrid } from '../src/creatures/spawn';
import type { RegionData } from '../src/data/region';
import { GatherSystem } from '../src/interaction/gather';
import { Hotbar } from '../src/items/hotbar';
import { Inventory } from '../src/items/Inventory';
import { StructureSet } from '../src/placement/structures';
import { MemoryBackend } from '../src/save/backends';
import { applySave, captureSave, type SaveTargets } from '../src/save/gameState';
import { SaveStore } from '../src/save/SaveStore';
import {
  SAVE_FORMAT_VERSION,
  SaveError,
  migrateSave,
  parseSave,
  type PlayerSave,
} from '../src/save/saveGame';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import {
  LEGACY,
  PROP_ID_STRIDE,
  absoluteChunkKey,
  decodeAbsoluteChunkKey,
  decodeAbsolutePropId,
} from '../src/world/chunkKeys';
import { chunkGridFor } from '../src/world/chunks';
import { LandCoverMap } from '../src/world/LandCoverMap';
import { PropIndex } from '../src/world/propIndex';
import { PropLayer } from '../src/world/PropLayer';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { scatterChunk } from '../src/world/scatter';
import { FreshWaterIndex } from '../src/world/waterIndex';
import { loadLegacyRegion, loadRealRegion } from './helpers/realRegion';
import { syntheticWorld } from './helpers/syntheticWorld';

/**
 * 7.7 kayıt göçü. `tests/fixtures/save-v1.json`, Faz 6 koduyla (main @ 7.0) gerçek bölgede üretilmiş bir v1
 * kaydıdır: Zonguldak başlangıcında kesilen bir ağaç ve toplanan bir çalı, Yenice'de kesilen bir ağaç,
 * Safranbolu'da toplanan bir nesne ve iki hücrede öldürülen canlı beklemesi. `save-v1.expect.json` aynı kodun o
 * kimlikler için gördüğü nesneleri (tür, konum, chunk, indeks) yazar.
 */
const FIXTURES = resolve(__dirname, 'fixtures');
const V1 = JSON.parse(readFileSync(resolve(FIXTURES, 'save-v1.json'), 'utf-8')) as Record<
  string,
  unknown
> & { world: { handDone: number[]; axeDone: number[]; removed: number[] } };

interface ExpectedProp {
  label: string;
  id: number;
  kind: string;
  x: number;
  z: number;
  cx: number;
  cy: number;
  index: number;
}
const EXPECT = JSON.parse(readFileSync(resolve(FIXTURES, 'save-v1.expect.json'), 'utf-8')) as {
  props: ExpectedProp[];
  killed: Array<{ cell: number; cx: number; cy: number; remainingSeconds: number }>;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const NOW = new Date('2026-10-01T10:00:00.000Z');

/** Eski kimliğin göçteki karşılığı (beklenen chunk ve indeksten). */
function migratedId(prop: ExpectedProp): number {
  return absoluteChunkKey(prop.cx, prop.cy) * PROP_ID_STRIDE + prop.index;
}

function makeTargets() {
  const events = new EventBus<GameEvents>();
  const inventory = new Inventory();
  const gather = new GatherSystem(events, inventory);
  const creatures = new CreatureSystem(events);
  const state: { pose: PlayerSave } = { pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 } };
  const targets: SaveTargets = {
    regionId: WORLD.id,
    player: { read: () => ({ ...state.pose }), apply: (p) => (state.pose = { ...p }) },
    survival: new SurvivalSystem(events),
    inventory,
    structures: new StructureSet(),
    gather,
    creatures,
    hotbar: new Hotbar(),
  };
  return { targets, gather, creatures, state };
}

describe('kayıt v1 → v2 göçü (yapı)', () => {
  it('fixture gerçekten v1 ve geçerli sürüm 6 (v1 → … → v5 → v6 zinciri)', () => {
    expect(V1.version).toBe(1);
    expect(V1.regionId).toBe(WORLD.legacyRegionId);
    expect(SAVE_FORMAT_VERSION).toBe(6);
  });

  it('bölge kimliği dünya kimliğine, nesne ve hücre kimlikleri mutlak anahtara çevrilir', () => {
    const save = parseSave(clone(V1));
    expect(save.version).toBe(SAVE_FORMAT_VERSION);
    // v2 → v3 (Faz 9): kısayol çubuğu boş eklenir.
    expect(save.hotbar.selected).toBeNull();
    expect(save.hotbar.slots.every((id) => id === null)).toBe(true);
    expect(save.regionId).toBe(WORLD.id);

    const byOld = new Map(EXPECT.props.map((p) => [p.id, migratedId(p)]));
    expect(save.world.handDone).toEqual(V1.world.handDone.map((id) => byOld.get(id)));
    expect(save.world.axeDone).toEqual(V1.world.axeDone.map((id) => byOld.get(id)));
    expect(save.world.removed).toEqual(V1.world.removed.map((id) => byOld.get(id)));
    for (const prop of EXPECT.props) {
      const { chunkKey, index } = decodeAbsolutePropId(migratedId(prop));
      expect(decodeAbsoluteChunkKey(chunkKey)).toEqual({ cx: prop.cx, cy: prop.cy });
      expect(index).toBe(prop.index);
    }

    expect(save.creatures.killed).toEqual(
      EXPECT.killed.map((k) => ({
        cell: absoluteChunkKey(k.cx, k.cy),
        remainingSeconds: k.remainingSeconds,
      })),
    );
  });

  it('oyuncu, göstergeler, saat, envanter ve yapılar aynen kalır (orijin ve kafes değişmedi)', () => {
    const v1 = clone(V1);
    const save = parseSave(clone(V1));
    for (const key of ['savedAt', 'player', 'survival', 'inventory', 'structures'] as const) {
      expect(save[key]).toEqual(v1[key]);
    }
  });

  it('göç girdiyi değiştirmez ve idempotent sonuç verir (v2 yeniden ayrıştırılınca aynı)', () => {
    const raw = clone(V1);
    const save = parseSave(raw);
    expect(raw).toEqual(V1);
    expect(parseSave(clone(save))).toEqual(save);
  });

  it('eski ızgara dışındaki kimlik ve hücre atılır; bozuk değer korunup reddedilir', () => {
    const raw = clone(V1) as Record<string, unknown> & { world: Record<string, unknown[]> };
    const outsideKey = LEGACY.chunkCols * LEGACY.chunkRows; // 130: v1'de var olamaz
    raw.world.handDone = [...(raw.world.handDone as number[]), outsideKey * PROP_ID_STRIDE + 3];
    raw.creatures = { killed: [{ cell: outsideKey, remainingSeconds: 5 }] };
    const save = parseSave(raw);
    expect(save.world.handDone).toHaveLength(V1.world.handDone.length);
    expect(save.creatures.killed).toEqual([]);

    const broken = clone(V1) as Record<string, unknown> & { world: Record<string, unknown[]> };
    broken.world.removed = ['ağaç'];
    expect(() => parseSave(broken)).toThrow(SaveError);
    try {
      parseSave(broken);
    } catch (error) {
      expect((error as SaveError).code).toBe('invalid');
    }
  });

  it('tanınmayan bölgeli v1 kayıt anlaşılır SaveError verir', () => {
    const raw = { ...clone(V1), regionId: 'kapadokya' };
    expect(() => migrateSave(raw)).toThrow(/tanınmayan bir bölge/);
    try {
      parseSave(raw);
    } catch (error) {
      expect(error).toBeInstanceOf(SaveError);
      expect((error as SaveError).code).toBe('invalid');
      return;
    }
    throw new Error('SaveError bekleniyordu');
  });

  it('başka dünyaya ait v2 kayıt yüklenmez', () => {
    const { targets } = makeTargets();
    const other = { ...captureSave(targets, NOW), regionId: 'dogu-karadeniz' };
    expect(() => applySave(other, targets)).toThrow(/başka bir dünyaya/);
  });

  it('SaveStore: depoda kalmış v1 kayıt listelenir ve yüklenince güncel sürüme taşınır', async () => {
    const backend = new MemoryBackend();
    await backend.put('auto', clone(V1));
    const store = new SaveStore(backend);
    const auto = (await store.list()).find((s) => s.slot === 'auto');
    expect(auto?.status).toBe('ok');
    expect(auto && auto.status === 'ok' ? auto.summary.regionId : null).toBe(WORLD.id);
    const loaded = await store.load('auto');
    expect(loaded?.version).toBe(SAVE_FORMAT_VERSION);
    expect(latestOk(await store.list())).toBe('auto');
  });
});

function latestOk(list: Awaited<ReturnType<SaveStore['list']>>): string | null {
  return list.find((s) => s.status === 'ok')?.slot ?? null;
}

describe(
  'göç edilen kimlikler aynı nesneyi ve hücreyi gösterir (gerçek bölge)',
  { timeout: 60_000 },
  () => {
    let region: RegionData;
    let source: RegionHeightSource;
    let cover: LandCoverMap;
    let water: FreshWaterIndex;

    beforeAll(async () => {
      region = await loadRealRegion();
      source = RegionHeightSource.fromRegion(region);
      cover = LandCoverMap.fromRegion(region)!;
      water = new FreshWaterIndex(scatterWaterOf(region.features!), FRESH_WATER.indexCellSize);
    }, 60_000);

    /** Göç edilen kimliğin yeni kodda gösterdiği nesne. */
    function propFor(data: RegionData, id: number) {
      const s = RegionHeightSource.fromRegion(data);
      const c = LandCoverMap.fromRegion(data)!;
      const grid = chunkGridFor(s);
      const index = new PropIndex(grid);
      const { cx, cy } = decodeAbsoluteChunkKey(decodeAbsolutePropId(id).chunkKey);
      index.set(
        scatterChunk({
          cx,
          cy,
          grid,
          seed: SCATTER.seed,
          cover: c,
          height: s.scatterView(),
          isWater: (x, z, clearance) => water.nearest(x, z, clearance) !== null,
        }),
      );
      return index.get(id);
    }

    it('gerçek Faz 7 dünyasında: her göç edilen kimlik Faz 6 kodunun gördüğü nesnedir (tür ve konum)', () => {
      const save = parseSave(clone(V1));
      for (const prop of EXPECT.props) {
        const id = migratedId(prop);
        expect(save.world.handDone).toContain(id);
        const ref = propFor(region, id);
        expect(ref, prop.label).not.toBeNull();
        expect(ref!.kind).toBe(prop.kind);
        expect(ref!.x).toBe(prop.x);
        expect(ref!.z).toBe(prop.z);
      }
    });

    it('Faz 6 verisinden kurulan geniş (sentetik) dünyada da aynı nesneleri gösterir', async () => {
      const wide = syntheticWorld(await loadLegacyRegion());
      for (const prop of EXPECT.props) {
        const ref = propFor(wide, migratedId(prop));
        expect(ref?.kind, prop.label).toBe(prop.kind);
        expect(ref!.x).toBe(prop.x);
        expect(ref!.z).toBe(prop.z);
      }
    });

    it('GatherSystem göç sonrası kesilen ağacı tükenmiş sayar; PropLayer onu çizmez/sorgulamaz', () => {
      const { targets, gather } = makeTargets();
      applySave(clone(V1), targets);
      const tree = EXPECT.props[0]!;
      const bush = EXPECT.props[1]!;
      expect(gather.isRemoved(migratedId(tree))).toBe(true);
      expect(gather.isRemoved(migratedId(bush))).toBe(false);

      // Game.loadSave'in yaptığı gibi: kalkan nesneler görsel katmanda gizlenir.
      const layer = new PropLayer(source, cover, water);
      layer.prepare(tree.x, tree.z);
      const near = () => layer.propsNear(tree.x, tree.z, 1).map((p) => p.id);
      expect(near()).toContain(migratedId(tree));
      for (const id of targets.gather.toSave().removed) layer.setPropDepleted(id, true);
      expect(near()).not.toContain(migratedId(tree));
      const bushRef = layer.propsNear(bush.x, bush.z, 0.01)[0];
      expect(bushRef?.id).toBe(migratedId(bush));
      // çalı elle toplanmış: elle eylem kalmadı (baltalı verimi yoksa tamamen tükenmiştir)
      const offer = gather.inspect(bushRef!);
      expect(offer === null || offer.action === 'axe').toBe(true);
      layer.dispose();
    });

    it('öldürülen canlı beklemesi aynı hücrede: hücre anahtarı oyuncunun gerçek doğma hücresidir', () => {
      const { targets, creatures } = makeTargets();
      const save = applySave(clone(V1), targets);
      const terrain = createRegionCreatureTerrain({ source, cover, freshWater: water });
      const grid = makeSpawnGrid(terrain.bounds);
      // fixture'daki ilk bekleme, Zonguldak başlangıcının (oyuncunun konumu) hücresindedir
      const here = cellOf(grid, save.player.x, save.player.z)!;
      expect(here).toEqual({ cx: EXPECT.killed[0]!.cx, cy: EXPECT.killed[0]!.cy });
      const cells = creatures.toSave().killed.map((k) => k.cell);
      expect(cells).toContain(cellKey(here.cx, here.cy));
      expect(cells).toContain(absoluteChunkKey(EXPECT.killed[1]!.cx, EXPECT.killed[1]!.cy));
    });
  },
);
