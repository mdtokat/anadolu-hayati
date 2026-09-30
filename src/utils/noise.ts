/** Kafes noktası için [0, 1) aralığında deterministik özet değer. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Quintic yumuşatma: kafes kenarlarında türev sürekli. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** 2B değer gürültüsü; çıktı [-1, 1]. Aynı (x, y, seed) her zaman aynı değeri verir. */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);

  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);

  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fy) * 2 - 1;
}

/** Oktav toplamı (fBm); çıktı [-1, 1] aralığına normalize edilir. */
export function fbm2D(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    // Her oktavda farklı seed: oktavlar birbirinin kopyası olmasın.
    sum += valueNoise2D(x * frequency, y * frequency, seed + i * 101) * amplitude;
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / total;
}
