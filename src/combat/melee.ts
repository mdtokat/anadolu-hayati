import { COMBAT } from '../config';
import type { CreatureView } from '../creatures/kinds';
import type { Inventory } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';

/** Silah anahtarı: `fist` ya da silah eşyasının kimliği (`COMBAT.weapons`). */
export type WeaponId = keyof typeof COMBAT.weapons;
export type WeaponStats = (typeof COMBAT.weapons)[WeaponId];

/** Oyuncunun vuruş anındaki konumu ve bakışı. `y` ayak, `eyeY` göz yüksekliğidir (oyun m). */
export interface MeleeAim {
  x: number;
  y: number;
  z: number;
  eyeY: number;
  /** Yaw 0 = −Z, pozitif sola döner (Player ile aynı sözleşme); pitch pozitif yukarı. */
  yaw: number;
  pitch: number;
}

export interface MeleeHit {
  view: CreatureView;
  /** Canlının kenarına yatay uzaklık (oyun m). */
  distance: number;
  /** Bakış ile canlı merkezi arasındaki yatay açı (derece). */
  bearingDeg: number;
}

const RAD = 180 / Math.PI;

const WEAPON_IDS = Object.keys(COMBAT.weapons) as WeaponId[];

/** Eşya bir silah mı (`COMBAT.weapons` anahtarı)? */
export function isWeapon(id: ItemId | null): id is ItemId & WeaponId {
  return id !== null && (WEAPON_IDS as readonly string[]).includes(id);
}

/**
 * Saldırıda kullanılan silah (Faz 9): elde (kısayolda seçili) bir silah varsa ve envanterdeyse o; yoksa
 * envanterdeki en iyi silah (`bestWeapon`). Böylece kısayolsuz oynayan oyuncu eskisi gibi en iyi silahla vurur.
 */
export function activeWeapon(inventory: Pick<Inventory, 'has'>, held: ItemId | null): WeaponId {
  if (isWeapon(held) && inventory.has(held)) return held;
  return bestWeapon(inventory);
}

/** Envanterdeki en çok hasar veren silah (yoksa yumruk). */
export function bestWeapon(inventory: Pick<Inventory, 'has'>): WeaponId {
  let best: WeaponId = 'fist';
  for (const id of WEAPON_IDS) {
    if (id === 'fist' || !inventory.has(id as ItemId)) continue;
    if (COMBAT.weapons[id].damage > COMBAT.weapons[best].damage) best = id;
  }
  return best;
}

/** Bir canlıyı nişan alma kuralları (saldırı ve leş kesme aynı geometriyi farklı eşiklerle kullanır). */
export interface AimRules {
  /** Canlının kenarına en büyük yatay uzaklık (oyun m). */
  reach: number;
  coneDeg: number;
  pitchToleranceDeg: number;
  closeRange: number;
  maxVerticalGap: number;
}

/**
 * Bir canlı nişan alınıyor mu (saf)? Menzil canlının kenarına yataydır; yatay koni canlının açısal
 * genişliğiyle genişler; dikey tolerans `INTERACT` yamaç mantığı gibi gevşektir (bakış eğimi ile hedefe
 * yükselti açısı farkı) ve `closeRange` içinde dikey açı aranmaz. `targetHeight`: hedef noktanın zeminden
 * yüksekliği (leşte alçak). İsabet yoksa null.
 */
export function aimAt(
  view: CreatureView,
  aim: MeleeAim,
  rules: AimRules,
  targetHeight: number = view.height / 2,
): MeleeHit | null {
  const dx = view.x - aim.x;
  const dz = view.z - aim.z;
  const centerDistance = Math.hypot(dx, dz);
  const distance = Math.max(centerDistance - view.radius, 0);
  if (distance > rules.reach) return null;
  if (Math.abs(view.y - aim.y) > rules.maxVerticalGap) return null;

  // Yatay koni: bakış yönü (−sin yaw, −cos yaw) ile canlıya yön arasındaki açı.
  let bearingDeg = 0;
  if (centerDistance > view.radius) {
    const fx = -Math.sin(aim.yaw);
    const fz = -Math.cos(aim.yaw);
    const cos = (dx * fx + dz * fz) / centerDistance;
    bearingDeg = Math.acos(Math.min(Math.max(cos, -1), 1)) * RAD;
    const widthDeg = Math.asin(Math.min(view.radius / centerDistance, 1)) * RAD;
    if (bearingDeg > rules.coneDeg + widthDeg) return null;
  }

  // Dikey: hedef noktanın yükselti açısı bakış eğimine yakın olmalı.
  if (distance > rules.closeRange) {
    const dy = view.y + targetHeight - aim.eyeY;
    const elevationDeg = Math.atan2(dy, centerDistance) * RAD;
    if (Math.abs(elevationDeg - aim.pitch * RAD) > rules.pitchToleranceDeg) return null;
  }
  return { view, distance, bearingDeg };
}

/** Bir canlıya vuruş isabet eder mi? Leşe vurulmaz. */
export function resolveMelee(
  view: CreatureView,
  aim: MeleeAim,
  weapon: Pick<WeaponStats, 'reach'>,
): MeleeHit | null {
  if (view.dead) return null;
  return aimAt(view, aim, { ...COMBAT.aim, reach: weapon.reach });
}

/** Adaylar içinden vuruşa en uygun olanı seçer: bakışa en yakın (yatay açı), eşitlikte en yakın. */
export function pickMeleeTarget(
  candidates: ReadonlyArray<CreatureView>,
  aim: MeleeAim,
  weapon: Pick<WeaponStats, 'reach'>,
): MeleeHit | null {
  let best: MeleeHit | null = null;
  for (const view of candidates) {
    const hit = resolveMelee(view, aim, weapon);
    if (!hit) continue;
    if (
      best === null ||
      hit.bearingDeg < best.bearingDeg - 1e-9 ||
      (Math.abs(hit.bearingDeg - best.bearingDeg) <= 1e-9 && hit.distance < best.distance)
    ) {
      best = hit;
    }
  }
  return best;
}
