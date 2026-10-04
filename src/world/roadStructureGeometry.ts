import { ROADS, ROAD_STRUCTURES, TERRAIN_OVERLAY, WATER } from '../config';
import type { RoadClass } from '../data/settlements';
import {
  SPAN_KIND,
  type PlannedRoad,
  type RoadPlan,
  type RoadSpan,
} from '../settlements/roadProfile';
import { PORTAL_APRON } from './roadTunnels';

/**
 * Yol yapılarının (köprü, viyadük, tünel) geometrisi (saf mantık, Three.js'siz): her yapı yönlü kutulardan kurulur.
 * Aynı kutular hem çizilir (`RoadStructureLayer`) hem çarpıştırılır (`RoadStructureColliders`); böylece görünen ile
 * basılan aynıdır. Kutu yönü: ileri (yol boyunca, eğimli), yan (yola dik, yatay) ve yukarı eksenlerinden oluşur.
 */

export interface StructureBox {
  /** Merkez (dünya). */
  x: number;
  y: number;
  z: number;
  /** Yarı boyutlar: ileri, yan, yukarı. */
  hl: number;
  hw: number;
  hh: number;
  /** İleri yön (birim, eğimli) ve yan yön (birim, yatay); yukarı = ileri × yan düzeltmesi. */
  fx: number;
  fy: number;
  fz: number;
  rx: number;
  rz: number;
  color: number;
  /** Çarpışır mı (ayaklar ve süs kutuları değil)? */
  solid: boolean;
  /** Işıklı (tünel lambası): ışıktan bağımsız parlak çizilir. */
  emissive?: boolean;
  /** Köprü ucundaki istinat (ayak) bloğu: araziye gömülü tasarlanır (gömülü güverte denetimine girmez). */
  footing?: boolean;
}

/** Bir yapının kutuları ve sınırları. */
export interface StructureShape {
  span: RoadSpan;
  boxes: StructureBox[];
  /** Orta nokta ve yarıçap (yatay): uzamsal indeks ve eleme. */
  cx: number;
  cz: number;
  radius: number;
}

/** İleri yönden (fx, fy, fz) yan yön (yatay, sağ) ve yukarı yön: u = f × r düzeltmesi değil; r = yukarı × f. */
function frame(
  fx: number,
  fy: number,
  fz: number,
): { rx: number; rz: number; ux: number; uy: number; uz: number } {
  // r = normalize(up × f) = (fz, 0, -fx) / |…|
  const rl = Math.hypot(fz, fx) || 1;
  const rx = fz / rl;
  const rz = -fx / rl;
  // u = f × r
  const ux = fy * rz;
  const uy = fz * rx - fx * rz;
  const uz = -fy * rx;
  return { rx, rz, ux, uy, uz };
}

/** Noktadaki (komşu noktalar arası) birim yatay yol yönü. */
function levelAxis(road: PlannedRoad, i: number): { fx: number; fz: number } {
  const n = road.xz.length / 2;
  const a = Math.max(0, i - 1);
  const b = Math.min(n - 1, i + 1);
  const dx = (road.xz[b * 2] as number) - (road.xz[a * 2] as number);
  const dz = (road.xz[b * 2 + 1] as number) - (road.xz[a * 2 + 1] as number);
  const h = Math.hypot(dx, dz) || 1;
  return { fx: dx / h, fz: dz / h };
}

/** Yol noktası dizinindeki (a → b) parça ekseni: birim ileri yön ve uzunluk. */
function segmentAxis(road: PlannedRoad, a: number, b: number) {
  const dx = (road.xz[b * 2] as number) - (road.xz[a * 2] as number);
  const dz = (road.xz[b * 2 + 1] as number) - (road.xz[a * 2 + 1] as number);
  const dy = (road.bed[b] as number) - (road.bed[a] as number);
  const len = Math.hypot(dx, dy, dz) || 1;
  return { fx: dx / len, fy: dy / len, fz: dz / len, len };
}

/**
 * Yolun a → b parçasına başka bir yapının (köprü/tünel; aynı yolun öbür yapıları dahil) yol noktası, iki genişliğin
 * toplamı kadar yakın mı? Yaklaşım plakası kavşakta komşu köprünün güvertesine binmesin diye.
 */
function nearOtherSpan(
  plan: RoadPlan,
  span: RoadSpan,
  road: PlannedRoad,
  a: number,
  b: number,
  half: number,
): boolean {
  const ax = road.xz[a * 2] as number;
  const az = road.xz[a * 2 + 1] as number;
  const dx = (road.xz[b * 2] as number) - ax;
  const dz = (road.xz[b * 2 + 1] as number) - az;
  const len2 = dx * dx + dz * dz || 1;
  const S = ROAD_STRUCTURES;
  for (const other of plan.spans) {
    if (other.road === span.road && other.i0 === span.i0 && other.i1 === span.i1) continue;
    const r = plan.roads[other.road] as PlannedRoad;
    const reach =
      half + (ROADS.width[r.cls] as number) / 2 + (S.widthPad[r.cls] as number) + S.tunnelSidePad;
    for (let i = other.i0; i <= other.i1; i++) {
      const px = (r.xz[i * 2] as number) - ax;
      const pz = (r.xz[i * 2 + 1] as number) - az;
      if (Math.abs(px) > 40 || Math.abs(pz) > 40) continue;
      const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / len2));
      if (Math.hypot(px - t * dx, pz - t * dz) < reach) return true;
    }
  }
  return false;
}

/** Yol tipinin yüzey rengi (arazi kaplamasındaki yolla aynı ton; `TERRAIN_OVERLAY`). */
export function roadSurfaceColor(cls: RoadClass): number {
  const O = TERRAIN_OVERLAY;
  return cls === 0 ? O.asphalt : cls === 1 ? O.villageAsphalt : cls === 2 ? O.dirt : O.cobble;
}

/**
 * Yapının kutuları (türe göre):
 *
 * - **beam** (beton kirişli köprü): beton güverte ve altında kiriş, alçak beton bordür + çelik korkuluk, köşeli ayaklar,
 *   uçlarda istinat (ayak) blokları.
 * - **viaduct**: beton güverte, yüksek beton korkuluk (parapet), yüksek çift ayaklar ve başlıkları.
 * - **arch** (taş kemer): taş güverte; yanlar kemer eğrisine kadar inen taş duvar (kemerin altı boştur), taş korkuluk.
 * - **wooden** (ahşap patika köprüsü): kalas güverte, dikmeli ahşap trabzan, kütük ayaklar.
 * - **suspension** (asma köprü, uzun deniz geçişi: Osman Gazi Köprüsü): beton kirişli köprü gibi güverte ve korkuluk;
 *   deniz kesiminde iki kule (deniz tabanından kesonlu çift bacak ve üç kiriş), kenar açıklıklarda ankraja inen ve ana
 *   açıklıkta sarkan iki ana kablo, güverteye inen askılar; asılı kesimin dışında (yaklaşım viyadüğü) ayaklar.
 * - **tunnel**: beton zemin, kalın yan duvarlar ve tavan (iç yüzü koyu), tavan lambaları (ışıklı), iki ağızda taş/beton
 *   cephe (açıklığın iki yanı ve üstü).
 *
 * Güverte her zaman yatağın (bed) üstündedir ve iki ayak arasında düzdür (profil öyle tasarlar). Güvertenin ve tünel
 * zemininin üstünde yolun kendi yüzeyi vardır (`roadSurfaceColor`; anayolda kenar çizgileri ve kesik orta şerit, kent
 * sokağında kaldırım): köprü/tünel yolun devamı gibi görünür; ayaklar ve tünel duvarları gri/koyu kalır.
 */
export function structureShape(plan: RoadPlan, span: RoadSpan): StructureShape {
  const road = plan.roads[span.road] as PlannedRoad;
  const half = (ROADS.width[road.cls] as number) / 2;
  const S = ROAD_STRUCTURES;
  const C = S.colors;
  const boxes: StructureBox[] = [];
  const mid = (a: number, b: number, k: 'xz0' | 'xz1' | 'bed') =>
    k === 'bed'
      ? ((road.bed[a] as number) + (road.bed[b] as number)) / 2
      : k === 'xz0'
        ? ((road.xz[a * 2] as number) + (road.xz[b * 2] as number)) / 2
        : ((road.xz[a * 2 + 1] as number) + (road.xz[b * 2 + 1] as number)) / 2;

  /** Parça (a → b) boyunca, eksenden `lateral` yanda, üst yüzü yatak + `top` olan eğimli kutu. */
  const push = (
    a: number,
    b: number,
    lateral: number,
    top: number,
    hw: number,
    hh: number,
    color: number,
    solid: boolean,
    stretch = 0.06,
    emissive = false,
  ) => {
    const ax = segmentAxis(road, a, b);
    const f = frame(ax.fx, ax.fy, ax.fz);
    const cx = mid(a, b, 'xz0') + f.rx * lateral;
    const cz = mid(a, b, 'xz1') + f.rz * lateral;
    // `top`: kutunun üst yüzünün eksene göre yüksekliği (yatak + top); merkez hh kadar aşağıda.
    const cy = mid(a, b, 'bed') + top - hh * f.uy;
    boxes.push({
      x: cx - hh * f.ux,
      y: cy,
      z: cz - hh * f.uz,
      hl: ax.len / 2 + stretch,
      hw,
      hh,
      fx: ax.fx,
      fy: ax.fy,
      fz: ax.fz,
      rx: f.rx,
      rz: f.rz,
      color,
      solid,
      ...(emissive ? { emissive: true } : {}),
    });
  };
  /** Yatay (eğimsiz) kutu: merkez (x, alt, z), yön noktası i'deki yol doğrultusu. */
  const level = (
    i: number,
    lateral: number,
    along: number,
    bottom: number,
    topY: number,
    hl: number,
    hw: number,
    color: number,
    solid: boolean,
  ) => {
    const ax = levelAxis(road, i);
    const rx = ax.fz;
    const rz = -ax.fx;
    const hh = Math.max(0.05, (topY - bottom) / 2);
    boxes.push({
      x: (road.xz[i * 2] as number) + rx * lateral + ax.fx * along,
      y: bottom + hh,
      z: (road.xz[i * 2 + 1] as number) + rz * lateral + ax.fz * along,
      hl,
      hw,
      hh,
      fx: ax.fx,
      fy: 0,
      fz: ax.fz,
      rx,
      rz,
      color,
      solid,
    });
  };

  /** Parçanın (a → b) [t0, t1] kesiminde, üst yüzü yatak + `top` olan süs kutusu (çarpışmaz). */
  const pushPart = (
    a: number,
    b: number,
    t0: number,
    t1: number,
    lateral: number,
    top: number,
    hw: number,
    hh: number,
    color: number,
  ) => {
    const ax = segmentAxis(road, a, b);
    const f = frame(ax.fx, ax.fy, ax.fz);
    const t = (t0 + t1) / 2;
    const lerp = (u: number, v: number) => u + (v - u) * t;
    const cx = lerp(road.xz[a * 2] as number, road.xz[b * 2] as number) + f.rx * lateral;
    const cz = lerp(road.xz[a * 2 + 1] as number, road.xz[b * 2 + 1] as number) + f.rz * lateral;
    const cy = lerp(road.bed[a] as number, road.bed[b] as number) + top - hh * f.uy;
    boxes.push({
      x: cx - hh * f.ux,
      y: cy,
      z: cz - hh * f.uz,
      hl: ((t1 - t0) * ax.len) / 2,
      hw,
      hh,
      fx: ax.fx,
      fy: ax.fy,
      fz: ax.fz,
      rx: f.rx,
      rz: f.rz,
      color,
      solid: false,
    });
  };
  /**
   * Yol yüzeyi (a → b parçası, yarı genişlik `surfaceHalf`): yol tipinin renginde ince kaplama, anayolda kenar
   * çizgileri ve `dashPeriod` dönemli kesik orta şerit (evre yolun başından ölçülür), kent sokağında kaldırım.
   */
  const surface = (a: number, b: number, surfaceHalf: number) => {
    const T = S.surfaceThickness;
    const O = TERRAIN_OVERLAY;
    pushPart(a, b, -0.01, 1.01, 0, T, surfaceHalf, T / 2, roadSurfaceColor(road.cls));
    const lift = S.markingLift;
    const top = T + lift;
    if (road.cls === 0) {
      const w = S.edgeLineWidth / 2;
      for (const side of [-1, 1]) {
        const lateral = side * (surfaceHalf - O.edgeLineInset - w);
        pushPart(a, b, 0, 1, lateral, top, w, lift / 2, O.edgeLine);
      }
      // Kesik orta şerit: dönemin orta yarısı çizgi (arazi kaplamasındaki `dashWave` < 0,5 ile aynı evre: köprü/tünel
      // yüzeyindeki çizgiler zemindeki yolda kesintisiz sürer).
      const len = segmentAxis(road, a, b).len;
      const s0 = a * road.step;
      const period = O.dashPeriod;
      for (let k = Math.floor(s0 / period) - 1; k * period + period / 4 < s0 + len; k++) {
        const d0 = Math.max(k * period + period / 4, s0);
        const d1 = Math.min(k * period + (period * 3) / 4, s0 + len);
        if (d1 - d0 < 0.05) continue;
        pushPart(
          a,
          b,
          (d0 - s0) / len,
          (d1 - s0) / len,
          0,
          top,
          O.centerLineHalf,
          lift / 2,
          O.centerLine,
        );
      }
    } else if (road.cls === 3) {
      const sw = Math.min(O.sidewalkWidth, surfaceHalf / 3) / 2;
      for (const side of [-1, 1]) {
        pushPart(a, b, 0, 1, side * (surfaceHalf - sw), T + 0.08, sw, 0.04, O.sidewalk);
      }
    }
  };

  /** İki dünya noktası arasında ince kutu (kablo; dikey olmayan). */
  const link = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    half: number,
    color: number,
  ) => {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1;
    const fx = dx / len;
    const fy = dy / len;
    const fz = dz / len;
    const f = frame(fx, fy, fz);
    boxes.push({
      x: (ax + bx) / 2,
      y: (ay + by) / 2,
      z: (az + bz) / 2,
      hl: len / 2 + half,
      hw: half,
      hh: half,
      fx,
      fy,
      fz,
      rx: f.rx,
      rz: f.rz,
      color,
      solid: false,
    });
  };

  /**
   * Asma köprünün kuleleri, kesonları, ana kabloları, askıları ve ankraj blokları (`structureShape` belgesi). Kuleler
   * köprü altındaki en uzun deniz kesiminin uçlarından `towerInset` oranında içeridedir; kenar açıklık ana açıklığın
   * `sideSpanShare` katıdır (köprü ucunu aşmaz). Dönüş: asılı kesimin (ankrajdan ankraja) yol noktaları.
   */
  const suspensionParts = (a0: number, a1: number, deckHalf: number): [number, number] => {
    let sa = -1;
    let sb = -1;
    let run = -1;
    for (let i = a0; i <= a1; i++) {
      if ((road.natural[i] as number) < 0) {
        if (run < 0) run = i;
        if (sa < 0 || i - run > sb - sa) {
          sa = run;
          sb = i;
        }
      } else run = -1;
    }
    if (sa < 0) {
      sa = a0;
      sb = a1;
    }
    const inset = Math.round((sb - sa) * S.towerInset);
    const t1 = Math.max(a0 + 1, sa + inset);
    const t2 = Math.min(a1 - 1, sb - inset);
    const side = Math.round((t2 - t1) * S.sideSpanShare);
    const anchorA = Math.max(a0, t1 - side);
    const anchorB = Math.min(a1, t2 + side);
    const lateral = deckHalf + 0.35 + S.towerLeg / 2;
    const leg = S.towerLeg / 2;
    const deck = (i: number) => road.bed[i] as number;
    const top = (i: number) => deck(i) + S.towerHeight;
    // Kablo yüksekliği: kenar açıklıkta ankrajdan kule tepesine doğru, ana açıklıkta parabol.
    const cableY = (i: number): number => {
      if (i <= t1) {
        const t = anchorA === t1 ? 1 : (i - anchorA) / (t1 - anchorA);
        return deck(i) + 0.9 + (S.towerHeight - 0.9) * t;
      }
      if (i >= t2) {
        const t = anchorB === t2 ? 1 : (anchorB - i) / (anchorB - t2);
        return deck(i) + 0.9 + (S.towerHeight - 0.9) * t;
      }
      const u = (2 * (i - t1)) / (t2 - t1) - 1;
      return deck(i) + S.cableSag + (S.towerHeight - S.cableSag) * u * u;
    };
    for (const t of [t1, t2]) {
      const ground = Math.min(road.natural[t] as number, 0);
      for (const sd of [-1, 1]) {
        level(t, sd * lateral, 0, ground - 0.8, top(t) + 0.4, leg, leg, C.tower, false);
      }
      // Kesson (deniz tabanından su üstüne), güverte altı, orta ve tepe kirişleri.
      level(t, 0, 0, ground - 1, WATER.level + 0.5, leg * 2.4, lateral + leg * 2, C.tower, false);
      level(t, 0, 0, deck(t) - 1.3, deck(t) - 0.75, leg, lateral, C.tower, false);
      level(
        t,
        0,
        0,
        deck(t) + S.towerHeight * 0.55,
        deck(t) + S.towerHeight * 0.55 + 0.5,
        leg,
        lateral,
        C.tower,
        false,
      );
      level(t, 0, 0, top(t) - 0.4, top(t) + 0.4, leg * 1.2, lateral + leg, C.tower, false);
    }
    for (const sd of [-1, 1]) {
      const cl = sd * (deckHalf + 0.35 + leg);
      const at = (i: number) => {
        const ax = levelAxis(road, i);
        return {
          x: (road.xz[i * 2] as number) + ax.fz * cl,
          z: (road.xz[i * 2 + 1] as number) - ax.fx * cl,
        };
      };
      for (let i = anchorA; i < anchorB; i++) {
        const p = at(i);
        const q = at(i + 1);
        link(p.x, cableY(i), p.z, q.x, cableY(i + 1), q.z, S.cableHalf, C.cable);
      }
      // Askılar: kablodan güverte korkuluğuna (kulelerde değil).
      for (let i = anchorA + 1; i < anchorB; i++) {
        if (i === t1 || i === t2) continue;
        const bottom = deck(i) + 1.05;
        const y = cableY(i);
        if (y - bottom < 0.2) continue;
        level(i, cl, 0, bottom, y, S.hangerHalf, S.hangerHalf, C.cable, false);
      }
      // Ankraj blokları (kablonun güverteye indiği uçlar).
      for (const i of [anchorA, anchorB]) {
        level(i, cl, 0, deck(i) - 1, deck(i) + 1.25, 0.7, 0.45, C.tower, false);
      }
    }
    return [anchorA, anchorB];
  };

  const i0 = span.i0;
  const i1 = span.i1;
  if (span.kind === SPAN_KIND.tunnel) {
    const inner = half + S.tunnelSidePad;
    const H = S.tunnelHeight;
    const W = S.tunnelWall;
    for (let i = i0; i < i1; i++) {
      push(i, i + 1, 0, 0, inner + W, 0.35, C.tunnelFloor, true);
      for (const side of [-1, 1]) {
        push(i, i + 1, side * (inner + W / 2), H, W / 2, (H + 0.7) / 2, C.tunnel, true);
      }
      push(i, i + 1, 0, H + W, inner + W, W / 2, C.tunnel, true);
      surface(i, i + 1, half);
    }
    // Ağız önü zemini (beton): yolun ağızdan önceki parçası boyunca, yol eğimiyle (delinen kenar hücresini örter).
    const last = road.xz.length / 2 - 1;
    if (i0 > 0) {
      push(i0 - 1, i0, 0, 0, inner, 0.35, C.tunnelFloor, true);
      surface(i0 - 1, i0, half);
    }
    if (i1 < last) {
      push(i1, i1 + 1, 0, 0, inner, 0.35, C.tunnelFloor, true);
      surface(i1, i1 + 1, half);
    }
    // Lambalar: tavanın ortasında, ışıklı (ayrı malzeme).
    const every = Math.max(1, Math.round(S.lampSpacing / road.step));
    for (let i = i0 + Math.max(1, Math.floor(every / 2)); i < i1; i += every) {
      push(i, i + 1, 0, H, 0.18, 0.06, C.lamp, false, -road.step * 0.35, true);
    }
    // Ağız cepheleri: açıklığın iki yanı ve üstü (yolun doğal zeminine kadar iner). Cephe ağız düzleminin dışındadır ve
    // delinen kenar hücresini örtecek kalınlıktadır; önünde beton zemin.
    for (const [i, out] of [
      [i0, -1],
      [i1, 1],
    ] as const) {
      const bed = road.bed[i] as number;
      const wing = inner + W + S.portalWing;
      const crown = bed + H + W + S.portalCrown;
      const bottom = Math.min(bed, road.natural[i] as number) - 1;
      const sideHalf = (wing - inner) / 2;
      const along = out * (PORTAL_APRON / 2 + 0.2);
      const thick = PORTAL_APRON / 2;
      for (const side of [-1, 1]) {
        level(i, side * (inner + sideHalf), along, bottom, crown, thick, sideHalf, C.portal, true);
      }
      level(i, 0, along, bed + H, crown, thick, inner, C.portal, true);
      // Saçak: cephenin üstünde ince taşma.
      level(i, 0, along, crown, crown + 0.35, thick + 0.25, wing + 0.3, C.stoneDark, false);
    }
  } else {
    const type = span.type;
    const deckHalf = half + (S.widthPad[road.cls] as number);
    const stone = type === 'arch';
    const wooden = type === 'wooden';
    // Beton güverte yolun renginde (gri değil); taş kemer ve ahşap kendi malzemesinde, üstünde yol yüzeyi.
    const deckColor = stone ? C.stone : wooden ? C.wood : roadSurfaceColor(road.cls);
    const deckThick = wooden ? 0.25 : stone ? 0.9 : S.deckThickness;
    const surfaceHalf = wooden ? deckHalf * S.woodenTrailShare : half;
    // Yaklaşım plakası: ayaktan önceki yol parçası boyunca, güverteyle aynı üst yüz ve kalınlıkta, yolun renginde ve
    // çizgileriyle (tünel ağzı önündeki beton zemin gibi). Zemindeki boyalı yol ile güverte arasında basamak/kesinti
    // kalmaz: ayak dibindeki zemin köprü koridorunda alçalabilir, güvertenin ön yüzü ve ayak bloğu görünürdü.
    const last = road.xz.length / 2 - 1;
    const approachColor = roadSurfaceColor(road.cls);
    for (const [a, b] of [
      [i0 - 1, i0],
      [i1, i1 + 1],
    ] as const) {
      if (a < 0 || b > last) continue;
      if (road.kind[a] !== SPAN_KIND.ground || road.kind[b] !== SPAN_KIND.ground) continue;
      // Kavşakta başka bir yolun köprüsü/tüneli bu parçaya değiyorsa plaka konmaz (yapılar üst üste binmesin).
      if (nearOtherSpan(plan, span, road, a, b, half + S.approachPad)) continue;
      push(a, b, 0, 0, half + S.approachPad, S.deckThickness / 2, approachColor, true);
      surface(a, b, half);
    }
    for (let i = i0; i < i1; i++) {
      push(i, i + 1, 0, 0, deckHalf, deckThick / 2, deckColor, true);
      surface(i, i + 1, surfaceHalf);
      for (const side of [-1, 1]) {
        if (type === 'beam' || type === 'suspension') {
          // Bordür + çelik korkuluk.
          push(i, i + 1, side * (deckHalf - 0.18), 0.32, 0.18, 0.16, C.parapet, true);
          push(i, i + 1, side * (deckHalf - 0.12), 0.95, 0.06, 0.13, C.guardRail, true);
        } else if (type === 'viaduct') {
          push(
            i,
            i + 1,
            side * (deckHalf - S.parapetThickness / 2),
            S.parapetHeight,
            S.parapetThickness / 2,
            S.parapetHeight / 2,
            C.parapet,
            true,
          );
        } else if (stone) {
          push(i, i + 1, side * (deckHalf - 0.22), 0.75, 0.22, 0.375, C.stoneDark, true);
        } else {
          // Ahşap trabzan: üst kuşak (dikmeler aşağıda).
          push(i, i + 1, side * (deckHalf - 0.08), 1.0, 0.06, 0.06, C.woodLight, true);
        }
      }
    }
    const length = (i1 - i0) * road.step;
    // Asma köprü: deniz kesiminde iki kule ve kablolar; asılı kesim [anchorA, anchorB] ayaksızdır.
    let suspended: [number, number] | null = null;
    if (type === 'suspension') suspended = suspensionParts(i0, i1, deckHalf);
    if (type === 'beam' || type === 'suspension') {
      // Kiriş: güvertenin altında, ayak aralarında.
      for (let i = i0; i < i1; i++)
        push(i, i + 1, 0, -deckThick, deckHalf * 0.7, 0.3, C.pier, false);
      // Çelik korkuluk dikmeleri.
      for (let i = i0; i <= i1; i++) {
        for (const side of [-1, 1]) {
          const bed = road.bed[i] as number;
          level(
            i,
            side * (deckHalf - 0.12),
            0,
            bed + 0.3,
            bed + 1.05,
            0.07,
            0.07,
            C.guardRail,
            false,
          );
        }
      }
    }
    if (wooden) {
      for (let i = i0; i <= i1; i++) {
        for (const side of [-1, 1]) {
          const bed = road.bed[i] as number;
          level(
            i,
            side * (deckHalf - 0.08),
            0,
            bed - 0.1,
            bed + 1.06,
            0.08,
            0.08,
            C.woodLight,
            false,
          );
        }
      }
    }
    if (stone) {
      // Kemer: kenar duvarları, güvertenin altından kemer eğrisine kadar iner. Kemerin üzengisi açıklığın altındaki en
      // alçak zeminde (dere yatağı); kemer yüksekliği açıklığın yarısını ve güverte altını aşmaz.
      let spring = Number.POSITIVE_INFINITY;
      for (let i = i0; i <= i1; i++) spring = Math.min(spring, road.natural[i] as number);
      spring -= 0.3;
      const deckLow = Math.min(road.bed[i0] as number, road.bed[i1] as number) - deckThick - 0.35;
      const rise = Math.max(0.6, Math.min(length / 2, deckLow - spring));
      for (let i = i0; i < i1; i++) {
        const t = (i + 0.5 - i0) / (i1 - i0);
        const archY = spring + rise * Math.sin(Math.PI * t);
        const bedHere = ((road.bed[i] as number) + (road.bed[i + 1] as number)) / 2;
        const depth = Math.max(0.2, bedHere - deckThick - archY);
        for (const side of [-1, 1]) {
          push(
            i,
            i + 1,
            side * (deckHalf - 0.35),
            -deckThick,
            0.35,
            depth / 2,
            C.stone,
            false,
            0.02,
          );
        }
        // Kemer taşı (alt kuşak): kemer eğrisini belirginleştirir.
        push(i, i + 1, 0, -deckThick - depth, deckHalf, 0.18, C.stoneDark, false, 0.02);
      }
    }
    // Ayaklar ve istinat blokları.
    const pierColor = stone ? C.stone : wooden ? C.wood : C.pier;
    for (const [i, out] of [
      [i0, -1],
      [i1, 1],
    ] as const) {
      const bed = road.bed[i] as number;
      const ground = road.natural[i] as number;
      const bottom = Math.min(ground, bed) - 1.2;
      if (wooden) {
        for (const side of [-1, 1]) {
          level(i, side * (deckHalf - 0.2), 0, bottom, bed - 0.12, 0.16, 0.16, C.wood, false);
        }
      } else {
        level(i, 0, out * 0.6, bottom, bed - deckThick, 0.8, deckHalf + 0.3, pierColor, true);
        (boxes[boxes.length - 1] as StructureBox).footing = true;
      }
    }
    const every = Math.max(1, Math.round((wooden ? 6 : S.pierSpacing) / road.step));
    if (!stone) {
      for (let i = i0 + every; i < i1 - every / 2; i += every) {
        if (suspended && i >= suspended[0] - 1 && i <= suspended[1] + 1) continue;
        const ground = road.natural[i] as number;
        const bottomOfDeck = (road.bed[i] as number) - deckThick - (type === 'beam' ? 0.6 : 0);
        if (bottomOfDeck - ground < (wooden ? 0.4 : S.pierMinHeight)) continue;
        if (wooden) {
          for (const side of [-1, 1])
            level(
              i,
              side * (deckHalf - 0.2),
              0,
              ground - 0.5,
              bottomOfDeck,
              0.15,
              0.15,
              C.wood,
              false,
            );
        } else if (type === 'viaduct') {
          // Çift ayak + başlık.
          for (const side of [-1, 1]) {
            level(
              i,
              side * deckHalf * 0.45,
              0,
              ground - 0.6,
              bottomOfDeck - 0.6,
              S.pierSize / 2,
              S.pierSize / 2,
              C.pier,
              false,
            );
          }
          level(
            i,
            0,
            0,
            bottomOfDeck - 0.6,
            bottomOfDeck,
            S.pierSize * 0.7,
            deckHalf * 0.85,
            C.pier,
            false,
          );
        } else {
          level(i, 0, 0, ground - 0.6, bottomOfDeck, S.pierSize / 2, deckHalf * 0.7, C.pier, false);
        }
      }
    }
  }

  const cx = ((road.xz[i0 * 2] as number) + (road.xz[i1 * 2] as number)) / 2;
  const cz = ((road.xz[i0 * 2 + 1] as number) + (road.xz[i1 * 2 + 1] as number)) / 2;
  const radius =
    Math.hypot(
      (road.xz[i1 * 2] as number) - (road.xz[i0 * 2] as number),
      (road.xz[i1 * 2 + 1] as number) - (road.xz[i0 * 2 + 1] as number),
    ) /
      2 +
    8;
  return { span, boxes, cx, cz, radius };
}

/**
 * sRGB bileşeni → doğrusal (vertex rengi doğrusal uzaydadır; Three.js `Color.setHex` ile aynı dönüşüm). Önceden renkler
 * dönüştürülmeden yazılıyordu: köprüler ve tüneller yapılandırılan renkten belirgin açık (soluk gri) görünüyordu;
 * şimdi güverte yolu arazideki yolla aynı tondadır.
 */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Kutu köşeleri için birim küp köşe işaretleri ve yüzler (dışa bakan, saat yönü tersi). */
const FACES: ReadonlyArray<{ n: [number, number, number]; v: Array<[number, number, number]> }> = [
  {
    n: [1, 0, 0],
    v: [
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [1, -1, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    v: [
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
      [-1, -1, -1],
    ],
  },
  {
    n: [0, 1, 0],
    v: [
      [-1, 1, -1],
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
    ],
  },
  {
    n: [0, -1, 0],
    v: [
      [-1, -1, 1],
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
    ],
  },
  {
    n: [0, 0, 1],
    v: [
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    v: [
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ],
  },
];

/** Kutu yerel eksenleri: x = yan, y = yukarı, z = ileri. */
export function boxBasis(b: StructureBox): {
  r: [number, number, number];
  u: [number, number, number];
  f: [number, number, number];
} {
  const fr = frame(b.fx, b.fy, b.fz);
  return { r: [b.rx, 0, b.rz], u: [fr.ux, fr.uy, fr.uz], f: [b.fx, b.fy, b.fz] };
}

/** Kutu listesini (konum, normal, renk) dizilerine döker; üçgen başına köşe indeksi yok (6 köşe/yüz). */
export function buildBoxVertices(boxes: readonly StructureBox[]): {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
} {
  const count = boxes.length * 36;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  let o = 0;
  for (const b of boxes) {
    const { r, u, f } = boxBasis(b);
    const cr = srgbToLinear(((b.color >> 16) & 255) / 255);
    const cg = srgbToLinear(((b.color >> 8) & 255) / 255);
    const cb = srgbToLinear((b.color & 255) / 255);
    for (const face of FACES) {
      const nx = face.n[0] * r[0] + face.n[1] * u[0] + face.n[2] * f[0];
      const ny = face.n[0] * r[1] + face.n[1] * u[1] + face.n[2] * f[1];
      const nz = face.n[0] * r[2] + face.n[1] * u[2] + face.n[2] * f[2];
      const corner = (k: number) => {
        const c = face.v[k] as [number, number, number];
        const sx = c[0] * b.hw;
        const sy = c[1] * b.hh;
        const sz = c[2] * b.hl;
        return [
          b.x + sx * r[0] + sy * u[0] + sz * f[0],
          b.y + sx * r[1] + sy * u[1] + sz * f[1],
          b.z + sx * r[2] + sy * u[2] + sz * f[2],
        ] as const;
      };
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const p = corner(k);
        position[o * 3] = p[0];
        position[o * 3 + 1] = p[1];
        position[o * 3 + 2] = p[2];
        normal[o * 3] = nx;
        normal[o * 3 + 1] = ny;
        normal[o * 3 + 2] = nz;
        color[o * 3] = cr;
        color[o * 3 + 1] = cg;
        color[o * 3 + 2] = cb;
        o++;
      }
    }
  }
  return { position, normal, color };
}

/** Yapıların uzamsal dizini: şekiller (kutular) ilk sorguda tembel hesaplanır. */
export class StructureIndex {
  private readonly cell = 128;
  private readonly cells = new Map<number, number[]>();
  private readonly shapes = new Map<number, StructureShape>();
  private readonly centers: Array<{ x: number; z: number; r: number }> = [];

  constructor(private readonly plan: RoadPlan) {
    plan.spans.forEach((span, i) => {
      const road = plan.roads[span.road] as PlannedRoad;
      const ax = road.xz[span.i0 * 2] as number;
      const az = road.xz[span.i0 * 2 + 1] as number;
      const bx = road.xz[span.i1 * 2] as number;
      const bz = road.xz[span.i1 * 2 + 1] as number;
      const r = Math.hypot(bx - ax, bz - az) / 2 + 8;
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      this.centers.push({ x: cx, z: cz, r });
      const key = (kx: number, kz: number) => (kx + 32768) * 65536 + (kz + 32768);
      const k = key(Math.floor(cx / this.cell), Math.floor(cz / this.cell));
      const list = this.cells.get(k);
      if (list) list.push(i);
      else this.cells.set(k, [i]);
    });
  }

  get count(): number {
    return this.plan.spans.length;
  }

  /** Kimlik (plan.spans indeksi) → yapı şekli. */
  shape(id: number): StructureShape {
    let s = this.shapes.get(id);
    if (!s) {
      s = structureShape(this.plan, this.plan.spans[id] as RoadSpan);
      this.shapes.set(id, s);
    }
    return s;
  }

  /** Merkezi (x, z)'ye `radius` içinde olan yapıların kimlikleri. */
  near(x: number, z: number, radius: number): number[] {
    const out: number[] = [];
    const reach = radius + 160;
    const key = (kx: number, kz: number) => (kx + 32768) * 65536 + (kz + 32768);
    for (
      let kx = Math.floor((x - reach) / this.cell);
      kx <= Math.floor((x + reach) / this.cell);
      kx++
    ) {
      for (
        let kz = Math.floor((z - reach) / this.cell);
        kz <= Math.floor((z + reach) / this.cell);
        kz++
      ) {
        for (const id of this.cells.get(key(kx, kz)) ?? []) {
          const c = this.centers[id] as { x: number; z: number; r: number };
          if (Math.hypot(c.x - x, c.z - z) <= radius + c.r) out.push(id);
        }
      }
    }
    return out;
  }
}
