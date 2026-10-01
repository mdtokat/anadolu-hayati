import { describe, expect, it, vi } from 'vitest';
import { DISMANTLE, FIRE, STATIONS, STORAGE } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { craft, craftStatus } from '../src/items/craft';
import { Inventory } from '../src/items/Inventory';
import { RECIPES } from '../src/items/recipes';
import { Dismantler, dismantleReturns } from '../src/placement/dismantle';
import { radiusOf } from '../src/placement/placeRules';
import { stationsNear } from '../src/placement/stations';
import { transferAll, transferSlot } from '../src/placement/storage';
import { structureInView } from '../src/placement/structureFocus';
import { StructureSet } from '../src/placement/structures';

const DT = 1 / 60;

describe('StructureSet: Faz 9 yapıları', () => {
  it('sandık boş envanterle gelir; diğer yapıların deposu yoktur', () => {
    const set = new StructureSet();
    const chest = set.add('storage_chest', 0, 0, 0);
    const bench = set.add('workbench', 5, 0, 0);
    const storage = set.storageOf(chest.id);
    expect(storage?.slotCount).toBe(STORAGE.slots);
    expect(storage?.maxWeightG).toBe(STORAGE.maxWeightG);
    expect(storage?.slots.every((s) => s === null)).toBe(true);
    expect(set.storageOf(bench.id)).toBeNull();
    expect(set.get(chest.id)?.fuelSeconds).toBeUndefined();
  });

  it('remove: yapıyı ve deposunu kaldırır, sürümü artırır; olmayan kimlikte false', () => {
    const set = new StructureSet();
    const chest = set.add('storage_chest', 0, 0, 0);
    const v = set.version;
    expect(set.remove(chest.id)).toBe(true);
    expect(set.version).toBeGreaterThan(v);
    expect(set.get(chest.id)).toBeUndefined();
    expect(set.storageOf(chest.id)).toBeNull();
    expect(set.remove(chest.id)).toBe(false);
    // Kimlik yeniden kullanılmaz.
    expect(set.add('workbench', 1, 0, 1).id).toBeGreaterThan(chest.id);
  });

  it('kayıt: sandık içeriği yazılır ve geri yüklenir; yeni türler korunur', () => {
    const set = new StructureSet();
    const chest = set.add('storage_chest', 1, 2, 3, 0.4);
    set.storageOf(chest.id)?.add('log', 3);
    set.storageOf(chest.id)?.add('cooked_meat', 2);
    set.add('wooden_hut', 10, 2, 3, 1.5);
    set.add('workbench', -5, 2, 3);
    const json = JSON.parse(JSON.stringify(set.toJSON()));
    const copy = StructureSet.fromJSON(json);
    expect(copy.toJSON()).toEqual(set.toJSON());
    expect(copy.storageOf(chest.id)?.count('log')).toBe(3);
    // Yerinde yükleme de içerikleri taşır.
    const target = new StructureSet();
    target.loadSave(json);
    expect(target.storageOf(chest.id)?.count('cooked_meat')).toBe(2);
  });

  it('kayıt: içeriksiz sandık boş sayılır; sandık olmayanda içerik ve bozuk içerik reddedilir', () => {
    const base = { version: 1, nextId: 3 };
    const chest = { id: 1, kind: 'storage_chest', x: 0, y: 0, z: 0, yaw: 0 };
    expect(
      StructureSet.fromJSON({ ...base, structures: [chest] })
        .storageOf(1)
        ?.slots.every((s) => s === null),
    ).toBe(true);
    const storage = new Inventory({ slots: STORAGE.slots, maxWeightG: STORAGE.maxWeightG });
    expect(() =>
      StructureSet.fromJSON({
        ...base,
        structures: [
          { id: 2, kind: 'workbench', x: 0, y: 0, z: 0, yaw: 0, storage: storage.toJSON() },
        ],
      }),
    ).toThrow(/eşya saklamaz/);
    expect(() =>
      StructureSet.fromJSON({
        ...base,
        structures: [{ ...chest, storage: { version: 1, slots: [{ id: 'laser', count: 1 }] } }],
      }),
    ).toThrow();
  });
});

describe('storage: yığın taşıma', () => {
  it('sığdığı kadar taşır; kalan kaynakta kalır; boş slotta 0', () => {
    const from = new Inventory();
    from.add('stick', 15);
    const to = new Inventory({ slots: 1, maxWeightG: 300 * 10 });
    expect(transferSlot(from, 0, to)).toBe(10);
    expect(from.count('stick')).toBe(5);
    expect(to.count('stick')).toBe(10);
    expect(transferSlot(from, 0, to)).toBe(0); // ağırlık dolu
    expect(transferSlot(from, 5, to)).toBe(0); // boş slot
  });

  it('transferAll: hepsini taşır, toplam ağırlık korunur', () => {
    const player = new Inventory();
    player.add('log', 3);
    player.add('stone', 4);
    player.add('torch', 1);
    const chest = new Inventory({ slots: STORAGE.slots, maxWeightG: STORAGE.maxWeightG });
    const total = player.totalWeightG;
    expect(transferAll(player, chest)).toBe(8);
    expect(player.totalWeightG).toBe(0);
    expect(chest.totalWeightG).toBe(total);
  });
});

describe('stationsNear ve tezgâh tarifleri', () => {
  it('tezgâhın kenarına STATIONS.workbench.reach içinde istasyon vardır', () => {
    const set = new StructureSet();
    set.add('workbench', 0, 0, 0);
    const limit = STATIONS.workbench.reach + radiusOf('workbench');
    expect(stationsNear(set, limit - 0.01, 0).stations.has('workbench')).toBe(true);
    expect(stationsNear(set, limit + 0.01, 0).stations.has('workbench')).toBe(false);
  });

  it('istasyonlu tarif: tezgâh yoksa missing_station, varsa üretilir', () => {
    const inventory = new Inventory();
    inventory.add('stone_axe', 1);
    inventory.add('log', 2);
    inventory.add('stick', 6);
    inventory.add('bark', 4);
    expect(craftStatus(inventory, RECIPES.storage_chest)).toEqual({
      ok: false,
      reason: 'missing_station',
      missing: [],
      station: 'workbench',
    });
    const near = { stations: new Set(['workbench'] as const) };
    expect(craft(inventory, RECIPES.storage_chest, near)).toEqual({
      ok: true,
      output: { id: 'storage_chest', count: 1 },
    });
    expect(inventory.count('storage_chest')).toBe(1);
  });

  it('kulübe malzemesi baltayla birlikte tek seferde taşınabilir (ağırlık sınırı içinde)', () => {
    const inventory = new Inventory();
    inventory.add('stone_axe', 1);
    for (const { id, count } of RECIPES.wooden_hut.inputs) {
      expect(inventory.add(id, count), id).toBe(0);
    }
    const near = { stations: new Set(['workbench'] as const) };
    expect(craftStatus(inventory, RECIPES.wooden_hut, near)).toEqual({ ok: true });
  });

  it('el aletleri (bıçak, meşale) istasyon istemez', () => {
    expect(RECIPES.bone_knife.station).toBeUndefined();
    expect(RECIPES.torch.station).toBeUndefined();
    expect(RECIPES.workbench.station).toBeUndefined();
    expect(RECIPES.fur_cloak.station).toBe('workbench');
  });
});

describe('structureInView', () => {
  it('bakış konisindeki en yakın kenarlı yapıyı seçer; arkadaki seçilmez; içindeyken açı aranmaz', () => {
    const set = new StructureSet();
    const ahead = set.add('storage_chest', 0, 0, -1.5);
    set.add('storage_chest', 0, 0, 1.5); // arkada
    const pose = { x: 0, z: 0, yaw: 0 }; // kuzeye (−Z) bakıyor
    expect(structureInView(set, pose, { reach: 2, viewConeDeg: 45 })?.id).toBe(ahead.id);
    expect(
      structureInView(set, { ...pose, yaw: Math.PI / 2 }, { reach: 2, viewConeDeg: 45 }),
    ).toBeNull();
    const hut = new StructureSet();
    const h = hut.add('wooden_hut', 0, 0, 0);
    expect(
      structureInView(hut, { x: 0.5, z: 0.5, yaw: 1 }, { reach: 2, viewConeDeg: 10 })?.id,
    ).toBe(h.id);
  });

  it('tür süzgeci ve menzil', () => {
    const set = new StructureSet();
    set.add('campfire', 0, 0, -2);
    const pose = { x: 0, z: 0, yaw: 0 };
    expect(
      structureInView(set, pose, { reach: 3, viewConeDeg: 45, kinds: ['storage_chest'] }),
    ).toBeNull();
    expect(structureInView(set, pose, { reach: 0.5, viewConeDeg: 45 })).toBeNull();
    expect(structureInView(set, pose, { reach: 1.2, viewConeDeg: 45 })?.kind).toBe('campfire');
  });
});

describe('Dismantler', () => {
  function setup(inventory = new Inventory()) {
    const events = new EventBus<GameEvents>();
    const dismantled = vi.fn();
    events.on('structure:dismantled', dismantled);
    const structures = new StructureSet();
    const dismantler = new Dismantler(events, inventory, structures);
    return { events, dismantled, inventory, structures, dismantler };
  }

  const hold = (d: Dismantler, target: Parameters<Dismantler['update']>[2], seconds: number) => {
    for (let i = 0; i < Math.ceil(seconds / DT) + 1; i++) d.update(DT, true, target);
  };

  it('dönen eşyalar: kamp ateşinden taş, diğerlerinden yapının kendisi', () => {
    expect(dismantleReturns('campfire')).toEqual(DISMANTLE.campfireReturns);
    expect(dismantleReturns('wooden_hut')).toEqual([{ id: 'wooden_hut', count: 1 }]);
  });

  it('süre dolunca yapı kalkar, eşya envantere gelir, olay yayınlanır', () => {
    const { dismantled, inventory, structures, dismantler } = setup();
    const bench = structures.add('workbench', 0, 0, 0);
    dismantler.update(DT, true, bench);
    expect(dismantler.progress).toBeGreaterThan(0);
    hold(dismantler, bench, DISMANTLE.seconds);
    expect(structures.get(bench.id)).toBeUndefined();
    expect(inventory.count('workbench')).toBe(1);
    expect(dismantled).toHaveBeenCalledWith({
      id: bench.id,
      kind: 'workbench',
      items: [{ id: 'workbench', count: 1 }],
    });
  });

  it('tuş bırakılınca ilerleme sıfırlanır', () => {
    const { structures, dismantler } = setup();
    const fire = structures.add('campfire', 0, 0, 0);
    hold(dismantler, fire, DISMANTLE.seconds / 2);
    dismantler.update(DT, false, fire);
    expect(dismantler.progress).toBe(0);
    expect(structures.get(fire.id)?.fuelSeconds).toBe(FIRE.burnSeconds);
  });

  it('dolu sandık sökülmez; eşya envantere sığmıyorsa sökülmez (atomik)', () => {
    const inventory = new Inventory({ slots: 4, maxWeightG: 10_000 });
    const { structures, dismantler } = setup(inventory);
    const chest = structures.add('storage_chest', 0, 0, 0);
    structures.storageOf(chest.id)?.add('stone', 1);
    hold(dismantler, chest, DISMANTLE.seconds * 2);
    expect(dismantler.offer?.status).toBe('not_empty');
    expect(structures.get(chest.id)).toBeDefined();
    structures.storageOf(chest.id)?.remove('stone', 1);
    inventory.add('log', 1); // 3 kg + sandık 8 kg > 10 kg
    hold(dismantler, chest, DISMANTLE.seconds * 2);
    expect(dismantler.offer?.status).toBe('no_space');
    expect(structures.get(chest.id)).toBeDefined();
    inventory.remove('log', 1);
    hold(dismantler, chest, DISMANTLE.seconds * 2);
    expect(structures.get(chest.id)).toBeUndefined();
    expect(inventory.count('storage_chest')).toBe(1);
  });

  it('ölüyken hiçbir şey yapmaz', () => {
    const { structures, dismantler } = setup();
    const fire = structures.add('campfire', 0, 0, 0);
    for (let i = 0; i < 200; i++) dismantler.update(DT, true, fire, false);
    expect(dismantler.offer).toBeNull();
    expect(structures.get(fire.id)).toBeDefined();
  });
});
