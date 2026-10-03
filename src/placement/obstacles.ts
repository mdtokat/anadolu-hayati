import { STRUCTURE_OBSTACLES } from '../config';
import { localToWorld, solidBoxes } from './structureShapes';
import type { Structure, StructureSet } from './structures';

/**
 * Engel sorgusu (Faz 11 ortak sözleşmesi, docs/faz-11-paralel-plan.md §3.4; saf mantık). Kinematik hareket eden
 * canlılar, insanlar, eşkıyalar ve domuz baskını bir adımda (x0, z0) → (x1, z1) yürümeden önce yolun oyuncu
 * duvarları/çitleri/kapalı kapılarıyla (ve yerleşim ayak izleriyle) kesilip kesilmediğini sorar. Arayüz 11.0'da
 * sabitlendi (`NO_OBSTACLES` her şeye açık); gerçek uygulama `StructureObstacles`'tır (Faz 11, 11.3).
 */
export interface ObstacleQuery {
  /** `radius` kalınlığındaki bir gövde (x0, z0)'dan (x1, z1)'e giderken bir engele çarpar mı? */
  blocked(x0: number, z0: number, x1: number, z1: number, radius: number): boolean;
}

/** Hiçbir şeyin engel olmadığı sorgu (11.0 varsayılanı; testlerde de kullanılır). */
export const NO_OBSTACLES: ObstacleQuery = {
  blocked: () => false,
};

/** `StructureObstacles` ek kaynakları. */
export interface ObstacleExtras {
  /**
   * (x, z) bir yerleşim yapısının ayak izinde mi (yarıçap payıyla)? Verilirse dışarıdan içeri girmek engeldir (canlılar,
   * insanlar binaların içinden geçmez).
   */
  solidAt?: (x: number, z: number, radius: number) => boolean;
  /**
   * Dünya nesneleri (ağaç, kaya, çalı; köprü ve tünel kutuları; kamp çadırları): (x0, z0)→(x1, z1) yürüyüşü keser mi?
   * `solidContains` hareketsiz noktalar içindir (insan yürüyüşü, doğma).
   */
  solidBlocks?: (x0: number, z0: number, x1: number, z1: number, radius: number) => boolean;
  solidContains?: (x: number, z: number, radius: number) => boolean;
  /** Zemin yüksekliği: verilirse zeminden `upperFloorRise` yüksekteki üst kat duvarları yerdeki yürüyüşü kesmez. */
  heightAt?: (x: number, z: number) => number;
}

/** Zeminden bu kadar yüksekte duran yapı üst kattır (yerdeki yürüyüşü kesmez; oyun m). */
const UPPER_FLOOR_RISE = 1.9;

/** Dünya düzleminde yönlü dikdörtgen (yapı yaw'ı ile dönmüş kutunun yatay izdüşümü). */
export interface ObstacleRect {
  cx: number;
  cz: number;
  cos: number;
  sin: number;
  hx: number;
  hz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Sorgu içinde aynı dikdörtgeni iki kez sınamamak için damga. */
  stamp: number;
}

const key = (gx: number, gz: number): number => gx * 73856093 + gz * 19349663;

/**
 * Oyuncu yapılarının 2B engel dizini: yapı kümesinin katı kutularından (`solidBoxes`) zemine yakın olanlar yönlü
 * dikdörtgen olarak uzamsal ızgaraya yazılır (yapı kümesinin `version`'ı değişince tembel yenilenir). Çit, duvar,
 * kapalı kapı, sandık, tezgâh, istasyon ve kulübe duvarı engeldir; açık kapı/çit kapısı boşluğu bırakır; taban, çatı ve
 * basamak gibi yürünen/üstte kalan parçalar engel değildir.
 */
export class StructureObstacles implements ObstacleQuery {
  private readonly grid = new Map<number, ObstacleRect[]>();
  private syncedVersion = -1;
  private stamp = 0;
  private count = 0;

  constructor(
    private readonly structures: StructureSet,
    private readonly extras: ObstacleExtras = {},
  ) {}

  /** Dizindeki dikdörtgen sayısı (test/dev). */
  get rectCount(): number {
    this.sync();
    return this.count;
  }

  blocked(x0: number, z0: number, x1: number, z1: number, radius: number): boolean {
    this.sync();
    if (this.extras.solidAt) {
      if (this.extras.solidAt(x1, z1, radius) && !this.extras.solidAt(x0, z0, radius)) return true;
    }
    if (this.extras.solidBlocks?.(x0, z0, x1, z1, radius)) return true;
    if (this.count === 0) return false;
    this.stamp += 1;
    const cell = STRUCTURE_OBSTACLES.cell;
    const gx0 = Math.floor((Math.min(x0, x1) - radius) / cell);
    const gx1 = Math.floor((Math.max(x0, x1) + radius) / cell);
    const gz0 = Math.floor((Math.min(z0, z1) - radius) / cell);
    const gz1 = Math.floor((Math.max(z0, z1) + radius) / cell);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const bucket = this.grid.get(key(gx, gz));
        if (!bucket) continue;
        for (const rect of bucket) {
          if (rect.stamp === this.stamp) continue;
          rect.stamp = this.stamp;
          if (segmentBlockedByRect(rect, x0, z0, x1, z1, radius)) return true;
        }
      }
    }
    return false;
  }

  /** (x, z) noktası (yarıçap payıyla) bir engelin içinde mi? Hareketsiz noktalar için (insan yürüyüşü, doğma). */
  contains(x: number, z: number, radius: number): boolean {
    this.sync();
    if (this.extras.solidAt?.(x, z, radius)) return true;
    if (this.extras.solidContains?.(x, z, radius)) return true;
    if (this.count === 0) return false;
    const cell = STRUCTURE_OBSTACLES.cell;
    const bucket = this.grid.get(key(Math.floor(x / cell), Math.floor(z / cell)));
    if (!bucket) return false;
    return bucket.some((rect) => depthIn(rect, x, z, radius) > 0);
  }

  private sync(): void {
    if (this.syncedVersion === this.structures.version) return;
    this.syncedVersion = this.structures.version;
    this.grid.clear();
    this.count = 0;
    const cell = STRUCTURE_OBSTACLES.cell;
    for (const s of this.structures.all()) {
      for (const rect of this.rectsOf(s)) {
        this.count += 1;
        const gx0 = Math.floor(rect.minX / cell);
        const gx1 = Math.floor(rect.maxX / cell);
        const gz0 = Math.floor(rect.minZ / cell);
        const gz1 = Math.floor(rect.maxZ / cell);
        for (let gx = gx0; gx <= gx1; gx++) {
          for (let gz = gz0; gz <= gz1; gz++) {
            const k = key(gx, gz);
            const bucket = this.grid.get(k);
            if (bucket) bucket.push(rect);
            else this.grid.set(k, [rect]);
          }
        }
      }
    }
  }

  /** Yapının engel dikdörtgenleri (zemine yakın katı kutular). */
  private rectsOf(s: Readonly<Structure>): ObstacleRect[] {
    const ground = this.extras.heightAt;
    if (ground && s.y - ground(s.x, s.z) > UPPER_FLOOR_RISE) return [];
    const rects: ObstacleRect[] = [];
    for (const b of solidBoxes(s.kind, s.open === true)) {
      if (b.cy - b.hy > STRUCTURE_OBSTACLES.maxBottom) continue;
      if (b.cy + b.hy < STRUCTURE_OBSTACLES.minTop) continue;
      const center = localToWorld(s, b.cx, b.cz);
      const cos = Math.cos(s.yaw);
      const sin = Math.sin(s.yaw);
      // Yatay kapsama: yerel yarı genişliklerin dünya eksenlerindeki izdüşümü.
      const ex = Math.abs(b.hx * cos) + Math.abs(b.hz * sin);
      const ez = Math.abs(b.hx * sin) + Math.abs(b.hz * cos);
      rects.push({
        cx: center.x,
        cz: center.z,
        cos,
        sin,
        hx: b.hx,
        hz: b.hz,
        minX: center.x - ex,
        maxX: center.x + ex,
        minZ: center.z - ez,
        maxZ: center.z + ez,
        stamp: 0,
      });
    }
    return rects;
  }
}

/** Noktanın dikdörtgenin (yarıçapla genişletilmiş) içindeki derinliği: > 0 içeride, ≤ 0 dışarıda. */
function depthIn(rect: ObstacleRect, x: number, z: number, radius: number): number {
  const dx = x - rect.cx;
  const dz = z - rect.cz;
  // Dünya → yerel (localToWorld'ün tersi).
  const lx = dx * rect.cos - dz * rect.sin;
  const lz = dx * rect.sin + dz * rect.cos;
  return Math.min(rect.hx + radius - Math.abs(lx), rect.hz + radius - Math.abs(lz));
}

/**
 * Doğru parçası (yarıçapla genişletilmiş) dikdörtgene giriyor mu? Başlangıç zaten içerideyse (örn. yapı üstüne
 * doğmuş/geri tepmiş gövde) yalnızca daha derine gitmek engeldir: çıkış hareketi serbesttir.
 */
export function segmentBlockedByRect(
  rect: ObstacleRect,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  radius: number,
): boolean {
  const hx = rect.hx + radius;
  const hz = rect.hz + radius;
  const ax = x0 - rect.cx;
  const az = z0 - rect.cz;
  const bx = x1 - rect.cx;
  const bz = z1 - rect.cz;
  const lax = ax * rect.cos - az * rect.sin;
  const laz = ax * rect.sin + az * rect.cos;
  const lbx = bx * rect.cos - bz * rect.sin;
  const lbz = bx * rect.sin + bz * rect.cos;

  // Slab yöntemi: [t0, t1] ∩ kutu.
  let t0 = 0;
  let t1 = 1;
  const dx = lbx - lax;
  const dz = lbz - laz;
  for (const [p, d, h] of [
    [lax, dx, hx],
    [laz, dz, hz],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(p) > h) return false;
    } else {
      let ta = (-h - p) / d;
      let tb = (h - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  const startDepth = Math.min(hx - Math.abs(lax), hz - Math.abs(laz));
  if (startDepth > 0) {
    const endDepth = Math.min(hx - Math.abs(lbx), hz - Math.abs(lbz));
    return endDepth > startDepth + 1e-9;
  }
  return true;
}
