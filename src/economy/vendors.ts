import { VENDORS } from '../config';
import type { ItemId } from '../items/itemDefs';
import { ITEMS } from '../items/itemDefs';
import { BUILDING_SHAPES, type BuildingKind } from '../settlements/kinds';
import type { Building } from '../settlements/layout';
import {
  buildingLocalToWorld,
  type SettlementView,
  type Stair,
} from '../settlements/SettlementMap';
import { createRandom, seedFrom } from '../utils/random';
import { WEAPON_ITEMS, isTradable } from './prices';

/** Satıcı (esnaf) türleri. */
export const VENDOR_KINDS = ['bakkal', 'nalbur', 'yapi_ustasi', 'av_bayii'] as const;
export type VendorKind = (typeof VENDOR_KINDS)[number];

export interface VendorDef {
  /** Unvan ("Bakkal Hasan"). */
  title: string;
  /** Dükkânın tanımı (panel alt başlığı). */
  shop: string;
  names: readonly string[];
  /** Sattığı eşyalar (sırası panel sırasıdır). */
  stock: readonly ItemId[];
  /** Uzmanlık alanı: bunları `ECONOMY.sellRatio` ile geri alır, diğerlerini `offSellRatio` ile. */
  specialty(id: ItemId): boolean;
  /** Karşılama sözü. */
  greeting: string;
}

/** Yapı ustasının sattığı yapılar: tarla dışındaki tüm yerleştirilebilir eşyalar (tek parça yapılar ve parçalar). */
const STRUCTURE_STOCK: readonly ItemId[] = (Object.keys(ITEMS) as ItemId[]).filter(
  (id) => ITEMS[id].category === 'placeable' && isTradable(id),
);

const FARM_GOODS: ReadonlySet<ItemId> = new Set<ItemId>([
  'wheat_seed',
  'corn_seed',
  'potato',
  'wheat',
  'corn',
  'flour',
  'corn_flour',
]);

export const VENDOR_DEFS: Readonly<Record<VendorKind, VendorDef>> = {
  bakkal: {
    title: 'Bakkal',
    shop: 'Kuru gıda, kiler, tohum ve mutfak eşyası',
    names: ['Hasan', 'Rıza', 'Nuri', 'Şükrü', 'Halil', 'Sabri'],
    stock: [
      'peksimet',
      'bread',
      'bulgur',
      'tarhana',
      'dry_beans',
      'black_tea',
      'pekmez',
      'leblebi',
      'dried_apricot',
      'flour',
      'potato',
      'wheat_seed',
      'corn_seed',
      'water_container_empty',
      'copper_pot',
    ],
    specialty: (id) => ITEMS[id].category === 'food' || FARM_GOODS.has(id),
    greeting: 'Hoş geldin hemşerim, buyur. Ne lazımsa var; erzak, çay, tohum.',
  },
  nalbur: {
    title: 'Nalbur',
    shop: 'Alet, yakıt, giyim ve el feneri',
    names: ['Yusuf', 'Kadir', 'İsmail', 'Cevdet', 'Tahsin', 'Erol'],
    stock: [
      'stone_axe',
      'hoe',
      'sickle',
      'bone_knife',
      'torch',
      'miner_lamp',
      'wool_blanket',
      'log',
      'tinder',
      'charcoal',
      'sulfur',
      'electronic_parts',
      'battery',
      'propeller',
      'backpack_small',
      'backpack_medium',
    ],
    specialty: (id) =>
      (ITEMS[id].category === 'tool' || ITEMS[id].category === 'material') &&
      !WEAPON_ITEMS.has(id) &&
      !FARM_GOODS.has(id),
    greeting: 'Selamün aleyküm usta. Alet edevat, yakacak, ne ararsan.',
  },
  yapi_ustasi: {
    title: 'Yapı Ustası',
    shop: 'Hazır yapılar: kulübe, sandık, tezgâh, ocak, çit ve yapı parçaları',
    names: ['Mehmet', 'Ahmet', 'Bekir', 'Osman', 'Cemal', 'Necati'],
    stock: STRUCTURE_STOCK,
    specialty: (id) => ITEMS[id].category === 'placeable',
    greeting: 'Hayırlı işler. Kulübe mi, sandık mı, duvar mı? Hepsi hazır, al kur.',
  },
  av_bayii: {
    title: 'Av Bayii',
    shop: 'Av silahları, fişek, bıçak ve av giyimi',
    names: ['Kemal', 'Ferit', 'Haydar', 'Selahattin', 'Rüstem'],
    stock: [
      'slingshot',
      'bow',
      'arrow',
      'iron_dagger',
      'pala',
      'shotgun',
      'shotgun_shell',
      'pistol',
      'pistol_ammo',
      'rifle_ammo',
      'gunpowder',
      'hide_vest',
      'fur_cloak',
    ],
    specialty: (id) =>
      WEAPON_ITEMS.has(id) ||
      id === 'hide' ||
      id === 'bone' ||
      id === 'hide_vest' ||
      id === 'fur_cloak',
    greeting: 'Hoş geldin avcı. Ruhsatına bakmıyorum, bu zamanda herkes kendini korur.',
  },
};

/** Dünyada duran bir satıcı (deterministik; kayda girmez). */
export interface Vendor {
  /** Kişi kimliği (`VENDORS.idBase + sıra`). */
  id: number;
  kind: VendorKind;
  /** Görünen ad: "Bakkal Hasan". */
  name: string;
  /** Dükkânın bulunduğu yerleşim adı. */
  town: string;
  building: number;
  x: number;
  y: number;
  z: number;
  /** Dinlenme yönü: kapıdan dışarı (ileri = (−sin, −cos)). */
  yaw: number;
}

/** Satıcı yerleşiminin okuduğu yerleşim haritası (`SettlementMap`). */
export interface VendorMap {
  readonly settlements: readonly SettlementView[];
  readonly stairs: readonly Stair[];
}

/** Satıcının durduğu zemin sorguları. */
export interface VendorTerrain {
  heightAt(x: number, z: number): number;
  /** Gerçek rakım (m; deniz ≤ 0). */
  elevationAt(x: number, z: number): number;
  /** (x, z) bir yapının ayak izinde mi? */
  blocked(x: number, z: number): boolean;
}

/** Yapının dışa bakan yaw'ı: yerel +z ön yüzdür; kişinin ileri yönü (−sin, −cos). */
function outwardYaw(b: Building): number {
  // localToWorld: yerel (0, 1) → dünya (sin yaw, cos yaw); kişi ileri = (−sin, −cos) olduğundan yaw + π.
  return b.yaw + Math.PI;
}

/**
 * Satıcıları yerleştirir (saf, deterministik): her il/ilçe merkezinde `VENDORS.perRank` sırasıyla merkeze en yakın
 * sağlam dükkândan başlayarak (yetmezse konuttan) her yapıya bir satıcı; yapı yetmezse satıcılar aynı kapının önünde
 * yan yana durur. Satıcı kapının (merdiven varsa merdiven ayağının) önünde, yürünebilir boş bir noktada durur; uygun
 * nokta bulunamayan yapı atlanır.
 */
export function placeVendors(map: VendorMap, terrain: VendorTerrain): Vendor[] {
  const stairRun = new Map<number, number>();
  for (const s of map.stairs) stairRun.set(s.building, s.run);
  const out: Vendor[] = [];
  for (const s of map.settlements) {
    const rank = s.data.rank;
    if (rank !== 'il' && rank !== 'ilce') continue;
    const kinds = VENDORS.perRank[rank];
    const byDistance = (list: readonly Building[]): Building[] =>
      [...list].sort(
        (a, b) =>
          Math.hypot(a.x - s.data.x, a.z - s.data.z) - Math.hypot(b.x - s.data.x, b.z - s.data.z),
      );
    const usable = (b: Building, from: readonly string[]): boolean =>
      !b.ruined && from.includes(b.kind);
    const candidates = [
      ...byDistance(s.buildings.filter((b) => usable(b, VENDORS.shopKinds))),
      ...byDistance(s.buildings.filter((b) => usable(b, VENDORS.fallbackKinds))),
    ];
    // Önce her satıcıya ayrı yapı; yapı yetmezse (küçük ilçe) aynı kapının önünde yan yana durulur.
    const usedSides = new Map<number, Set<number>>();
    for (const kind of kinds) {
      let placed: { b: Building; spot: { x: number; y: number; z: number; side: number } } | null =
        null;
      for (const shared of [false, true]) {
        for (const b of candidates) {
          const used = usedSides.get(b.id);
          if (!shared && used) continue;
          const spot = standingSpot(b, stairRun.get(b.id) ?? 0, terrain, used);
          if (!spot) continue;
          if (!used) usedSides.set(b.id, new Set());
          usedSides.get(b.id)?.add(spot.side);
          placed = { b, spot };
          break;
        }
        if (placed) break;
      }
      if (!placed) break;
      const { b, spot } = placed;
      const random = createRandom(seedFrom(VENDORS.seed, b.id, spot.side));
      const def = VENDOR_DEFS[kind];
      const name = def.names[Math.floor(random.next() * def.names.length)] as string;
      out.push({
        id: VENDORS.idBase + out.length,
        kind,
        name: `${def.title} ${name}`,
        town: s.data.name,
        building: b.id,
        x: spot.x,
        y: spot.y,
        z: spot.z,
        yaw: outwardYaw(b),
      });
    }
  }
  return out;
}

/**
 * Kapı önünde (merdiven ayağının ötesinde) yürünebilir, yapı dışı bir nokta (`side`: `VENDORS.sideSteps` sırası;
 * `used` sıralar atlanır); yoksa null.
 */
function standingSpot(
  b: Building,
  stair: number,
  terrain: VendorTerrain,
  used?: ReadonlySet<number>,
): { x: number; y: number; z: number; side: number } | null {
  const shape = BUILDING_SHAPES[b.kind as BuildingKind];
  const front = shape.depth / 2 + stair + VENDORS.standOut;
  for (let side = 0; side < VENDORS.sideSteps.length; side++) {
    if (used?.has(side)) continue;
    const p = buildingLocalToWorld(b, shape.door.x + (VENDORS.sideSteps[side] as number), front);
    if (terrain.blocked(p.x, p.z) || terrain.elevationAt(p.x, p.z) <= 1) continue;
    return { x: p.x, y: terrain.heightAt(p.x, p.z), z: p.z, side };
  }
  return null;
}

/** Oyuncu yakınsa ona dönük yaw, değilse dinlenme yönü. */
export function vendorFacing(v: Vendor, player: { x: number; z: number }): number {
  const dx = player.x - v.x;
  const dz = player.z - v.z;
  if (Math.hypot(dx, dz) > VENDORS.faceDistance) return v.yaw;
  return Math.atan2(-dx, -dz);
}
