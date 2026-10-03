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
  const job = new ScatterJob(input);
  job.step(Number.POSITIVE_INFINITY);
  return job.result();
}

/**
 * Bölünebilir dağılım işi (performans): aday satırları `step` ile parça parça işlenir; kare bütçesi tek chunk'ın
 * ~10 ms'lik hesabını birkaç kareye yayabilir. Adaylar birbirinden bağımsız seed'lidir, satırlar sırayla işlenir:
 * sonuç `scatterChunk` ile birebir aynıdır (kimlikler değişmez).
 */
export class ScatterJob {
  readonly cx: number;
  readonly cy: number;
  private readonly input: ScatterInput;
  private readonly spacing = SCATTER.candidateSpacing;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly cellsX: number;
  private readonly cellsZ: number;
  private readonly chunkSeed: number;
  private readonly noiseSeed: number;
  private readonly areaFactor: number;
  private readonly kind: Uint8Array;
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly zs: Float32Array;
  private readonly yaws: Float32Array;
  private readonly scales: Float32Array;
  private readonly tones: Float32Array;
  private readonly rowStart: Uint32Array;
  private count = 0;
  private row = 0;

  constructor(input: ScatterInput) {
    this.input = input;
    this.cx = input.cx;
    this.cy = input.cy;
    const rect = chunkRect(input.grid, input.cx, input.cy);
    this.minX = rect.minX;
    this.minZ = rect.minZ;
    this.cellsX = Math.round((rect.maxX - rect.minX) / this.spacing);
    this.cellsZ = Math.round((rect.maxZ - rect.minZ) / this.spacing);
    const capacity = this.cellsX * this.cellsZ;
    this.chunkSeed = seedFrom(input.seed, input.cx, input.cy);
    this.noiseSeed = seedFrom(input.seed, 0x6e6f6973);
    this.areaFactor = (this.spacing * this.spacing) / 100;
    this.kind = new Uint8Array(capacity);
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
    this.zs = new Float32Array(capacity);
    this.yaws = new Float32Array(capacity);
    this.scales = new Float32Array(capacity);
    this.tones = new Float32Array(capacity);
    this.rowStart = new Uint32Array(this.cellsZ + 1);
  }

  /** Bütün satırlar işlendi mi? */
  get done(): boolean {
    return this.row >= this.cellsZ;
  }

  /** En çok `rows` aday satırını işler. */
  step(rows: number): void {
    const { cover, height, isWater } = this.input;
    const { spacing, cellsX, chunkSeed, noiseSeed, areaFactor } = this;
    const end = Math.min(this.cellsZ, this.row + rows);
    for (let j = this.row; j < end; j++) {
      this.rowStart[j] = this.count;
      for (let i = 0; i < cellsX; i++) {
        const random = createRandom(seedFrom(chunkSeed, j * cellsX + i));
        const roll = random.next();
        const x = this.minX + (i + random.next()) * spacing;
        const z = this.minZ + (j + random.next()) * spacing;
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

        const n = this.count;
        this.kind[n] = chosen.index;
        this.xs[n] = x;
        this.ys[n] = height.heightAt(x, z);
        this.zs[n] = z;
        this.yaws[n] = yaw;
        this.scales[n] = spec.scale[0] + scaleRoll * (spec.scale[1] - spec.scale[0]);
        this.tones[n] = 0.85 + toneRoll * 0.3;
        this.count++;
      }
    }
    this.row = end;
  }

  /** Bitmiş işin sonucu (`done` değilse hata). */
  result(): ChunkProps {
    if (!this.done) throw new Error('Dağılım işi bitmedi');
    const count = this.count;
    this.rowStart[this.cellsZ] = count;
    return {
      cx: this.cx,
      cy: this.cy,
      count,
      kind: this.kind.slice(0, count),
      x: this.xs.slice(0, count),
      y: this.ys.slice(0, count),
      z: this.zs.slice(0, count),
      yaw: this.yaws.slice(0, count),
      scale: this.scales.slice(0, count),
      tone: this.tones.slice(0, count),
      rowStart: this.rowStart,
      minZ: this.minZ,
      spacing: this.spacing,
    };
  }
}
