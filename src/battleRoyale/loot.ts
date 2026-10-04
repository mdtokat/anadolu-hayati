import type { BanditWeapon } from '../bandits/kinds';
import { AMMO, BATTLE_ROYALE, RANGED } from '../config';
import type { ItemStack } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import { createRandom, seedFrom, type Random } from '../utils/random';
import type { LootSpot } from './farSim';

/**
 * Battle Royale ganimeti (BR.4; saf, maç tohumuyla deterministik). Bina kapları maçta hayatta kalma tablosu yerine
 * `rollBrLoot`'u zarlar; ganimet sandıkları (`planCrates`) maç başında yerleşimlerin çevresine ve alana dağılır;
 * ölen yarışmacının üstünden (`contestantLoot`) silahı, mühimmatı ve teçhizatına göre sağlık/zırh çıkar.
 */

/** Silahın mühimmatı (yakın dövüş silahında null). */
export function ammoOf(weapon: ItemId): ItemId | null {
  const spec = (RANGED.weapons as Record<string, { ammo: ItemId } | undefined>)[weapon];
  return spec?.ammo ?? null;
}

function pickWeighted<K extends string>(random: Random, weights: Readonly<Record<K, number>>): K {
  const entries = Object.entries(weights) as Array<[K, number]>;
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = random.next() * total;
  for (const [k, w] of entries) {
    roll -= w;
    if (roll <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}

function ammoCount(random: Random, item: ItemId, scale: number): number {
  const range = (AMMO.lootCount as Record<string, readonly [number, number] | undefined>)[item];
  const [min, max] = range ?? [3, 8];
  return Math.max(1, Math.round(random.int(min, max) * scale));
}

/** Aynı eşyaları birleştirir (sıra korunur). */
function merge(stacks: ItemStack[]): ItemStack[] {
  const out: ItemStack[] = [];
  for (const s of stacks) {
    const same = out.find((o) => o.id === s.id);
    if (same) same.count += s.count;
    else out.push({ ...s });
  }
  return out;
}

/**
 * Bir kabın/sandığın ganimeti. `key`: kalıcı kimlik (kap kimliği, sandık sırası…), `scale`: olasılık çarpanı (yapı
 * türü, yıkık, sandık), `guaranteedWeapon`: silah kesin (sandık).
 */
export function rollBrLoot(
  key: number,
  scale: number,
  seed: number,
  guaranteedWeapon = false,
): ItemStack[] {
  const cfg = BATTLE_ROYALE.loot;
  const random = createRandom(seedFrom(seed, Math.floor(key / 2 ** 31), key % 2 ** 31, 41));
  const out: ItemStack[] = [];
  const chance = (p: number): boolean => random.next() < Math.min(0.95, p * scale);
  if (guaranteedWeapon || chance(cfg.weaponChance)) {
    const weapon = pickWeighted(random, cfg.weapons) as ItemId;
    out.push({ id: weapon, count: 1 });
    const ammo = ammoOf(weapon);
    if (ammo) out.push({ id: ammo, count: ammoCount(random, ammo, cfg.weaponAmmoScale) });
  }
  if (chance(cfg.ammoChance)) {
    const ammo = pickWeighted(random, cfg.ammo) as ItemId;
    out.push({ id: ammo, count: ammoCount(random, ammo, 1) });
  }
  for (const row of cfg.extras) {
    const roll = random.next();
    const count = random.int(row.min, row.max);
    if (roll < Math.min(0.95, row.chance * scale)) out.push({ id: row.item as ItemId, count });
  }
  return merge(out);
}

/** Yapı kabının ganimeti: yapı türü ve yıkıklığa göre çarpanla. */
export function rollBuildingBrLoot(
  key: number,
  building: { kind: string; ruined: boolean },
  seed: number,
): ItemStack[] {
  const cfg = BATTLE_ROYALE.loot;
  const kind = (cfg.kindScale as Record<string, number | undefined>)[building.kind] ?? 1;
  return rollBrLoot(key, kind * (building.ruined ? cfg.ruinedScale : 1), seed);
}

/**
 * Ölen yarışmacının üstü: silahı, mühimmatı (teçhizatla artar), teçhizatına göre sağlık eşyası ve yelek. `gear`
 * uzak kademedeki teçhizat düzeyidir (0–1).
 */
export function contestantLoot(
  contestant: number,
  weapon: BanditWeapon,
  gear: number,
  seed: number,
): ItemStack[] {
  const random = createRandom(seedFrom(seed, contestant, 43));
  const g = Math.min(Math.max(gear, 0), 1);
  const out: ItemStack[] = [{ id: weapon, count: 1 }];
  const ammo = ammoOf(weapon);
  if (ammo) out.push({ id: ammo, count: ammoCount(random, ammo, 1 + g) });
  if (random.next() < 0.3 + 0.5 * g) out.push({ id: 'bandage', count: random.int(1, 2) });
  if (random.next() < 0.6 * g * g) out.push({ id: 'first_aid_kit', count: 1 });
  const vest = random.next();
  if (g >= 0.6 && vest < 0.45 * g) out.push({ id: 'steel_vest', count: 1 });
  else if (g >= 0.25 && vest < 0.35) out.push({ id: 'hide_vest', count: 1 });
  return merge(out);
}

/** Ganimet sandığı: konum ve kalıcı sıra. */
export interface Crate {
  id: number;
  x: number;
  z: number;
}

export interface CrateArea {
  readonly areaM2: number;
  randomPoint(random: Random): { x: number; z: number };
  contains(x: number, z: number): boolean;
}

/**
 * Sandık yerleri: alan büyüklüğüne göre sayı; `crateNearTownShare`'ı ganimet yerlerinin (zenginliğe göre seçilen
 * yerleşimin) yarıçapı içinde, kalanı alanda rastgele. `open`: sandık konabilir mi (kara, yürünebilir, yapı dışı).
 */
export function planCrates(
  area: CrateArea,
  spots: readonly LootSpot[],
  random: Random,
  open: (x: number, z: number) => boolean,
): Crate[] {
  const cfg = BATTLE_ROYALE.loot;
  const count = Math.max(1, Math.round(area.areaM2 / cfg.crateAreaM2));
  const inside = spots.filter((s) => area.contains(s.x, s.z));
  let totalRichness = 0;
  for (const s of inside) totalRichness += s.richness;
  const crates: Crate[] = [];
  const far = (x: number, z: number): boolean =>
    crates.every((c) => Math.hypot(c.x - x, c.z - z) >= cfg.crateSpacing);
  const tries = count * 30;
  for (let i = 0; i < tries && crates.length < count; i++) {
    let p: { x: number; z: number };
    if (inside.length > 0 && random.next() < cfg.crateNearTownShare) {
      let roll = random.next() * totalRichness;
      let spot = inside[inside.length - 1]!;
      for (const s of inside) {
        roll -= s.richness;
        if (roll <= 0) {
          spot = s;
          break;
        }
      }
      const a = random.next() * Math.PI * 2;
      const r = Math.sqrt(random.next()) * spot.radius * 1.3;
      p = { x: spot.x + Math.cos(a) * r, z: spot.z + Math.sin(a) * r };
    } else p = area.randomPoint(random);
    if (!area.contains(p.x, p.z) || !open(p.x, p.z) || !far(p.x, p.z)) continue;
    crates.push({ id: crates.length, x: p.x, z: p.z });
  }
  return crates;
}

/** Sandığın içeriği (silah kesin, olasılıklar `crateScale` katı). */
export function crateLoot(crate: Crate, seed: number): ItemStack[] {
  return rollBrLoot(2 ** 40 + crate.id, BATTLE_ROYALE.loot.crateScale, seed, true);
}

/** Uzakta ölen yarışmacının yerde kalan çantası (`FarSim.drops`). */
export function dropLoot(
  drop: { victim: number; gear: number },
  weapon: BanditWeapon,
  seed: number,
): ItemStack[] {
  return contestantLoot(drop.victim, weapon, drop.gear, seed);
}

/** Yerdeki ganimet: sandık ya da ölü yarışmacının çantası. */
export interface Pickup {
  /** Kalıcı anahtar: sandıkta `crate:<sıra>`, çantada `bag:<yarışmacı>`. */
  key: string;
  kind: 'crate' | 'bag';
  x: number;
  z: number;
  /** Boşaltıldı mı (görünmez, etkileşilmez)? */
  empty: boolean;
}

/**
 * Maçın yerdeki ganimetleri (saf): sandıklar ve uzakta ölenlerin çantaları. İçerik ilk açılışta zarlanır ve
 * değiştirilebilir liste olarak tutulur (ganimet paneli alınanı listeden düşer); boşalan kalkar.
 */
export class BrPickups {
  private readonly pickups = new Map<string, Pickup>();
  private readonly contents = new Map<string, ItemStack[]>();
  private readonly rollers = new Map<string, () => ItemStack[]>();

  constructor(
    crates: readonly Crate[],
    private readonly seed: number,
  ) {
    for (const c of crates) {
      this.add({ key: `crate:${c.id}`, kind: 'crate', x: c.x, z: c.z, empty: false }, () =>
        crateLoot(c, this.seed),
      );
    }
  }

  /** Uzakta ölen yarışmacının çantasını ekler (aynı yarışmacı bir kez). */
  addDrop(
    drop: { victim: number; x: number; z: number; gear: number },
    weapon: BanditWeapon,
  ): void {
    const key = `bag:${drop.victim}`;
    if (this.pickups.has(key)) return;
    this.add({ key, kind: 'bag', x: drop.x, z: drop.z, empty: false }, () =>
      dropLoot(drop, weapon, this.seed),
    );
  }

  private add(p: Pickup, roll: () => ItemStack[]): void {
    this.pickups.set(p.key, p);
    this.rollers.set(p.key, roll);
  }

  get size(): number {
    return this.pickups.size;
  }

  /** (x, z)'ye `r` içindeki dolu ganimetler (yakından uzağa). */
  near(x: number, z: number, r: number): Pickup[] {
    const out: Array<{ p: Pickup; d: number }> = [];
    for (const p of this.pickups.values()) {
      if (p.empty) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d <= r) out.push({ p, d });
    }
    return out.sort((a, b) => a.d - b.d || (a.p.key < b.p.key ? -1 : 1)).map((o) => o.p);
  }

  /** İçeriği (ilk çağrıda zarlanır; ganimet paneline verilen değiştirilebilir liste). Yoksa/boşsa null. */
  items(key: string): ItemStack[] | null {
    const p = this.pickups.get(key);
    if (!p || p.empty) return null;
    let list = this.contents.get(key);
    if (!list) {
      list = this.rollers.get(key)!();
      this.contents.set(key, list);
    }
    if (list.length === 0) p.empty = true;
    return p.empty ? null : list;
  }

  /** Panelden alındıktan sonra: liste boşaldıysa ganimet kalkar. */
  settle(key: string): void {
    const p = this.pickups.get(key);
    if (p && (this.contents.get(key)?.length ?? 1) === 0) p.empty = true;
  }
}
