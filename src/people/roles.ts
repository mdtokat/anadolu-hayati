import type { ItemStack } from '../items/Inventory';
import type { Random } from '../utils/random';

/**
 * Diğer insanlar (Faz 10): rol tablosu, adlar, takas teklifleri, konuşma metinleri (saf veri/mantık).
 * Herkes barışçıldır; Türkçe gündelik selamlaşma ve dualar kullanılır.
 */

export const PERSON_ROLES = ['yolcu', 'coban', 'oduncu', 'yasli', 'dervis'] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

/** Takas: oyuncu `give` verir, `get` alır. `give` boşsa hediyedir (bir kez). */
export interface TradeOffer {
  give: ItemStack[];
  get: ItemStack[];
}

export interface RoleDef {
  /** Unvan: ad ile birlikte gösterilir ("Çoban Hasan", "Hatice Teyze"). */
  title: string;
  /** Unvan addan önce mi ("Çoban Hasan") sonra mı ("Hatice Teyze")? */
  titleFirst: boolean;
  /** Ad havuzu. */
  names: readonly string[];
  /** Takas teklifleri. */
  trades: readonly TradeOffer[];
  /** Hikâye satırları ("Bu topraklarda ne oldu?"). */
  lore: readonly string[];
  /** Hitap: "evladım", "kardeşim"… */
  address: string;
}

const s = (id: ItemStack['id'], count: number): ItemStack => ({ id, count });

export const ROLES: Readonly<Record<PersonRole, RoleDef>> = {
  yolcu: {
    title: 'Yolcu',
    titleFirst: true,
    names: ['Mustafa', 'Yusuf', 'Kemal', 'Murat', 'Selim', 'Emre'],
    trades: [
      { give: [s('cooked_meat', 2)], get: [s('black_tea', 2)] },
      { give: [s('hide', 2)], get: [s('peksimet', 3)] },
    ],
    lore: [
      'Şehirden şehre yürüyorum kardeşim. Yollar boş, kasabalar sessiz; kimse kalmamış.',
      'Duyduğuma göre insanlar göç etmiş, evlerini olduğu gibi bırakmışlar. Kilerlerde hâlâ erzak bulunur.',
    ],
    address: 'kardeşim',
  },
  coban: {
    title: 'Çoban',
    titleFirst: true,
    names: ['Hasan', 'Hüseyin', 'Ali', 'Osman', 'İbrahim', 'Halil'],
    trades: [
      { give: [s('hide', 2)], get: [s('wool_blanket', 1)] },
      { give: [s('hazelnut', 10)], get: [s('pekmez', 1)] },
    ],
    lore: [
      'Sürüm dağda kaldı, bir ben bir köpeğim. Yaylaya çıkan yol hâlâ açık, ama gece kurt iner.',
      'Köydekiler gidince ben gidemedim; buralar benim toprağım. Ateşini söndürme, ayı ateşten korkar.',
    ],
    address: 'evladım',
  },
  oduncu: {
    title: 'Oduncu',
    titleFirst: true,
    names: ['Mehmet', 'Ahmet', 'Recep', 'Cemal', 'Bekir', 'Ömer'],
    trades: [
      { give: [s('peksimet', 2)], get: [s('log', 2)] },
      { give: [s('cooked_meat', 1)], get: [s('torch', 1)] },
    ],
    lore: [
      'Bu ormanlar Yenice’den Bolu’ya kadar uzanır. Kesmeden önce besmele çek, ağaca da hakkını ver.',
      'Kasabaya inme dedim kendime; ama kışın odun bitince bakır tencere aramaya gidiyorum.',
    ],
    address: 'kardeşim',
  },
  yasli: {
    title: 'Teyze',
    titleFirst: false,
    names: ['Hatice', 'Fatma', 'Ayşe', 'Emine', 'Zeynep', 'Hayriye'],
    trades: [
      { give: [s('hazelnut', 10)], get: [s('tarhana', 2)] },
      { give: [s('hide', 3)], get: [s('copper_pot', 1)] },
    ],
    lore: [
      'Çocuklarım şehre gitti, ben evimi bırakmadım evladım. Tarhanamı kendim kuruttum.',
      'Eskiden bayramlarda bütün köy camide buluşurdu. Şimdi ezanı rüzgâr okuyor.',
    ],
    address: 'evladım',
  },
  dervis: {
    title: 'Derviş',
    titleFirst: true,
    names: ['Yunus', 'Bayram', 'Abdullah', 'Nureddin'],
    trades: [{ give: [], get: [s('dried_apricot', 3)] }],
    lore: [
      'Gelin tanış olalım, işi kolay kılalım. Yol uzun, dünya fâni; yolcu yolunda gerek.',
      'Göynük’te Akşemseddin’in türbesini ziyaret ettim. Sabır, her kapının anahtarıdır.',
    ],
    address: 'can',
  },
};

/** Kişinin görünen adı: "Çoban Hasan", "Hatice Teyze". */
export function personName(role: PersonRole, name: string): string {
  const def = ROLES[role];
  return def.titleFirst ? `${def.title} ${name}` : `${name} ${def.title}`;
}

/** Rol + ad seçimi (deterministik üreteçten). */
export function pickIdentity(random: Random, role: PersonRole): string {
  const names = ROLES[role].names;
  return names[Math.floor(random.next() * names.length)] as string;
}

/** Yön adı: oyun (dx, dz) → "kuzeydoğu" (+X doğu, −Z kuzey). */
export function directionName(dx: number, dz: number): string {
  const azimuth = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const names = [
    'kuzey',
    'kuzeydoğu',
    'doğu',
    'güneydoğu',
    'güney',
    'güneybatı',
    'batı',
    'kuzeybatı',
  ];
  return names[Math.round(azimuth / 45) % 8] as string;
}

/** Oyun uzaklığını gerçek uzaklık sözüne çevirir (1 oyun m = 50 gerçek m). */
export function distanceWords(gameMeters: number, horizontalScale: number): string {
  const real = gameMeters * horizontalScale;
  if (real < 1000) return `${Math.max(100, Math.round(real / 100) * 100)} metre kadar`;
  return `${(real / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} kilometre kadar`;
}

/** Selam ve vedalaşma (Türkçe gündelik kullanım). */
export const GREETINGS = {
  /** Kişinin selamı. */
  salam: 'Selamün aleyküm!',
  /** Oyuncunun karşılığı (düğme). */
  reply: 'Aleyküm selam.',
  farewellPlayer: 'Allah’a emanet ol.',
  farewellPerson: 'Hayırlı yolculuklar. Yolun açık olsun.',
  tradeDone: 'Hayırlı olsun.',
  tradeFail: 'Bunun için yeterince eşyan yok gibi.',
  giftDone: 'Al bunu, yolda lazım olur. Allah kabul etsin.',
} as const;
