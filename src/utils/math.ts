/** Değeri [min, max] aralığına sıkıştırır. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** a ile b arasında t (0..1) oranında doğrusal geçiş. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
