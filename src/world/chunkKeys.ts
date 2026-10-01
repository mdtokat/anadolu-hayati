/**
 * Mutlak chunk/nesne/canlı kimlikleri (docs/faz-7-paralel-plan.md §3.4). Eski kimlikler ızgara genişliğine
 * bağlıydı (`cy · cols + cx`); dünya büyüyünce kaymasın diye anahtar artık yalnızca `(cx, cy)` kafes
 * koordinatından türer (negatif olabilir). Saf mantık; mevcut `world/chunks.ts` (`chunkKey(grid, …)`),
 * `world/propIndex.ts` (`propId`) ve `creatures/species.ts` (`creatureId`) Hesap B'nin 7.5 adımında bunlara
 * bağlanır.
 */

/** Chunk koordinatı bu kadar kaydırılıp işaretsiz yapılır; geçerli aralık `[−BIAS, BIAS − 1]`. */
export const CHUNK_KEY_BIAS = 32768;
const KEY_STRIDE = 65536;

/** Chunk başına en çok nesne (`PropIndex` sınırı ile aynı olmalı; test eşleştirir). */
export const PROP_ID_STRIDE = 65536;
/** Doğma hücresi başına en çok canlı (`species.ts` `MAX_CREATURES_PER_CELL` ile aynı; test eşleştirir). */
export const CREATURE_ID_STRIDE = 256;

function assertChunk(cx: number, cy: number): void {
  for (const v of [cx, cy]) {
    if (!Number.isInteger(v) || v < -CHUNK_KEY_BIAS || v >= CHUNK_KEY_BIAS) {
      throw new RangeError(
        `Chunk koordinatı [${-CHUNK_KEY_BIAS}, ${CHUNK_KEY_BIAS - 1}] tam sayısı olmalı: ${v}`,
      );
    }
  }
}

/** Chunk `(cx, cy)` için tekil, ızgara boyutundan bağımsız anahtar (0 ≤ anahtar < 2³²). */
export function absoluteChunkKey(cx: number, cy: number): number {
  assertChunk(cx, cy);
  return (cy + CHUNK_KEY_BIAS) * KEY_STRIDE + (cx + CHUNK_KEY_BIAS);
}

export function decodeAbsoluteChunkKey(key: number): { cx: number; cy: number } {
  if (!Number.isInteger(key) || key < 0 || key >= KEY_STRIDE * KEY_STRIDE) {
    throw new RangeError(`Geçersiz chunk anahtarı: ${key}`);
  }
  return {
    cx: (key % KEY_STRIDE) - CHUNK_KEY_BIAS,
    cy: Math.floor(key / KEY_STRIDE) - CHUNK_KEY_BIAS,
  };
}

/** `chunkKey · 65536 + indeks` (< 2⁴⁸: güvenli tam sayı). */
export function absolutePropId(chunkKey: number, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= PROP_ID_STRIDE) {
    throw new RangeError(`Nesne indeksi 0–${PROP_ID_STRIDE - 1} aralığında olmalı: ${index}`);
  }
  decodeAbsoluteChunkKey(chunkKey); // anahtarı doğrula
  return chunkKey * PROP_ID_STRIDE + index;
}

export function decodeAbsolutePropId(id: number): { chunkKey: number; index: number } {
  if (!Number.isInteger(id) || id < 0) throw new RangeError(`Geçersiz nesne kimliği: ${id}`);
  return { chunkKey: Math.floor(id / PROP_ID_STRIDE), index: id % PROP_ID_STRIDE };
}

/** `hücreAnahtarı · 256 + sıra` (< 2⁴⁰); doğma hücresi ≡ chunk, anahtar `absoluteChunkKey(cx, cy)`. */
export function absoluteCreatureId(cellKey: number, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= CREATURE_ID_STRIDE) {
    throw new RangeError(`Canlı sırası 0–${CREATURE_ID_STRIDE - 1} aralığında olmalı: ${index}`);
  }
  decodeAbsoluteChunkKey(cellKey);
  return cellKey * CREATURE_ID_STRIDE + index;
}

/**
 * Faz 6 (kayıt v1) kimlikleri: eski bölge ızgarası 13 × 10 chunk, anahtar `cy · 13 + cx`; kafes (çapa) yeni
 * dünyayla aynı olduğundan chunk koordinatı yeni dünyada da aynı chunk'tır ve nesne indeksi değişmez.
 */
export const LEGACY = { chunkCols: 13, chunkRows: 10, spawnCols: 13, spawnRows: 10 } as const;

function legacyKeyToAbsolute(oldKey: number, cols: number, rows: number): number | null {
  if (!Number.isInteger(oldKey) || oldKey < 0 || oldKey >= cols * rows) return null;
  return absoluteChunkKey(oldKey % cols, Math.floor(oldKey / cols));
}

/** Eski chunk anahtarı → mutlak anahtar; eski ızgara dışındaki değer için `null`. */
export function legacyChunkKeyToAbsolute(oldKey: number): number | null {
  return legacyKeyToAbsolute(oldKey, LEGACY.chunkCols, LEGACY.chunkRows);
}

/** Eski doğma hücresi anahtarı → mutlak anahtar; eski ızgara dışındaki değer için `null`. */
export function legacyCellKeyToAbsolute(oldKey: number): number | null {
  return legacyKeyToAbsolute(oldKey, LEGACY.spawnCols, LEGACY.spawnRows);
}

/** Eski nesne kimliği (`eskiAnahtar · 65536 + indeks`) → mutlak kimlik; geçersizse `null`. */
export function legacyPropIdToAbsolute(oldId: number): number | null {
  if (!Number.isInteger(oldId) || oldId < 0) return null;
  const key = legacyChunkKeyToAbsolute(Math.floor(oldId / PROP_ID_STRIDE));
  return key === null ? null : absolutePropId(key, oldId % PROP_ID_STRIDE);
}
