import { HORIZONTAL_SCALE } from '../config';
import { LANDCOVER_CLASSES, LANDCOVER_VALUE, type LandCoverClass } from '../data/landcover';
import type { RegionData } from '../data/region';

/**
 * Arazi örtüsü ızgarası (landcover.bin): oyun X/Z → sınıf. Izgara heightmap ile aynıdır
 * (piksel merkezi örnekleri; (0, 0) örneği `origin`'de, varsayılan eski merkezli düzen); sorgu en yakın hücreyi
 * okur. Izgara dışı `none`.
 */
export class LandCoverMap {
  readonly width: number;
  readonly height: number;
  /** Izgara hücre boyu (oyun metresi). */
  readonly cell: number;
  /** Dizinin (0, 0) örneğinin konumu (oyun m): `RegionMeta.gridOrigin`. */
  readonly origin: { x: number; z: number };

  constructor(
    gridWidth: number,
    gridHeight: number,
    cellSizeReal: number,
    private readonly classes: Uint8Array,
    origin?: { x: number; z: number },
  ) {
    if (classes.length !== gridWidth * gridHeight) {
      throw new Error(`landcover ${classes.length} hücre, beklenen ${gridWidth * gridHeight}`);
    }
    this.width = gridWidth;
    this.height = gridHeight;
    this.cell = cellSizeReal / HORIZONTAL_SCALE;
    this.origin = origin ?? {
      x: (-(gridWidth - 1) / 2) * this.cell,
      z: (-(gridHeight - 1) / 2) * this.cell,
    };
  }

  /** Bölgenin arazi örtüsü yoksa null. */
  static fromRegion(region: RegionData): LandCoverMap | null {
    if (region.landcover === null) return null;
    const { gridWidth, gridHeight, cellSizeReal, gridOrigin } = region.meta;
    return new LandCoverMap(gridWidth, gridHeight, cellSizeReal, region.landcover, gridOrigin);
  }

  /** Hücre değeri (uint8); ızgara dışı için 0 (`none`). */
  valueAtCell(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return 0;
    return this.classes[row * this.width + col] as number;
  }

  /** Oyun X/Z'deki sınıf değeri (uint8). */
  valueAt(x: number, z: number): number {
    const col = Math.round((x - this.origin.x) / this.cell);
    const row = Math.round((z - this.origin.z) / this.cell);
    return this.valueAtCell(col, row);
  }

  /** Oyun X/Z'deki sınıf adı. */
  classAt(x: number, z: number): LandCoverClass {
    return LANDCOVER_CLASSES[this.valueAt(x, z)] ?? 'none';
  }

  /** Oyun X/Z'de belirli bir sınıf var mı? */
  is(x: number, z: number, name: LandCoverClass): boolean {
    return this.valueAt(x, z) === LANDCOVER_VALUE[name];
  }
}
