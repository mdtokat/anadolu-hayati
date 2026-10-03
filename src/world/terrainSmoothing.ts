/**
 * Kara hücrelerine ayrılabilir Gauss süzgeci (saf). `values` satır satır `width × height` dizidir; `isLand(i)`
 * yanlış olan hücreler ne değişir ne de komşularının ortalamasına girer (kıyı çizgisi kaymaz, deniz kıyıya
 * "sızmaz"). Ağırlıklar yalnızca kara komşularına göre normalize edilir: kara değerleri karadaki en küçük ile en
 * büyük komşu arasında kalır (sıfırın üstündeki kara sıfıra inmez). Yerinde yazar.
 */
export function smoothLand(
  values: Float32Array,
  width: number,
  height: number,
  isLand: (index: number) => boolean,
  sigmaCells: number,
  strength = 1,
): void {
  for (const _ of smoothLandSteps(values, width, height, isLand, sigmaCells, strength, Infinity)) {
    void _;
  }
}

/**
 * `smoothLand`'in dilimli hâli (aynı aritmetik, aynı sonuç): her `rowsPerStep` satır/sütunda bir `yield` eder; çağıran
 * dilimleri kare bütçesine yayabilir (karo akışı).
 */
export function* smoothLandSteps(
  values: Float32Array,
  width: number,
  height: number,
  isLand: (index: number) => boolean,
  sigmaCells: number,
  strength = 1,
  rowsPerStep = 32,
): Generator<void, void> {
  if (sigmaCells <= 0 || strength <= 0) return;
  const radius = Math.max(1, Math.ceil(sigmaCells * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  for (let k = -radius; k <= radius; k++) {
    kernel[k + radius] = Math.exp(-(k * k) / (2 * sigmaCells * sigmaCells));
  }
  const land = new Uint8Array(width * height);
  for (let i = 0; i < land.length; i++) {
    land[i] = isLand(i) ? 1 : 0;
    if ((i + 1) % (rowsPerStep * 2 * width) === 0) yield;
  }

  // Yatay geçiş: değer × ağırlık ve ağırlık toplamı ayrı tutulur (dikey geçiş ikisini de süzer).
  const sum = new Float32Array(width * height);
  const weight = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    const row = r * width;
    for (let c = 0; c < width; c++) {
      let s = 0;
      let w = 0;
      const k0 = Math.max(-radius, -c);
      const k1 = Math.min(radius, width - 1 - c);
      for (let k = k0; k <= k1; k++) {
        const j = row + c + k;
        if (land[j] === 0) continue;
        const kw = kernel[k + radius] as number;
        s += (values[j] as number) * kw;
        w += kw;
      }
      sum[row + c] = s;
      weight[row + c] = w;
    }
    if ((r + 1) % rowsPerStep === 0) yield;
  }
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < height; r++) {
      const i = r * width + c;
      if (land[i] === 0) continue;
      let s = 0;
      let w = 0;
      const k0 = Math.max(-radius, -r);
      const k1 = Math.min(radius, height - 1 - r);
      for (let k = k0; k <= k1; k++) {
        const j = i + k * width;
        const kw = kernel[k + radius] as number;
        s += (sum[j] as number) * kw;
        w += (weight[j] as number) * kw;
      }
      if (w <= 0) continue;
      const smooth = s / w;
      const original = values[i] as number;
      values[i] = original + (smooth - original) * strength;
    }
    if ((c + 1) % rowsPerStep === 0) yield;
  }
}
