import { createRandom, seedFrom } from '../utils/random';
import { pickWeighted } from './camps';
import type { BanditRole, BanditWeapon } from './kinds';

/**
 * Eşkıya ve sokak çetesi çeşitleri (kullanıcı talimatı: "eşkıya ve haydutların farklı çeşitleri olsun"; saf). Çeşit
 * kimlikten ve silahtan **deterministik** türetilir (aynı eşkıya hep aynı görünür; kayda girmez). Çeşit kıyafeti ve
 * başlığı belirler (`world/banditGeometry.ts`); davranış ve silah dağılımı değişmez.
 *
 * Kamp: `mountain` dağ eşkıyası (poşu, kuşak, fişeklik), `highwayman` yol kesen (uzun pelerin, geniş şapka, yüz bezi),
 * `smuggler` kaçakçı (deri yelek, kasket, sırt çantası), `marksman` nişancı (zeytin yeşili kamuflaj, geniş kenarlı
 * şapka), `brawler` kavgacı (yırtık gömlek, kırmızı bandana, bileklik). Sokak: `jacket` deri ceket, `hoodie` kapüşonlu,
 * `suit` takım elbise ve fötr şapka, `tank` atlet ve bandana.
 */
export const CAMP_STYLES = ['mountain', 'highwayman', 'smuggler', 'marksman', 'brawler'] as const;
export const GANG_STYLES = ['jacket', 'hoodie', 'suit', 'tank'] as const;
export type CampStyle = (typeof CAMP_STYLES)[number];
export type GangStyle = (typeof GANG_STYLES)[number];
export type BanditStyle = CampStyle | GangStyle;

const STYLE_SEED = 0x57915e;

/** Kamp eşkıyasının çeşidi: silaha göre ağırlıklı, kimlikle deterministik. */
export function campStyle(id: number, weapon: BanditWeapon, role: BanditRole): CampStyle {
  const random = createRandom(seedFrom(STYLE_SEED, id % 2 ** 31, 1));
  switch (weapon) {
    case 'sniper_rifle':
      return 'marksman';
    case 'rifle':
      return pickWeighted(random, { marksman: 2, mountain: 3, highwayman: 1 });
    case 'shotgun':
      return role === 'leader'
        ? pickWeighted(random, { highwayman: 3, mountain: 1 })
        : pickWeighted(random, { highwayman: 2, mountain: 2, smuggler: 1 });
    case 'pistol':
      return pickWeighted(random, { smuggler: 3, mountain: 2, highwayman: 1 });
    case 'pala':
      return pickWeighted(random, { brawler: 2, mountain: 2 });
    case 'club':
      return pickWeighted(random, { brawler: 3, mountain: 1 });
  }
}

/** Sokak çetesi üyesinin çeşidi: reis çoğunlukla takım elbiseli, yakın dövüşçüler atletli/kapüşonlu. */
export function gangStyle(id: number, weapon: BanditWeapon, role: BanditRole): GangStyle {
  const random = createRandom(seedFrom(STYLE_SEED, id % 2 ** 31, 2));
  if (role === 'leader') return pickWeighted(random, { suit: 3, jacket: 2, hoodie: 1 });
  if (weapon === 'pala' || weapon === 'club') {
    return pickWeighted(random, { tank: 3, hoodie: 2, jacket: 1 });
  }
  return pickWeighted(random, { jacket: 3, hoodie: 2, tank: 1, suit: 1 });
}

export function isGangStyle(style: BanditStyle): style is GangStyle {
  return (GANG_STYLES as readonly string[]).includes(style);
}
