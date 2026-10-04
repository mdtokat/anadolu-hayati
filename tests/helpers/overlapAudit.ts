import { SPAN_KIND, type PlannedRoad, type RoadSpan } from '../../src/settlements/roadProfile';
import { BUILDING_SHAPES, shapeVariant } from '../../src/settlements/kinds';
import { boxCorners, quadsOverlap } from '../../src/settlements/footprints';
import type { SettlementMap } from '../../src/settlements/SettlementMap';
import { StructureIndex, type StructureBox } from '../../src/world/roadStructureGeometry';

/**
 * İç içe geçme denetimi (kullanıcı talimatı: "köprü, yol, dere, dağ vb. yapıların iç içe geçtiği kısımlar"): köprü/tünel
 * kutularının binalarla ve birbirleriyle çakışması, güvertenin arazide gömülmesi, yolun akarsuyu köprüsüz kesmesi ve
 * yolun göl içinden geçmesi. Her ölçü gerçek dünyada sayılır; testler eşik koyar, belge sayıları yazar.
 */

export interface Overlap {
  kind: string;
  a: string;
  b: string;
  x: number;
  z: number;
  detail?: string;
}

export interface AuditResult {
  spans: number;
  bridgeBuilding: Overlap[];
  /** Köprü/tünel çiftleri; `junction` olanlar ortak kavşakta buluşan ayak parçalarıdır (iki yol aynı noktadan başlar). */
  bridgeBridge: Overlap[];
  buriedDecks: Overlap[];
  streamCrossings: Overlap[];
  lakeRoads: Overlap[];
}

/** Kutunun yatay dörtgeni (köprü/tünel kutusu; ileri yönü olmayan kutu null). */
function planQuad(b: StructureBox): { quad: Float64Array; yaw: number } | null {
  const fh = Math.hypot(b.fx, b.fz);
  if (fh < 1e-6) return null;
  const yaw = Math.atan2(-b.rz, b.rx);
  const hz = b.hl * fh + b.hh * Math.abs(b.fy);
  return { quad: boxCorners({ x: b.x, z: b.z, hx: b.hw, hz, yaw }), yaw };
}

function yRange(b: StructureBox): [number, number] {
  const fh = Math.hypot(b.fx, b.fz) || 1;
  const rise = Math.abs(b.fy) * b.hl;
  return [b.y - b.hh / fh - rise, b.y + b.hh / fh + rise];
}

/** Doğru parçası kesişimi (a→b, c→d); kesişim noktasının a→b üzerindeki oranı ya da null. */
function segmentHit(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): number | null {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

export function auditOverlaps(
  map: SettlementMap,
  heightAt: (x: number, z: number) => number,
  water: {
    lines: ReadonlyArray<{ kind: string; xz: ArrayLike<number> }>;
    polygons: ReadonlyArray<{ kind: string; rings: ReadonlyArray<ArrayLike<number>> }>;
  } | null,
): AuditResult {
  const plan = map.plan;
  const index = new StructureIndex(plan);
  const result: AuditResult = {
    spans: plan.spans.length,
    bridgeBuilding: [],
    bridgeBridge: [],
    buriedDecks: [],
    streamCrossings: [],
    lakeRoads: [],
  };
  const label = (id: number): string => {
    const s = plan.spans[id] as RoadSpan;
    return `${s.kind === SPAN_KIND.tunnel ? 'tünel' : s.type}#${id}`;
  };

  // 1. Köprü/tünel kutusu × bina (yatay kesişim ve düşey aralık çakışması).
  for (let id = 0; id < index.count; id++) {
    const shape = index.shape(id);
    const seen = new Set<number>();
    for (const b of map.buildingsNear(shape.cx, shape.cz, shape.radius + 40)) {
      if (seen.has(b.id)) continue;
      const bs = shapeVariant(b.kind, b.floors, b.ruined);
      const footprint = boxCorners({
        x: b.x,
        z: b.z,
        hx: (BUILDING_SHAPES[b.kind].width + 0.4) / 2,
        hz: (BUILDING_SHAPES[b.kind].depth + 0.4) / 2,
        yaw: b.yaw,
      });
      for (const box of shape.boxes) {
        const q = planQuad(box);
        if (!q || !quadsOverlap(q.quad, footprint)) continue;
        const [y0, y1] = yRange(box);
        if (y1 < b.y - 1 || y0 > b.y + bs.height) continue;
        // Tünel ağzı cephesi araziden yükselir; ağız üstündeki dağ yamacında duran bina cepheyle örtüşebilir. Bilinen sınır
        // (dünyada 2 yapı; ölçüm belgesinde); tünel kutuları bu denetimden hariçtir, köprüler sayılır.
        const span = plan.spans[id] as RoadSpan;
        if (span.kind === SPAN_KIND.tunnel) continue;
        seen.add(b.id);
        result.bridgeBuilding.push({
          kind: 'köprü-bina',
          a: label(id),
          b: `${b.kind}#${b.id}`,
          x: b.x,
          z: b.z,
        });
        break;
      }
    }
  }

  // 2. Köprü/tünel × köprü/tünel (farklı yollar ya da aynı yolun ardışık olmayan yapıları).
  for (let id = 0; id < index.count; id++) {
    const sa = plan.spans[id] as RoadSpan;
    const shape = index.shape(id);
    for (const other of index.near(shape.cx, shape.cz, shape.radius + 10)) {
      if (other <= id) continue;
      const sb = plan.spans[other] as RoadSpan;
      const sameRoad = sa.road === sb.road;
      let hit = false;
      for (const a of shape.boxes) {
        const qa = planQuad(a);
        if (!qa) continue;
        const [a0, a1] = yRange(a);
        for (const b of index.shape(other).boxes) {
          const qb = planQuad(b);
          if (!qb || !quadsOverlap(qa.quad, qb.quad)) continue;
          const [b0, b1] = yRange(b);
          if (a1 < b0 || b1 < a0) continue;
          hit = true;
          break;
        }
        if (hit) break;
      }
      if (hit && !(sameRoad && Math.abs(sb.i0 - sa.i1) <= 1)) {
        const foot = (span: RoadSpan, end: 0 | 1) => {
          const road = plan.roads[span.road] as PlannedRoad;
          const at = end === 0 ? span.i0 : span.i1;
          return { x: road.xz[at * 2] as number, z: road.xz[at * 2 + 1] as number };
        };
        const junction = ([0, 1] as const).some((ea) =>
          ([0, 1] as const).some((eb) => {
            const pa = foot(sa, ea);
            const pb = foot(sb, eb);
            return Math.hypot(pa.x - pb.x, pa.z - pb.z) < 3.5;
          }),
        );
        result.bridgeBridge.push({
          kind: 'yapı-yapı',
          a: label(id),
          b: label(other),
          x: shape.cx,
          z: shape.cz,
          detail: junction ? 'junction' : sameRoad ? 'aynı yol' : 'farklı yol',
        });
      }
    }
  }

  // 3. Güverte arazide gömülü mü (köprü güvertesinin üstü, çevre arazinin altında)?
  for (let id = 0; id < index.count; id++) {
    const span = plan.spans[id] as RoadSpan;
    if (span.kind !== SPAN_KIND.bridge) continue;
    const shape = index.shape(id);
    let worst = 0;
    let at = { x: shape.cx, z: shape.cz };
    for (const b of shape.boxes) {
      // Yalnızca ince güverte ve korkuluk kutuları (kemer ayakları/istinat blokları araziye gömülü olacak şekilde tasarlıdır).
      if (!b.solid || b.footing || b.hh > 0.35) continue;
      const top = b.y + b.hh;
      const ground = heightAt(b.x, b.z);
      if (ground - top > worst) {
        worst = ground - top;
        at = { x: b.x, z: b.z };
      }
    }
    if (worst > 1) {
      result.buriedDecks.push({
        kind: 'gömülü güverte',
        a: label(id),
        b: '',
        x: at.x,
        z: at.z,
        detail: `${worst.toFixed(2)} m`,
      });
    }
  }

  // 4. Yol akarsuyu (köprü/tünel dışında) kesiyor mu; 5. yol göl içinden geçiyor mu?
  if (water) {
    const lines = water.lines.filter(
      (l) => l.kind === 'river' || l.kind === 'stream' || l.kind === 'canal',
    );
    const cell = 64;
    const key = (cx: number, cz: number) => cx * 100003 + cz;
    const grid = new Map<number, Array<[number, number, number, number, number]>>();
    lines.forEach((line, li) => {
      const xz = line.xz;
      for (let i = 0; i + 3 < xz.length; i += 2) {
        const seg: [number, number, number, number, number] = [
          xz[i] as number,
          xz[i + 1] as number,
          xz[i + 2] as number,
          xz[i + 3] as number,
          li,
        ];
        const gx0 = Math.floor(Math.min(seg[0], seg[2]) / cell);
        const gx1 = Math.floor(Math.max(seg[0], seg[2]) / cell);
        const gz0 = Math.floor(Math.min(seg[1], seg[3]) / cell);
        const gz1 = Math.floor(Math.max(seg[1], seg[3]) / cell);
        for (let gx = gx0; gx <= gx1; gx++)
          for (let gz = gz0; gz <= gz1; gz++) {
            const k = key(gx, gz);
            const list = grid.get(k);
            if (list) list.push(seg);
            else grid.set(k, [seg]);
          }
      }
    });
    const spansOfRoad = new Map<number, RoadSpan[]>();
    for (const s of plan.spans) {
      const list = spansOfRoad.get(s.road);
      if (list) list.push(s);
      else spansOfRoad.set(s.road, [s]);
    }
    plan.roads.forEach((road: PlannedRoad, ri) => {
      const spans = spansOfRoad.get(ri) ?? [];
      const n = road.xz.length / 2;
      for (let i = 0; i + 1 < n; i++) {
        // Köprü/tünel kesiminde (ayaklar dahil) kesişim serbest.
        if (spans.some((s) => i >= s.i0 - 1 && i <= s.i1)) continue;
        const ax = road.xz[i * 2] as number;
        const az = road.xz[i * 2 + 1] as number;
        const bx = road.xz[i * 2 + 2] as number;
        const bz = road.xz[i * 2 + 3] as number;
        const seen = new Set<number>();
        for (
          let gx = Math.floor(Math.min(ax, bx) / cell);
          gx <= Math.floor(Math.max(ax, bx) / cell);
          gx++
        )
          for (
            let gz = Math.floor(Math.min(az, bz) / cell);
            gz <= Math.floor(Math.max(az, bz) / cell);
            gz++
          )
            for (const seg of grid.get(key(gx, gz)) ?? []) {
              if (seen.has(seg[4])) continue;
              const t = segmentHit(ax, az, bx, bz, seg[0], seg[1], seg[2], seg[3]);
              if (t === null) continue;
              seen.add(seg[4]);
              result.streamCrossings.push({
                kind: 'köprüsüz dere kesişimi',
                a: `yol#${ri} sınıf ${road.cls}`,
                b: `${lines[seg[4]]?.kind}`,
                x: ax + (bx - ax) * t,
                z: az + (bz - az) * t,
              });
            }
      }
    });
    // Göl çokgeni içinden geçen yol noktası (köprüsüz).
    for (const poly of water.polygons) {
      const ring = poly.rings[0];
      if (!ring) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < ring.length; i += 2) {
        minX = Math.min(minX, ring[i] as number);
        maxX = Math.max(maxX, ring[i] as number);
        minZ = Math.min(minZ, ring[i + 1] as number);
        maxZ = Math.max(maxZ, ring[i + 1] as number);
      }
      plan.roads.forEach((road, ri) => {
        const spans = spansOfRoad.get(ri) ?? [];
        const n = road.xz.length / 2;
        for (let i = 0; i < n; i++) {
          const x = road.xz[i * 2] as number;
          const z = road.xz[i * 2 + 1] as number;
          if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
          if (spans.some((s) => i >= s.i0 - 1 && i <= s.i1)) continue;
          if (pointInRing(ring, x, z)) {
            result.lakeRoads.push({ kind: 'göl içinde yol', a: `yol#${ri}`, b: poly.kind, x, z });
            break;
          }
        }
      });
    }
  }
  return result;
}

function pointInRing(ring: ArrayLike<number>, x: number, z: number): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2] as number;
    const zi = ring[i * 2 + 1] as number;
    const xj = ring[j * 2] as number;
    const zj = ring[j * 2 + 1] as number;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
