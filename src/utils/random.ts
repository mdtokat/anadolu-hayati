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
