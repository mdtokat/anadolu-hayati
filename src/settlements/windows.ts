import {
  ROOMS,
  SHAPE_DIMS,
  WALL_THICKNESS,
  mosqueOffset,
  type BuildingKind,
  type LocalBox,
} from './kinds';

/**
 * Girilebilir yapıların camlı pencereleri (saf; kullanıcı talimatı: "binaların içindeyken camdan dışarısı görünsün,
 * ateş edince cam kırılsın"). Tek kaynak: görsel geometri (`world/buildingGeometry.ts`) bu pencerelerde duvarı
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

/** Bir yapıda en çok pencere sayısı: kırık cam kimliği `yapı · 64 + sıra`. */
export const MAX_PANES = 64;

/** Kırık cam kimliği. */
export function paneId(buildingId: number, index: number): number {
  return buildingId * MAX_PANES + index;
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

const cache = new Map<BuildingKind, readonly WindowPane[]>();

/** Yapı türünün camlı pencereleri (yerel, harim kayması dahil); camsız türde boş. Önbellekli. */
export function windowPanes(kind: BuildingKind): readonly WindowPane[] {
  const hit = cache.get(kind);
  if (hit) return hit;
  const panes: WindowPane[] = [];
  const walls = wallsOf(kind);
  const oz = mosqueOffset(kind);
  if (walls) {
    const t = WALL_THICKNESS;
    for (const row of rowsOf(kind)) {
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
  cache.set(kind, panes);
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

/** İki kutu (yerel, eksene hizalı) kesişiyor mu (sınırda değmek kesişme sayılmaz)? */
export function boxesOverlap(a: LocalBox, b: LocalBox, eps = 1e-4): boolean {
  return (
    Math.abs(a.cx - b.cx) < a.hx + b.hx - eps &&
    Math.abs(a.cy - b.cy) < a.hy + b.hy - eps &&
    Math.abs(a.cz - b.cz) < a.hz + b.hz - eps
  );
}

/**
 * Kutudan (eksene hizalı) delik kutusunu çıkarır: en çok 6 parça kalır (önce x, sonra y, sonra z dilimleri).
 * Kesişmiyorsa kutunun kendisi döner.
 */
export function subtractBox(box: LocalBox, hole: LocalBox): LocalBox[] {
  if (!boxesOverlap(box, hole)) return [box];
  const out: LocalBox[] = [];
  let x0 = box.cx - box.hx;
  let x1 = box.cx + box.hx;
  let y0 = box.cy - box.hy;
  let y1 = box.cy + box.hy;
  const z0 = box.cz - box.hz;
  const z1 = box.cz + box.hz;
  const push = (a0: number, a1: number, b0: number, b1: number, c0: number, c1: number) => {
    if (a1 - a0 > 1e-4 && b1 - b0 > 1e-4 && c1 - c0 > 1e-4) {
      out.push({
        cx: (a0 + a1) / 2,
        cy: (b0 + b1) / 2,
        cz: (c0 + c1) / 2,
        hx: (a1 - a0) / 2,
        hy: (b1 - b0) / 2,
        hz: (c1 - c0) / 2,
      });
    }
  };
  const hx0 = hole.cx - hole.hx;
  const hx1 = hole.cx + hole.hx;
  const hy0 = hole.cy - hole.hy;
  const hy1 = hole.cy + hole.hy;
  const hz0 = hole.cz - hole.hz;
  const hz1 = hole.cz + hole.hz;
  if (hx0 > x0) push(x0, hx0, y0, y1, z0, z1);
  if (hx1 < x1) push(hx1, x1, y0, y1, z0, z1);
  x0 = Math.max(x0, hx0);
  x1 = Math.min(x1, hx1);
  if (hy0 > y0) push(x0, x1, y0, hy0, z0, z1);
  if (hy1 < y1) push(x0, x1, hy1, y1, z0, z1);
  y0 = Math.max(y0, hy0);
  y1 = Math.min(y1, hy1);
  if (hz0 > z0) push(x0, x1, y0, y1, z0, hz0);
  if (hz1 < z1) push(x0, x1, y0, y1, hz1, z1);
  return out;
}

/** Kutulardan tüm delikleri çıkarır. */
export function subtractHoles(boxes: readonly LocalBox[], holes: readonly LocalBox[]): LocalBox[] {
  let current = [...boxes];
  for (const hole of holes) current = current.flatMap((b) => subtractBox(b, hole));
  return current;
}
