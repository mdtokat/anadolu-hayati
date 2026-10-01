import type { CreatureSystem } from '../creatures/CreatureSystem';
import type { GatherSystem } from '../interaction/gather';
import type { Hotbar } from '../items/hotbar';
import type { Inventory } from '../items/Inventory';
import type { StructureSet } from '../placement/structures';
import type { SurvivalSystem } from '../survival/SurvivalSystem';
import {
  SAVE_FORMAT_VERSION,
  SaveError,
  parseSave,
  type PlayerSave,
  type SaveGame,
} from './saveGame';

/** Oyuncunun konumunu ve bakışını okuyup yazan köprü (fizik/kamera `Game`'de olduğundan arayüzle verilir). */
export interface PlayerPose {
  read(): PlayerSave;
  apply(pose: PlayerSave): void;
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
  targets.player.apply(save.player);
  return save;
}
