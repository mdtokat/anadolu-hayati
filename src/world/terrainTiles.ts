import { HORIZONTAL_SCALE } from '../config';
import type { MeshStandardMaterial } from 'three';
import type { RegionMeta, WaterFeatures, WaterLine, WaterPolygon } from '../data/region';
import type { RoadData } from '../data/settlements';
import type { TileBlob } from '../data/worldStream';
import {
  buildRoadOverlay,
  buildRoadOverlaySteps,
  buildTerrainOverlay,
  buildTerrainOverlaySteps,
  type OverlayGrid,
  type OverlayRaster,
} from './terrainOverlay';
import { buildCoverWeights, type CoverWeights } from './landCoverWeights';
import { createTerrainMaterial, type TerrainUniforms } from './TerrainMaterial';
import { OVERVIEW_STRIDE, overviewSize } from './terrainPages';

/**
 * Karo başına arazi kaplaması ve materyali (Faz 12, karo akışı). Her karonun kaplama dokuları (yol/su/sınır uzaklık
 * alanı, yol dokusu, örtü ağırlıkları) karo penceresinin kafesinde, karo yüklenince küresel vektör verisinden
 * rasterlenir (tüm dünya için ~0,35 sn olan iş karo başına birkaç ms). Karoların materyalleri aynı programı paylaşır
 * (yalnız doku/ızgara uniform'ları farklıdır); LOD3 chunk'lar ve yüklü olmayan karolar tek **genel bakış** materyalini
 * kullanır (16 m'lik kafes, daha kaba uzaklık kodlaması).
 */

/** Kaplamanın küresel kaynakları. */
export interface TileOverlaySources {
  /** Boyanan yollar (`SettlementMap.paintLines`). */
  roads: readonly RoadData[];
  water: WaterFeatures | null;
  /** `landBorderSegments` çıktısı. */
  borders: readonly number[];
}

/** Genel bakış kaplaması: uzaklık kodlaması ve erişim (16 m'lik hücre için). */
export const OVERVIEW_OVERLAY = { scale: 4, reach: 24 } as const;

interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Çizgi/çokgen sınır kutularının önceden hesaplanmış listesi: kutuya değenler süzülür. */
class BoxList<T> {
  private readonly boxes: Float64Array;

  constructor(
    private readonly items: readonly T[],
    boxOf: (item: T) => Box,
  ) {
    this.boxes = new Float64Array(items.length * 4);
    items.forEach((item, i) => {
      const b = boxOf(item);
      this.boxes[i * 4] = b.minX;
      this.boxes[i * 4 + 1] = b.maxX;
      this.boxes[i * 4 + 2] = b.minZ;
      this.boxes[i * 4 + 3] = b.maxZ;
    });
  }

  /** Sıra korunur (rasterleme sırasına duyarlı eşitlikler aynı kalsın). */
  query(box: Box): T[] {
    const out: T[] = [];
    const b = this.boxes;
    for (let i = 0; i < this.items.length; i++) {
      if (
        (b[i * 4] as number) <= box.maxX &&
        (b[i * 4 + 1] as number) >= box.minX &&
        (b[i * 4 + 2] as number) <= box.maxZ &&
        (b[i * 4 + 3] as number) >= box.minZ
      ) {
        out.push(this.items[i] as T);
      }
    }
    return out;
  }
}

function pointsBox(xz: ArrayLike<number>): Box {
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i + 1 < xz.length; i += 2) {
    box.minX = Math.min(box.minX, xz[i] as number);
    box.maxX = Math.max(box.maxX, xz[i] as number);
    box.minZ = Math.min(box.minZ, xz[i + 1] as number);
    box.maxZ = Math.max(box.maxZ, xz[i + 1] as number);
  }
  return box;
}

export class TerrainTiles {
  /** LOD3 chunk'lar ve yüklü olmayan karolar için tek materyal. */
  readonly overviewMaterial: MeshStandardMaterial;
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly pending = new Map<
    string,
    { overlay: OverlayRaster; roads: OverlayRaster; weights: CoverWeights }
  >();
  private readonly roadBoxes: BoxList<RoadData>;
  private readonly lineBoxes: BoxList<WaterLine>;
  private readonly polygonBoxes: BoxList<WaterPolygon>;
  private readonly cell: number;
  private readonly origin: { x: number; z: number };

  constructor(
    meta: RegionMeta,
    private readonly sources: TileOverlaySources,
    overviewCover: Uint8Array,
    private readonly uniforms: TerrainUniforms,
  ) {
    this.cell = meta.cellSizeReal / HORIZONTAL_SCALE;
    this.origin = { x: meta.gridOrigin.x, z: meta.gridOrigin.z };
    this.roadBoxes = new BoxList(sources.roads, (r) => pointsBox(r.xz));
    this.lineBoxes = new BoxList(sources.water?.lines ?? [], (l) => pointsBox(l.xz));
    this.polygonBoxes = new BoxList(sources.water?.polygons ?? [], (p) => p.bounds);

    // Genel bakış materyali: tüm dünya, her 8. örnek.
    const cols = overviewSize(meta.gridWidth);
    const rows = overviewSize(meta.gridHeight);
    const grid: OverlayGrid = {
      width: cols,
      height: rows,
      cell: this.cell * OVERVIEW_STRIDE,
      origin: this.origin,
    };
    const options = { scale: OVERVIEW_OVERLAY.scale, reach: OVERVIEW_OVERLAY.reach };
    const overlay = buildTerrainOverlay(
      grid,
      { roads: sources.roads, water: sources.water, borders: sources.borders },
      options,
    );
    const roads = buildRoadOverlay(grid, sources.roads, options);
    this.overviewMaterial = createTerrainMaterial(
      { classes: overviewCover, width: cols, height: rows, cell: grid.cell, origin: this.origin },
      {
        data: overlay.data,
        roads: roads.data,
        ...grid,
        scale: OVERVIEW_OVERLAY.scale,
      },
      uniforms,
    );
  }

  /** Karo penceresinin dünya X/Z kutusu (kaplama özelliklerini süzmek için `pad` kadar geniş). */
  private boxOf(window: TileBlob['window'], pad: number): Box {
    return {
      minX: this.origin.x + window.col0 * this.cell - pad,
      maxX: this.origin.x + (window.col0 + window.cols - 1) * this.cell + pad,
      minZ: this.origin.z + window.row0 * this.cell - pad,
      maxZ: this.origin.z + (window.row0 + window.rows - 1) * this.cell + pad,
    };
  }

  private gridOf(window: TileBlob['window']): OverlayGrid {
    return {
      width: window.cols,
      height: window.rows,
      cell: this.cell,
      origin: {
        x: this.origin.x + window.col0 * this.cell,
        z: this.origin.z + window.row0 * this.cell,
      },
    };
  }

  /** Aşama A: kaplama dokularının verisini rasterler (tek parça; testler). */
  rasterize(blob: TileBlob): void {
    const steps = this.rasterizeSteps(blob, Infinity);
    while (!steps.next().done) {
      // dilimler peş peşe
    }
  }

  /** Aşama A'nın dilimli hâli: her `next()` birkaç ms'den az iş yapar (karo akışı bütçeye yayar). */
  *rasterizeSteps(blob: TileBlob, vertsPerStep = 400): Generator<void, void> {
    const box = this.boxOf(blob.window, 16);
    const grid = this.gridOf(blob.window);
    const water: WaterFeatures | null = this.sources.water
      ? {
          lines: this.lineBoxes.query(box),
          polygons: this.polygonBoxes.query(box),
          points: [],
        }
      : null;
    const borders: number[] = [];
    const all = this.sources.borders;
    for (let i = 0; i + 3 < all.length; i += 4) {
      const ax = all[i] as number;
      const az = all[i + 1] as number;
      const bx = all[i + 2] as number;
      const bz = all[i + 3] as number;
      if (
        Math.max(ax, bx) >= box.minX &&
        Math.min(ax, bx) <= box.maxX &&
        Math.max(az, bz) >= box.minZ &&
        Math.min(az, bz) <= box.maxZ
      ) {
        borders.push(ax, az, bx, bz);
      }
    }
    const roads = this.roadBoxes.query(box);
    yield;
    const overlay = yield* buildTerrainOverlaySteps(
      grid,
      { roads, water, borders },
      {},
      vertsPerStep,
    );
    yield;
    const roadRaster = yield* buildRoadOverlaySteps(grid, roads, {}, vertsPerStep);
    yield;
    this.pending.set(tileKey(blob), {
      overlay,
      roads: roadRaster,
      weights: buildCoverWeights(blob.cover),
    });
  }

  /** Aşama B: dokuları ve materyali kurar (GPU yüklemesi çizim sırasında). */
  createMaterial(blob: TileBlob): void {
    const k = tileKey(blob);
    const rasters = this.pending.get(k);
    if (!rasters) throw new Error(`Karo ${k} rasterlenmemiş`);
    this.pending.delete(k);
    const grid = this.gridOf(blob.window);
    this.materials.set(
      k,
      createTerrainMaterial(
        {
          classes: blob.cover,
          width: grid.width,
          height: grid.height,
          cell: grid.cell,
          origin: grid.origin,
        },
        { data: rasters.overlay.data, roads: rasters.roads.data, ...grid },
        this.uniforms,
      ),
    );
  }

  materialOf(tx: number, ty: number): MeshStandardMaterial | undefined {
    return this.materials.get(`${tx},${ty}`);
  }

  release(tx: number, ty: number): void {
    const k = `${tx},${ty}`;
    this.pending.delete(k);
    this.materials.get(k)?.dispose();
    this.materials.delete(k);
  }

  get materialCount(): number {
    return this.materials.size;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.overviewMaterial.dispose();
  }
}

function tileKey(blob: { tx: number; ty: number }): string {
  return `${blob.tx},${blob.ty}`;
}
