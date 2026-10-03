import { GANGS } from '../config';
import { createRandom, seedFrom, type Random } from '../utils/random';
import { pickWeighted } from './camps';
import type { BanditRole, BanditWeapon } from './kinds';

/**
 * Sokak çeteleri (saf, seed'li; kullanıcı talimatı: şehir merkezinde de silahlı NPC'ler ve çatışma): il/ilçe
 * merkezlerinin caddelerinde iki rakip çete. Yer seçimi merkezin çevresindeki cadde noktalarından yapılır; aynı dünya
 * verisi ve tohum aynı yerleri verir. Hangi gün hangi merkezde çete olduğu ve üyelerinin silahları da deterministiktir
 * (`gangPresent`, `gangRoster`). Yapay zekâ ve çatışma `BanditSystem`'dedir.
 */

/** Çete yeri seçiminin dünyadan istediği (Game `SettlementMap` ile karşılar; testte sahte). */
export interface GangSiteQuery {
  /** Aday merkezler (il ve ilçe): kalıcı kimlik, ad, merkez ve ayak izi yarıçapı. */
  readonly centers: ReadonlyArray<{
    id: number;
    name: string;
    x: number;
    z: number;
    radius: number;
  }>;
  /** (x, z) bir cadde üzerinde (yol ekseninden `distance` içinde) mi? */
  onStreet(x: number, z: number, distance: number): boolean;
  /** (x, z) bir yapının `margin` payıyla dışında ve yürünebilir mi? */
  open(x: number, z: number, margin: number): boolean;
}

export interface GangSpot {
  x: number;
  z: number;
}

/** Bir merkezdeki çete yeri: çetelerin başlangıç noktaları (`a`, `b`; bulunabilirse `c`). */
export interface GangSite {
  /** Kalıcı kimlik (yerleşim kimliği). */
  id: number;
  name: string;
  /** Merkez ve ayak izi yarıçapı. */
  x: number;
  z: number;
  radius: number;
  a: GangSpot;
  b: GangSpot;
  /** Üçüncü çete noktası (cadde üzerinde yer bulunabildiyse). */
  c?: GangSpot;
}

/** Bir çete üyesi: rol, silah ve başlangıç noktası (merkez noktasının çevresine dağılmış). */
export interface GangMember {
  role: BanditRole;
  weapon: BanditWeapon;
  x: number;
  z: number;
}

/** Çeteler (faction 0, 1, 2): bir yerde 1–3 tanesi birlikte bulunur (`gangFactionsPresent`). */
export const GANG_FACTIONS = [0, 1, 2] as const;
export type GangFaction = (typeof GANG_FACTIONS)[number];

function randomInRing(random: Random, cx: number, cz: number, rMax: number): GangSpot {
  const angle = random.next() * Math.PI * 2;
  const r = Math.sqrt(random.next()) * rMax;
  return { x: cx + Math.cos(angle) * r, z: cz + Math.sin(angle) * r };
}

/** Çete yerlerini seçer: her merkezde cadde üzerinde, binalardan açık iki yakın nokta; bulunamayan merkez atlanır. */
export function placeGangSites(q: GangSiteQuery, seed: number = GANGS.seed): GangSite[] {
  const sites: GangSite[] = [];
  const [minPair, maxPair] = GANGS.pairDistance;
  for (const center of q.centers) {
    const random = createRandom(seedFrom(seed, center.id, 1));
    const reach = Math.max(center.radius * GANGS.searchRadiusFraction, maxPair);
    let a: GangSpot | null = null;
    for (let i = 0; i < GANGS.searchTries && !a; i++) {
      const p =
        i === 0 ? { x: center.x, z: center.z } : randomInRing(random, center.x, center.z, reach);
      if (q.onStreet(p.x, p.z, GANGS.streetDistance) && q.open(p.x, p.z, GANGS.buildingClearance))
        a = p;
    }
    if (!a) continue;
    let b: GangSpot | null = null;
    for (let i = 0; i < GANGS.searchTries && !b; i++) {
      const angle = random.next() * Math.PI * 2;
      const r = minPair + random.next() * (maxPair - minPair);
      const p = { x: a.x + Math.cos(angle) * r, z: a.z + Math.sin(angle) * r };
      if (q.onStreet(p.x, p.z, GANGS.streetDistance) && q.open(p.x, p.z, GANGS.buildingClearance))
        b = p;
    }
    if (!b) continue;
    // Üçüncü nokta: a'ya pair uzaklığında, b'den de en az `minPair` uzakta (bulunamazsa site en çok iki çeteye hizmet eder).
    let c: GangSpot | null = null;
    for (let i = 0; i < GANGS.searchTries && !c; i++) {
      const angle = random.next() * Math.PI * 2;
      const r = minPair + random.next() * (maxPair - minPair);
      const p = { x: a.x + Math.cos(angle) * r, z: a.z + Math.sin(angle) * r };
      if (Math.hypot(p.x - b.x, p.z - b.z) < minPair) continue;
      if (q.onStreet(p.x, p.z, GANGS.streetDistance) && q.open(p.x, p.z, GANGS.buildingClearance))
        c = p;
    }
    sites.push({
      id: center.id,
      name: center.name,
      x: center.x,
      z: center.z,
      radius: center.radius,
      a,
      b,
      ...(c ? { c } : {}),
    });
  }
  return sites;
}

/** Oyun gününün (0'dan) bu merkezde çete bulunduran gün olup olmadığı (deterministik). */
export function gangPresent(site: GangSite, day: number, seed: number = GANGS.seed): boolean {
  return createRandom(seedFrom(seed, site.id, day, 2)).next() < GANGS.presenceChance;
}

/** Saat çetelerin sokakta olduğu aralıkta mı? */
export function gangHours(hour: number): boolean {
  const [from, to] = GANGS.hours;
  return hour >= from && hour < to;
}

/** Çetenin başlangıç noktası (bu yerde o çete için nokta yoksa null). */
export function gangSpot(site: GangSite, faction: GangFaction): GangSpot | null {
  return faction === 0 ? site.a : faction === 1 ? site.b : (site.c ?? null);
}

/**
 * O gün bu yerde bulunan çeteler (artan sırada): sayı `GANGS.gangCountWeights`'e göre 1–3 (noktası olan çetelerle
 * sınırlı), hangi çeteler olduğu da gün ve yere göre deterministiktir. Hep iki çete çıkmaz.
 */
export function gangFactionsPresent(
  site: GangSite,
  day: number,
  seed: number = GANGS.seed,
): GangFaction[] {
  const random = createRandom(seedFrom(seed, site.id, day, 7));
  const available = GANG_FACTIONS.filter((f) => gangSpot(site, f) !== null);
  const wanted = Number(pickWeighted(random, GANGS.gangCountWeights));
  const count = Math.max(1, Math.min(wanted, GANGS.maxGangs, available.length));
  // Karıştır (Fisher–Yates), ilk `count` taneyi al.
  const pool = [...available];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = random.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count).sort((x, y) => x - y);
}

/** Çetenin üyeleri (reis ilk): sayı (1–6, ağırlıklı), roller ve silahlar `site`, gün ve çeteye göre deterministiktir. */
export function gangRoster(
  site: GangSite,
  day: number,
  faction: GangFaction,
  seed: number = GANGS.seed,
): GangMember[] {
  const random = createRandom(seedFrom(seed, site.id, day, 3 + faction));
  const spot = gangSpot(site, faction) ?? site.a;
  const count = Number(pickWeighted(random, GANGS.memberWeights));
  const members: GangMember[] = [];
  for (let i = 0; i < count; i++) {
    const role: BanditRole = i === 0 ? 'leader' : 'member';
    const weapon: BanditWeapon =
      role === 'leader'
        ? (pickWeighted(random, GANGS.leaderWeapons) as BanditWeapon)
        : (pickWeighted(random, GANGS.weapons) as BanditWeapon);
    const p = i === 0 ? spot : randomInRing(random, spot.x, spot.z, GANGS.spread);
    members.push({ role, weapon, x: p.x, z: p.z });
  }
  return members;
}

/** Çete üyesinin kalıcı kimliği (kamp üyelerinden ve serbest eşkıyalardan ayrı aralık). */
export const GANG_ID_BASE = 2 ** 41;
const GANG_STRIDE = 32;
const GANG_FACTION_STRIDE = 8;

export function gangMemberId(siteIndex: number, faction: GangFaction, index: number): number {
  return GANG_ID_BASE + siteIndex * GANG_STRIDE + faction * GANG_FACTION_STRIDE + index;
}
