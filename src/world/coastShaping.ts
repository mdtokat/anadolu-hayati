import { COAST_SHAPING, WATER } from '../config';

/**
 * Kıyı biçimlendirme (saf; `terrainPages.ts` `terrainFromRawSteps`'in son adımı; kullanıcı talimatı: "Samsun ve Sinop'un
 * sahil şeridinde hatalar var, deniz kesik kesik görünüyor"; Kocaeli körfezi). 100 m'lik DSM'de kıyı şeridinde üç kusur
 * vardı:
 *
 * 1. Deltada/lagünde kara içinde tek tük "deniz" hücreleri (0 m) ve denizde tek tük kara hücreleri: su yüzeyi benek
 *    benek görünüyordu.
 * 2. 0–1 m'lik kıyı ovası hücreleri su düzleminin (`WATER.level`) hemen üstündeydi: yüzey ile zemin neredeyse aynı
 *    düzlemde kalıp uzaktan titriyor, kıyı çizgisi kesik kesik görünüyordu.
 * 3. Kıyı çizgisi hücre kenarlarını izliyordu (merdiven).
 *
 * Yöntem: kara/deniz maskesi Gauss süzgeciyle (`sigmaCells`) yumuşatılır (b: 0 deniz, 1 kara); kıyı yüksekliği
 * s(b) = su + `relief` · (b − ½). Kara hücresi b ≥ ½ ise s'nin altına inmez (alçak kara suyun belirgin üstünde; iç
 * kesimde en az su + `relief`/2), b < ½ ise (denize taşan tek hücrelik çıkıntı, denizdeki benek) s'nin üstüne çıkmaz
 * (su altında kalır). Deniz hücresi b > ½ ise (karadaki benek, tek hücrelik girinti) s'ye yükselir; kıyıya yakın
 * (b ≥ `shoreBand`) deniz hücresi en az s'dedir (sığ kıyı). Böylece su çizgisi yumuşatılmış maskenin ½ eş-yükselti
 * eğrisini izler. Yerel bir işlemdir (yarıçap `ceil(3σ)` hücre): karo penceresinde (`TILE_HALO`) bire bir aynı sonuç.
 * Deniz/kara anlamı (ham değer 0) değişmez: nesne dağılımı ve arazi örtüsü ham veriyi okur.
 */
export function* shapeCoastSteps(
  game: Float32Array,
  isLand: (index: number) => boolean,
  width: number,
  height: number,
  rowsPerStep = 32,
): Generator<void, void> {
  const { sigmaCells, relief, shoreBand } = COAST_SHAPING;
  if (sigmaCells <= 0) return;
  const radius = Math.ceil(3 * sigmaCells);
  const weights = new Float64Array(radius * 2 + 1);
  let sum = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigmaCells * sigmaCells));
    weights[k + radius] = w;
    sum += w;
  }
  for (let k = 0; k < weights.length; k++) weights[k] = (weights[k] as number) / sum;

  const mask = new Float32Array(width * height);
  let anySea = false;
  let anyLand = false;
  for (let i = 0; i < mask.length; i++) {
    const land = isLand(i);
    mask[i] = land ? 1 : 0;
    if (land) anyLand = true;
    else anySea = true;
  }
  if (!anySea || !anyLand) return;
  yield;
  // Ayrılabilir süzgeç: önce satırlar, sonra sütunlar (kenarda en yakın hücre).
  const rowsBlur = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    const base = r * width;
    for (let c = 0; c < width; c++) {
      let v = 0;
      for (let k = -radius; k <= radius; k++) {
        const cc = c + k < 0 ? 0 : c + k >= width ? width - 1 : c + k;
        v += (weights[k + radius] as number) * (mask[base + cc] as number);
      }
      rowsBlur[base + c] = v;
    }
    if ((r + 1) % rowsPerStep === 0) yield;
  }
  const level = WATER.level;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      let b = 0;
      for (let k = -radius; k <= radius; k++) {
        const rr = r + k < 0 ? 0 : r + k >= height ? height - 1 : r + k;
        b += (weights[k + radius] as number) * (rowsBlur[rr * width + c] as number);
      }
      const i = r * width + c;
      const s = level + relief * (b - 0.5);
      const g = game[i] as number;
      if (mask[i] === 1) game[i] = b >= 0.5 ? Math.max(g, s) : Math.min(g, s);
      else if (b > 0.5 || b >= shoreBand) game[i] = Math.max(g, s);
    }
    if ((r + 1) % rowsPerStep === 0) yield;
  }
}
