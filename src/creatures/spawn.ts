import { CREATURES } from '../config';
import { createRandom, seedFrom } from '../utils/random';
import { darknessOf, angleDiff, yawOf } from './perception';
import { CREATURE_KINDS, type CreatureId, type CreatureKind, type CreatureTerrain } from './kinds';
import {
  MAX_CREATURES_PER_CELL,
  SPECIES,
  creatureId,
  type SpeciesDef,
  type Trapezoid,
} from './species';

/**
 * Doğma kuralları (5.3, saf mantık + gerçek bölge verisi): biyom (arazi örtüsü + rakım + eğim + su)
 * uygunluğu, gün/gece etkinlik ağırlıkları, hücre başına **deterministik** aday canlılar ve doğma noktası
 * denetimleri. Aday listesi yalnızca `(seed, cx, cy, epoch)` ve sabit araziye bağlıdır; oyuncu konumundan
 * ve yükleme sırasından bağımsızdır. Ekoloji yaklaşıktır.
 */

/** Doğma ızgarası: bölge sınırına hizalı kare hücreler (chunk ızgarasıyla aynı boy ve orijin). */
export interface SpawnGrid {
  size: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
}

export interface CellIndex {
  cx: number;
  cy: number;
}

export function makeSpawnGrid(
  bounds: CreatureTerrain['bounds'],
  size: number = CREATURES.spawnCellSize,
): SpawnGrid {
  return {
    size,
    minX: bounds.minX,
    minZ: bounds.minZ,
    cols: Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / size)),
    rows: Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / size)),
  };
}

/** Hücre anahtarı (chunk anahtarıyla aynı: `cy * cols + cx`). */
export function cellKey(grid: SpawnGrid, cx: number, cy: number): number {
  return cy * grid.cols + cx;
}

/** Noktanın hücresi; ızgara dışındaysa null. */
export function cellOf(grid: SpawnGrid, x: number, z: number): CellIndex | null {
  const cx = Math.floor((x - grid.minX) / grid.size);
  const cy = Math.floor((z - grid.minZ) / grid.size);
  return cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows ? null : { cx, cy };
}

/** Hücrenin X/Z kapsamı. */
export function cellRect(grid: SpawnGrid, cx: number, cy: number) {
  const minX = grid.minX + cx * grid.size;
  const minZ = grid.minZ + cy * grid.size;
  return { minX, maxX: minX + grid.size, minZ, maxZ: minZ + grid.size };
}

/** (x, z) çevresindeki `radius` dairesini kesen hücreler (ızgara içinde kalanlar). */
export function cellsNear(grid: SpawnGrid, x: number, z: number, radius: number): CellIndex[] {
  const c0 = Math.max(0, Math.floor((x - radius - grid.minX) / grid.size));
  const c1 = Math.min(grid.cols - 1, Math.floor((x + radius - grid.minX) / grid.size));
  const r0 = Math.max(0, Math.floor((z - radius - grid.minZ) / grid.size));
  const r1 = Math.min(grid.rows - 1, Math.floor((z + radius - grid.minZ) / grid.size));
  const cells: CellIndex[] = [];
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const rect = cellRect(grid, cx, cy);
      const nx = Math.min(Math.max(x, rect.minX), rect.maxX);
      const nz = Math.min(Math.max(z, rect.minZ), rect.maxZ);
      if (Math.hypot(nx - x, nz - z) <= radius) cells.push({ cx, cy });
    }
  }
  return cells;
}

/** Dönem numarası: geçen toplam gerçek saniyeye göre. */
export function epochOf(elapsedSeconds: number): number {
  return Math.floor(elapsedSeconds / CREATURES.epochSeconds);
}

/** Yamuk üyelik (0–1). */
export function trapezoidWeight(v: number, [a, b, c, d]: Trapezoid): number {
  if (v < a || v > d) return 0;
  if (v < b) return (v - a) / (b - a);
  if (v <= c) return 1;
  return (d - v) / (d - c);
}

/**
 * Etkinlik ağırlığı (0–1): gün/alacakaranlık/gece. Karanlık güneş yüksekliğinden gelir; alacakaranlıkta
 * `dusk` ağırlığı öne çıkar.
 */
export function activityWeight(species: SpeciesDef, sunAltitudeDeg: number): number {
  const day = 1 - darknessOf(sunAltitudeDeg);
  const base = species.activity.night + (species.activity.day - species.activity.night) * day;
  const twilight = 1 - Math.abs(2 * day - 1);
  return Math.max(base, species.activity.dusk * twilight);
}

/** Eğim payı (derece): doğma noktası, türün dolaşabileceği sınırın bu kadar altında olmalı. */
const SPAWN_SLOPE_MARGIN_DEG = 6;
/** Bölge kenarından bu kadar (oyun m) içeride doğma/yürüme (duvara yapışmasın). */
const EDGE_MARGIN = 6;

/** Canlı bu noktaya girebilir mi: bölge içi, kara, tür eğim sınırının altı (göl içi ayrıca denetlenir). */
export function passable(
  species: SpeciesDef,
  terrain: CreatureTerrain,
  x: number,
  z: number,
): boolean {
  const b = terrain.bounds;
  if (x < b.minX + EDGE_MARGIN || x > b.maxX - EDGE_MARGIN) return false;
  if (z < b.minZ + EDGE_MARGIN || z > b.maxZ - EDGE_MARGIN) return false;
  return !terrain.isSea(x, z) && terrain.slopeDegAt(x, z) <= species.maxSlopeDeg;
}

/**
 * Doğma uygunluğu 0–1: arazi örtüsü × rakım; deniz/kıyı, kar, yerleşim (tablo dışı sınıflar), dik yamaç
 * ve tatlı su kıyısında 0.
 */
export function habitatSuitability(
  species: SpeciesDef,
  terrain: CreatureTerrain,
  x: number,
  z: number,
): number {
  if (!passable(species, terrain, x, z)) return 0;
  if (terrain.slopeDegAt(x, z) > species.maxSlopeDeg - SPAWN_SLOPE_MARGIN_DEG) return 0;
  const cover = species.habitat.cover[terrain.coverAt(x, z)] ?? 0;
  if (cover <= 0) return 0;
  const elevation = trapezoidWeight(terrain.elevationAt(x, z), species.habitat.elevation);
  if (elevation <= 0) return 0;
  if (terrain.waterNear(x, z, CREATURES.spawnWaterClearance)) return 0;
  return cover * elevation;
}

/** Bir doğma adayı: aynı grup aynı `u`'yu paylaşır (birlikte doğar/kaldırılır). */
export interface Candidate {
  id: CreatureId;
  kind: CreatureKind;
  x: number;
  z: number;
  yaw: number;
  /** Zaman penceresi eşiği [0,1): `activityWeight > u` ise doğabilir. */
  u: number;
  /** Hücre anahtarı ve dönem (hata ayıklama/önbellek). */
  cell: number;
  epoch: number;
}

export interface CandidateInput {
  grid: SpawnGrid;
  terrain: CreatureTerrain;
  cx: number;
  cy: number;
  epoch: number;
  seed?: number;
}

/**
 * Hücrenin aday canlıları. Her tür için `spawnAttemptsPerCell` deneme: rastgele nokta, uygunluk ×
 * yoğunluk / deneme olasılığıyla kabul; kabul edilen nokta bir grubun lideridir, üyeler çevresine dağılır
 * (hücre dışına taşmaz → komşu hücrelerle çift/kayıp yok). Kimlik `creatureId(hücre, sıra)`.
 */
export function candidatesForCell(input: CandidateInput): Candidate[] {
  const { grid, terrain, cx, cy, epoch } = input;
  const seed = input.seed ?? CREATURES.seed;
  const rect = cellRect(grid, cx, cy);
  const key = cellKey(grid, cx, cy);
  const rng = createRandom(seedFrom(seed, cx, cy, epoch));
  const out: Candidate[] = [];
  const attempts = CREATURES.spawnAttemptsPerCell;

  const clampX = (v: number) => Math.min(Math.max(v, rect.minX), rect.maxX - 1e-3);
  const clampZ = (v: number) => Math.min(Math.max(v, rect.minZ), rect.maxZ - 1e-3);

  for (const kind of CREATURE_KINDS) {
    const species = SPECIES[kind];
    for (let attempt = 0; attempt < attempts; attempt++) {
      const x = rng.range(rect.minX, rect.maxX);
      const z = rng.range(rect.minZ, rect.maxZ);
      const roll = rng.next();
      const suitability = habitatSuitability(species, terrain, x, z);
      if (suitability <= 0 || roll >= (species.habitat.density * suitability) / attempts) continue;

      const size = rng.int(species.group[0], species.group[1]);
      const u = rng.next();
      for (let member = 0; member < size; member++) {
        if (out.length >= MAX_CREATURES_PER_CELL) return out;
        let mx = x;
        let mz = z;
        if (member > 0) {
          const angle = rng.range(0, Math.PI * 2);
          const radius = rng.range(1, CREATURES.groupSpread);
          mx = clampX(x + Math.cos(angle) * radius);
          mz = clampZ(z + Math.sin(angle) * radius);
          if (!passable(species, terrain, mx, mz) || terrain.waterNear(mx, mz, 1)) continue;
        }
        out.push({
          id: creatureId(key, out.length),
          kind,
          x: mx,
          z: mz,
          yaw: rng.range(-Math.PI, Math.PI),
          u,
          cell: key,
          epoch,
        });
      }
    }
  }
  return out;
}

/** Nokta oyuncunun görüş konisi içinde ve `spawnHiddenDistance`'tan yakın mı (görünüyor sayılır)? */
export function isVisibleTo(
  point: { x: number; z: number },
  player: { x: number; z: number; yaw?: number },
): boolean {
  if (player.yaw === undefined) return false;
  const dx = point.x - player.x;
  const dz = point.z - player.z;
  if (Math.hypot(dx, dz) >= CREATURES.spawnHiddenDistance) return false;
  const half = (CREATURES.spawnViewHalfAngleDeg * Math.PI) / 180;
  return Math.abs(angleDiff(player.yaw, yawOf(dx, dz))) <= half;
}

/** Oyuncu görmüyor (koni dışı ya da uzak) → canlı sessizce kaldırılabilir. */
export function isHiddenFrom(
  point: { x: number; z: number },
  player: { x: number; z: number; yaw?: number },
): boolean {
  return !isVisibleTo(point, player);
}

/**
 * Doğma noktası denetimi: oyuncudan `minSpawnDistance`–`simRadius` arasında; oyuncunun görüş konisinde ve
 * `spawnHiddenDistance` içinde değil (pop-in görünmesin); yapıların `structureClearance`'ı dışında.
 */
export function spawnPointOk(
  point: { x: number; z: number },
  player: { x: number; z: number; yaw?: number },
  structures: ReadonlyArray<{ x: number; z: number }>,
): boolean {
  const dist = Math.hypot(point.x - player.x, point.z - player.z);
  if (dist < CREATURES.minSpawnDistance || dist > CREATURES.simRadius) return false;
  if (isVisibleTo(point, player)) return false;
  for (const s of structures) {
    if (Math.hypot(point.x - s.x, point.z - s.z) < CREATURES.structureClearance) return false;
  }
  return true;
}
