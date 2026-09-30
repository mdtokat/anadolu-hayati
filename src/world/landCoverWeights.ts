import { LANDCOVER_VALUE, type LandCoverClass } from '../data/landcover';

/**
 * Arazi shader'ı sınıf başına bir ağırlık kanalı okur: iki RGBA doku (8 kanal). Doku hücre
 * merkezlerinde örneklenip lineer filtrelenir; böylece sınıf sınırları 2 m'lik bloklar yerine
 * yumuşak geçer. `none` (deniz/veri yok) hiçbir kanalı açmaz: shader rakım/eğim rengine döner.
 */
export const COVER_CHANNELS_A: readonly LandCoverClass[] = ['forest', 'shrub', 'grass', 'crop'];
export const COVER_CHANNELS_B: readonly LandCoverClass[] = ['barren', 'urban', 'snow', 'wetland'];

export interface CoverWeights {
  /** RGBA (forest, shrub, grass, crop), hücre başına 4 bayt, heightmap sırasında. */
  a: Uint8Array;
  /** RGBA (barren, urban, snow, wetland). */
  b: Uint8Array;
}

/** Sınıf ızgarasını iki RGBA ağırlık dokusunun verisine çevirir (seçili sınıf 255, diğerleri 0). */
export function buildCoverWeights(classes: Uint8Array): CoverWeights {
  const a = new Uint8Array(classes.length * 4);
  const b = new Uint8Array(classes.length * 4);
  const channelA = channelTable(COVER_CHANNELS_A);
  const channelB = channelTable(COVER_CHANNELS_B);
  for (let i = 0; i < classes.length; i++) {
    const value = classes[i] as number;
    const ca = channelA[value];
    if (ca !== undefined) a[i * 4 + ca] = 255;
    const cb = channelB[value];
    if (cb !== undefined) b[i * 4 + cb] = 255;
  }
  return { a, b };
}

/** Sınıf değeri → kanal indeksi tablosu (kanalı olmayan değer tanımsız). */
function channelTable(channels: readonly LandCoverClass[]): Array<number | undefined> {
  const table: Array<number | undefined> = [];
  channels.forEach((name, channel) => {
    table[LANDCOVER_VALUE[name]] = channel;
  });
  return table;
}
