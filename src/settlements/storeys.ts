/**
 * Katlı yapıların iç düzeni (kullanıcı talimatı: "katlı binaların içinde çatıya kadar her kata merdiven"; saf mantık,
 * Three.js'siz). Konak, apartman, maden lojmanı ve hükümet konağı zemin kattan düz çatı terasına kadar girilebilir:
 * her kat bir döşeme levhası (`SLAB`), katlar arası düz bir merdiven kolu, çatıda korkuluklu teras. Tek kaynak: görsel
 * geometri (`world/buildingGeometry.ts`), collider/mermi katıları (`kinds.ts`) ve kat/tavan sorguları buradan okur.
 *
 * Yerel uzay: zemin kat döşemesi y = 0, ön yüz +z (kapı). Merdiven kolları kapının karşı yanındaki iki şeritte
 * (A ve B) gidip gelir: çift numaralı kol önden arkaya, tek numaralı kol arkadan öne yükselir; her kolun üstündeki
 * döşemede kolun üzerini açan bir boşluk vardır, diğer şerit döşeme üstünde başlar (U dönüşlü merdiven).
 */

/** Döşeme levhası kalınlığı (oyun m): alt kattaki tavan ile üst kattaki zemin arasında. */
export const SLAB = 0.3;
/** Çatı terasının korkuluk duvarı yüksekliği (oyun m). */
export const PARAPET = 1;
/** Merdiven genişliği ve en yüksek katın kol eğimi (derece; kısa odada daha dik). Oyuncunun sınırının (60°) altında. */
export const STAIR_WIDTH = 1.1;
export const STAIR_ANGLE_DEG = 33;
/** Merdivenin iç duvardan ve şeritlerin birbirinden payı; ön uçta kapıdan geri çekilme (oyun m). */
const STAIR_WALL_GAP = 0.1;
const LANE_GAP = 0.12;
const STAIR_FRONT_GAP = 1;
/** Kolun arka ucunda döşeme üstünde bırakılan en az sahanlık (oyun m). */
const STAIR_LANDING = 1;
/** Döşeme boşluğunun merdiven kenarlarından payı (oyun m). */
const HOLE_PAD = 0.04;
/** Basamak yüksekliği hedefi (görsel; oyun m). */
export const STEP_RISE = 0.2;

/** Katlı bir yapının ölçü girdileri (`kinds.ts` `ROOMS` + `SHAPE_DIMS` karşılar). */
export interface StoreyParams {
  /** Zemin kat dış ölçüleri. */
  w: number;
  d: number;
  /** Duvar kalınlığı. */
  wall: number;
  /** Zemin kat ve üst katların iç yüksekliği (tavan). */
  room: number;
  upper: number;
  /** Kat sayısı (zemin dahil; ≥ 2). */
  storeys: number;
  /** Üst katların çıkma payı (konak: 0,7; diğerleri 0). */
  over: number;
  /** Zemin kat kapısının yerel x'i (merdiven kapının karşı yanına konur). */
  doorX: number;
}

/** Tek merdiven kolu: şerit merkezi `x`, başlangıç/bitiş `z` ve yükseklikleri (yerel). */
export interface Flight {
  /** Bu kol `level`. kattan `level + 1`'e çıkar. */
  level: number;
  x: number;
  width: number;
  zFrom: number;
  zTo: number;
  y0: number;
  y1: number;
}

/** Döşeme levhasındaki merdiven boşluğu (yerel dikdörtgen). */
export interface SlabHole {
  /** Levha numarası: `level`. katın zemini (1…storeys; `storeys` = çatı terası). */
  level: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface StoreyPlan {
  storeys: number;
  /** Her katın zemin üst yüzü (0…storeys; `floorY[storeys]` = çatı terasının zemini). */
  floorY: number[];
  /** Her katın iç yüksekliği (0…storeys − 1). */
  clear: number[];
  /** Çatı terası zemini (= floorY'nin sonuncusu) ve korkuluk tepesi. */
  roofY: number;
  parapetTop: number;
  /** Üst katların dış ölçüsü (çıkma dahil). */
  upperW: number;
  upperD: number;
  flights: Flight[];
  holes: SlabHole[];
}

/** Kat planı (saf). */
export function storeyPlan(p: StoreyParams): StoreyPlan {
  const n = Math.max(2, Math.floor(p.storeys));
  const clear: number[] = [];
  const floorY: number[] = [0];
  for (let k = 0; k < n; k++) {
    clear.push(k === 0 ? p.room : p.upper);
    floorY.push((floorY[k] as number) + (clear[k] as number) + SLAB);
  }
  const roofY = floorY[n] as number;
  const hw = p.w / 2 - p.wall;
  const hd = p.d / 2 - p.wall;
  // Merdiven kapının karşı yanında; ilk şerit duvar dibinde, ikincisi ona bitişik.
  const side = p.doorX >= 0 ? -1 : 1;
  const half = STAIR_WIDTH / 2;
  const laneX = [
    side * (hw - STAIR_WALL_GAP - half),
    side * (hw - STAIR_WALL_GAP - half) - side * (STAIR_WIDTH + LANE_GAP),
  ] as const;
  const zFront = hd - STAIR_FRONT_GAP;
  // Tüm kollar aynı uzunlukta (U dönüşü aynı uçta buluşsun): en yüksek katın eğimi `STAIR_ANGLE_DEG`'dir; oda sığmazsa
  // (kısa yapılar) kol kısalır ve eğim artar.
  const tan = Math.tan((STAIR_ANGLE_DEG * Math.PI) / 180);
  const maxRise = Math.max(...clear.map((c) => c + SLAB));
  const run = Math.min(maxRise / tan, 2 * hd - STAIR_FRONT_GAP - STAIR_LANDING);
  const flights: Flight[] = [];
  const holes: SlabHole[] = [];
  for (let k = 0; k < n; k++) {
    const y0 = floorY[k] as number;
    const y1 = floorY[k + 1] as number;
    const even = k % 2 === 0;
    const x = laneX[k % 2] as number;
    const zBack = zFront - run;
    flights.push({
      level: k,
      x,
      width: STAIR_WIDTH,
      zFrom: even ? zFront : zBack,
      zTo: even ? zBack : zFront,
      y0,
      y1,
    });
    holes.push({
      level: k + 1,
      x0: x - half - HOLE_PAD,
      x1: x + half + HOLE_PAD,
      z0: zBack,
      z1: zFront,
    });
  }
  return {
    storeys: n,
    floorY,
    clear,
    roofY,
    parapetTop: roofY + PARAPET,
    upperW: p.w + p.over,
    upperD: p.d + p.over,
    flights,
    holes,
  };
}

/** Bir kolun basamak sayısı (görsel). */
export function stepCount(flight: Flight): number {
  return Math.max(4, Math.round((flight.y1 - flight.y0) / STEP_RISE));
}

/**
 * `rel` yüksekliğindeki (zemin kat döşemesinden) ayağın üstündeki tavan: ayağın bulunduğu katın tavanına uzaklık;
 * çatı terasında (tavan yok) null.
 */
export function ceilingAbove(plan: StoreyPlan, rel: number): number | null {
  for (let k = 0; k < plan.storeys; k++) {
    const top = (plan.floorY[k] as number) + (plan.clear[k] as number);
    if (rel < top + 0.2) return Math.max(0.5, top - rel);
  }
  return null;
}

/** Ayak `rel` yüksekliğindeyse yapının içinde (çatı terasının altında) sayılır mı? */
export function isUnderRoof(plan: StoreyPlan, rel: number): boolean {
  return rel < plan.roofY - SLAB + 0.2;
}

/** Eksene hizalı yerel kutu (kinds.ts `LocalBox` ile aynı alanlar). */
export interface PlanBox {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
}

function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): PlanBox {
  return {
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    cz: (z0 + z1) / 2,
    hx: (x1 - x0) / 2,
    hy: (y1 - y0) / 2,
    hz: (z1 - z0) / 2,
  };
}

/** Döşeme levhası (boşluk bırakılmış): boşluğun çevresindeki dört dikdörtgen. */
export function slabBoxes(
  plan: StoreyPlan,
  level: number,
  halfW: number,
  halfD: number,
): PlanBox[] {
  const hole = plan.holes.find((h) => h.level === level);
  const y1 = plan.floorY[level] as number;
  const y0 = y1 - SLAB;
  if (!hole) return [box(-halfW, halfW, y0, y1, -halfD, halfD)];
  const boxes: PlanBox[] = [];
  if (hole.x0 > -halfW) boxes.push(box(-halfW, hole.x0, y0, y1, -halfD, halfD));
  if (hole.x1 < halfW) boxes.push(box(hole.x1, halfW, y0, y1, -halfD, halfD));
  if (hole.z0 > -halfD) boxes.push(box(hole.x0, hole.x1, y0, y1, -halfD, hole.z0));
  if (hole.z1 < halfD) boxes.push(box(hole.x0, hole.x1, y0, y1, hole.z1, halfD));
  return boxes;
}

/** Üst katların (zemin kat tavanından korkuluk tepesine) kapısız dış duvarları: dört tek parça. */
export function upperWallBoxes(plan: StoreyPlan, wall: number): PlanBox[] {
  const hw = plan.upperW / 2;
  const hd = plan.upperD / 2;
  const y0 = (plan.floorY[1] as number) - SLAB;
  const y1 = plan.parapetTop;
  return [
    box(-hw, hw, y0, y1, -hd, -hd + wall),
    box(-hw, hw, y0, y1, hd - wall, hd),
    box(-hw, -hw + wall, y0, y1, -hd + wall, hd - wall),
    box(hw - wall, hw, y0, y1, -hd + wall, hd - wall),
  ];
}

/** Merdiven kolunun eğik çarpışma levhası (yerel; kalınlık yarısı `RAMP_HALF`): kutu merkezi, boyutlar ve eğim. */
export interface RampBox {
  /** Merkez (yerel). */
  cx: number;
  cy: number;
  cz: number;
  /** Yarı genişlik (x), yarı kalınlık (y) ve yarı uzunluk (eğik, z). */
  hx: number;
  hy: number;
  hz: number;
  /** x ekseni etrafında dönüş (radyan): + → −z yönünde yükselir. */
  pitch: number;
}

/** Eğik levhanın yarı kalınlığı (oyun m). */
export const RAMP_HALF = 0.1;

/** Kolun eğik levhası: üst yüzü kolun uçlarından geçer. */
export function rampBox(f: Flight): RampBox {
  const dz = f.zTo - f.zFrom;
  const dy = f.y1 - f.y0;
  const length = Math.hypot(dz, dy);
  // x ekseni etrafında α dönüşü (0,0,1) → (0, −sin α, cos α): +z'ye giderken alçalır. Hep cos α > 0 olacak yön seçilir
  // (kutu simetriktir); böylece yüzey normali (0, cos α, sin α) yukarı bakar.
  const sign = dz >= 0 ? 1 : -1;
  const pitch = Math.atan2(-dy * sign, dz * sign);
  const midY = (f.y0 + f.y1) / 2;
  const midZ = (f.zFrom + f.zTo) / 2;
  // Yüzey normali (0, cos, sin): merkez yüzeyin `RAMP_HALF` altındadır.
  const nx = Math.cos(pitch);
  const nz = Math.sin(pitch);
  return {
    cx: f.x,
    cy: midY - RAMP_HALF * nx,
    cz: midZ - RAMP_HALF * nz,
    hx: f.width / 2,
    hy: RAMP_HALF,
    hz: length / 2,
    pitch,
  };
}
