/**
 * Eksene hizalı yerel kutu işlemleri (saf): kesişme ve delik çıkarma. Pencere ve balkon kapısı delikleri (`windows.ts`,
 * `kinds.ts`) bunu kullanır; `kinds.ts` ↔ `windows.ts` döngüsel içe aktarması olmasın diye ayrı modüldedir.
 */

/** Eksene hizalı yerel kutu (kinds.ts `LocalBox` ile aynı alanlar). */
export interface AxisBox {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
}

/** İki kutu (yerel, eksene hizalı) kesişiyor mu (sınırda değmek kesişme sayılmaz)? */
export function boxesOverlap(a: AxisBox, b: AxisBox, eps = 1e-4): boolean {
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
export function subtractBox(box: AxisBox, hole: AxisBox): AxisBox[] {
  if (!boxesOverlap(box, hole)) return [box];
  const out: AxisBox[] = [];
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
export function subtractHoles(boxes: readonly AxisBox[], holes: readonly AxisBox[]): AxisBox[] {
  let current = [...boxes];
  for (const hole of holes) current = current.flatMap((b) => subtractBox(b, hole));
  return current;
}
