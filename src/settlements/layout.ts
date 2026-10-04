import { CITY_SIZE, ROADS, SETTLEMENT_LAYOUT, SETTLEMENT_STYLES } from '../config';
import type { LandmarkData, RoadClass, SettlementData, SettlementRank } from '../data/settlements';
import { createRandom, seedFrom } from '../utils/random';
import { LATTICE_CELL, latticeCol, latticeRow, latticeX, latticeZ } from '../world/lattice';
import { apartmentFloors, bySize, konakFloors, paintIndex, urbanScale } from './citySize';
import { FootprintRegistry, type OrientedBox } from './footprints';
import { BUILDING_OVERHANG, BUILDING_SHAPES, MAX_BURY, isMosque, type BuildingKind } from './kinds';
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
 * Deniz/kıyı, tatlı su, yol ve çakışma elenir: çakışma, görsel taşma payı (`BUILDING_OVERHANG`: saçak, revak) ve
 * kapı önü merdiveni dahil, komşu yerleşimlerin yapılarıyla da (ortak `FootprintRegistry`) denetlenir; sokaklar
 * yapıların ve akarsuların üstünden geçmez.
 */

/** Kapı önü merdiveni: eğim (yükselti / uzunluk) ve en kısa yükselti (altı basamaksız geçilir). */
export const STAIR_SLOPE = 0.7;
export const STAIR_MIN_RISE = 0.3;

/** Merdiven genişliği (oyun m): girilebilir yapıda geniş, diğerlerinde dar. */
export function stairWidth(kind: BuildingKind): number {
  return BUILDING_SHAPES[kind].enterable ? 2.6 : 1.6;
}

/** Düzenin okuduğu arazi sorguları (`RegionHeightSource` + tatlı su dizini karşılar). */
export interface LayoutTerrain {
  /** Oyun yüksekliği (y). */
  heightAt(x: number, z: number): number;
  /** Gerçek rakım (m; deniz ≤ 0). */
  elevationAt(x: number, z: number): number;
  /** (x, z)'ye `clearance` içinde tatlı su var mı? */
  isWater(x: number, z: number, clearance: number): boolean;
  /**
   * Varsa dik arazide yapı terası açılabilir: `box` ayak izi `y` seviyesine düzlenir (kazı + dolgu, çevresine yumuşak
   * şevle). Çağrıdan sonra `heightAt` düzlenmiş zemini verir; sonraki yapılar onun üstünde kurulur. Yoksa yamaç
   * yalnızca taş temel / gömülmeyle (`maxPlinth`, `MAX_BURY`) aşılır.
   */
  level?(box: OrientedBox, y: number): void;
  /** Düzlenmeyen yapının ayak izini kilitler (sonraki teraslar zeminini değiştirmesin). */
  lock?(box: OrientedBox): void;
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
  /**
   * Kat sayısı (zemin dahil): apartman 2–10 ve konak 2–3 kentin büyüklüğüne göre (`citySize.ts`); diğerleri 1 (katlı
   * diğer yapıların kat sayısı türün sabitidir, `kinds.ts` `storeyCount`).
   */
  floors: number;
  /** Apartman cephe boyası: 0 (ya da yok) boyasız beton, 1…n `BUILDING_LOOK.paints` sırası. */
  paint?: number;
  /** Simge yapının adı (yoksa null). */
  name: string | null;
  /** Kapı önü merdiveni için ayrılan en uzun yer (oyun m; merdiven yoksa 0): merdiven bunu aşmaz. */
  stairRun: number;
}

/** Kent sokağı adayı: sınıfı (3) ve dünya X/Z çizgisi ([x0, z0, x1, z1]); `townNetwork.ts` hangilerinin kalacağını seçer. */
export interface Street {
  cls: RoadClass;
  xz: Float32Array;
}

export interface LayoutResult {
  buildings: Building[];
  /** Kent sokakları (il/ilçe): yalnızca yapılara hizmet eden kesimler. */
  streets: Street[];
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
/** En geniş yol sınıfının yarı genişliği (oyun m). */
const MAX_ROAD_HALF = Math.max(...ROADS.width) / 2;
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
  /** Daha önce yerleşmiş yapıların (komşu yerleşimler) ayak izleri; bu yerleşiminkiler de buna eklenir. */
  occupied: FootprintRegistry = new FootprintRegistry(),
  /** Başka il/ilçe merkezlerinin çekirdekleri (dünya daireleri): buralara bu yerleşimin yapısı konmaz. */
  foreignCores: ReadonlyArray<{ x: number; z: number; r: number }> = [],
  /** Yerleşmiş camilerin konumları (tüm yerleşimler ortak; camiler arası en az uzaklık için). Bu yerleşiminkiler eklenir. */
  mosqueSites: Array<{ x: number; z: number }> = [],
): LayoutResult {
  const L = SETTLEMENT_LAYOUT;
  const reject = (reason: string): null => {
    if (diagnostics) diagnostics[reason] = (diagnostics[reason] ?? 0) + 1;
    return null;
  };
  const rank: SettlementRank = settlement.rank;
  const village = rank === 'koy';
  const random = createRandom(seedFrom(seed, settlement.id));
  // Kentleşme ölçeği (0 küçük kasaba … 1 metropol): kat, karışım, doluluk, harabelik. Köylerde etkisiz (çarpan 1).
  const urban = urbanScale(settlement);
  const sized = (pair: readonly [number, number]): number => (village ? 1 : bySize(pair, urban));
  const scale = L.footprintScale[rank];
  // Büyük kentte parseller geniş: apartman (10 m) ve dükkân sıraları yan yana sığar.
  const pitch = L.lotPitch[rank] * sized(CITY_SIZE.lotPitchScale);
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
        wanted: roll < Math.min(1, n / (L.fullDensity[rank] * sized(CITY_SIZE.fullDensityScale))),
      });
    }
  }
  lots.sort((a, b) => a.r - b.r || a.v - b.v || a.u - b.u);
  if (diagnostics) {
    diagnostics.lots = lots.length;
    diagnostics.wanted = lots.filter((l) => l.wanted).length;
  }

  /**
   * (x, z) başka bir merkezin çekirdeğinde mi? Çekirdekler örtüşebilir (Zonguldak–Kozlu): nokta ancak o merkeze bu
   * yerleşimin merkezinden daha yakınsa onundur (Voronoi bölüşümü).
   */
  const nearCores = foreignCores.filter(
    (core) => Math.hypot(core.x - cx, core.z - cz) < core.r + radius + pitch,
  );
  const inForeignCore = (x: number, z: number): boolean => {
    if (nearCores.length === 0) return false;
    const own = Math.hypot(x - cx, z - cz);
    for (const core of nearCores) {
      const d = Math.hypot(x - core.x, z - core.z);
      if (d < core.r && d < own) return true;
    }
    return false;
  };

  /** Son çare (merkezin tek camisi): komşu çekirdeğe de konabilir. */
  let allowForeignCore = false;
  /**
   * Cami (u, v)'de başka bir camiye (bu ya da komşu yerleşimlerin) `mosqueSpacing`'ten yakın mı? İl/ilçe merkezinin ilk
   * camisi bu kurala takılmaz (her kentin en az bir camisi olur).
   */
  const mosqueCrowded = (u: number, v: number): boolean => {
    if (!village && !placed.some((b) => isMosque(b.kind))) return false;
    const p = toWorld(u, v);
    return mosqueSites.some((m) => Math.hypot(m.x - p.x, m.z - p.z) < L.mosqueSpacing);
  };
  const placed: Building[] = [];
  const placedUV: Array<{ u: number; v: number }> = [];
  const usedLots = new Set<Lot>();

  /** Yapı (u, v)'ye `yaw` ile sığar mı? Sığarsa zemin ve ayak izi (gövde + merdiven) bilgisiyle döner. */
  const site = (
    kind: BuildingKind,
    u: number,
    v: number,
    yaw: number,
    ignore: number | null = null,
  ) => {
    const shape = BUILDING_SHAPES[kind];
    const pad = BUILDING_OVERHANG[kind];
    const p = toWorld(u, v);
    const ex = shape.width / 2 + pad.x;
    const ez = shape.depth / 2 + pad.z;
    // Gövde: ayak izi + taşma payı + aralık payı (iki komşu arasında toplam `gap`).
    const body: OrientedBox = { x: p.x, z: p.z, hx: ex + L.gap / 2, hz: ez + L.gap / 2, yaw };
    if (occupied.overlaps(body, ignore)) return reject('overlap');
    if (!allowForeignCore && inForeignCore(p.x, p.z)) return reject('foreign');
    const yc = Math.cos(yaw);
    const ys = Math.sin(yaw);
    const local = (lx: number, lz: number) => ({
      x: p.x + lx * yc + lz * ys,
      z: p.z - lx * ys + lz * yc,
    });
    const corner = (lx: number, lz: number) => {
      const { x, z } = local(lx, lz);
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
    // Girilebilir yapılar (konut, dükkân, cami, han) da gömülmez: içeride arazi döşemenin üstüne çıkmasın diye zemin
    // katı ayak izinin en yüksek zemininin biraz üstündedir (`floorLift`); altı taş temel, kapı önü merdivendir.
    const terrace = shape.enterable;
    let floor = terrace ? interiorTop(hw, hd, corner) + L.floorLift : Math.max(fl.h, fr.h);
    let base = Math.min(fl.h, fr.h, bl.h, br.h, mid.h, back.h);
    const buried = !terrace && Math.max(bl.h, br.h, mid.h, back.h) - floor > MAX_BURY[kind];
    const plinth = floor - base > (isMosque(kind) ? L.maxTerrace : L.maxPlinth);
    // Dik arazide (bury/plinth sınırı aşılıyorsa) ve arazi düzlenebiliyorsa yapı bir terasa oturur: zemin kat ve temel
    // medyan seviyede, merdiven ve taş temel gerekmez.
    let padLevel: number | null = null;
    if (buried || plinth) {
      const hs = [fl.h, fr.h, bl.h, br.h, mid.h, back.h].sort((x, y) => x - y);
      if (!terrain.level || (hs[5] as number) - (hs[0] as number) > L.maxPadRange) {
        return reject(buried ? 'bury' : 'plinth');
      }
      padLevel = ((hs[2] as number) + (hs[3] as number)) / 2;
      floor = padLevel;
      base = padLevel;
    }
    // Ayak izi (taşma payıyla) üzerinde örnekler: hiçbiri akarsuya/göle ya da yola değmesin.
    // Önce merkezden tek sorgu: yakında su/yol yoksa örneklere gerek yok (düzen süresi).
    const reach = Math.hypot(ex, ez);
    const waterNear = terrain.isWater(p.x, p.z, reach + L.waterClearance);
    const roadNear =
      roads !== null && roads.nearest(p.x, p.z, reach + L.roadMargin + MAX_ROAD_HALF) !== null;
    if (waterNear || roadNear) {
      const nx = Math.max(1, Math.ceil((2 * ex) / L.sampleStep));
      const nz = Math.max(1, Math.ceil((2 * ez) / L.sampleStep));
      for (let i = 0; i <= nx; i++) {
        for (let j = 0; j <= nz; j++) {
          const q = local(-ex + (2 * ex * i) / nx, -ez + (2 * ez * j) / nz);
          if (waterNear && terrain.isWater(q.x, q.z, L.waterClearance)) return reject('water');
          if (roadNear && roads?.onRoad(q.x, q.z, L.roadMargin)) return reject('road');
        }
      }
    }
    // Kapı önü merdiveni (kat zemini kapı önündeki araziden yüksekse): uzunluğu tahminidir (uç zemini daha alçak
    // olabilir; `SettlementMap` gerçek merdiveni kurar), payla ayrılır.
    let stair: OrientedBox | null = null;
    if (padLevel === null && (shape.enterable || shape.searchable)) {
      const door = local(shape.door.x, hd);
      const rise = floor - terrain.heightAt(door.x, door.z);
      if (rise >= STAIR_MIN_RISE) {
        const run = Math.max(1, rise / STAIR_SLOPE) * L.stairRunPad + 0.5;
        const c = local(shape.door.x, hd + run / 2);
        stair = { x: c.x, z: c.z, hx: stairWidth(kind) / 2 + 0.3, hz: run / 2, yaw };
        if (occupied.overlaps(stair, ignore)) return reject('stair');
        const end = local(shape.door.x, hd + run);
        if (terrain.isWater(end.x, end.z, L.waterClearance)) return reject('water');
      }
    }
    return { body, stair, x: p.x, z: p.z, y: floor, base, pad: padLevel };
  };

  const denseThreshold = village ? L.denseThreshold : bySize(CITY_SIZE.denseThreshold, urban);
  const maxBuildings = Math.min(
    Math.round(L.maxBuildings[rank] * sized(CITY_SIZE.maxBuildingsScale)),
    MAX_PER_SETTLEMENT,
  );
  const add = (
    kind: BuildingKind,
    u: number,
    v: number,
    yaw: number,
    name: string | null,
    ignore: number | null = null,
  ): Building | null => {
    if (placed.length >= maxBuildings) return reject('cap');
    if (isMosque(kind) && mosqueCrowded(u, v)) return reject('mosque_spacing');
    const s = site(kind, u, v, yaw, ignore);
    if (!s) return null;
    const ruinRoll = random.next();
    const tone = random.next();
    const floorsRoll = random.next();
    const ruined = RUINABLE.has(kind) && ruinRoll < L.ruinChance[rank] * sized(CITY_SIZE.ruinScale);
    const n = densityAt(s.x, s.z);
    // Kat sayısı kentin büyüklüğüne, merkeze yakınlığa ve yoğunluğa göre (`citySize.ts`).
    const floors =
      kind === 'apartment'
        ? apartmentFloors(
            rank,
            urban,
            floorsRoll,
            1 - Math.hypot(u, v) / radius,
            n / (2 * denseThreshold),
          )
        : kind === 'konak'
          ? konakFloors(urban, settlement.style === 'osmanli', floorsRoll)
          : 1;
    // Cephe boyası ayrı tohumdan: düzenin zar sırasını değiştirmez.
    let paint = 0;
    if (kind === 'apartment') {
      const pr = createRandom(seedFrom(seed, settlement.id, placed.length, 0x9a17));
      paint = paintIndex(urban, pr.next(), pr.next());
    }
    placedUV.push({ u, v });
    if (s.pad !== null) {
      const shape = BUILDING_SHAPES[kind];
      // Girilebilir yapıda teras arazi kafesinin bir hücresi kadar geniştir: odanın içindeki zemin (aradeğerleme) şevden
      // etkilenmesin.
      const margin = shape.enterable ? L.interiorPadMargin : L.padMargin;
      terrain.level?.(
        { x: s.x, z: s.z, hx: shape.width / 2 + margin, hz: shape.depth / 2 + margin, yaw },
        s.pad,
      );
    }
    if (s.pad === null && BUILDING_SHAPES[kind].enterable) {
      // İç mekân: sonraki teraslar bu yapının ayak izindeki zemini yükseltmesin.
      const shape = BUILDING_SHAPES[kind];
      const m = L.interiorPadMargin - L.padMargin;
      terrain.lock?.({ x: s.x, z: s.z, hx: shape.width / 2 + m, hz: shape.depth / 2 + m, yaw });
    }
    const id = settlement.id * 1024 + placed.length;
    occupied.add(id, s.body);
    if (s.stair) occupied.add(id, s.stair);
    const building: Building = {
      id,
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
      paint,
      name,
      stairRun: s.stair ? s.stair.hz * 2 : 0,
    };
    placed.push(building);
    if (isMosque(kind)) mosqueSites.push({ x: s.x, z: s.z });
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

  /**
   * Parselde denenecek konumlar: parselin kendisi, yol parselin yakınından geçiyorsa yoldan uzağa kaydırılmış iki
   * konum (köy evleri yolun kenarına dizilir; yolun üstüne binmesin diye parsel yoldan çekilir).
   */
  const positionsFor = (lot: Lot): Array<{ u: number; v: number }> => {
    const out = [{ u: lot.u, v: lot.v }];
    const hit = roads?.nearest(lot.x, lot.z, pitch) ?? null;
    if (!roads || !hit) return out;
    // Yola dik yön (dünya): yol yönü (cos a, sin a) → dik (−sin a, cos a); yoldan uzaklaşan işaret seçilir.
    let px = -Math.sin(hit.angle);
    let pz = Math.cos(hit.angle);
    const probe = roads.nearest(lot.x + px * 0.5, lot.z + pz * 0.5, pitch);
    if (probe && probe.distance < hit.distance) {
      px = -px;
      pz = -pz;
    }
    for (const amount of L.roadNudge) {
      const dx = px * amount * pitch;
      const dz = pz * amount * pitch;
      // Dünya kaydırması → çerçeve (worldToFrame'in doğrusal kısmı).
      out.push({ u: lot.u + dx * cos - dz * sin, v: lot.v + dx * sin + dz * cos });
    }
    return out;
  };

  const tryLot = (kind: BuildingKind, lot: Lot, name: string | null): Building | null => {
    const yaws = yawsFor(kind, lot);
    for (const pos of positionsFor(lot)) {
      for (const yaw of yaws) {
        const b = add(kind, pos.u, pos.v, yaw, name);
        if (b) {
          usedLots.add(lot);
          return b;
        }
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
    /** En yakın kaç parsel denenir (son çare aramasında hepsi). */
    tries = 60,
  ): Building | null => {
    const candidates = lots
      .filter((lot) => !usedLots.has(lot))
      .map((lot) => ({ lot, d: Math.hypot(lot.u - tu, lot.v - tv) }))
      .filter((c) => c.d <= maxDistance)
      .sort((a, b) => a.d - b.d);
    for (const { lot } of candidates.slice(0, tries)) {
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

  /**
   * Cami avlusunun şadırvanı: kapının önünde (merdivenin ötesinde) eksen üstünde; sığmazsa kapının sağına/soluna.
   * Avlu caminin aralık payına girer: caminin kendi ayak iziyle çakışma sayılmaz (merdivenden uzak tutulur).
   */
  const addSadirvan = (mosque: Building): void => {
    const shape = BUILDING_SHAPES[mosque.kind];
    const r = BUILDING_SHAPES.sadirvan.width / 2 + BUILDING_OVERHANG.sadirvan.x;
    // Caminin ön kenarı (revak/sundurma taşması dahil) ve merdivenin ucu.
    const front = shape.depth / 2 + BUILDING_OVERHANG[mosque.kind].z;
    const stairEnd = shape.depth / 2 + mosque.stairRun;
    const side = stairWidth(mosque.kind) / 2 + 0.6 + r;
    const spots: Array<[number, number]> = [
      [shape.door.x, Math.max(front, stairEnd) + 0.9 + r],
      [shape.door.x - side, front + r + 0.6],
      [shape.door.x + side, front + r + 0.6],
      [shape.door.x, Math.max(front, stairEnd) + 2.4 + r],
    ];
    const yc = Math.cos(mosque.yaw);
    const ys = Math.sin(mosque.yaw);
    for (const [lx, lz] of spots) {
      const t = worldToFrame(mosque.x + lx * yc + lz * ys, mosque.z - lx * ys + lz * yc);
      if (add('sadirvan', t.u, t.v, mosque.yaw, null, mosque.id)) return;
    }
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
      if (isMosque(lm.kind)) addSadirvan(b);
    }
  }

  // 2. Türetilen kamu/dinî yapılar.
  // Gerçek cami sayısının küçük bir kesri (oyun ölçeğinde her yapı yüzlerce gerçek binayı temsil eder; camiler
  // birbirinden `mosqueSpacing` uzakta kalır).
  const M = L.mosques;
  const mosqueTarget =
    rank === 'il'
      ? clamp(Math.round(settlement.mosques / M.perIl), 1, M.maxIl)
      : rank === 'ilce'
        ? clamp(Math.round(settlement.mosques / M.perIlce), 1, M.maxIlce)
        : random.next() < M.villageChance
          ? 1
          : 0;
  let mosques = placed.filter((b) => isMosque(b.kind)).length;
  if (rank === 'il' && mosques === 0) {
    const b = placeNear('mosque_grand', 0, 0, null) ?? placeNear('mosque', 0, 0, null, radius);
    if (b) {
      mosques++;
      addSadirvan(b);
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
    addSadirvan(b);
  }
  // Her yerleşimde (köyler hariç olabilir) en az bir cami: dik/dar kasabada küçük ahşap camiye düşülür; il/ilçe
  // merkezi komşu merkezin çekirdeğine sıkışmışsa (Kozlu–Zonguldak) son çare olarak oraya da konabilir.
  if (mosques === 0 && (!village || mosqueTarget > 0)) {
    const tryMosque = () =>
      placeNear(village ? 'mosque_wooden' : 'mosque', 0, 0, null, radius, Infinity) ??
      (village ? null : placeNear('mosque_wooden', 0, 0, null, radius, Infinity));
    let b = tryMosque();
    if (!b && !village && nearCores.length > 0) {
      allowForeignCore = true;
      b = tryMosque();
      allowForeignCore = false;
    }
    if (b) addSadirvan(b);
  }
  if (!village) {
    placeNear('government', 0, 0, null);
    if (!curated.has('clock_tower') && rank === 'il') placeNear('clock_tower', 0, 0, null);
    placeNear('fountain', 0, 0, null); // meydan çeşmesi
  }
  const coffee = village
    ? random.next() < 0.6
      ? 1
      : 0
    : Math.round(bySize(CITY_SIZE.kahvehane, urban));
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
  const coreRadius = radius * (village ? 0.3 : bySize(CITY_SIZE.coreRadius, urban));
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
      const mixRoll = random.next();
      let kind: BuildingKind;
      const dense = lot.n >= denseThreshold;
      if (lot.r < coreRadius && shopRoll < bySize(CITY_SIZE.shopShare, urban)) kind = 'shop_row';
      else if (!dense && mixRoll < bySize(CITY_SIZE.sparseApartment, urban)) kind = 'apartment';
      else kind = pickWeighted(dense ? style.dense : style.sparse, roll);
      // Küçük kasabada yoğun doku da alçak kalır: apartmanın bir kısmı ev/konak olur.
      if (kind === 'apartment' && dense && mixRoll < bySize(CITY_SIZE.smallTownHouse, urban)) {
        kind = settlement.style === 'osmanli' ? 'konak' : 'house';
      }
      if (tryLot(kind, lot, null) || kind === 'house') continue;
      // Büyük kentte sığmayan apartmanın yerine ev kurulmayabilir (parsel boş kalır).
      if (kind === 'apartment' && mixRoll < bySize(CITY_SIZE.skipHouseFallback, urban)) continue;
      tryLot('house', lot, null);
    }
  }

  // 4. Sokaklar (il/ilçe): yapı bulunan her mahalle bloğunun dört kenarı sokak olur; komşu bloklar kenar paylaşır, böylece
  // sokaklar bağlı bir ağ kurar ve yapısız yerde sokak çizilmez. Hangi adayların kalacağını ve ana caddeyi `townNetwork.ts` seçer.
  const streets: Street[] = [];
  if (!village) {
    const okAt = (u: number, v: number, half: number): boolean => {
      if (Math.hypot(u, v) > radius) return false;
      const p = toWorld(u, v);
      return (
        densityAt(p.x, p.z) > 0 &&
        terrain.elevationAt(p.x, p.z) >= L.minElevationM &&
        // Sokak yapının (merdiveni dahil) ya da akarsuyun üstünden geçmez: orada kesilir.
        !occupied.contains(p.x, p.z, half + 0.3) &&
        !inForeignCore(p.x, p.z) &&
        !terrain.isWater(p.x, p.z, half + L.waterClearance)
      );
    };
    const step = pitch / 8;
    // Blok (a, b): parsel sıraları [blockMod·a, blockMod·a + blockLots − 1]; çevresindeki sokak sıraları blockMod·a − 1 ve
    // blockMod·a + blockLots. Sokak hattı s (sıra blockMod·s + blockLots) a. ve (a+1). blokların arasındadır.
    const built = new Set<number>();
    const blockKey = (a: number, b: number) => (a + 4096) * 8192 + (b + 4096);
    for (const p of placedUV) {
      built.add(
        blockKey(
          Math.floor(Math.round(p.u / pitch) / blockMod),
          Math.floor(Math.round(p.v / pitch) / blockMod),
        ),
      );
    }
    // Hat ('u' sabit = dikey hat 'V', 'v' sabit = 'H') → kullanılan blok dilimleri.
    const slices = new Map<string, Set<number>>();
    const use = (orientation: 'V' | 'H', line: number, slice: number) => {
      const key = `${orientation}${line}`;
      const set = slices.get(key) ?? new Set<number>();
      set.add(slice);
      slices.set(key, set);
    };
    for (const key of built) {
      const a = Math.floor(key / 8192) - 4096;
      const b = (key % 8192) - 4096;
      use('V', a - 1, b);
      use('V', a, b);
      use('H', b - 1, a);
      use('H', b, a);
    }
    const lineCoord = (line: number) => (blockMod * line + L.blockLots) * pitch;
    for (const [key, set] of slices) {
      const along: 'u' | 'v' = key[0] === 'V' ? 'v' : 'u';
      const line = Number(key.slice(1));
      const fixed = lineCoord(line);
      const cls: RoadClass = 3;
      const half = (ROADS.width[cls] as number) / 2;
      const sorted = [...set].sort((x, y) => x - y);
      // Ardışık dilimler tek hatta birleşir.
      let from = sorted[0] as number;
      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i] as number;
        if (i + 1 < sorted.length && sorted[i + 1] === cur + 1) continue;
        const t0 = (blockMod * from - 1) * pitch;
        const t1 = (blockMod * cur + L.blockLots) * pitch;
        from = sorted[i + 1] as number;
        let run: number[] = [];
        const flush = () => {
          if (run.length >= 4) {
            const n = run.length;
            streets.push({
              cls,
              xz: Float32Array.of(
                run[0] as number,
                run[1] as number,
                run[n - 2] as number,
                run[n - 1] as number,
              ),
            });
          }
          run = [];
        };
        for (let t = t0; t <= t1 + 1e-6; t += step) {
          const u = along === 'u' ? t : fixed;
          const v = along === 'u' ? fixed : t;
          if (!okAt(u, v, half)) {
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

/**
 * Girilebilir yapının ayak izindeki en yüksek zemin: kenarlar ve iç, arazi kafesinden (2 m) sık örneklenir (kat
 * döşemesi bunun üstündedir; arazi odanın içine taşmasın).
 */
function interiorTop(
  hw: number,
  hd: number,
  corner: (lx: number, lz: number) => { h: number },
): number {
  const nx = Math.max(2, Math.ceil((2 * hw) / INTERIOR_SAMPLE));
  const nz = Math.max(2, Math.ceil((2 * hd) / INTERIOR_SAMPLE));
  let top = -Infinity;
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      top = Math.max(top, corner(-hw + (2 * hw * i) / nx, -hd + (2 * hd * j) / nz).h);
    }
  }
  return top;
}

/** İç zemin örnek aralığı (oyun m; arazi kafesinden sık). */
const INTERIOR_SAMPLE = 1.5;

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
