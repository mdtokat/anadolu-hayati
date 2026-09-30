import type { ItemId } from '../items/itemDefs';
import type { StructureId, StructureKind } from '../placement/structures';
import type { PropId, PropKind } from '../world/propKinds';
import type { DeathCause } from '../survival/vitals';
import type { InputAction } from './inputMapping';

/** Oyun genelindeki olayların adı → yük tipi eşlemesi. Yeni sistemler buraya olay ekler. */
export interface GameEvents {
  'game:started': undefined;
  'game:disposed': undefined;
  'game:paused': undefined;
  'game:resumed': undefined;
  'input:pointerLockChanged': { locked: boolean };
  'input:pointerLockFailed': undefined;
  'input:action': { action: InputAction };
  'time:nightStarted': { day: number };
  'time:dayStarted': { day: number };
  'player:died': { cause: DeathCause; survivedSeconds: number; day: number };
  'player:respawned': { deaths: number };
  /** Bir içme oturumu bitince: bu oturumda artan su seviyesi. */
  'player:drank': { amount: number };
  /** Bir şey yenince: gerçekte artan tokluk ve su (100'e kırpıldıktan sonra). */
  'player:ate': { item: ItemId; satiety: number; hydration: number };
  /** Bir nesneden eşya toplanınca (eşya türü başına bir kez). `removed`: nesne dünyadan kalktı (kesilen ağaç, alınan dal/taş). */
  'item:collected': {
    item: ItemId;
    count: number;
    source: PropKind;
    propId: PropId;
    removed: boolean;
  };
  /** Bir yapı yerleştirilince (eşya envanterden düşülmüştür). */
  'structure:placed': { id: StructureId; kind: StructureKind; x: number; z: number };
  /** Bir kamp ateşinin yakıtı bitip söndüğünde. */
  'structure:extinguished': { id: StructureId };
  /** Ateşe yakıt atılınca: atılan eşya ve gerçekten eklenen yanma süresi (sn). */
  'structure:refueled': { id: StructureId; item: ItemId; seconds: number };
  'camera:modeChanged': { mode: 'firstPerson' | 'thirdPerson' };
}
