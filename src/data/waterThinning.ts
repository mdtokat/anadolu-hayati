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

/** Bir öbekteki su çizgilerinin özeti (bağlı çizgiler: ortak uç noktası). */
interface LineGroup {
  length: number;
  intermittent: boolean;
  /** Nehir/kanal öbeği mi (eşik `minRiverNetworkLength`)? */
  river: boolean;
  /** Bir yerleşim merkezine yakından geçiyor mu (köy deresi: `minAnchoredLength`'i aşarsa kalır)? */
  anchored: boolean;
  /** Yakınından geçtiği yer adı/ışınlanma noktaları (`keepShort`). */
  places: Array<{ x: number; z: number }>;
}

/** Ayıklama eşikleri (`WATER_THINNING`). */
export interface WaterThinningOptions {
  minNetworkLength: number;
  minIntermittentLength: number;
  /** Nehir/kanal içeren öbeklerin eşiği (oyun m). */
  minRiverNetworkLength: number;
  /** Yerleşim merkezine yakın öbeğin yine de kalması için en kısa toplam uzunluk (oyun m). */
  minAnchoredLength: number;
  joinTolerance: number;
  anchorReach: number;
}

/**
 * Küçük, kısa su çizgilerini ayıklar (kullanıcı talimatları: "akarsu sayısı çok fazla"; "2-3 karelik suları ve
 * üzerindeki köprüleri kaldır, uzun nehirler kalsın"). Dereler kendi aralarında, nehir ve kanallar kendi aralarında uç
 * noktalarıyla (`joinTolerance` içinde) öbeklenir; öbeğin toplam uzunluğu eşiğin altındaysa öbek kaldırılır: dere öbeği
 * `minNetworkLength` (tamamı mevsimlikse `minIntermittentLength`), nehir/kanal öbeği `minRiverNetworkLength`. Bir
 * derenin nehre bağlanması onu kurtarmaz (yoksa nehre dökülen her kısa kol kalırdı). Böylece uzun bir akarsuyun kısa parçaları silinmez, yalnızca kendi
 * başına kalan kısa parçalar gider. Bir yerleşim merkezinin yakınından geçen öbek (köy/kasaba deresi: içme suyu) kısa
 * olsa da kalır, ama `minAnchoredLength`'ten kısaysa (birkaç hücrelik kopuk parça) o da kalkar. Saf ve deterministik.
 */
export function thinWaterLines(
  lines: readonly WaterLine[],
  options: WaterThinningOptions = WATER_THINNING,
  /**
   * Yerleşim merkezleri: bunlara `anchorReach` içinden geçen öbek kısa olsa da kalır (köy deresi), `minAnchoredLength`'ten
   * kısa değilse. `keepShort` olanlar (yer adı ve ışınlanma noktaları: hayatta kalma başlangıcında içilecek su):
   * yakınında hiç su kalmadıysa yakından geçen en uzun öbek uzunluğu ne olursa olsun korunur.
   */
  anchors: ReadonlyArray<{ x: number; z: number; keepShort?: boolean }> = [],
): WaterLine[] {
  if (lines.length === 0) return [];

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
  // Dereler ve nehir/kanallar ayrı öbeklenir (ayrı uç noktası kovaları).
  const endpoints = [new Map<string, number>(), new Map<string, number>()] as const;
  const join = (i: number, x: number, z: number): void => {
    const bucket = endpoints[(lines[i] as WaterLine).kind === 'stream' ? 0 : 1];
    // Komşu kovalara da bakılır: tolerans sınırına düşen uçlar kaçmasın.
    const kx = Math.floor(x / tol);
    const kz = Math.floor(z / tol);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const other = bucket.get(`${kx + dx},${kz + dz}`);
        if (other !== undefined) parent[find(i)] = find(other);
      }
    }
    bucket.set(`${kx},${kz}`, i);
  };
  for (let i = 0; i < lines.length; i++) {
    const xz = (lines[i] as WaterLine).xz;
    if (xz.length < 4) continue;
    join(i, xz[0] as number, xz[1] as number);
    join(i, xz[xz.length - 2] as number, xz[xz.length - 1] as number);
  }

  const reach = options.anchorReach;
  const anchorCells = new Map<string, Array<{ x: number; z: number; keepShort?: boolean }>>();
  for (const a of anchors) {
    const k = `${Math.floor(a.x / reach)},${Math.floor(a.z / reach)}`;
    const list = anchorCells.get(k) ?? [];
    list.push(a);
    anchorCells.set(k, list);
  }
  /** Çizginin `anchorReach` içinden geçtiği çapalar. */
  const anchorsNear = (xz: Float64Array): Array<{ x: number; z: number; keepShort?: boolean }> => {
    const out: Array<{ x: number; z: number; keepShort?: boolean }> = [];
    if (anchorCells.size === 0) return out;
    for (let j = 0; j + 1 < xz.length; j += 2) {
      const x = xz[j] as number;
      const z = xz[j + 1] as number;
      const kx = Math.floor(x / reach);
      const kz = Math.floor(z / reach);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const a of anchorCells.get(`${kx + dx},${kz + dz}`) ?? []) {
            if (Math.hypot(a.x - x, a.z - z) <= reach && !out.includes(a)) out.push(a);
          }
        }
      }
    }
    return out;
  };

  const groups = new Map<number, LineGroup>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as WaterLine;
    const root = find(i);
    const group = groups.get(root) ?? {
      length: 0,
      intermittent: true,
      river: false,
      anchored: false,
      places: [],
    };
    group.length += lineLength(line.xz);
    group.intermittent &&= line.intermittent;
    group.river ||= line.kind !== 'stream';
    for (const a of anchorsNear(line.xz)) {
      if (!a.keepShort) group.anchored = true;
      else if (!group.places.includes(a)) group.places.push(a);
    }
    groups.set(root, group);
  }

  const keep = new Set<LineGroup>();
  for (const group of groups.values()) {
    const min = group.river
      ? options.minRiverNetworkLength
      : group.intermittent
        ? options.minIntermittentLength
        : options.minNetworkLength;
    if (group.length >= min || (group.anchored && group.length >= options.minAnchoredLength)) {
      keep.add(group);
    }
  }
  // Yer adı/ışınlanma noktası: yakınında hiç su kalmadıysa oradan geçen en uzun öbek kalır (içme suyu).
  const best = new Map<{ x: number; z: number }, LineGroup>();
  const watered = new Set<{ x: number; z: number }>();
  for (const group of groups.values()) {
    for (const p of group.places) {
      if (keep.has(group)) watered.add(p);
      const current = best.get(p);
      if (!current || group.length > current.length) best.set(p, group);
    }
  }
  for (const [p, group] of best) if (!watered.has(p)) keep.add(group);

  return lines.filter((_line, i) => keep.has(groups.get(find(i)) as LineGroup));
}

/**
 * Özelliklerin kısa su çizgilerinden ayıklanmış kopyası; ayıklananlar (dere, nehir ya da kanal) `minorStreams`'e
 * (yalnızca nesne dağılımı için).
 */
export function thinFeatures(
  features: RegionFeatures,
  anchors: ReadonlyArray<{ x: number; z: number; keepShort?: boolean }> = [],
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
