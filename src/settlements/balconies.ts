import type { StoreyPlan } from './storeys';

/**
 * Apartman balkonları (kullanıcı talimatı: "balkonlar da kullanılabilir olsun"; saf mantık, Three.js'siz). Her üst katın
 * ön cephesinde iki balkon: döşemesi katın zemin seviyesindedir, önünde ve yanlarında korkuluk vardır, odadan balkon
 * kapısıyla çıkılır. Tek kaynak: görsel geometri (`world/buildingGeometry.ts`), collider/mermi katıları (`kinds.ts`:
 * balkon döşemesi ve korkulukları katı, ön üst duvar kapıda delik) ve pencere düzeni (`windows.ts`: ön cephe üst kat
 * pencereleri balkon kapılarına yer bırakır) buradan okur.
 *
 * Yerel uzay (`kinds.ts` ile aynı): zemin kat döşemesi y = 0, ön yüz +z. Ölçüler oyun metresidir. Balkonların ayak izi
 * taşması `BUILDING_OVERHANG.apartment.z` içindedir (yerleşim düzeni değişmez).
 */
export const BALCONY = {
  /** Balkonun cepheden taşması (oyun m). */
  depth: 1,
  /** Döşeme kalınlığı: üst yüzü katın zemininde. */
  slab: 0.15,
  /** Korkuluk yüksekliği ve kalınlığı. */
  railHeight: 1,
  railThickness: 0.08,
  /** Balkon kapısı genişliği ve yüksekliği. */
  doorWidth: 1,
  doorHeight: 2.1,
  /** Balkon merkezinin yapı genişliğine oranı ve balkon genişliğinin oranı (yerel x: ±centerShare · w). */
  centerShare: 0.28,
  widthShare: 0.36,
  /**
   * Balkon kapısının yerel x'i (mutlak): merdiven kolları kapının karşı yanındaki şeritlerdedir (`storeys.ts`), kapı
   * onlardan uzak, balkonun yapı ortasına yakın ucunda durur.
   */
  doorOffset: 1.6,
} as const;

/** Tek balkon (yerel). */
export interface Balcony {
  /** Kat (1 … storeys − 1). */
  level: number;
  /** Döşemenin üst yüzü (= katın zemini). */
  floorY: number;
  /** Merkez x, genişlik; ön cephe z'si (duvarın dış yüzü) ve taşma. */
  x: number;
  width: number;
  wallZ: number;
  depth: number;
  /** Balkon kapısının merkez x'i. */
  doorX: number;
}

/** Eksene hizalı yerel kutu (kinds.ts `LocalBox` ile aynı alanlar). */
interface Box {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
}

/** Yapının balkonları: yalnız apartmanda (her üst katta iki); diğer türlerde ve katsızda boş. */
export function balconyLayout(
  kind: string,
  plan: StoreyPlan | null,
  w: number,
  d: number,
): Balcony[] {
  if (kind !== 'apartment' || plan === null) return [];
  const out: Balcony[] = [];
  for (let level = 1; level < plan.storeys; level++) {
    for (const side of [-1, 1]) {
      out.push({
        level,
        floorY: plan.floorY[level] as number,
        x: side * w * BALCONY.centerShare,
        width: w * BALCONY.widthShare,
        wallZ: d / 2,
        depth: BALCONY.depth,
        doorX: side * BALCONY.doorOffset,
      });
    }
  }
  return out;
}

/** Balkon kapısının duvarı delen hacmi (duvar kalınlığı + `pad`; eşik döşeme seviyesinde). */
export function balconyDoorHole(b: Balcony, wall: number, pad = 0.12): Box {
  const h = BALCONY.doorHeight;
  return {
    cx: b.doorX,
    cy: b.floorY + h / 2,
    cz: b.wallZ - wall / 2,
    hx: BALCONY.doorWidth / 2,
    hy: h / 2,
    hz: wall / 2 + pad,
  };
}

/** Balkonun katı kutuları: döşeme, ön korkuluk ve iki yan korkuluk. */
export function balconySolids(b: Balcony): Box[] {
  const { slab, railHeight: rh, railThickness: rt } = BALCONY;
  const z0 = b.wallZ;
  const z1 = b.wallZ + b.depth;
  const hw = b.width / 2;
  const y = b.floorY;
  return [
    { cx: b.x, cy: y - slab / 2, cz: (z0 + z1) / 2, hx: hw, hy: slab / 2, hz: b.depth / 2 },
    { cx: b.x, cy: y + rh / 2, cz: z1 - rt / 2, hx: hw, hy: rh / 2, hz: rt / 2 },
    {
      cx: b.x - hw + rt / 2,
      cy: y + rh / 2,
      cz: (z0 + z1 - rt) / 2,
      hx: rt / 2,
      hy: rh / 2,
      hz: (b.depth - rt) / 2,
    },
    {
      cx: b.x + hw - rt / 2,
      cy: y + rh / 2,
      cz: (z0 + z1 - rt) / 2,
      hx: rt / 2,
      hy: rh / 2,
      hz: (b.depth - rt) / 2,
    },
  ];
}
