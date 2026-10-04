import { balconyLayout } from './balconies';
import {
  ROOMS,
  SHAPE_DIMS,
  WALL_THICKNESS,
  mosqueOffset,
  storeyPlanOf,
  type BuildingKind,
  type LocalBox,
} from './kinds';

/**
 * Girilebilir yapıların camlı pencereleri (saf; kullanıcı talimatları: "binaların içindeyken camdan dışarısı görünsün,
 * ateş edince cam kırılsın"; "yüksek katlı binaların üst katlarında da camlar olsun"). Katlı yapılarda (konak,
 * apartman, maden lojmanı, hükümet konağı) her katın pencereleri camlıdır; apartmanın ön cephesinde üst kat pencereleri
 * balkon kapılarına (`balconies.ts`) yer bırakır. Tek kaynak: görsel geometri (`world/buildingGeometry.ts`) bu pencerelerde duvarı
 * deler ve içten kasa çizer, cam katmanı (`world/GlassLayer.ts`) camı çizer, mermi (`combat/shotSolids.ts`) duvarın
 * katı kutusunu pencerede deler (mermi camdan geçer, camı kırar). Oyuncu collider'ı (Rapier) delinmez: pencereden
 * geçilmez.
 *
 * Konumlar yerel uzaydadır (zemin katı döşemesi y = 0, ön yüz +z) ve camilerin harim kayması (`mosqueOffset`)
 * dahildir; geometri kaymadan önce çizdiği için `withoutOffset` ile karşılaştırır.
 */

export type WindowFace = 'front' | 'back' | 'left' | 'right';

/** Bir cephedeki pencere sırası: `span` cephe uzunluğu, satır başına `cols` pencere, `size` [genişlik, yükseklik]. */
interface WindowRow {
  face: WindowFace;
  span: number;
  rows: readonly number[];
  cols: number;
  size: readonly [number, number];
  /** Bu yerel konumlara (kapılar) yakın alt satır pencereleri atlanır (`windows()` ile aynı kural). */
  avoid?: readonly number[];
  /** Duvar dikdörtgeni (çıkmalı üst katta zemin kattan büyük); yoksa yapının ölçüsü. */
  walls?: { w: number; d: number };
}

/** Tek pencere camı: duvarın orta düzleminde, eksene hizalı ince kutu (yerel). */
export interface WindowPane {
  /** Yapı içindeki sıra (kırık cam kimliği `paneId`). */
  index: number;
  face: WindowFace;
  /** Merkez (yerel; caminin harim kayması dahil). */
  cx: number;
  cy: number;
  cz: number;
  /** Cam genişliği ve yüksekliği (oyun m). */
  w: number;
  h: number;
}

/** Bir yapıda en çok pencere sayısı: kırık cam kimliği `yapı · 128 + sıra` (oturumluk; kayda girmez). */
export const MAX_PANES = 128;

/** Kırık cam kimliği. */
export function paneId(buildingId: number, index: number): number {
  return buildingId * MAX_PANES + index;
}

/** Katlı yapının üst kat pencere satırları (görsel `windows()` çağrılarıyla aynı düzen; `buildingGeometry.ts`). */
function upperRowsOf(kind: BuildingKind, floors: number | undefined): WindowRow[] {
  const D = SHAPE_DIMS;
  const plan = storeyPlanOf(kind, floors);
  if (!plan) return [];
  switch (kind) {
    case 'konak': {
      const { w, d } = D.konak;
      const over = ROOMS.konak!.over ?? 0;
      const walls = { w: w + over, d: d + over };
      const rows = [ROOMS.konak!.room + 0.7];
      const size = [0.7, 1.2] as const;
      return [
        { face: 'front', span: w + over, rows, cols: 5, size, walls },
        { face: 'left', span: d + over, rows, cols: 3, size, walls },
        { face: 'right', span: d + over, rows, cols: 3, size, walls },
        { face: 'back', span: w + over, rows, cols: 4, size, walls },
      ];
    }
    case 'apartment': {
      const { w, d } = D.apartment;
      const doors = balconyLayout(kind, plan, w, d)
        .filter((b) => b.level === 1)
        .map((b) => b.doorX);
      const out: WindowRow[] = [];
      for (let k = 1; k < plan.storeys; k++) {
        const rows = [(plan.floorY[k] as number) + 0.9];
        const size = [1.1, 1.2] as const;
        out.push(
          { face: 'front', span: w, rows, cols: 4, size, avoid: doors },
          { face: 'back', span: w, rows, cols: 4, size },
          { face: 'left', span: d, rows, cols: 2, size: [1, 1.2] },
          { face: 'right', span: d, rows, cols: 2, size: [1, 1.2] },
        );
      }
      return out;
    }
    case 'lojman': {
      const size = [0.8, 1] as const;
      return [
        { face: 'front', span: D.lojman.w, rows: [3.4], cols: 6, size },
        { face: 'back', span: D.lojman.w, rows: [3.4], cols: 6, size },
      ];
    }
    case 'government': {
      const { w, d } = D.government;
      const size = [0.9, 1.6] as const;
      return [
        { face: 'front', span: w, rows: [4], cols: 7, size },
        { face: 'back', span: w, rows: [4], cols: 7, size },
        { face: 'left', span: d, rows: [4], cols: 3, size },
        { face: 'right', span: d, rows: [4], cols: 3, size },
      ];
    }
    default:
      return [];
  }
}

function rowsOf(kind: BuildingKind): WindowRow[] {
  const D = SHAPE_DIMS;
  switch (kind) {
    case 'house': {
      const { w, d } = D.house;
      const size = [0.85, 1.15] as const;
      return [
        { face: 'front', span: w, rows: [1.05], cols: 3, size, avoid: [ROOMS.house!.doorX] },
        { face: 'left', span: d, rows: [1.05], cols: 2, size },
      ];
    }
    case 'konak': {
      const { w } = D.konak;
      return [
        {
          face: 'front',
          span: w,
          rows: [1],
          cols: 2,
          size: [0.6, 0.8],
          avoid: [ROOMS.konak!.doorX],
        },
      ];
    }
    case 'apartment': {
      const { w } = D.apartment;
      const size = [1.1, 1.2] as const;
      return [
        { face: 'back', span: w, rows: [0.9], cols: 4, size },
        {
          face: 'front',
          span: w,
          rows: [0.9],
          cols: 4,
          size,
          avoid: [ROOMS.apartment!.doorX],
        },
      ];
    }
    case 'lojman':
      return [{ face: 'back', span: D.lojman.w, rows: [0.9], cols: 6, size: [0.8, 1] }];
    case 'kahvehane':
      return [{ face: 'front', span: D.kahvehane.w, rows: [0.8], cols: 2, size: [1.8, 1.4] }];
    case 'government': {
      const { w, d } = D.government;
      const size = [0.9, 1.6] as const;
      return [
        { face: 'back', span: w, rows: [1], cols: 7, size },
        { face: 'left', span: d, rows: [1], cols: 3, size },
        { face: 'right', span: d, rows: [1], cols: 3, size },
      ];
    }
    case 'mosque_grand':
    case 'mosque': {
      const s = D[kind];
      const n = kind === 'mosque_grand' ? 4 : 3;
      const size = [0.9, 1.6] as const;
      return [
        { face: 'left', span: s.d, rows: [1.4, s.h * 0.62], cols: n, size },
        { face: 'right', span: s.d, rows: [1.4, s.h * 0.62], cols: n, size },
        { face: 'back', span: s.w, rows: [s.h * 0.62], cols: n, size },
      ];
    }
    case 'mosque_wooden': {
      const s = D.mosque_wooden;
      const size = [0.8, 1.2] as const;
      return [
        { face: 'left', span: s.d, rows: [1.4], cols: 3, size },
        { face: 'right', span: s.d, rows: [1.4], cols: 3, size },
      ];
    }
    default:
      return [];
  }
}

/** Yapının duvar ölçüsü (genişlik, derinlik): pencereler bu dikdörtgenin duvarlarındadır. */
function wallsOf(kind: BuildingKind): { w: number; d: number } | null {
  const dims = SHAPE_DIMS[kind] as { w: number; d: number };
  return dims ? { w: dims.w, d: dims.d } : null;
}

const cache = new Map<string, readonly WindowPane[]>();

/**
 * Yapının camlı pencereleri (yerel, harim kayması dahil); camsız türde boş. Katlı yapıda üst katlarınki de (apartmanda
 * kat sayısı `floors`; yıkık katlı yapının yalnız zemin katı olduğundan çağıran yıkıkta camları hiç kullanmaz).
 * Önbellekli.
 */
export function windowPanes(kind: BuildingKind, floors?: number): readonly WindowPane[] {
  const key = kind === 'apartment' ? `${kind}:${floors ?? SHAPE_DIMS.apartment.floors}` : kind;
  const hit = cache.get(key);
  if (hit) return hit;
  const panes: WindowPane[] = [];
  const base = wallsOf(kind);
  const oz = mosqueOffset(kind);
  if (base) {
    const t = WALL_THICKNESS;
    for (const row of [...rowsOf(kind), ...upperRowsOf(kind, floors)]) {
      const walls = row.walls ?? base;
      const [ww, wh] = row.size;
      for (let r = 0; r < row.rows.length; r++) {
        for (let c = 0; c < row.cols; c++) {
          const along = -row.span / 2 + (row.span / row.cols) * (c + 0.5);
          if (r === 0 && (row.avoid ?? []).some((a) => Math.abs(a - along) < ww / 2 + 0.9)) {
            continue;
          }
          const cy = (row.rows[r] as number) + wh / 2;
          const zMid = walls.d / 2 - t / 2;
          const xMid = walls.w / 2 - t / 2;
          const center =
            row.face === 'front'
              ? { cx: along, cz: zMid }
              : row.face === 'back'
                ? { cx: along, cz: -zMid }
                : row.face === 'left'
                  ? { cx: -xMid, cz: along }
                  : { cx: xMid, cz: along };
          panes.push({
            index: panes.length,
            face: row.face,
            cx: center.cx,
            cy,
            cz: center.cz + oz,
            w: ww,
            h: wh,
          });
        }
      }
    }
  }
  if (panes.length > MAX_PANES) throw new Error(`${kind}: ${panes.length} pencere > ${MAX_PANES}`);
  cache.set(key, panes);
  return panes;
}

/**
 * Camın duvarı delen hacmi (yerel kutu): cam dikdörtgeni, duvar normali boyunca duvar kalınlığı + `pad` kadar
 * (dış pencere levhası ve iç sıva da delinsin).
 */
export function paneHole(pane: WindowPane, pad = 0.12): LocalBox {
  const half = WALL_THICKNESS / 2 + pad;
  const alongX = pane.face === 'front' || pane.face === 'back';
  return {
    cx: pane.cx,
    cy: pane.cy,
    cz: pane.cz,
    hx: alongX ? pane.w / 2 : half,
    hy: pane.h / 2,
    hz: alongX ? half : pane.w / 2,
  };
}

/** Kutu (yerel) caminin harim kayması olmadan: geometri kaymadan önce kurulduğundan onunla karşılaştırılır. */
export function withoutOffset(box: LocalBox, kind: BuildingKind): LocalBox {
  const oz = mosqueOffset(kind);
  return oz === 0 ? box : { ...box, cz: box.cz - oz };
}

export { boxesOverlap, subtractBox, subtractHoles } from './boxMath';
