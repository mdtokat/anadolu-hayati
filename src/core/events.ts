import type { CreatureId, CreatureKind, CreatureState } from '../creatures/kinds';
import type { ItemStack } from '../items/Inventory';
import type { BuildingKind, ContainerKind } from '../settlements/kinds';
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
  /** Camide vakit namazı kılındı (`prayer`: vaktin adı, `health`: kazanılan sağlık). */
  'player:prayed': { prayer: string; health: number };
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
  /** Bir yapı sökülünce (Faz 9): geri dönen eşyalar envantere eklenmiştir. */
  'structure:dismantled': { id: StructureId; kind: StructureKind; items: ItemStack[] };
  /** Bir kamp ateşinin yakıtı bitip söndüğünde. */
  'structure:extinguished': { id: StructureId };
  /** Ateşe yakıt atılınca: atılan eşya ve gerçekten eklenen yanma süresi (sn). */
  'structure:refueled': { id: StructureId; item: ItemId; seconds: number };
  /** Bir tarif üretilince: tarif kimliği ve çıktı. */
  'item:crafted': { recipe: RecipeId; item: ItemId; count: number };
  'camera:modeChanged': { mode: 'firstPerson' | 'thirdPerson' };
  /** Kısayol tuşu (Faz 9): `slot` 0'dan başlar (`INPUT.bindings.hotbar` sırası). */
  'input:hotbarSelect': { slot: number };
  /** Fare tekerleği (Faz 9): kısayol seçimini bir sonraki (+1) / önceki (−1) slota kaydırır. */
  'input:hotbarCycle': { step: 1 | -1 };

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
  'player:damaged': { amount: number; cause: 'creature' | 'shot'; sourceKind?: CreatureKind };
  /** Oyuncu saldırınca; `hitId` isabet ettiği canlı (ıskaladıysa null). */
  'player:attacked': { weapon: ItemId | 'fist'; hitId: CreatureId | null };
  /** Bir leş kesilince alınan eşyalar. */
  'carcass:butchered': { id: CreatureId; kind: CreatureKind; items: ItemStack[] };
  /** Ateşte bir şey pişirilince (`from`: çiğ eşya). */
  'item:cooked': { from: ItemId; item: ItemId; count: number };
  /** Tatlı su kenarında bir boş su kabı doldurulunca (`item`: dolu kap). */
  'item:filled': { item: ItemId };
  /** Faz 10: terk edilmiş bir yapı arandı (`items` boşsa çoktan yağmalanmış). */
  /** Yapı ya da içindeki kap arandı (`container`: kap türü; kapıdan aranan yapıda null). */
  'building:searched': {
    id: number;
    kind: BuildingKind;
    items: ItemStack[];
    container: ContainerKind | null;
    /** Bulunan para (₺; cüzdan bağlı değilse 0). */
    money?: number;
  };
  /** Faz 10: bir kişi oyuncuya selam verdi. */
  'person:greeted': { id: number; name: string; text: string };
  /** Faz 10: kişiyle takas yapıldı (`give` boşsa hediye). */
  'person:traded': { id: number; give: ItemStack[]; get: ItemStack[] };
  /** Alışveriş: satıcıdan eşya alındı (`price` toplam ₺). */
  'shop:bought': { vendor: number; id: ItemId; count: number; price: number };
  /** Alışveriş: satıcıya eşya satıldı (`price` toplam ₺). */
  'shop:sold': { vendor: number; id: ItemId; count: number; price: number };
  /** Tapu: yerleşim yapısı satın alındı ya da geri satıldı (`price` ₺; satışta alınan para). */
  'property:bought': { building: number; kind: BuildingKind; price: number };
  'property:sold': { building: number; kind: BuildingKind; price: number };

  // ── Faz 11: ortak (11.0) ──
  /**
   * Bir gürültü oldu (atış, kırılan kapı…): `radius` içindeki canlılar kaçar (11.0), eşkıyalar duyar (E).
   * `source`: gürültünün kaynağı (`player`, `bandit`, silah kimliği…; serbest metin, mantık yalnızca konuma bakar).
   */
  'noise:made': { x: number; z: number; radius: number; source: string };

  // ── Faz 11: A (11.1 modüler inşa II; bu bölüme yalnızca A ekler) ──

  // ── Faz 11: B (11.2/11.3 yapılar, çit, engel sorgusu; bu bölüme yalnızca B ekler) ──

  // ── Faz 11: C (11.4 ekme biçme; bu bölüme yalnızca C ekler) ──

  // ── Faz 11: D (11.5 silahlar; bu bölüme yalnızca D ekler) ──
  /**
   * Oyuncu menzilli silahla ateş etti (`combat/RangedSystem`): ağız konumu, isabet eden (tekil) hedef sayısı. Gürültü
   * ayrıca `noise:made` ile yayınlanır.
   */
  'weapon:fired': {
    weapon: ItemId;
    x: number;
    y: number;
    z: number;
    hits: number;
    /** Susturuculu atış mı (verilmezse hayır; eşkıya atışları)? */
    suppressed?: boolean;
  };
  /** Şarjör envanterden dolduruldu (`rounds`: giren mermi). */
  'weapon:reloaded': { weapon: ItemId; rounds: number };
  /** Boş tetik: şarjör boş ve yedek mühimmat yok. */
  'weapon:empty': { weapon: ItemId };
  /** Mermi pencere camlarını kırdı (`ids`: `settlements/windows.ts` `paneId`; konum: atış noktası). */
  'glass:broken': { ids: number[]; x: number; y: number; z: number };

  // ── Faz 11: E (11.6/11.7 eşkıya ve yankesici; bu bölüme yalnızca E ekler) ──
  /** Bir eşkıya oyuncuyu fark edip saldırıya geçti (çatışma başına bir kez). */
  'bandit:noticed': { id: number; name: string };
  /** Bir eşkıya hasar aldı (`killed`: bu vuruşla öldü). */
  'bandit:damaged': { id: number; amount: number; killed: boolean };
  /** Ağır yaralı eşkıya teslim oldu ("Aman ağam, canımı bağışla"). */
  'bandit:surrendered': { id: number; name: string };
  /** Teslim olan eşkıya bağışlandı: silahını bıraktı (`weapon`), kaçıyor. */
  'bandit:spared': { id: number; weapon: ItemId };
  /** Ölü eşkıyanın üstü arandı (`items` envantere eklendi). */
  'bandit:searched': { id: number; items: ItemStack[] };
  /** Bir kampın bütün eşkıyaları öldü ya da kaçtı. */
  'camp:cleared': { camp: number };
  /** Kamp sandığından eşya alındı (`left`: sığmayıp sandıkta kalan yığın sayısı). */
  'camp:looted': { camp: number; items: ItemStack[]; left: number };
  /** Yankesici oyuncunun yanına sokuldu (bir kez: "Biri çok yaklaştı"). */
  'pickpocket:near': { id: number };
  /** Yankesici bir eşya çaldı ve kaçıyor. */
  'pickpocket:stole': { id: number; item: ItemId; count: number };
  /** Yankesici yakalandı ya da vuruldu: eşya geri geldi (`lost`: envantere sığmayıp kaybolan adet). */
  'pickpocket:recovered': { id: number; item: ItemId; count: number; lost: number };
  /** Yankesici kaçtı: eşya en yakın kampın sandığına düştü (kamp yoksa null). */
  'pickpocket:escaped': { id: number; item: ItemId; count: number; camp: number | null };

  // ── Faz 11: F (11.8 drone; bu bölüme yalnızca F ekler) ──
  /** Drone kalktı. */
  'drone:launched': { x: number; y: number; z: number };
  /** Drone menzil sınırını aştı ve kendiliğinden dönüyor / denetim geri geldi. */
  'drone:outOfRange': undefined;
  'drone:controlRestored': undefined;
  /** Drone pili azaldı (bir kez). */
  'drone:batteryLow': { battery: number };
  /** Drone vuruldu (`health`: kalan dayanıklılık). */
  'drone:damaged': { amount: number; health: number };
  /** Drone eve dönüp indi ve alındı. */
  'drone:landed': undefined;
  /** Drone düştü (pil bitti ya da vuruldu); yerde `drone` yapısı olarak kalır. */
  'drone:crashed': { x: number; y: number; z: number; shot: boolean };
  /** Drone görüşünde bir işaret eklendi ya da kaldırıldı. */
  'drone:marked': { label: string; action: 'added' | 'removed' };
}
