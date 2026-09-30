import { SCATTER } from '../config';
import type { LandCoverClass } from '../data/landcover';
import { createRandom, seedFrom } from '../utils/random';
import { valueNoise2D } from '../utils/noise';
import { chunkRect, type ChunkGrid } from './chunks';
import { PROP_KINDS, type PropKind } from './propKinds';

/**
 * Seed'li nesne yerleşimi (saf mantık, Three.js'siz): bir chunk için arazi örtüsüne, rakıma, eğime ve
 * tatlı suya göre ağaç/kaya/çalı/yenebilir bitki konumları üretir. Sonuç yalnızca `(seed, cx, cy)` ve
 * sabit veriye bağlıdır; yükleme sırasından, LOD'dan ve oyuncu konumundan bağımsızdır.
 */

/** Yerleşimin okuduğu yükseklik sorguları (RegionHeightSource bunu karşılar). */
export interface ScatterHeight {
  /** Oyun yüksekliği (y). */
  heightAt(x: number, z: number): number;
  /** Gerçek rakım (m). */
  elevationAt(x: number, z: number): number;
  /** Oyun uzayı eğimi (derece). */
  slopeDegAt(x: number, z: number): number;
}

export interface ScatterInput {
  cx: number;
  cy: number;
  grid: ChunkGrid;
  seed: number;
  cover: { classAt(x: number, z: number): LandCoverClass };
  height: ScatterHeight;
  /** (x, z)'ye `clearance` (oyun m) içinde tatlı su var mı? */
  isWater(x: number, z: number, clearance: number): boolean;
}

/** Bir chunk'ın nesneleri: tek sıralı liste, alanlar paralel dizilerdir (GC/bellek dostu). */
export interface ChunkProps {
  cx: number;
  cy: number;
  count: number;
  /** `PROP_KINDS` indeksi. */
  kind: Uint8Array;
  x: Float32Array;
  /** Zemin yüksekliği (oyun y). */
  y: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
  /** Taban geometriye göre ölçek çarpanı. */
  scale: Float32Array;
  /** Örnek başına renk tonu çarpanı (≈ 0,85–1,15). */
  tone: Float32Array;
  /**
   * Nesneler aday ızgarasının satır sırasıyla (kuzeyden güneye) üretilir; `rowStart[j]` = satır j'nin
   * ilk nesne indeksi (uzunluk = satır sayısı + 1). Yarıçap sorguları için z'ye göre daraltma sağlar.
   */
  rowStart: Uint32Array;
  /** Chunk'ın kuzey kenarı (minZ) ve aday aralığı: satır j, z ∈ [minZ + j·spacing, minZ + (j+1)·spacing). */
  minZ: number;
  spacing: number;
}

/** Tarifesi olan arazi örtüsü sınıfları → tür → yoğunluk (config `SCATTER.density`). */
type DensityTable = Partial<Record<LandCoverClass, Partial<Record<PropKind, number>>>>;
const DENSITY = SCATTER.density as DensityTable;

interface KindSpec {
  height: number;
  scale: readonly [number, number];
  maxSlopeDeg: number;
  elevation: readonly [number, number, number, number];
  waterClearance: number;
  maxInstances: number;
  maxDistance: number;
  farLod: boolean;
}
const KINDS = SCATTER.kinds as Record<PropKind, KindSpec>;

/** Yamuk üyelik: a→b arası 0→1, b→c arası 1, c→d arası 1→0 (a = b veya c = d ise keskin kenar). */
export function trapezoid(
  v: number,
  [a, b, c, d]: readonly [number, number, number, number],
): number {
  if (v < a || v > d) return 0;
  if (v < b) return (v - a) / (b - a);
  if (v <= c) return 1;
  return (d - v) / (d - c);
}

/**
 * Yoğunluk çarpanı olarak rakım: tür yamuğu (`elevation`, gürültüyle kaydırılmış olabilir) × ağaç sınırı
 * (`realElevation` ile kesin: ağaç sınırı üstünde ağaç yok).
 */
function elevationFactor(
  kind: PropKind,
  elevation: number,
  realElevation: number = elevation,
): number {
  if (isTree(kind) && realElevation > SCATTER.treeLineElevation) return 0;
  return trapezoid(elevation, KINDS[kind].elevation);
}

function isTree(kind: PropKind): boolean {
  return kind === 'tree_broadleaf' || kind === 'tree_conifer' || kind === 'chestnut';
}

/**
 * Bir sınıf + (jitter'lı) rakım için türün hedef yoğunluğu (nesne / 100 m²); eleme kuralları
 * (eğim, su) hariç. Testler ve ayar araçları için dışa açıktır.
 */
export function kindDensity(cover: LandCoverClass, kind: PropKind, elevation: number): number {
  return (DENSITY[cover]?.[kind] ?? 0) * elevationFactor(kind, elevation);
}

interface ClassEntry {
  kind: PropKind;
  index: number;
  density: number;
}
const CLASS_ENTRIES = new Map<LandCoverClass, ClassEntry[]>();
for (const cover of Object.keys(DENSITY) as LandCoverClass[]) {
  const table = DENSITY[cover] ?? {};
  CLASS_ENTRIES.set(
    cover,
    PROP_KINDS.filter((kind) => (table[kind] ?? 0) > 0).map((kind) => ({
      kind,
      index: PROP_KINDS.indexOf(kind),
      density: table[kind] as number,
    })),
  );
}

/** Rakıma yavaş gürültü ekler: tür geçiş bantları yamalı olur. */
function jitterElevation(elevation: number, x: number, z: number, seed: number): number {
  const { wavelength, amplitude } = SCATTER.elevationJitter;
  return elevation + valueNoise2D(x / wavelength, z / wavelength, seed) * amplitude;
}

/**
 * Chunk (cx, cy) için nesneleri üretir. Her aday hücre kendi alt-seed'iyle aynı sayıda rastgele sayı
 * çeker (eleme sonucundan bağımsız): veri değişse bile komşu adayların dizileri kaymaz.
 */
export function scatterChunk(input: ScatterInput): ChunkProps {
  const { cx, cy, grid, cover, height, isWater } = input;
  const spacing = SCATTER.candidateSpacing;
  const rect = chunkRect(grid, cx, cy);
  const cellsX = Math.round((rect.maxX - rect.minX) / spacing);
  const cellsZ = Math.round((rect.maxZ - rect.minZ) / spacing);
  const capacity = cellsX * cellsZ;
  const chunkSeed = seedFrom(input.seed, cx, cy);
  const noiseSeed = seedFrom(input.seed, 0x6e6f6973);
  const areaFactor = (spacing * spacing) / 100;

  const kind = new Uint8Array(capacity);
  const xs = new Float32Array(capacity);
  const ys = new Float32Array(capacity);
  const zs = new Float32Array(capacity);
  const yaws = new Float32Array(capacity);
  const scales = new Float32Array(capacity);
  const tones = new Float32Array(capacity);
  const rowStart = new Uint32Array(cellsZ + 1);
  let count = 0;

  for (let j = 0; j < cellsZ; j++) {
    rowStart[j] = count;
    for (let i = 0; i < cellsX; i++) {
      const random = createRandom(seedFrom(chunkSeed, j * cellsX + i));
      const roll = random.next();
      const x = rect.minX + (i + random.next()) * spacing;
      const z = rect.minZ + (j + random.next()) * spacing;
      const yaw = random.next() * Math.PI * 2;
      const scaleRoll = random.next();
      const toneRoll = random.next();

      const entries = CLASS_ENTRIES.get(cover.classAt(x, z));
      if (!entries) continue;

      // Deniz/kıyı: gürültüsüz gerçek rakım (kıyı çizgisi ve ağaç sınırı kaymasın).
      const realElevation = height.elevationAt(x, z);
      if (realElevation <= SCATTER.minElevation) continue;
      const elevation = jitterElevation(realElevation, x, z, noiseSeed);
      let cumulative = 0;
      let chosen: ClassEntry | null = null;
      for (const entry of entries) {
        cumulative +=
          entry.density * elevationFactor(entry.kind, elevation, realElevation) * areaFactor;
        if (roll < cumulative) {
          chosen = entry;
          break;
        }
      }
      if (!chosen) continue;

      const spec = KINDS[chosen.kind];
      if (height.slopeDegAt(x, z) > spec.maxSlopeDeg) continue;
      if (isWater(x, z, spec.waterClearance)) continue;

      kind[count] = chosen.index;
      xs[count] = x;
      ys[count] = height.heightAt(x, z);
      zs[count] = z;
      yaws[count] = yaw;
      scales[count] = spec.scale[0] + scaleRoll * (spec.scale[1] - spec.scale[0]);
      tones[count] = 0.85 + toneRoll * 0.3;
      count++;
    }
  }
  rowStart[cellsZ] = count;

  return {
    cx,
    cy,
    count,
    kind: kind.slice(0, count),
    x: xs.slice(0, count),
    y: ys.slice(0, count),
    z: zs.slice(0, count),
    yaw: yaws.slice(0, count),
    scale: scales.slice(0, count),
    tone: tones.slice(0, count),
    rowStart,
    minZ: rect.minZ,
    spacing,
  };
}
