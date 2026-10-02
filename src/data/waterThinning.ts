import { WATER_THINNING } from '../config';
import type { RegionFeatures, WaterFeatures, WaterLine } from './region';

/** Çizginin oyun metresi cinsinden uzunluğu. */
function lineLength(xz: Float64Array): number {
  let length = 0;
  for (let i = 0; i + 3 < xz.length; i += 2) {
    length += Math.hypot(
      (xz[i + 2] as number) - (xz[i] as number),
      (xz[i + 3] as number) - (xz[i + 1] as number),
    );
  }
  return length;
}

/** Bir öbekteki dere çizgilerinin özeti (bağlı dereler: ortak uç noktası). */
interface StreamGroup {
  length: number;
  intermittent: boolean;
  /** Bir yerleşim merkezine yakından geçiyor mu (köy deresi: kalır)? */
  anchored: boolean;
}

/**
 * Küçük, ince dereleri ayıklar (kullanıcı talimatı: "akarsu sayısı çok fazla"). Nehir ve kanallar olduğu gibi kalır.
 * Dereler uç noktalarıyla (`joinTolerance` içinde) birbirine bağlanıp öbeklenir; öbeğin toplam uzunluğu
 * `minNetworkLength`'ten kısaysa (tamamı mevsimlikse `minIntermittentLength`'ten) öbek kaldırılır. Böylece uzun bir
 * derenin kısa parçaları silinmez, yalnızca kendi başına kalan kısa kollar gider. Bir yerleşim merkezinin yakınından
 * geçen dere öbekleri (köy/kasaba deresi: içme suyu) kısa olsa da kalır. Saf ve deterministik.
 */
export function thinWaterLines(
  lines: readonly WaterLine[],
  options: {
    minNetworkLength: number;
    minIntermittentLength: number;
    joinTolerance: number;
    anchorReach: number;
  } = WATER_THINNING,
  /** Yerleşim merkezleri: bunlara `anchorReach` içinden geçen dere öbeği kısa olsa da kalır (köy deresi). */
  anchors: ReadonlyArray<{ x: number; z: number }> = [],
): WaterLine[] {
  const streams: number[] = [];
  for (let i = 0; i < lines.length; i++)
    if ((lines[i] as WaterLine).kind === 'stream') streams.push(i);
  if (streams.length === 0) return [...lines];

  const parent = new Int32Array(lines.length);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i] as number] as number;
      i = parent[i] as number;
    }
    return i;
  };
  const tol = options.joinTolerance;
  const endpoints = new Map<string, number>();
  const join = (i: number, x: number, z: number): void => {
    // Komşu kovalara da bakılır: tolerans sınırına düşen uçlar kaçmasın.
    const kx = Math.floor(x / tol);
    const kz = Math.floor(z / tol);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const other = endpoints.get(`${kx + dx},${kz + dz}`);
        if (other !== undefined) parent[find(i)] = find(other);
      }
    }
    endpoints.set(`${kx},${kz}`, i);
  };
  for (const i of streams) {
    const xz = (lines[i] as WaterLine).xz;
    if (xz.length < 4) continue;
    join(i, xz[0] as number, xz[1] as number);
    join(i, xz[xz.length - 2] as number, xz[xz.length - 1] as number);
  }

  const reach = options.anchorReach;
  const anchorCells = new Map<string, Array<{ x: number; z: number }>>();
  for (const a of anchors) {
    const k = `${Math.floor(a.x / reach)},${Math.floor(a.z / reach)}`;
    const list = anchorCells.get(k) ?? [];
    list.push(a);
    anchorCells.set(k, list);
  }
  const nearAnchor = (xz: Float64Array): boolean => {
    if (anchorCells.size === 0) return false;
    for (let j = 0; j + 1 < xz.length; j += 2) {
      const x = xz[j] as number;
      const z = xz[j + 1] as number;
      const kx = Math.floor(x / reach);
      const kz = Math.floor(z / reach);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const a of anchorCells.get(`${kx + dx},${kz + dz}`) ?? []) {
            if (Math.hypot(a.x - x, a.z - z) <= reach) return true;
          }
        }
      }
    }
    return false;
  };

  const groups = new Map<number, StreamGroup>();
  for (const i of streams) {
    const line = lines[i] as WaterLine;
    const root = find(i);
    const group = groups.get(root) ?? { length: 0, intermittent: true, anchored: false };
    group.length += lineLength(line.xz);
    group.intermittent &&= line.intermittent;
    group.anchored ||= nearAnchor(line.xz);
    groups.set(root, group);
  }

  return lines.filter((line, i) => {
    if (line.kind !== 'stream') return true;
    const group = groups.get(find(i)) as StreamGroup;
    if (group.anchored) return true;
    const min = group.intermittent ? options.minIntermittentLength : options.minNetworkLength;
    return group.length >= min;
  });
}

/** Özelliklerin küçük derelerden ayıklanmış kopyası; ayıklananlar `minorStreams`'e (yalnızca nesne dağılımı için). */
export function thinFeatures(
  features: RegionFeatures,
  anchors: ReadonlyArray<{ x: number; z: number }> = [],
): RegionFeatures {
  const lines = thinWaterLines(features.water.lines, WATER_THINNING, anchors);
  const kept = new Set(lines);
  const minor = features.water.lines.filter((line) => !kept.has(line));
  return {
    ...features,
    water: { ...features.water, lines },
    minorStreams: [...(features.minorStreams ?? []), ...minor],
  };
}

/** Nesne dağılımının gördüğü su: oyundaki su + ayıklanan küçük dereler (ayıklama öncesi su ağı). */
export function scatterWaterOf(features: RegionFeatures): WaterFeatures {
  const minor = features.minorStreams ?? [];
  if (minor.length === 0) return features.water;
  return { ...features.water, lines: [...features.water.lines, ...minor] };
}
