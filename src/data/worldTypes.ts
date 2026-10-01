/**
 * Dünya manifesti (`public/data/world/<id>/world.json`) tipleri: sözleşme docs/faz-7-paralel-plan.md §3.2.
 * Yalnızca tipler ve sabitler burada; doğrulama/yükleme `src/data/world.ts`'tedir (Hesap A, 7.1).
 */

/** Manifest şema sürümü; biçim değişirse artar. */
export const WORLD_MANIFEST_VERSION = 1;

/** Gerçek veri dikdörtgeni (global örnek kafesinde; negatif indeksler batıya/kuzeye uzanır). */
export interface WorldExtent {
  col0: number;
  row0: number;
  cols: number;
  rows: number;
}

/** Diskteki bir karo: 512×512 örnek, `(tx, ty) = (floor(col / 512), floor(row / 512))`. */
export interface WorldTileEntry {
  tx: number;
  ty: number;
  /** Yükseklik dosyası (uint16 LE, satır satır; extent dışı kısım 0), manifeste göre göreli yol. */
  height: string;
  /** Arazi örtüsü dosyası (uint8; extent dışı 0). */
  cover: string;
  /** `height` dosyasının bayt sayısı ve SHA-256'sı (bütünlük ve önbellek tazelenmesi: `?v=sha256[0..8]`). */
  bytes: number;
  sha256: string;
}

export interface WorldManifest {
  version: typeof WORLD_MANIFEST_VERSION;
  id: string;
  name: string;
  crs: string;
  originUtm: [number, number];
  horizontalScale: number;
  cellSizeReal: number;
  /** `WORLD.lattice` ile aynı olmalı (yükleyici doğrular). */
  lattice: { anchorX: number; anchorZ: number };
  tileSize: number;
  extent: WorldExtent;
  /** Dünya geneli tek yükseklik aralığı: `elevation = min + v / 65535 · (max − min)`. */
  elevation: { min: number; max: number; encoding: 'uint16' };
  /** `extent` ile kesişen HER karo listelenir (kapsama dikdörtgen ve boşluksuz olmalı). */
  tiles: WorldTileEntry[];
  provinces: string;
  features: { file: string; layers: string[] };
  landcover: { classes: string[] };
  sources: string[];
  /** Su/örtü verisinin Overture sürümü; eski ve yeni alanda aynı olmalı. */
  overtureRelease: string;
  built: string;
}
