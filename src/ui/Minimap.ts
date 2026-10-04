import './ui.css';
import { MINIMAP } from '../config';
import type { LandCoverClass } from '../data/landcover';
import type { WaterFeatures } from '../data/region';
import type { RoadData } from '../data/settlements';
import {
  boundsTouch,
  circleToPx,
  frameAround,
  lineBounds,
  mapTransform,
  needsRebase,
  rasterColor,
  slopeShade,
  type RasterFrame,
} from './minimapView';
import { el } from './widgets';

/** Mini haritanın dünyadan okudukları (RegionWorld karşılar; testte sahte). */
export interface MinimapSource {
  heightAt(x: number, z: number): number;
  coverAt(x: number, z: number): LandCoverClass;
  water: WaterFeatures | null;
  roads: readonly RoadData[];
  /** (x, z)'ye `radius` içindeki yapıların ayak izleri (`w` yerel x genişliği, `d` derinlik). */
  buildingsNear(
    x: number,
    z: number,
    radius: number,
  ): ReadonlyArray<{ x: number; z: number; yaw: number; w: number; d: number; mosque: boolean }>;
}

/** Son Kalan: şimdiki ve sonraki güvenli daire. */
export interface MinimapZone {
  circle: { x: number; z: number; r: number };
  next: { x: number; z: number; r: number } | null;
}

type Bounds = ReturnType<typeof lineBounds>;

const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const C = MINIMAP.colors;

/**
 * Mini harita (HTML canvas; kullanıcı talimatı): kuzey yukarı, oyuncu ortada ok. Arazi taban görüntüsü oyuncu kenara
 * yaklaşınca yeniden örneklenir (kare başına birkaç satır: takılma yok); su, yol ve yapılar her çizimde vektör olarak
 * üstüne çizilir. Son Kalan'da güvenli bölge (dışı karartılır) ve sonraki daire (kesikli) görünür.
 */
export class Minimap {
  readonly root = el('div', 'minimap');
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly ratio: number;
  /** Bitmiş taban görüntüsü ve çerçevesi. */
  private base: HTMLCanvasElement | null = null;
  private frame: RasterFrame | null = null;
  /** Örneklenmekte olan taban görüntüsü (satır satır). */
  private job: {
    frame: RasterFrame;
    row: number;
    heights: Float32Array;
    covers: LandCoverClass[];
  } | null = null;
  private readonly lineBounds: Bounds[];
  private readonly roadBounds: Bounds[];
  /** Yakındaki vektörler (son yenilemeden). */
  private nearWater: number[] = [];
  private nearLakes: number[] = [];
  private nearRoads: number[] = [];
  private nearBuildings: ReturnType<MinimapSource['buildingsNear']> = [];
  private vectorAt: { x: number; z: number } | null = null;
  private lastDraw = -Infinity;
  private shown = false;

  constructor(
    parent: HTMLElement,
    private readonly source: MinimapSource,
  ) {
    this.ratio = Math.min(Math.max(globalThis.devicePixelRatio || 1, 1), 2);
    const size = MINIMAP.sizePx;
    this.canvas.width = Math.round(size * this.ratio);
    this.canvas.height = Math.round(size * this.ratio);
    this.canvas.className = 'minimap-canvas';
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.ctx = this.canvas.getContext('2d');
    const north = el('span', 'minimap-north', 'K');
    this.root.append(this.canvas, north);
    this.root.hidden = true;
    this.lineBounds = (source.water?.lines ?? []).map((l) => lineBounds(l.xz));
    this.roadBounds = source.roads.map((r) => lineBounds(r.xz));
    parent.append(this.root);
  }

  get visible(): boolean {
    return this.shown;
  }

  setVisible(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.root.hidden = !on;
    if (on) this.lastDraw = -Infinity;
  }

  /** Her karede: taban örneklemesini ilerletir, aralıkla çizer. */
  update(nowMs: number, player: { x: number; z: number; yaw: number }, zone: MinimapZone | null) {
    if (!this.shown || !this.ctx) return;
    const radius = MINIMAP.radius;
    if (!this.job && needsRebase(this.frame, player.x, player.z, radius)) {
      this.startJob(frameAround(player.x, player.z, radius));
    }
    if (this.job) this.stepJob();
    if (
      !this.vectorAt ||
      Math.hypot(player.x - this.vectorAt.x, player.z - this.vectorAt.z) > MINIMAP.vectorRefresh
    ) {
      this.refreshVectors(player.x, player.z);
    }
    if (nowMs - this.lastDraw < MINIMAP.drawIntervalMs) return;
    this.lastDraw = nowMs;
    this.draw(player, zone);
  }

  dispose(): void {
    this.root.remove();
  }

  // ── Taban görüntüsü ──

  private startJob(frame: RasterFrame): void {
    const n = MINIMAP.rasterCells;
    this.job = {
      frame,
      row: 0,
      heights: new Float32Array((n + 1) * (n + 1)),
      covers: new Array<LandCoverClass>(n * n),
    };
    // İlk taban yoksa (açılış/ışınlanma) bekletmeden tamamlanır.
    if (!this.base || !this.frame || needsRebase(this.frame, frame.cx, frame.cz, 0)) {
      while (this.job) this.stepJob(MINIMAP.rasterCells + 1);
    }
  }

  private stepJob(rows: number = MINIMAP.rowsPerFrame): void {
    const job = this.job;
    if (!job) return;
    const n = MINIMAP.rasterCells;
    const step = job.frame.span / n;
    const x0 = job.frame.cx - job.frame.span / 2;
    const z0 = job.frame.cz - job.frame.span / 2;
    const end = Math.min(job.row + rows, n + 1);
    for (let r = job.row; r < end; r++) {
      const z = z0 + r * step;
      for (let c = 0; c <= n; c++) {
        const x = x0 + c * step;
        job.heights[r * (n + 1) + c] = this.source.heightAt(x, z);
        if (r > 0 && c > 0)
          job.covers[(r - 1) * n + (c - 1)] = this.source.coverAt(x - step / 2, z - step / 2);
      }
    }
    job.row = end;
    if (job.row > n) this.finishJob();
  }

  private finishJob(): void {
    const job = this.job;
    this.job = null;
    if (!job) return;
    const n = MINIMAP.rasterCells;
    const step = job.frame.span / n;
    const canvas = document.createElement('canvas');
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(n, n);
    const w = n + 1;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const h = job.heights[(r + 1) * w + (c + 1)] as number;
        const hNW = job.heights[r * w + c] as number;
        const rgb = rasterColor(job.covers[r * n + c] ?? 'none', h, slopeShade(h, hNW, step));
        const i = (r * n + c) * 4;
        image.data[i] = rgb[0];
        image.data[i + 1] = rgb[1];
        image.data[i + 2] = rgb[2];
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.base = canvas;
    this.frame = job.frame;
  }

  // ── Vektörler ──

  private refreshVectors(x: number, z: number): void {
    this.vectorAt = { x, z };
    const half = MINIMAP.radius * 1.5;
    const lines = this.source.water?.lines ?? [];
    this.nearWater = [];
    for (let i = 0; i < lines.length; i++) {
      if (boundsTouch(this.lineBounds[i]!, x, z, half)) this.nearWater.push(i);
    }
    const lakes = this.source.water?.polygons ?? [];
    this.nearLakes = [];
    for (let i = 0; i < lakes.length; i++) {
      if (boundsTouch(lakes[i]!.bounds, x, z, half)) this.nearLakes.push(i);
    }
    this.nearRoads = [];
    for (let i = 0; i < this.source.roads.length; i++) {
      if (boundsTouch(this.roadBounds[i]!, x, z, half)) this.nearRoads.push(i);
    }
    this.nearBuildings = this.source.buildingsNear(x, z, half * 1.42);
  }

  // ── Çizim ──

  private draw(player: { x: number; z: number; yaw: number }, zone: MinimapZone | null): void {
    const ctx = this.ctx!;
    const size = MINIMAP.sizePx;
    const half = size / 2;
    const t = mapTransform(player, MINIMAP.radius, size);
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = css(C.sea);
    ctx.fillRect(0, 0, size, size);

    if (this.base && this.frame) {
      const f = this.frame;
      const tl = t.toPx(f.cx - f.span / 2, f.cz - f.span / 2);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.base, tl.x, tl.y, f.span * t.scale, f.span * t.scale);
    }

    const water = this.source.water;
    if (water) {
      ctx.fillStyle = css(C.water);
      for (const i of this.nearLakes) {
        const poly = water.polygons[i]!;
        ctx.beginPath();
        for (const ring of poly.rings) traceLine(ctx, ring, t, true);
        ctx.fill('evenodd');
      }
      ctx.strokeStyle = css(C.water);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const i of this.nearWater) {
        const line = water.lines[i]!;
        ctx.lineWidth = line.kind === 'river' ? 2 : 1.1;
        ctx.beginPath();
        traceLine(ctx, line.xz, t, false);
        ctx.stroke();
      }
    }

    for (const i of this.nearRoads) {
      const road = this.source.roads[i]!;
      ctx.strokeStyle = css(road.cls === 0 ? C.trunk : road.cls === 3 ? C.street : C.road);
      ctx.lineWidth = road.cls === 0 ? 2.4 : road.cls === 2 ? 0.9 : 1.4;
      ctx.setLineDash(road.cls === 2 ? [3, 2] : []);
      ctx.beginPath();
      traceLine(ctx, road.xz, t, false);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const b of this.nearBuildings) {
      const p = t.toPx(b.x, b.z);
      if (p.x < -8 || p.y < -8 || p.x > size + 8 || p.y > size + 8) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      // Yapı yaw'ı yerel +z'yi dünyada döndürür; haritada y ekseni +z'dir (kuzey −z yukarı).
      ctx.rotate(-b.yaw);
      ctx.fillStyle = css(b.mosque ? C.mosque : C.building);
      const w = Math.max(b.w * t.scale, 1.5);
      const d = Math.max(b.d * t.scale, 1.5);
      ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.restore();
    }

    if (zone) {
      const cur = circleToPx(t, zone.circle);
      // Güvenli bölgenin dışı karartılır.
      ctx.beginPath();
      ctx.rect(0, 0, size, size);
      ctx.arc(cur.x, cur.y, cur.r, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(40, 10, 60, 0.38)';
      ctx.fill('evenodd');
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, cur.r, 0, Math.PI * 2);
      ctx.strokeStyle = css(C.zone);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      if (zone.next) {
        const next = circleToPx(t, zone.next);
        ctx.beginPath();
        ctx.arc(next.x, next.y, next.r, 0, Math.PI * 2);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = css(C.next);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
        // Sonraki dairenin merkezi haritanın dışındaysa kenarda yön işareti.
        const dx = next.x - half;
        const dy = next.y - half;
        const dist = Math.hypot(dx, dy);
        if (dist > half - 6) {
          const k = (half - 9) / dist;
          ctx.beginPath();
          ctx.arc(half + dx * k, half + dy * k, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = css(C.next);
          ctx.fill();
        }
      }
    }

    // Oyuncu: ucu bakış yönünde ok (yaw 0 = −Z = yukarı; pozitif sola döner).
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(-player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = css(C.player);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.lineWidth = 1.2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232, 220, 192, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** [x0, z0, x1, z1, …] çizgisini yola ekler (`close`: halka). */
function traceLine(
  ctx: CanvasRenderingContext2D,
  xz: ArrayLike<number>,
  t: ReturnType<typeof mapTransform>,
  close: boolean,
): void {
  for (let i = 0; i + 1 < xz.length; i += 2) {
    const p = t.toPx(xz[i] as number, xz[i + 1] as number);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  if (close) ctx.closePath();
}
