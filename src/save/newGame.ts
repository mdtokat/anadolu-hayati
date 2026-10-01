import { CLOCK, INVENTORY } from '../config';
import { Inventory } from '../items/Inventory';
import { StructureSet } from '../placement/structures';
import type { Vec3 } from '../player/movement';
import { initialVitals } from '../survival/vitals';
import { SAVE_FORMAT_VERSION, type SaveGame } from './saveGame';

/**
 * Yeni oyunun başlangıç durumunu kayıt biçiminde verir: oyuncu `spawn`'da, göstergeler dolu, saat
 * `CLOCK.startHour`, envanter/yapılar/tükenen nesneler boş. "Yeni Oyun" bu kaydı `Game.loadSave` ile uygular;
 * böylece sıfırlama, yüklemeyle aynı (testli) yoldan geçer ve başlangıç durumu tek yerde tanımlı kalır.
 */
export function createNewGameSave(regionId: string, spawn: Readonly<Vec3>, now: Date): SaveGame {
  return {
    version: SAVE_FORMAT_VERSION,
    savedAt: now.toISOString(),
    regionId,
    player: { x: spawn.x, y: spawn.y, z: spawn.z, yaw: 0, pitch: 0 },
    survival: {
      vitals: initialVitals(),
      aliveSeconds: 0,
      deaths: 0,
      clockHour: CLOCK.startHour,
      clockDay: 0,
    },
    inventory: new Inventory({ slots: INVENTORY.slots }).toJSON(),
    structures: new StructureSet().toJSON(),
    world: { handDone: [], axeDone: [], removed: [] },
    creatures: { killed: [] },
  };
}
