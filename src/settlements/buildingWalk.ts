import { BUILDING_LOOK } from '../config';
import { WALK_BAND, walkBoxBlocks, type WalkBox } from '../world/walkSolids';
import { isMosque, shapeVariant, type BuildingShape } from './kinds';
import type { Building } from './layout';
import { buildingLocalToWorld, worldToBuildingLocal, type Stair } from './SettlementMap';

/**
 * NPC'lerin (eşkıya, sokak çetesi, Son Kalan yarışmacısı) yerleşim yapılarında yürüyüşü (kullanıcı talimatı: "tüm
 * modlarda NPC'ler de binalara girebilsin"; saf mantık, Three.js/Rapier'siz). NPC'ler kinematiktir: bu sınıf
 *
 * - yapının katı kutularını (`BuildingShape.solids`: kapı boşluklu duvarlar, kaplar, üst kat döşemeleri) ve taş temeli
 *   gövdenin ayağından `WALK_BAND` yüksekliğindeki aralıkla keser (kapıdan girilir, duvardan geçilmez),
 * - yürüme yüzeyini verir (`surfaceAt`: arazi, kapı önü merdiveni, kat döşemeleri, katlar arası merdiven kolları;
 *   ayağın `STEP_UP` üstündeki yüzeye çıkılmaz),
 * - hedef başka bir yapının içindeyse ya da başka kattaysa ara hedefi (`route`: kapı önü/merdiven ayağı, kapı içi,
 *   merdiven kolunun alt/üst ucu) söyler.
 */

/** Gövdenin bir adımda çıkabildiği en büyük yükseklik (oyun m; basamak, eşik). */
export const STEP_UP = 0.65;

/**
 * Duvar sınamasında gövde yarıçapı en çok bu kadardır (oyun m): kapı boşlukları 1,3–1,4 m'dir, gövdenin 0,38 m'lik
 * yarıçapıyla kapı ekseninden ancak ±0,27 m sapılabilirdi.
 */
const WALL_RADIUS = 0.26;
/** Yapı katılarında alt sınır: ayağın `STEP_UP` üstünden başlar (eşik ve alçak döşeme kenarı basamak sayılır). */
const BAND_SHIFT = STEP_UP - WALK_BAND.lo;

/** Yapıların sorgulandığı yarıçap payı (en büyük yarı köşegen; `SettlementMap` ile aynı mantık). */
const QUERY_RADIUS = 24;
/** Önbellekte en çok yapı (aşılınca temizlenir). */
const CACHE_LIMIT = 4000;
/** Kapı içi ara hedefinin iç duvardan uzaklığı ve kapı önü noktasının dış yüze uzaklığı (oyun m). */
const INSIDE_DEPTH = 1.1;
const OUTSIDE_DEPTH = 1.2;
/** Kapı ekseninden bu kadar (oyun m) sapmış gövde kapı hattında sayılır (kapı boşluğundan geçebilir). */
const DOOR_LATERAL = 0.3;
/** Merdiven kolunun uçlarında ara hedefin kola uzaklığı (oyun m; kolun dışında, düz döşemede). */
const FLIGHT_PAD = 0.7;

/** Yapı yürüyüşünün haritadan istedikleri. */
export interface BuildingWalkMap {
  buildingsNear(x: number, z: number, radius: number): Building[];
  readonly stairs: readonly Stair[];
}

/** Bir noktanın içinde bulunduğu yapı ve kat (zemin 0). */
export interface Location {
  building: Building;
  level: number;
}

interface Entry {
  b: Building;
  shape: BuildingShape;
  boxes: WalkBox[];
  stair: Stair | null;
}

export class BuildingWalk {
  private readonly cache = new Map<number, Entry>();
  private readonly stairs = new Map<number, Stair>();

  constructor(
    private readonly map: BuildingWalkMap,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    for (const s of map.stairs) this.stairs.set(s.building, s);
  }

  /** (x, z)'de ayağı `prevY`'de olan gövdenin yürüme yüzeyi (arazi ya da yapı döşemesi/merdiveni). */
  surfaceAt(x: number, z: number, prevY: number): number {
    let y = this.heightAt(x, z);
    const reach = prevY + STEP_UP;
    for (const b of this.map.buildingsNear(x, z, QUERY_RADIUS)) {
      const e = this.entry(b);
      const local = worldToBuildingLocal(b, x, z);
      const stair = e.stair;
      if (stair) {
        const doorX = e.shape.door.x;
        const front = e.shape.depth / 2;
        if (
          Math.abs(local.x - doorX) <= stair.width / 2 &&
          local.z >= front &&
          local.z <= front + stair.run
        ) {
          const sy = b.y - (stair.rise * (local.z - front)) / Math.max(stair.run, 1e-6);
          if (sy <= reach && sy > y) y = sy;
        }
      }
      if (!e.shape.interior) continue;
      if (Math.abs(local.x) > e.shape.width / 2 || Math.abs(local.z) > e.shape.depth / 2) continue;
      const floor = floorAt(e.shape, local.x, local.z, prevY - b.y);
      if (floor !== null && b.y + floor <= reach && b.y + floor > y) y = b.y + floor;
    }
    return y;
  }

  /** (x0, z0)→(x1, z1) yürüyüşü (yarıçap `radius`, ayak `feetY`) bir yapının katılarına çarpar mı? */
  blocked(x0: number, z0: number, x1: number, z1: number, radius: number, feetY: number): boolean {
    for (const b of this.map.buildingsNear(x1, z1, QUERY_RADIUS)) {
      const e = this.entry(b);
      // Hızlı eleme: yapının ayak izi dairesine değmiyorsa.
      const reach = Math.hypot(e.shape.width, e.shape.depth) / 2 + radius + 1;
      if ((b.x - x1) ** 2 + (b.z - z1) ** 2 > reach * reach) continue;
      const r = Math.min(radius, WALL_RADIUS);
      for (const box of e.boxes) {
        if (walkBoxBlocks(box, x0, z0, x1, z1, r, feetY + BAND_SHIFT)) return true;
      }
    }
    return false;
  }

  /** (x, y, z) girilebilir bir yapının içinde mi; içindeyse hangi katta? */
  locate(x: number, y: number, z: number): Location | null {
    for (const b of this.map.buildingsNear(x, z, QUERY_RADIUS)) {
      const e = this.entry(b);
      const area = e.shape.interior;
      if (!area) continue;
      const rel = y - b.y;
      if (rel < -0.8 || rel > e.shape.indoorTop + 1.2) continue;
      const local = worldToBuildingLocal(b, x, z);
      const plan = e.shape.storeys;
      const level = plan ? levelOf(plan.floorY, rel) : 0;
      if (level > 0 && plan) {
        if (Math.abs(local.x) <= plan.upperW / 2 && Math.abs(local.z) <= plan.upperD / 2) {
          return { building: b, level };
        }
        continue;
      }
      if (Math.abs(local.x) <= area.halfWidth && local.z >= area.back && local.z <= area.front) {
        return { building: b, level: 0 };
      }
    }
    return null;
  }

  /**
   * `from`'dan `to`'ya giderken sıradaki ara hedef (dünya X/Z); doğrudan gidilebiliyorsa null. Hedef başka bir yapının
   * içindeyse önce o yapının kapı önüne (merdiven varsa ayağına), sonra kapı içine; NPC bir yapının içindeyse ve hedef
   * dışarıdaysa önce zemin kata, kapı içine, kapı önüne; aynı yapının başka katıysa merdiven kolunun ucuna.
   */
  route(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
  ): { x: number; z: number } | null {
    const here = this.locate(from.x, from.y, from.z);
    const there = this.locate(to.x, to.y, to.z);
    // Merdiven kolunun üstündeyken önce kol bitirilir (yarıda başka yöne dönen gövde boşluktan düşerdi).
    if (here) {
      const end = this.flightEnd(
        here.building,
        from,
        there?.building.id === here.building.id ? there.level : 0,
      );
      if (end) return end;
    }
    if (here && there && here.building.id === there.building.id) {
      if (here.level === there.level) return null;
      return this.flightStep(here, from, there.level > here.level ? 1 : -1);
    }
    if (here) {
      // Dışarı (ya da başka yapıya): önce zemin kata in, sonra kapıdan çık.
      if (here.level > 0) return this.flightStep(here, from, -1);
      return this.exitStep(here.building, from);
    }
    if (there) return this.enterStep(there.building, from);
    return null;
  }

  /**
   * (x, z)'ye `radius` içindeki girilebilir yapıların (cami hariç: saygı) zemin kat iç noktası; Son Kalan yarışmacısı
   * içine girip ganimet arar.
   */
  enterableNear(
    x: number,
    z: number,
    radius: number,
  ): Array<{ id: number; x: number; z: number; y: number }> {
    const out: Array<{ id: number; x: number; z: number; y: number }> = [];
    for (const b of this.map.buildingsNear(x, z, radius)) {
      const e = this.entry(b);
      const area = e.shape.interior;
      if (!area || isMosque(b.kind)) continue;
      const p = buildingLocalToWorld(b, e.shape.door.x * 0.5, (area.back + area.front) / 2);
      out.push({ id: b.id, x: p.x, z: p.z, y: b.y });
    }
    return out;
  }

  /** Yapının kapı önü (merdiven varsa ayağı) ve kapı içi noktaları (dünya X/Z). */
  doorPoints(b: Building): { outside: { x: number; z: number }; inside: { x: number; z: number } } {
    const e = this.entry(b);
    const doorX = e.shape.door.x;
    const front = e.shape.depth / 2;
    const run = e.stair?.run ?? 0;
    const area = e.shape.interior;
    const insideZ = area ? area.front - INSIDE_DEPTH : front - INSIDE_DEPTH;
    return {
      outside: buildingLocalToWorld(
        b,
        doorX,
        Math.max(front + run, e.shape.door.z - 0.6) + OUTSIDE_DEPTH,
      ),
      inside: buildingLocalToWorld(b, doorX, insideZ),
    };
  }

  private enterStep(b: Building, from: { x: number; z: number }): { x: number; z: number } {
    const e = this.entry(b);
    const { outside, inside } = this.doorPoints(b);
    const local = worldToBuildingLocal(b, from.x, from.z);
    const doorX = e.shape.door.x;
    const outsideZ = worldToBuildingLocal(b, outside.x, outside.z).z;
    // Kapı hattında (kapı önü ile kapı arası, kapı ekseninde) ise içeri; değilse kapı önüne.
    const insideZ = (e.shape.interior?.front ?? e.shape.depth / 2) - INSIDE_DEPTH;
    const lateral = Math.abs(local.x - doorX);
    const onLine = lateral <= DOOR_LATERAL && local.z <= outsideZ + 0.4 && local.z >= insideZ - 0.5;
    const atDoor =
      lateral <= DOOR_LATERAL && Math.hypot(from.x - outside.x, from.z - outside.z) <= 0.9;
    return onLine || atDoor ? inside : outside;
  }

  private exitStep(b: Building, from: { x: number; z: number }): { x: number; z: number } {
    const e = this.entry(b);
    const { outside, inside } = this.doorPoints(b);
    const local = worldToBuildingLocal(b, from.x, from.z);
    const doorX = e.shape.door.x;
    const insideZ = worldToBuildingLocal(b, inside.x, inside.z).z;
    // Kapı ekseninde ve kapı içi noktasından öndeyse dışarı; değilse önce kapı içine.
    const lateral = Math.abs(local.x - doorX);
    const onLine = lateral <= DOOR_LATERAL && local.z >= insideZ - 0.4;
    const atInside =
      lateral <= DOOR_LATERAL && Math.hypot(from.x - inside.x, from.z - inside.z) <= 0.7;
    return onLine || atInside ? outside : inside;
  }

  /**
   * Gövde bir merdiven kolunun üstündeyse (şeritte ve kolun yüksekliğinde) kolun ucu: hedef kat kolun üstündeyse üst
   * ucu, değilse alt ucu (uçların ötesinde, düz döşemede). Kolda değilse null.
   */
  private flightEnd(
    b: Building,
    from: { x: number; y: number; z: number },
    targetLevel: number,
  ): { x: number; z: number } | null {
    const plan = this.entry(b).shape.storeys;
    if (!plan) return null;
    const local = worldToBuildingLocal(b, from.x, from.z);
    const rel = from.y - b.y;
    for (const f of plan.flights) {
      if (Math.abs(local.x - f.x) > f.width / 2) continue;
      const lo = Math.min(f.zFrom, f.zTo);
      const hi = Math.max(f.zFrom, f.zTo);
      if (local.z < lo || local.z > hi) continue;
      const t = (local.z - f.zFrom) / (f.zTo - f.zFrom || 1);
      const y = f.y0 + (f.y1 - f.y0) * t;
      // Uçlarda (döşemeye 0,3 m'den yakın) kolda sayılmaz: sıradaki ara hedef seçilebilsin.
      if (Math.abs(y - rel) > 0.5 || y - f.y0 < 0.3 || f.y1 - y < 0.3) continue;
      const sign = Math.sign(f.zTo - f.zFrom) || 1;
      const up = targetLevel > f.level;
      return buildingLocalToWorld(
        b,
        f.x,
        up ? f.zTo + sign * FLIGHT_PAD : f.zFrom - sign * FLIGHT_PAD,
      );
    }
    return null;
  }

  /** Aynı yapıda bir kat yukarı (`dir` 1) ya da aşağı (−1) giden merdiven kolunun sıradaki ucu. */
  private flightStep(
    here: Location,
    from: { x: number; y: number; z: number },
    dir: 1 | -1,
  ): { x: number; z: number } | null {
    const b = here.building;
    const plan = this.entry(b).shape.storeys;
    if (!plan) return null;
    const flight = plan.flights[dir > 0 ? here.level : here.level - 1];
    if (!flight) return null;
    const local = worldToBuildingLocal(b, from.x, from.z);
    const sign = Math.sign(flight.zTo - flight.zFrom) || 1;
    // Çıkarken kolun alt ucu → üst ucu, inerken üst ucu → alt ucu (uçların ötesinde, düz döşemede).
    const startZ = dir > 0 ? flight.zFrom - sign * FLIGHT_PAD : flight.zTo + sign * FLIGHT_PAD;
    const endZ = dir > 0 ? flight.zTo + sign * FLIGHT_PAD : flight.zFrom - sign * FLIGHT_PAD;
    const lo = Math.min(flight.zFrom, flight.zTo) - 0.2;
    const hi = Math.max(flight.zFrom, flight.zTo) + 0.2;
    const onFlight =
      Math.abs(local.x - flight.x) <= flight.width / 2 && local.z >= lo && local.z <= hi;
    const atStart = Math.hypot(local.x - flight.x, local.z - startZ) <= 0.6;
    return buildingLocalToWorld(b, flight.x, onFlight || atStart ? endZ : startZ);
  }

  private entry(b: Building): Entry {
    let e = this.cache.get(b.id);
    if (e) return e;
    if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
    const shape = shapeVariant(b.kind, b.floors, b.ruined);
    const cos = Math.cos(b.yaw);
    const sin = Math.sin(b.yaw);
    const boxes: WalkBox[] = shape.solids.map((box) => {
      const c = buildingLocalToWorld(b, box.cx, box.cz);
      return {
        cx: c.x,
        cz: c.z,
        cos,
        sin,
        hx: box.hx,
        hz: box.hz,
        bottom: b.y + box.cy - box.hy,
        top: b.y + box.cy + box.hy,
        slope: 0,
      };
    });
    // Taş temel: zeminden kat seviyesine (yamaçta duvar); kapıya merdivenden çıkılır.
    if (b.y - b.base > WALK_BAND.lo * 0.5) {
      boxes.push({
        cx: b.x,
        cz: b.z,
        cos,
        sin,
        hx: shape.width * 0.49,
        hz: shape.depth * 0.49,
        bottom: b.base - BUILDING_LOOK.plinthSink,
        top: b.y,
        slope: 0,
      });
    }
    e = { b, shape, boxes, stair: this.stairs.get(b.id) ?? null };
    this.cache.set(b.id, e);
    return e;
  }
}

/** `floorY` katlarından `rel` (zemin kat döşemesine göre ayak yüksekliği) hangi kattadır? */
function levelOf(floorY: readonly number[], rel: number): number {
  let level = 0;
  for (let k = 1; k < floorY.length; k++) if ((floorY[k] as number) <= rel + 0.5) level = k;
  return level;
}

/**
 * Yapının içinde (yerel lx, lz) ayağı `rel`'de olan gövdenin üstünde durabileceği en yüksek döşeme (yerel y): zemin
 * kat, merdiven kolları ve (boşluğu olmayan yerde) üst kat döşemeleri; `rel + STEP_UP`'tan yüksek olanlar sayılmaz.
 */
function floorAt(shape: BuildingShape, lx: number, lz: number, rel: number): number | null {
  const reach = rel + STEP_UP;
  let best: number | null = 0;
  const plan = shape.storeys;
  if (!plan) return best;
  for (const f of plan.flights) {
    if (Math.abs(lx - f.x) > f.width / 2) continue;
    const lo = Math.min(f.zFrom, f.zTo);
    const hi = Math.max(f.zFrom, f.zTo);
    if (lz < lo || lz > hi) continue;
    const t = (lz - f.zFrom) / (f.zTo - f.zFrom || 1);
    const y = f.y0 + (f.y1 - f.y0) * t;
    if (y <= reach && (best === null || y > best)) best = y;
  }
  const hw = plan.upperW / 2;
  const hd = plan.upperD / 2;
  for (let level = 1; level < plan.floorY.length; level++) {
    const y = plan.floorY[level] as number;
    if (y > reach || (best !== null && y <= best)) continue;
    if (Math.abs(lx) > hw || Math.abs(lz) > hd) continue;
    const inHole = plan.holes.some(
      (h) => h.level === level && lx >= h.x0 && lx <= h.x1 && lz >= h.z0 && lz <= h.z1,
    );
    if (!inHole) best = y;
  }
  return best;
}
