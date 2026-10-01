import { SETTLEMENT_LAYOUT, SETTLEMENT_STYLES } from '../config';
import type { LandmarkData, SettlementData, SettlementRank } from '../data/settlements';
import { createRandom, seedFrom } from '../utils/random';
import { LATTICE_CELL, latticeCol, latticeRow, latticeX, latticeZ } from '../world/lattice';
import { BUILDING_SHAPES, MAX_BURY, isMosque, type BuildingKind } from './kinds';
import { qiblaAzimuthDeg, yawFacingBackTo } from './qibla';
import type { RoadIndex } from './roadIndex';

/**
 * Yerleşim düzeni (saf, deterministik): bir yerleşimin gerçek ayak izinden (100 m hücre başına bina sayısı) ve
 * araziden oyun binalarını üretir. Aynı veri + tohum = aynı kasaba.
 *
 * Yöntem: ayak izi `footprintScale` kadar büyütülür; yerleşim çerçevesinde (en yakın yolun yönüne hizalı) bir
 * parsel ızgarası kurulur, il/ilçede her `blockLots` parselden sonra bir sokak boş kalır (sokaklar da çizilir).
 * Önce simge yapılar (elle seçilmiş gerçek konumlar, sonra cami/hükümet konağı/kahvehane/mezarlık/maden kulesi…
 * gibi türetilenler) hedeflerine en yakın uygun parsele, sonra konutlar üsluba ve yoğunluğa göre yerleşir.
 *
 * Yamaç: dikey ölçek yataydan 3,3 kat dik olduğundan kasabalar dik yamaçlardadır. Konutun kapısı aşağıya
 * (vadiye/denize) bakar, zemin katı ön kenarın zeminindedir, arka kenarı yamaca gömülür (`MAX_BURY`), altta kalan
 * yanlar taş temelle doldurulur (`maxPlinth`) — Karadeniz kasabalarının gerçek görünümü. Camiler kıbleye döner.
 * Deniz/kıyı, tatlı su, yol ve çakışma elenir.
 */

/** Düzenin okuduğu arazi sorguları (`RegionHeightSource` + tatlı su dizini karşılar). */
export interface LayoutTerrain {
  /** Oyun yüksekliği (y). */
  heightAt(x: number, z: number): number;
  /** Gerçek rakım (m; deniz ≤ 0). */
  elevationAt(x: number, z: number): number;
  /** (x, z)'ye `clearance` içinde tatlı su var mı? */
  isWater(x: number, z: number, clearance: number): boolean;
}

export interface Building {
  /** Kalıcı kimlik: `yerleşim · 1024 + sıra`. */
  id: number;
  settlement: number;
  kind: BuildingKind;
  x: number;
  z: number;
  /** Zemin katı döşemesi (oyun y): ön (kapı) kenarının zemini. */
  y: number;
  /** Ayak izinin en alçak zemini: taş temel buraya iner. */
  base: number;
  /** Dönüş (radyan; yerel +z ön yüz). */
  yaw: number;
  /** Harabelik 0–1; `ruined` ise çatısız/yıkık görünür. */
  ruin: number;
  ruined: boolean;
  /** Renk/doku çeşitlemesi [0, 1). */
  tone: number;
  /** Apartman kat sayısı (diğerleri 1). */
  floors: number;
  /** Simge yapının adı (yoksa null). */
  name: string | null;
}

export interface LayoutResult {
  buildings: Building[];
  /** Kent sokakları (il/ilçe): dünya X/Z çoklu çizgileri ([x0, z0, x1, z1, …]). */
  streets: Float32Array[];
  /** Yerleşim çerçevesi açısı (radyan) ve ayak izi yarıçapı (oyun m; büyütülmüş). */
  frame: number;
  radius: number;
}

const RUINABLE = new Set<BuildingKind>([
  'house',
  'konak',
  'lojman',
  'kahvehane',
  'shop_row',
  'serender',
]);
const MAX_PER_SETTLEMENT = 1023;
/** Camilerin (mihrap duvarı) döneceği yön: bölge için tek kıble açısı. */
const QIBLA_YAW = yawFacingBackTo(
  qiblaAzimuthDeg(SETTLEMENT_LAYOUT.qiblaFrom.lat, SETTLEMENT_LAYOUT.qiblaFrom.lon),
);

interface Lot {
  /** Çerçeve koordinatı (yerleşim merkezine göre, çerçeve eksenlerinde). */
  u: number;
  v: number;
  x: number;
  z: number;
  /** Yerleşim merkezine uzaklık (oyun m). */
  r: number;
  /** 100 m hücredeki gerçek bina sayısı. */
  n: number;
  /** Parsel dolu olsun mu (yoğunluk zarı)? */
  wanted: boolean;
}

/** Çerçevede eksene hizalı dikdörtgen (yerleşim içi çakışma denetimi). */
interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

function pickWeighted<K extends string>(
  table: Readonly<Partial<Record<K, number>>>,
  roll: number,
): K {
  let acc = 0;
  let last: K | null = null;
  for (const [key, weight] of Object.entries(table) as Array<[K, number]>) {
    acc += weight;
    last = key;
    if (roll < acc) return key;
  }
  return last as K;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const cellKey = (dc: number, dr: number): number => (dc + 4096) * 8192 + (dr + 4096);

/** Yerleşimin merkez hücresi (build_settlements.py `game_to_cell`) ve oyun konumu. */
export function settlementCenter(settlement: SettlementData): { x: number; z: number } {
  return {
    x: latticeX(Math.round(latticeCol(settlement.x))),
    z: latticeZ(Math.round(latticeRow(settlement.z))),
  };
}

/** Büyütülmüş ayak izi yarıçapı (oyun m); düzen kurulmadan önce de hesaplanabilir (yol kesme). */
export function footprintRadius(settlement: SettlementData): number {
  let maxCell = 0;
  const c = settlement.cells;
  for (let i = 0; i + 2 < c.length; i += 3) {
    maxCell = Math.max(maxCell, Math.hypot(c[i] as number, c[i + 1] as number));
  }
  const L = SETTLEMENT_LAYOUT;
  return (
    (maxCell + 0.5) * LATTICE_CELL * L.footprintScale[settlement.rank] +
    L.lotPitch[settlement.rank] / 2
  );
}

/**
 * Bir yerleşimin binaları ve sokakları. `landmarks`: bu yerleşime ait elle seçilmiş simge yapılar. `roads`: yol
 * dizini (yoksa çerçeve rastgele ve yol elemesi yok).
 */
export function layoutSettlement(
  settlement: SettlementData,
  landmarks: readonly LandmarkData[],
  terrain: LayoutTerrain,
  roads: RoadIndex | null,
  seed: number = SETTLEMENT_LAYOUT.seed,
  /** Ayar/test: parsel eleme nedenlerinin sayımı (verilirse doldurulur). */
  diagnostics?: Record<string, number>,
): LayoutResult {
  const L = SETTLEMENT_LAYOUT;
  const reject = (reason: string): null => {
    if (diagnostics) diagnostics[reason] = (diagnostics[reason] ?? 0) + 1;
    return null;
  };
  const rank: SettlementRank = settlement.rank;
  const village = rank === 'koy';
  const random = createRandom(seedFrom(seed, settlement.id));
  const scale = L.footprintScale[rank];
  const pitch = L.lotPitch[rank];
  const cells = new Map<number, number>();
  for (let i = 0; i + 2 < settlement.cells.length; i += 3) {
    const c = settlement.cells;
    cells.set(cellKey(c[i] as number, c[i + 1] as number), c[i + 2] as number);
  }
  const { x: cx, z: cz } = settlementCenter(settlement);
  const radius = footprintRadius(settlement);

  // Çerçeve eksenleri yapı yerel eksenleriyle aynı kuraldadır (yaw = frame): u yerel x, v yerel z.
  // Yolun yönü (atan2(dz, dx) = a) çerçevenin u eksenine (cos f, −sin f) denk gelsin: f = −a.
  const nearRoad = roads?.nearest(cx, cz, Math.max(30, radius * 0.5)) ?? null;
  const frameRoll = random.next();
  const frame = nearRoad ? -nearRoad.angle : frameRoll * Math.PI;
  const cos = Math.cos(frame);
  const sin = Math.sin(frame);
  const toWorld = (u: number, v: number) => ({
    x: cx + u * cos + v * sin,
    z: cz - u * sin + v * cos,
  });
  const worldToFrame = (x: number, z: number) => {
    const dx = x - cx;
    const dz = z - cz;
    return { u: dx * cos - dz * sin, v: dx * sin + dz * cos };
  };
  /** Gerçek konum merkezden `scale` kat uzaklaştırılır (ayak iziyle aynı büyütme), sonra çerçeveye çevrilir. */
  const toFrame = (x: number, z: number) =>
    worldToFrame(cx + (x - cx) * scale, cz + (z - cz) * scale);

  /**
   * Dünya konumundaki gerçek bina yoğunluğu (büyütme geri alınarak): parselin kapladığı hücre penceresinin
   * ortalaması (ayak izi hücreleri seyrek olabilir; tek hücre örneklemek parselleri gereksiz eler).
   */
  const window = Math.max(0, Math.round(pitch / scale / LATTICE_CELL / 2));
  const densityAt = (x: number, z: number): number => {
    const dc = Math.round((x - cx) / scale / LATTICE_CELL);
    const dr = Math.round((z - cz) / scale / LATTICE_CELL);
    let sum = 0;
    for (let a = -window; a <= window; a++) {
      for (let b = -window; b <= window; b++) sum += cells.get(cellKey(dc + a, dr + b)) ?? 0;
    }
    return sum / (2 * window + 1) ** 2;
  };

  const blockMod = L.blockLots + 1;
  const isStreet = (i: number) => ((i % blockMod) + blockMod) % blockMod === L.blockLots;

  // Parseller: il/ilçe düzenli ızgara (sokaklı), köy kaydırılmış seyrek ızgara.
  const lots: Lot[] = [];
  const steps = Math.ceil(radius / pitch);
  for (let j = -steps; j <= steps; j++) {
    for (let i = -steps; i <= steps; i++) {
      const jitterU = random.next();
      const jitterV = random.next();
      const roll = random.next();
      if (!village && (isStreet(i) || isStreet(j))) continue;
      const u = i * pitch + (village ? (jitterU - 0.5) * pitch * 0.5 : 0);
      const v = j * pitch + (village ? (jitterV - 0.5) * pitch * 0.5 : 0);
      const r = Math.hypot(u, v);
      if (r > radius) continue;
      const p = toWorld(u, v);
      const n = densityAt(p.x, p.z);
      if (n <= 0) continue;
      lots.push({
        u,
        v,
        x: p.x,
        z: p.z,
        r,
        n,
        wanted: roll < Math.min(1, n / L.fullDensity[rank]),
      });
    }
  }
  lots.sort((a, b) => a.r - b.r || a.v - b.v || a.u - b.u);
  if (diagnostics) {
    diagnostics.lots = lots.length;
    diagnostics.wanted = lots.filter((l) => l.wanted).length;
  }

  const placed: Building[] = [];
  const placedUV: Array<{ u: number; v: number }> = [];
  const rects: Rect[] = [];
  const usedLots = new Set<Lot>();

  /** (u, v)'de `yaw` dönük yapının çerçevedeki eksene hizalı kapsayıcı dikdörtgeni (+ boşluk payı). */
  const rectOf = (kind: BuildingKind, u: number, v: number, yaw: number): Rect => {
    const shape = BUILDING_SHAPES[kind];
    const phi = yaw - frame;
    const c = Math.abs(Math.cos(phi));
    const s = Math.abs(Math.sin(phi));
    const hw = (c * shape.width + s * shape.depth) / 2 + L.gap / 2;
    const hd = (s * shape.width + c * shape.depth) / 2 + L.gap / 2;
    return { u0: u - hw, u1: u + hw, v0: v - hd, v1: v + hd };
  };

  /** Yapı (u, v)'ye `yaw` ile sığar mı? Sığarsa zemin bilgisiyle döner. */
  const site = (
    kind: BuildingKind,
    u: number,
    v: number,
    yaw: number,
    ignore: Rect | null = null,
  ) => {
    const rect = rectOf(kind, u, v, yaw);
    for (const other of rects) {
      if (other === ignore) continue;
      if (rect.u0 < other.u1 && rect.u1 > other.u0 && rect.v0 < other.v1 && rect.v1 > other.v0) {
        return reject('overlap');
      }
    }
    const shape = BUILDING_SHAPES[kind];
    const p = toWorld(u, v);
    const yc = Math.cos(yaw);
    const ys = Math.sin(yaw);
    const corner = (lx: number, lz: number) => {
      const x = p.x + lx * yc + lz * ys;
      const z = p.z - lx * ys + lz * yc;
      return { x, z, h: terrain.heightAt(x, z), e: terrain.elevationAt(x, z) };
    };
    const hw = shape.width / 2;
    const hd = shape.depth / 2;
    const fl = corner(-hw, hd);
    const fr = corner(hw, hd);
    const bl = corner(-hw, -hd);
    const br = corner(hw, -hd);
    const mid = corner(0, 0);
    const back = corner(0, -hd);
    for (const k of [fl, fr, bl, br, mid, back]) if (k.e < L.minElevationM) return reject('sea');
    // Camiler kıbleye döndüğünden kapı yokuş yukarı da bakabilir: yamaca gömülmez, taş bir set (teras) üstünde
    // durur (zemin katı en yüksek köşede). Diğer yapılar ön kenarın zeminindedir, arkası yamaca gömülür.
    const terrace = isMosque(kind);
    const floor = terrace ? Math.max(fl.h, fr.h, bl.h, br.h, mid.h, back.h) : Math.max(fl.h, fr.h);
    const base = Math.min(fl.h, fr.h, bl.h, br.h, mid.h, back.h);
    if (Math.max(bl.h, br.h, mid.h, back.h) - floor > MAX_BURY[kind]) return reject('bury');
    if (floor - base > (terrace ? L.maxTerrace : L.maxPlinth)) return reject('plinth');
    const halfDiag = Math.hypot(shape.width, shape.depth) / 2;
    if (terrain.isWater(p.x, p.z, halfDiag * 0.8)) return reject('water');
    if (roads) {
      const hit = roads.nearest(p.x, p.z, halfDiag + 6);
      if (hit && hit.edgeDistance < Math.min(shape.width, shape.depth) / 2 + L.roadMargin) {
        return reject('road');
      }
    }
    return { rect, x: p.x, z: p.z, y: floor, base };
  };

  const add = (
    kind: BuildingKind,
    u: number,
    v: number,
    yaw: number,
    name: string | null,
    ignore: Rect | null = null,
  ): Building | null => {
    if (placed.length >= Math.min(L.maxBuildings[rank], MAX_PER_SETTLEMENT)) return reject('cap');
    const s = site(kind, u, v, yaw, ignore);
    if (!s) return null;
    const ruinRoll = random.next();
    const tone = random.next();
    const floorsRoll = random.next();
    const ruined = RUINABLE.has(kind) && ruinRoll < L.ruinChance[rank];
    const n = densityAt(s.x, s.z);
    const floors =
      kind === 'apartment'
        ? clamp(Math.round(3 + floorsRoll * 2 + (n >= L.denseThreshold * 2 ? 1 : 0)), 3, 6)
        : 1;
    rects.push(s.rect);
    placedUV.push({ u, v });
    const building: Building = {
      id: settlement.id * 1024 + placed.length,
      settlement: settlement.id,
      kind,
      x: s.x,
      z: s.z,
      y: s.y,
      base: s.base,
      yaw,
      ruin: ruined ? 0.5 + ruinRoll : ruinRoll * 0.5,
      ruined,
      tone,
      floors,
      name,
    };
    placed.push(building);
    return building;
  };

  /**
   * Yapının deneneceği dönüşler (tercih sırasıyla): cami kıbleye; diğerleri yamaçta kapı aşağıya, düzde merkeze
   * bakar (çerçeveye hizalı dört çeyrek).
   */
  const yawsFor = (
    kind: BuildingKind,
    lot: { u: number; v: number; x: number; z: number },
  ): number[] => {
    if (isMosque(kind)) return [QIBLA_YAW];
    const quarters = [0, 1, 2, 3].map((q) => frame + (q * Math.PI) / 2);
    const probe = L.slopeProbe;
    const gx = terrain.heightAt(lot.x + probe, lot.z) - terrain.heightAt(lot.x - probe, lot.z);
    const gz = terrain.heightAt(lot.x, lot.z + probe) - terrain.heightAt(lot.x, lot.z - probe);
    let dirX: number;
    let dirZ: number;
    if (Math.hypot(gx, gz) >= L.slopeFacingMin) {
      dirX = -gx; // aşağı yön
      dirZ = -gz;
    } else {
      const toCenter = toWorld(0, 0);
      dirX = toCenter.x - lot.x;
      dirZ = toCenter.z - lot.z;
    }
    // Ön yüz (yerel +z) dünyada (sin yaw, cos yaw).
    return quarters.sort(
      (a, b) => Math.sin(b) * dirX + Math.cos(b) * dirZ - (Math.sin(a) * dirX + Math.cos(a) * dirZ),
    );
  };

  const tryLot = (kind: BuildingKind, lot: Lot, name: string | null): Building | null => {
    for (const yaw of yawsFor(kind, lot)) {
      const b = add(kind, lot.u, lot.v, yaw, name);
      if (b) {
        usedLots.add(lot);
        return b;
      }
    }
    return null;
  };

  /** Hedefe (çerçeve u, v) en yakın, yapıyı alan parsele yerleştirir (`maxDistance` içinde). */
  const placeNear = (
    kind: BuildingKind,
    tu: number,
    tv: number,
    name: string | null,
    maxDistance: number = L.landmarkSearchRadius,
  ): Building | null => {
    const candidates = lots
      .filter((lot) => !usedLots.has(lot))
      .map((lot) => ({ lot, d: Math.hypot(lot.u - tu, lot.v - tv) }))
      .filter((c) => c.d <= maxDistance)
      .sort((a, b) => a.d - b.d);
    for (const { lot } of candidates.slice(0, 60)) {
      const b = tryLot(kind, lot, name);
      if (b) return b;
    }
    return null;
  };

  /** Merkezden uzak (kenar) parsellerden birine yerleştirir (mezarlık, maden, fabrika). */
  const placeAtEdge = (kind: BuildingKind): Building | null => {
    const edge = lots
      .filter((lot) => !usedLots.has(lot))
      .sort((a, b) => b.r - a.r || a.v - b.v || a.u - b.u);
    const pool = edge.slice(0, Math.max(6, Math.ceil(edge.length * 0.35)));
    const start = Math.floor(random.next() * pool.length);
    for (let k = 0; k < pool.length; k++) {
      const b = tryLot(kind, pool[(start + k) % pool.length] as Lot, null);
      if (b) return b;
    }
    return null;
  };

  const addFountain = (mosque: Building): void => {
    // Avlu çeşmesi (abdest/şadırvan): caminin önünde sol köşede, aynı yöne bakar.
    const shape = BUILDING_SHAPES[mosque.kind];
    const lx = -shape.width / 2 + 1.6;
    const lz = shape.depth / 2 + 1.6;
    const yc = Math.cos(mosque.yaw);
    const ys = Math.sin(mosque.yaw);
    const t = worldToFrame(mosque.x + lx * yc + lz * ys, mosque.z - lx * ys + lz * yc);
    // Caminin kapsayıcı dikdörtgeni (kıbleye döndüğünden çerçeveye eğik) avluyu da kapsar: onunla çakışma sayılmaz.
    add('fountain', t.u, t.v, mosque.yaw, null, rects[placed.indexOf(mosque)] ?? null);
  };

  // 1. Elle seçilmiş simge yapılar (gerçek konumlarına en yakın).
  const curated = new Set<string>();
  for (const lm of landmarks) {
    const t = toFrame(lm.x, lm.z);
    // Büyük cami sığmazsa aynı adla mahalle camisi ölçüsünde kurulur (dik yamaç kasabaları).
    const b =
      placeNear(lm.kind, t.u, t.v, lm.name) ??
      (lm.kind === 'mosque_grand' ? placeNear('mosque', t.u, t.v, lm.name) : null);
    if (b) {
      curated.add(lm.kind);
      if (isMosque(lm.kind)) addFountain(b);
    }
  }

  // 2. Türetilen kamu/dinî yapılar.
  const mosqueTarget =
    rank === 'il'
      ? clamp(Math.round(settlement.mosques / 5), 2, 5)
      : rank === 'ilce'
        ? clamp(Math.round(settlement.mosques / 4), 1, 3)
        : random.next() < 0.8
          ? 1
          : 0;
  let mosques = placed.filter((b) => isMosque(b.kind)).length;
  if (rank === 'il' && mosques === 0) {
    const b = placeNear('mosque_grand', 0, 0, null) ?? placeNear('mosque', 0, 0, null, radius);
    if (b) {
      mosques++;
      addFountain(b);
    }
  }
  // Mahalle camileri: ayak izine yayılsın (her biri öncekilerden en uzak isteğe bağlı parsele).
  for (let k = 0; mosques < mosqueTarget && k < mosqueTarget * 3; k++) {
    const kind: BuildingKind = village ? 'mosque_wooden' : 'mosque';
    const spot = village ? { u: 0, v: 0 } : farthestFrom(placed, placedUV, lots, usedLots);
    if (!spot) break;
    const b =
      placeNear(kind, spot.u, spot.v, null, village ? 40 : L.landmarkSearchRadius) ??
      (mosques === 0 ? placeNear(kind, 0, 0, null, radius) : null);
    if (!b) continue;
    mosques++;
    addFountain(b);
  }
  // Her yerleşimde (köyler hariç olabilir) en az bir cami: dik/dar kasabada küçük ahşap camiye düşülür.
  if (mosques === 0 && (!village || mosqueTarget > 0)) {
    const b =
      placeNear(village ? 'mosque_wooden' : 'mosque', 0, 0, null, radius) ??
      (village ? null : placeNear('mosque_wooden', 0, 0, null, radius));
    if (b) addFountain(b);
  }
  if (!village) {
    placeNear('government', 0, 0, null);
    if (!curated.has('clock_tower') && rank === 'il') placeNear('clock_tower', 0, 0, null);
    placeNear('fountain', 0, 0, null); // meydan çeşmesi
  }
  const coffee = rank === 'il' ? 2 : rank === 'ilce' ? 2 : random.next() < 0.6 ? 1 : 0;
  for (let k = 0; k < coffee; k++) placeNear('kahvehane', 0, 0, null);
  if ((rank === 'il' || settlement.style === 'osmanli') && !village && !curated.has('hamam')) {
    placeNear('hamam', 0, 0, null);
  }
  if (settlement.style === 'osmanli' && !village && !curated.has('tomb'))
    placeNear('tomb', 0, 0, null);
  const cemeteries = rank === 'il' ? 2 : rank === 'ilce' ? 1 : random.next() < 0.7 ? 1 : 0;
  for (let k = 0; k < cemeteries; k++) placeAtEdge('cemetery');
  if (settlement.style === 'maden')
    for (let k = 0; k < (rank === 'il' ? 2 : 1); k++) placeAtEdge('mine_tower');
  if (settlement.style === 'sanayi')
    for (let k = 0; k < (rank === 'il' ? 2 : 1); k++) placeAtEdge('factory');

  // 3. Konutlar: köyde sayı gerçek binalardan, il/ilçede yoğunluk zarıyla.
  const style = SETTLEMENT_STYLES[settlement.style];
  const coreRadius = radius * 0.3;
  if (village) {
    const houses = clamp(
      Math.round(settlement.buildings / L.villageBuildingsPerHouse),
      L.villageHouses.min,
      L.villageHouses.max,
    );
    let built = 0;
    for (const lot of lots) {
      if (built >= houses) break;
      if (usedLots.has(lot)) continue;
      const roll = random.next();
      const kind: BuildingKind = built === 0 ? 'house' : pickWeighted(style.sparse, roll);
      if (tryLot(kind, lot, null)) built++;
    }
  } else {
    for (const lot of lots) {
      if (usedLots.has(lot) || !lot.wanted) continue;
      const roll = random.next();
      const shopRoll = random.next();
      let kind: BuildingKind;
      if (lot.r < coreRadius && shopRoll < 0.55) kind = 'shop_row';
      else kind = pickWeighted(lot.n >= L.denseThreshold ? style.dense : style.sparse, roll);
      if (!tryLot(kind, lot, null) && kind !== 'house') tryLot('house', lot, null);
    }
  }

  // 4. Sokaklar (il/ilçe): boş bırakılan ızgara sıraları, yerleşimin dolu olduğu kesimlerde.
  const streets: Float32Array[] = [];
  if (!village) {
    const buildingsBox = placedUV.reduce(
      (b, p) => ({
        u0: Math.min(b.u0, p.u),
        u1: Math.max(b.u1, p.u),
        v0: Math.min(b.v0, p.v),
        v1: Math.max(b.v1, p.v),
      }),
      { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity },
    );
    const okAt = (u: number, v: number): boolean => {
      if (Math.hypot(u, v) > radius) return false;
      const p = toWorld(u, v);
      return densityAt(p.x, p.z) > 0 && terrain.elevationAt(p.x, p.z) >= L.minElevationM;
    };
    const step = pitch / 2;
    for (let k = -steps; k <= steps; k++) {
      if (!isStreet(k)) continue;
      const fixed = k * pitch;
      for (const along of ['u', 'v'] as const) {
        const lo = along === 'u' ? buildingsBox.u0 : buildingsBox.v0;
        const hi = along === 'u' ? buildingsBox.u1 : buildingsBox.v1;
        const fixedLo = along === 'u' ? buildingsBox.v0 : buildingsBox.u0;
        const fixedHi = along === 'u' ? buildingsBox.v1 : buildingsBox.u1;
        if (!(fixed >= fixedLo - pitch && fixed <= fixedHi + pitch)) continue;
        let run: number[] = [];
        const flush = () => {
          if (run.length >= 4) streets.push(Float32Array.from(run));
          run = [];
        };
        for (let t = Math.floor(lo / step) * step - pitch; t <= hi + pitch; t += step) {
          const u = along === 'u' ? t : fixed;
          const v = along === 'u' ? fixed : t;
          if (!okAt(u, v)) {
            flush();
            continue;
          }
          const p = toWorld(u, v);
          run.push(p.x, p.z);
        }
        flush();
      }
    }
  }

  return { buildings: placed, streets, frame, radius };
}

/** Yerleşmiş camilere en uzak, isteğe bağlı (wanted) boş parselin çerçeve konumu. */
function farthestFrom(
  placed: readonly Building[],
  placedUV: ReadonlyArray<{ u: number; v: number }>,
  lots: readonly Lot[],
  used: ReadonlySet<Lot>,
): { u: number; v: number } | null {
  const anchors = placedUV.filter((_, i) => isMosque((placed[i] as Building).kind));
  let best: Lot | null = null;
  let bestD = -1;
  for (const lot of lots) {
    if (used.has(lot) || !lot.wanted) continue;
    let d = anchors.length === 0 ? lot.r : Infinity;
    for (const a of anchors) d = Math.min(d, Math.hypot(lot.u - a.u, lot.v - a.v));
    if (d > bestD) {
      bestD = d;
      best = lot;
    }
  }
  return best ? { u: best.u, v: best.v } : null;
}
