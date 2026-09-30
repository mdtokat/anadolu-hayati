/** Seed'li rastgele sayı üreteci arayüzü. Aynı seed her zaman aynı diziyi verir. */
export interface Random {
  /** [0, 1) aralığında sayı. */
  next(): number;
  /** [min, max) aralığında sayı. */
  range(min: number, max: number): number;
  /** [min, max] aralığında (uçlar dahil) tam sayı. */
  int(min: number, max: number): number;
}

/** Mulberry32 tabanlı deterministik üreteç (prosedürel içerik için; kriptografik değildir). */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
  };
}

/**
 * Tam sayı girdilerinden 32-bit tohum üretir (murmur3 tarzı karma). Sıra önemlidir:
 * `seedFrom(a, b) !== seedFrom(b, a)`. Sonuç doğrudan `createRandom`'a verilebilir; bitişik
 * girdiler (ör. komşu chunk'lar) birbirinden ilişkisiz diziler verir.
 */
export function seedFrom(...ints: number[]): number {
  let h = 0x9e3779b9;
  for (const value of ints) {
    let k = Math.imul(value | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= ints.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
