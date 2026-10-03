import { BUILDING_LOOK } from '../config';
import { solidBoxes, localToWorld } from '../placement/structureShapes';
import type { StructureSet } from '../placement/structures';
import {
  BUILDING_SHAPES,
  shapeVariant,
  type BuildingKind,
  type LocalBox,
} from '../settlements/kinds';
import { paneHole, paneId, subtractHoles, windowPanes } from '../settlements/windows';
import type { Building } from '../settlements/layout';
import type { SettlementMap } from '../settlements/SettlementMap';
import type { PaneBox, PaneQuery, SolidBox, SolidQuery } from './ballistics';

/**
 * Mermiyi durduran katılar (Faz 11.5, saf): oyuncu yapılarının katı kutuları (`placement/structureShapes.ts`
 * `solidBoxes`: duvar, sandık, tezgâh, kapalı kapı, çit…) ve yerleşim binalarının katı kutuları + taş temeli
 * (`BUILDING_SHAPES.solids`; Rapier collider'larıyla aynı kutular). Uzaklıktan bağımsızdır (collider'lar yalnızca
 * oyuncunun yakınında kurulur, burada her bina sayılır). Köprü güvertesi ve tünel duvarları sayılmaz (bilinen sınır).
 */

/** Binaların en büyük yarı köşegeni payı (oyun m): merkezi aramanın dışında kalan büyük yapının kutusu kaçmasın. */
const BUILDING_MARGIN = 40;

export function shotSolids(
  structures: Pick<StructureSet, 'near'> | null,
  settlements: Pick<SettlementMap, 'buildingsNear'> | null,
): SolidQuery {
  const cache = new WeakMap<Building, readonly SolidBox[]>();
  return {
    boxesNear(x, z, r) {
      const out: SolidBox[] = [];
      if (structures) {
        for (const s of structures.near(x, z, r + 4)) {
          for (const b of solidBoxes(s.kind, s.open === true)) {
            const c = localToWorld(s, b.cx, b.cz);
            out.push({
              x: c.x,
              z: c.z,
              hx: b.hx,
              hz: b.hz,
              yaw: s.yaw,
              y0: s.y + b.cy - b.hy,
              y1: s.y + b.cy + b.hy,
            });
          }
        }
      }
      if (settlements) {
        for (const b of settlements.buildingsNear(x, z, r + BUILDING_MARGIN)) {
          let list = cache.get(b);
          if (!list) {
            list = buildingSolids(b);
            cache.set(b, list);
          }
          out.push(...list);
        }
      }
      return out;
    },
  };
}

/** Türün mermi katıları: camlı pencerelerde duvar delinir (mermi camdan geçer; `settlements/windows.ts`). */
const holedSolids = new Map<string, readonly LocalBox[]>();
function solidsOf(kind: BuildingKind, ruined: boolean, floors: number): readonly LocalBox[] {
  const solids = shapeVariant(kind, floors, ruined).solids;
  if (ruined) return solids;
  const key = `${kind}:${floors}`;
  let list = holedSolids.get(key);
  if (!list) {
    const holes = windowPanes(kind, floors).map((pane) => paneHole(pane));
    list = holes.length > 0 ? subtractHoles(solids, holes) : solids;
    holedSolids.set(key, list);
  }
  return list;
}

/** Bir binanın katı kutuları (dünya): `BUILDING_SHAPES.solids` (pencereler delik) + yamaçtaki taş temel. */
export function buildingSolids(b: Building): SolidBox[] {
  const shape = BUILDING_SHAPES[b.kind];
  const out: SolidBox[] = solidsOf(b.kind, b.ruined, b.floors).map((box) => {
    const c = localToWorld(b, box.cx, box.cz);
    return {
      x: c.x,
      z: c.z,
      hx: box.hx,
      hz: box.hz,
      yaw: b.yaw,
      y0: b.y + box.cy - box.hy,
      y1: b.y + box.cy + box.hy,
    };
  });
  const rise = b.y - b.base;
  if (rise > 0.2) {
    out.push({
      x: b.x,
      z: b.z,
      hx: shape.width * 0.49,
      hz: shape.depth * 0.49,
      yaw: b.yaw,
      y0: b.base - BUILDING_LOOK.plinthSink,
      y1: b.y,
    });
  }
  return out;
}

/** Cam levhasının mermi kalınlığı (yarım; oyun m). */
const PANE_HALF = 0.05;

/** Bir binanın camları (dünya; yıkık yapıda yok). Kimlik `paneId(yapı, sıra)`. */
export function buildingPanes(b: Building): PaneBox[] {
  if (b.ruined) return [];
  return windowPanes(b.kind, b.floors).map((pane) => {
    const c = localToWorld(b, pane.cx, pane.cz);
    const alongX = pane.face === 'front' || pane.face === 'back';
    return {
      id: paneId(b.id, pane.index),
      x: c.x,
      z: c.z,
      hx: alongX ? pane.w / 2 : PANE_HALF,
      hz: alongX ? PANE_HALF : pane.w / 2,
      yaw: b.yaw,
      y0: b.y + pane.cy - pane.h / 2,
      y1: b.y + pane.cy + pane.h / 2,
    };
  });
}

/** Kırılmamış camlar (yerleşim binaları); `broken` kırık cam kimlikleri. */
export function shotPanes(
  settlements: Pick<SettlementMap, 'buildingsNear'> | null,
  broken: ReadonlySet<number>,
): PaneQuery {
  const cache = new WeakMap<Building, readonly PaneBox[]>();
  return {
    panesNear(x, z, r) {
      const out: PaneBox[] = [];
      if (!settlements) return out;
      for (const b of settlements.buildingsNear(x, z, r + BUILDING_MARGIN)) {
        let list = cache.get(b);
        if (!list) {
          list = buildingPanes(b);
          cache.set(b, list);
        }
        for (const pane of list) if (!broken.has(pane.id)) out.push(pane);
      }
      return out;
    },
  };
}
