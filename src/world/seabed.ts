/**
 * Deniz hücrelerinin kıyıya (kara hücresine) uzaklığı: iki geçişli chamfer mesafe dönüşümü
 * (ortogonal 1, çapraz √2). Kara hücreleri 0; kıyıdan uzak / kara görmeyen hücreler büyük değer alır.
 * Dönüş: hücre cinsinden uzaklık (satır satır, `width × height`).
 */
export function seaDistanceToLand(
  width: number,
  height: number,
  isSea: (index: number) => boolean,
): Float32Array {
  const steps = seaDistanceToLandSteps(width, height, isSea, Infinity);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/** `seaDistanceToLand`'in dilimli hâli (aynı sonuç): her `rowsPerStep` satırda bir `yield` eder. */
export function* seaDistanceToLandSteps(
  width: number,
  height: number,
  isSea: (index: number) => boolean,
  rowsPerStep = 64,
): Generator<void, Float32Array> {
  const DIAGONAL = Math.SQRT2;
  const BIG = 1e9;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < dist.length; i++) dist[i] = isSea(i) ? BIG : 0;

  // İleri geçiş: sol-üst → sağ-alt
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      let d = dist[i] as number;
      if (d === 0) continue;
      if (c > 0) d = Math.min(d, (dist[i - 1] as number) + 1);
      if (r > 0) {
        d = Math.min(d, (dist[i - width] as number) + 1);
        if (c > 0) d = Math.min(d, (dist[i - width - 1] as number) + DIAGONAL);
        if (c < width - 1) d = Math.min(d, (dist[i - width + 1] as number) + DIAGONAL);
      }
      dist[i] = d;
    }
    if ((r + 1) % rowsPerStep === 0) yield;
  }
  // Geri geçiş: sağ-alt → sol-üst
  for (let r = height - 1; r >= 0; r--) {
    for (let c = width - 1; c >= 0; c--) {
      const i = r * width + c;
      let d = dist[i] as number;
      if (d === 0) continue;
      if (c < width - 1) d = Math.min(d, (dist[i + 1] as number) + 1);
      if (r < height - 1) {
        d = Math.min(d, (dist[i + width] as number) + 1);
        if (c < width - 1) d = Math.min(d, (dist[i + width + 1] as number) + DIAGONAL);
        if (c > 0) d = Math.min(d, (dist[i + width - 1] as number) + DIAGONAL);
      }
      dist[i] = d;
    }
    if ((height - r) % rowsPerStep === 0) yield;
  }
  return dist;
}

/**
 * Deniz hücrelerinin derinliği (oyun m, pozitif): kıyıdan uzaklık × hücre boyu × tan(eğim), `maxDepth` ile sınırlı.
 * Kara hücrelerinde 0.
 */
export function seabedDepth(
  distanceCells: Float32Array,
  cellSize: number,
  slopeDeg: number,
  maxDepth: number,
): Float32Array {
  const perCell = cellSize * Math.tan((slopeDeg * Math.PI) / 180);
  const depth = new Float32Array(distanceCells.length);
  for (let i = 0; i < depth.length; i++)
    depth[i] = Math.min((distanceCells[i] as number) * perCell, maxDepth);
  return depth;
}
