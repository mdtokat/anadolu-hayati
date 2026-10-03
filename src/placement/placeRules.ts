import { PLACEMENT, PROPERTY, SCATTER, VERTICAL_SCALE } from '../config';
import { floorTopAt, isPieceKind, pieceDistance } from './pieces';
import type { StructureKind, StructureSet } from './structures';

/**
 * Yerleşim yapısı (tapu kuralları, `economy/property.ts`): başkasının yapısına bir şey kurulamaz; sahip olunan yapının
 * iç mekânına küçük yapılar (sandık, tezgâh, döşek…) döşemeye kurulur.
 */
export interface PlaceBuilding {
  /** Oyuncunun tapusu var mı? */
  owned: boolean;
  /** Zemin katı döşemesi (oyun y). */
  floorY: number;
  /** (x, z) iç mekânda, duvar ve bina içi kaplardan `margin` uzakta mı? İç mekânı olmayan yapıda false. */
  insideRoom(x: number, z: number, margin: number): boolean;
}

/** Geçerlilik denetiminin dünyaya bakışı (Three.js'siz; test ve dünyalar kendi kaynağını verir). */
export interface PlaceContext {
  heightAt(x: number, z: number): number;
  /** (x, z) tatlı suya erişim mesafesinde mi (nehir, göl, kaynak)? Desteklemeyen dünyada tanımsız. */
  nearFreshWater?(x: number, z: number): boolean;
  /** (x, z) bir yerleşim yapısının ayak izinde mi (`margin` payıyla)? Yerleşimsiz dünyada tanımsız. */
  buildingAt?(x: number, z: number, margin: number): PlaceBuilding | null;
  /**
   * (x, z)'ye `reach` yakın, sahip olunan bir yapının döşeme yüksekliği (yoksa null): ek yapının ilk tabanı bu
   * seviyeye oturur (kapıdan düz geçilsin).
   */
  ownedFloorNear?(x: number, z: number, reach: number): number | null;
  structures: StructureSet;
}

export type PlaceFailure =
  | 'too_far'
  | 'in_sea'
  | 'too_steep'
  | 'near_water'
  | 'too_close'
  /** Modüler parça: bitişeceği taban/duvar yok. */
  | 'no_support'
  /** Modüler parça: bu yuva dolu. */
  | 'occupied'
  /** Faz 11 (A): çatı en üst parçadır; üstüne hiçbir şey kurulamaz. */
  | 'on_roof'
  /** Faz 11 (A): merdivenin girişi, boşluğu ve çıkışı açık kalmalı (duvar/çatı kurulamaz). */
  | 'stairwell'
  /** Tapu: başkasının (tapusu alınmamış) yerleşim yapısına kurulamaz. */
  | 'not_owned';

export type PlaceCheck =
  { ok: true; y: number; slopeDeg: number } | { ok: false; reason: PlaceFailure };

type KindSpec = {
  maxSlopeDeg: number;
  radius: number;
  aimDistance?: number;
  maxReach?: number;
  maxRelief?: number;
  reliefRadius?: number;
};

/** Ayak izi engebesi için örneklenen yön sayısı (çember üzerinde eşit aralıklı). */
const RELIEF_SAMPLES = 8;

/** (x, z) çevresinde `radius` çemberindeki zeminin merkeze göre en büyük mutlak yükseklik farkı (oyun m). */
export function footprintRelief(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
  radius: number,
): number {
  const center = heightAt(x, z);
  let relief = 0;
  for (let i = 0; i < RELIEF_SAMPLES; i++) {
    const a = (i / RELIEF_SAMPLES) * Math.PI * 2;
    relief = Math.max(
      relief,
      Math.abs(heightAt(x + Math.cos(a) * radius, z + Math.sin(a) * radius) - center),
    );
  }
  return relief;
}

function specOf(kind: StructureKind): KindSpec {
  return PLACEMENT.kinds[kind] as KindSpec;
}

/** Hayaletin oyuncunun önüne konduğu yatay uzaklık (oyun m): büyük yapılarda daha ileri (Faz 9). */
export function aimDistanceOf(kind: StructureKind): number {
  return specOf(kind).aimDistance ?? PLACEMENT.aimDistance;
}

/** Oyuncu ile hedef arasındaki en büyük yatay uzaklık (oyun m). */
export function maxReachOf(kind: StructureKind): number {
  return specOf(kind).maxReach ?? PLACEMENT.maxReach;
}

/** Yapının kaplama yarıçapı (oyun m; aralık kuralı ve sökme/odak menzili). */
export function radiusOf(kind: StructureKind): number {
  return specOf(kind).radius;
}

/**
 * Zemin eğimi (derece, oyun uzayı): hedef çevresinde ±adım örneklenen yüksekliklerin merkezi farkı.
 * `HeightSource` yalnızca yükseklik verdiği için dünyadan bağımsız hesaplanır.
 */
export function slopeDegAt(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
  step: number = PLACEMENT.slopeSampleStep,
): number {
  const dx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step);
  const dz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}

/**
 * Yapı (`target`) konumuna konabilir mi? Sırayla: erişim, deniz/kıyı, eğim (büyük yapıda ayak izi engebesi de),
 * tatlı su, başka yapıya yakınlık. Geçerliyse zemin yüksekliği (`y`) ve eğim döner.
 */
export function validatePlacement(
  kind: StructureKind,
  target: { x: number; z: number },
  player: { x: number; z: number; y?: number },
  ctx: PlaceContext,
): PlaceCheck {
  const spec = specOf(kind);
  if (Math.hypot(target.x - player.x, target.z - player.z) > maxReachOf(kind)) {
    return { ok: false, reason: 'too_far' };
  }

  // Tapu: yerleşim yapısının ayak izinde yalnızca sahip olunan yapının iç mekânına, döşemeye kurulur (kulübe ve
  // sundurma değil). Zemin denetimleri (eğim, deniz, su) yapının döşemesinde gerekmez.
  const building = ctx.buildingAt?.(target.x, target.z, spec.radius * 0.5) ?? null;
  if (building) {
    if (!building.owned) return { ok: false, reason: 'not_owned' };
    if (
      kind === 'wooden_hut' ||
      kind === 'lean_to' ||
      !building.insideRoom(target.x, target.z, spec.radius * 0.6) ||
      (player.y !== undefined &&
        Math.abs(player.y - building.floorY) > PROPERTY.indoorVerticalReach)
    ) {
      return { ok: false, reason: 'too_close' };
    }
  }

  // Taban üstünde yalnızca küçük yapılar (ateş, tezgâh, sandık) kurulur; zemin denetimleri tabanda yapılmıştır.
  // Faz 11 (A): katlı yapıda oyuncunun bulunduğu kata en yakın taban seçilir.
  const floorTop = building
    ? building.floorY
    : floorTopAt(ctx.structures, target.x, target.z, player.y);
  if (floorTop !== null && (kind === 'wooden_hut' || kind === 'lean_to')) {
    return { ok: false, reason: 'too_close' };
  }
  const y = floorTop ?? ctx.heightAt(target.x, target.z);
  let slope = 0;
  if (floorTop === null) {
    if (y * VERTICAL_SCALE <= SCATTER.minElevation) return { ok: false, reason: 'in_sea' };

    slope = slopeDegAt(ctx.heightAt, target.x, target.z);
    if (slope > spec.maxSlopeDeg) return { ok: false, reason: 'too_steep' };
    if (
      spec.maxRelief !== undefined &&
      footprintRelief(ctx.heightAt, target.x, target.z, spec.reliefRadius ?? spec.radius) >
        spec.maxRelief
    ) {
      return { ok: false, reason: 'too_steep' };
    }

    if (ctx.nearFreshWater?.(target.x, target.z)) return { ok: false, reason: 'near_water' };
  }

  const longest = Math.max(...Object.values(PLACEMENT.kinds).map((k) => k.radius));
  const searchRadius = spec.radius + longest + PLACEMENT.spacingMargin;
  for (const other of ctx.structures.near(target.x, target.z, searchRadius)) {
    if (isPieceKind(other.kind)) {
      // Modüler parça: yalnızca kendi ayak izine (plaka kenarı/duvar doğrusu) yaklaşılamaz; çatı üstte kalır.
      if (other.kind !== 'roof' && pieceDistance(other, target.x, target.z) < spec.radius + 0.15) {
        // Taban üstündeki küçük yapı tabanın kendisine değil, yalnızca duvarlara çarpar.
        if (other.kind === 'foundation' && floorTop !== null) continue;
        return { ok: false, reason: 'too_close' };
      }
      continue;
    }
    const needed = spec.radius + PLACEMENT.kinds[other.kind].radius + PLACEMENT.spacingMargin;
    if (Math.hypot(other.x - target.x, other.z - target.z) < needed) {
      return { ok: false, reason: 'too_close' };
    }
  }
  return { ok: true, y, slopeDeg: slope };
}

/**
 * Izgaraya oturan yapıların (modüler parça, çit) tapu denetimi: hedef bir yerleşim yapısının ayak izine `margin`
 * yakınsa başkasınınki `not_owned`, sahip olunanınki `too_close` (parçalar binanın içine/duvarına kurulmaz; ek yapı
 * yanına kurulur). Geçerli değilse ya da yapı yoksa denetim aynen döner.
 */
export function buildingClash(
  check: PlaceCheck,
  target: { x: number; z: number },
  margin: number,
  ctx: Pick<PlaceContext, 'buildingAt'>,
): PlaceCheck {
  if (!check.ok) return check;
  const building = ctx.buildingAt?.(target.x, target.z, margin) ?? null;
  if (!building) return check;
  return { ok: false, reason: building.owned ? 'too_close' : 'not_owned' };
}
