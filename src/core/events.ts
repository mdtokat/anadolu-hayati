import type { CreatureId, CreatureKind, CreatureState } from '../creatures/kinds';
import type { ItemStack } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import type { StructureId, StructureKind } from '../placement/structures';
import type { RecipeId } from '../items/recipes';
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
  /** Bir tarif üretilince: tarif kimliği ve çıktı. */
  'item:crafted': { recipe: RecipeId; item: ItemId; count: number };
  'camera:modeChanged': { mode: 'firstPerson' | 'thirdPerson' };

  // ── Faz 5: Canlılar (Hesap A yayınlar; bu bölüme yalnızca A ekler) ──
  /** Bir canlı oyuncuya saldırınca (vuruş anında, bir kez): `damage` savunma öncesi ham hasar. */
  'creature:attacked': { id: CreatureId; kind: CreatureKind; damage: number; x: number; z: number };
  /** Bir canlı hasar alınca (`killed`: bu vuruşla öldü). */
  'creature:damaged': { id: CreatureId; kind: CreatureKind; amount: number; killed: boolean };
  /** Bir canlı ölünce; leş simülasyonda kalır (`removeCarcass` ile kaldırılır). */
  'creature:died': { id: CreatureId; kind: CreatureKind; x: number; y: number; z: number };
  /** Bir canlı oyuncuyu ilk fark edip `alert`/`stalk`/`chase` durumuna geçince. */
  'creature:noticed': { id: CreatureId; kind: CreatureKind; state: CreatureState };

  // ── Faz 5: Oyuncu tarafı (Hesap B yayınlar; bu bölüme yalnızca B ekler) ──
  /** Oyuncu hasar alınca (savunma sonrası). */
  'player:damaged': { amount: number; cause: 'creature'; sourceKind?: CreatureKind };
  /** Oyuncu saldırınca; `hitId` isabet ettiği canlı (ıskaladıysa null). */
  'player:attacked': { weapon: ItemId | 'fist'; hitId: CreatureId | null };
  /** Bir leş kesilince alınan eşyalar. */
  'carcass:butchered': { id: CreatureId; kind: CreatureKind; items: ItemStack[] };
  /** Ateşte bir şey pişirilince (`from`: çiğ eşya). */
  'item:cooked': { from: ItemId; item: ItemId; count: number };
  /** Tatlı su kenarında bir boş su kabı doldurulunca (`item`: dolu kap). */
  'item:filled': { item: ItemId };
}
