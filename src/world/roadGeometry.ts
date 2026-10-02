import { ROADS } from '../config';
import type { RoadData } from '../data/settlements';
import { createRandom } from '../utils/random';

/** Bir çizim grubunun (kare) üçgen ağı: konum, renk, indeks. */
export interface RoadGroupMesh {
  /** Grup kimliği: (gx, gz) kare indeksleri. */
  gx: number;
  gz: number;
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

type HeightFn = (x: number, z: number) => number;

/** Dar dönüşlerde şerit sivrilmesin (köşe normali uzaması sınırı). */
const MAX_MITER = 2;

/** Çoklu çizgiyi en çok `step` aralıklı noktalara sıklaştırır (araziye oturması için). */
export function densify(xz: Float32Array, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < xz.length; i += 2) {
    const ax = xz[i] as number;
    const az = xz[i + 1] as number;
    if (i + 3 >= xz.length) {
      out.push(ax, az);
      break;
    }
    const bx = xz[i + 2] as number;
    const bz = xz[i + 3] as number;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
  }
  return out;
}

class GroupBuilder {
  positions: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  constructor(
    readonly gx: number,
    readonly gz: number,
  ) {}
}

/**
 * Yolları zemine oturan şeritlere çevirir ve `groupSize` karelerine böler (her kare ayrı mesh: görüş/uzaklık
 * kırpması). Kesit yüksekliği orta/sol/sağ zeminin en yükseği + `lift`. Renk sınıftan, hafif aşınma lekesiyle.
 */
export function buildRoadGroups(
  roads: readonly RoadData[],
  heightAt: HeightFn,
  groupSize: number = ROADS.groupSize,
): RoadGroupMesh[] {
  const groups = new Map<string, GroupBuilder>();
  const groupOf = (x: number, z: number) => {
    const gx = Math.floor(x / groupSize);
    const gz = Math.floor(z / groupSize);
    const key = `${gx},${gz}`;
    let g = groups.get(key);
    if (!g) {
      g = new GroupBuilder(gx, gz);
      groups.set(key, g);
    }
    return g;
  };
  const random = createRandom(0x70ad);

  for (const road of roads) {
    const pts = densify(road.xz, ROADS.sampleStep);
    const count = pts.length / 2;
    if (count < 2) continue;
    const half = (ROADS.width[road.cls] as number) / 2;
    const base = ROADS.color[road.cls] as number;
    const br = ((base >> 16) & 255) / 255;
    const bg = ((base >> 8) & 255) / 255;
    const bb = (base & 255) / 255;

    // Her noktanın sol/sağ köşesi.
    const left: Array<[number, number, number]> = [];
    const right: Array<[number, number, number]> = [];
    const shade: number[] = [];
    for (let i = 0; i < count; i++) {
      const x = pts[i * 2] as number;
      const z = pts[i * 2 + 1] as number;
      let nx = 0;
      let nz = 0;
      if (i > 0) {
        const dx = x - (pts[i * 2 - 2] as number);
        const dz = z - (pts[i * 2 - 1] as number);
        const len = Math.hypot(dx, dz) || 1;
        nx += -dz / len;
        nz += dx / len;
      }
      if (i < count - 1) {
        const dx = (pts[i * 2 + 2] as number) - x;
        const dz = (pts[i * 2 + 3] as number) - z;
        const len = Math.hypot(dx, dz) || 1;
        nx += -dz / len;
        nz += dx / len;
      }
      const nLen = Math.hypot(nx, nz);
      const scale = nLen < 1e-6 ? 0 : Math.min(1 / (nLen / 2), MAX_MITER) / nLen;
      nx *= scale * half;
      nz *= scale * half;
      if (i === 0 || i === count - 1) {
        // Uçta tek parça: normal zaten birim (ortalama yok).
        const l = Math.hypot(nx, nz) || 1;
        nx = (nx / l) * half;
        nz = (nz / l) * half;
      }
      const y =
        Math.max(heightAt(x, z), heightAt(x + nx, z + nz), heightAt(x - nx, z - nz)) + ROADS.lift;
      left.push([x + nx, y, z + nz]);
      right.push([x - nx, y, z - nz]);
      shade.push(0.86 + random.next() * 0.2);
    }

    // Parçaları gruplara dağıt: grup değişince şerit yeni grupta yeniden başlar (sınır noktası tekrarlanır).
    let current: GroupBuilder | null = null;
    let prevIndex = -1;
    for (let i = 0; i < count - 1; i++) {
      const mx = ((pts[i * 2] as number) + (pts[i * 2 + 2] as number)) / 2;
      const mz = ((pts[i * 2 + 1] as number) + (pts[i * 2 + 3] as number)) / 2;
      const g = groupOf(mx, mz);
      const push = (k: number) => {
        const l = left[k] as [number, number, number];
        const r = right[k] as [number, number, number];
        const s = shade[k] as number;
        g.positions.push(...l, ...r);
        g.colors.push(br * s, bg * s, bb * s, br * s, bg * s, bb * s);
        return g.positions.length / 3 - 2;
      };
      if (g !== current) {
        current = g;
        prevIndex = push(i);
      }
      const next = push(i + 1);
      const a = prevIndex; // sol_i
      const b = prevIndex + 1; // sağ_i
      const c = next; // sol_i+1
      const d = next + 1; // sağ_i+1
      g.indices.push(a, c, b, b, c, d); // normal +Y
      prevIndex = next;
    }
  }

  return [...groups.values()]
    .filter((g) => g.indices.length > 0)
    .map((g) => ({
      gx: g.gx,
      gz: g.gz,
      positions: new Float32Array(g.positions),
      colors: new Float32Array(g.colors),
      indices: new Uint32Array(g.indices),
    }));
}
