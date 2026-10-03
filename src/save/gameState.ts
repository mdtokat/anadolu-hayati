import type { CreatureSystem } from '../creatures/CreatureSystem';
import type { GatherSystem } from '../interaction/gather';
import type { Hotbar } from '../items/hotbar';
import type { Inventory } from '../items/Inventory';
import type { BuildingSearch } from '../settlements/search';
import type { StructureSet } from '../placement/structures';
import type { SurvivalSystem } from '../survival/SurvivalSystem';
import {
  SAVE_FORMAT_VERSION,
  SaveError,
  emptyEconomySave,
  emptyFaz11Save,
  parseSave,
  type BanditsSave,
  type DroneSave,
  type EconomySave,
  type FarmSave,
  type PlayerSave,
  type SaveGame,
  type WeaponsSave,
} from './saveGame';

/** Oyuncunun konumunu ve bakışını okuyup yazan köprü (fizik/kamera `Game`'de olduğundan arayüzle verilir). */
export interface PlayerPose {
  read(): PlayerSave;
  apply(pose: PlayerSave): void;
}

/** Faz 11 (v5) alanlarının sahibi: kendi alanını yazar ve okur (sahibi akış uygular). */
export interface SaveSection<T> {
  toSave(): T;
  loadSave(save: T): void;
}

/** Kaydın okunduğu ve yazıldığı canlı sistemler. */
export interface SaveTargets {
  /** Oynanan dünya (`WORLD.id`); kayıt başka bir dünyaya aitse yüklenmez. */
  regionId: string;
  player: PlayerPose;
  survival: Pick<SurvivalSystem, 'toSave' | 'loadSave'>;
  inventory: Pick<Inventory, 'toJSON' | 'loadSave'>;
  structures: Pick<StructureSet, 'toJSON' | 'loadSave'>;
  gather: Pick<GatherSystem, 'toSave' | 'loadSave'>;
  creatures: Pick<CreatureSystem, 'toSave' | 'loadSave'>;
  hotbar: Pick<Hotbar, 'toSave' | 'loadSave'>;
  /** Yapı arama durumu (Faz 10); yerleşimsiz dünyada (test arenası) yoktur. */
  search?: Pick<BuildingSearch, 'toSave' | 'containersToSave' | 'leftoversToSave' | 'loadSave'>;
  /** Camide kılınan son vakit (v6); yoksa kayda −1 yazılır. */
  prayer?: SaveSection<number>;
  // ── Faz 11 (v5): her akış kendi bölümünü bağlar; bağlanmamışsa kayda boş değer yazılır, yüklemede atlanır. ──
  /** C: tarlalar. */
  farm?: SaveSection<FarmSave>;
  /** D: silah şarjörleri. */
  weapons?: SaveSection<WeaponsSave>;
  /** E: eşkıya kampları ve yankesici. */
  bandits?: SaveSection<BanditsSave>;
  /** F: drone. */
  drone?: SaveSection<DroneSave>;
  /** v8: para ve tapular; bağlı değilse kayda başlangıç değeri yazılır. */
  economy?: SaveSection<EconomySave>;
}

/** Canlı oyun durumunun kayıt görüntüsünü alır. Ölüyken çağrılmamalıdır (ölüm durumu kayda girmez). */
export function captureSave(targets: SaveTargets, now: Date = new Date()): SaveGame {
  return {
    version: SAVE_FORMAT_VERSION,
    savedAt: now.toISOString(),
    regionId: targets.regionId,
    player: targets.player.read(),
    survival: targets.survival.toSave(),
    inventory: targets.inventory.toJSON(),
    structures: targets.structures.toJSON(),
    world: targets.gather.toSave(),
    creatures: targets.creatures.toSave(),
    hotbar: targets.hotbar.toSave(),
    settlements: {
      searched: targets.search?.toSave() ?? [],
      containers: targets.search?.containersToSave() ?? [],
      leftovers: targets.search?.leftoversToSave() ?? [],
      lastPrayer: targets.prayer?.toSave() ?? -1,
    },
    ...faz11Sections(targets),
    economy: targets.economy?.toSave() ?? emptyEconomySave(),
  };
}

/** v5 alanları: bağlı sistemden, yoksa boş değer. */
function faz11Sections(
  targets: SaveTargets,
): Pick<SaveGame, 'farm' | 'weapons' | 'bandits' | 'drone'> {
  const empty = emptyFaz11Save();
  return {
    farm: targets.farm?.toSave() ?? empty.farm,
    weapons: targets.weapons?.toSave() ?? empty.weapons,
    bandits: targets.bandits?.toSave() ?? empty.bandits,
    drone: targets.drone?.toSave() ?? empty.drone,
  };
}

/**
 * Ham kaydı doğrular ve sistemlere yazar. Doğrulama her yazımdan önce biter: bozuk/yabancı bölgeli kayıt
 * `SaveError` fırlatır ve oyun durumu değişmez. Oyuncu konumu en son uygulanır. Doğrulanmış kaydı döner.
 */
export function applySave(raw: unknown, targets: SaveTargets): SaveGame {
  const save = parseSave(raw);
  if (save.regionId !== targets.regionId) {
    throw new SaveError(
      'invalid',
      `Kayıt başka bir dünyaya ait (${save.regionId}); bu oyun ${targets.regionId} dünyasını oynuyor.`,
    );
  }
  targets.survival.loadSave(save.survival);
  targets.inventory.loadSave(save.inventory);
  targets.structures.loadSave(save.structures);
  targets.gather.loadSave(save.world);
  targets.creatures.loadSave(save.creatures);
  targets.hotbar.loadSave(save.hotbar);
  targets.search?.loadSave(
    save.settlements.searched,
    save.settlements.containers,
    save.settlements.leftovers,
  );
  targets.prayer?.loadSave(save.settlements.lastPrayer);
  targets.farm?.loadSave(save.farm);
  targets.weapons?.loadSave(save.weapons);
  targets.bandits?.loadSave(save.bandits);
  targets.drone?.loadSave(save.drone);
  targets.economy?.loadSave(save.economy);
  targets.player.apply(save.player);
  return save;
}
