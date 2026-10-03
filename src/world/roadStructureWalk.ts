import { StructureIndex, type StructureBox } from './roadStructureGeometry';
import { walkBoxBlocks, type WalkBox } from './walkSolids';

/** Köprü/viyadük/tünel kutusunun yürüyen gövde için yönlü kutusu; yatay (ileri yönü olmayan) kutu null. */
export function structureWalkBox(box: StructureBox): WalkBox | null {
  const fh = Math.hypot(box.fx, box.fz);
  if (fh < 1e-6) return null;
  // Yerel x = yan yön r = (rx, rz); `walkSolids` sözleşmesi: x = (cos, −sin) → cos = rx, sin = −rz.
  return {
    cx: box.x,
    cz: box.z,
    cos: box.rx,
    sin: -box.rz,
    hx: box.hw,
    // Eğimli kutunun yatay izdüşümü: boy fh ile kısalır, kalınlık eğimle uzar.
    hz: box.hl * fh + box.hh * Math.abs(box.fy),
    bottom: box.y - box.hh / fh,
    top: box.y + box.hh / fh,
    slope: box.fy / fh,
  };
}

/**
 * Yol yapılarının (köprü, viyadük, tünel) katı kutuları yürüyen gövdeyi keser mi (korkuluk, güverte kenarı, tünel
 * ağzı cephesi ve duvarı)? Kutu listesi yapı başına tembel önbelleklenir.
 */
export class StructureWalkSolids {
  private readonly cache = new Map<number, WalkBox[]>();

  constructor(private readonly index: StructureIndex) {}

  private boxesOf(id: number): WalkBox[] {
    let list = this.cache.get(id);
    if (!list) {
      list = [];
      for (const box of this.index.shape(id).boxes) {
        if (!box.solid) continue;
        const walk = structureWalkBox(box);
        if (walk) list.push(walk);
      }
      this.cache.set(id, list);
    }
    return list;
  }

  blocks(x0: number, z0: number, x1: number, z1: number, radius: number, ground: number): boolean {
    for (const id of this.index.near(x1, z1, radius + 2)) {
      for (const box of this.boxesOf(id)) {
        if (Math.hypot(box.cx - x1, box.cz - z1) > box.hz + box.hx + radius + 0.5) continue;
        if (walkBoxBlocks(box, x0, z0, x1, z1, radius, ground)) return true;
      }
    }
    return false;
  }
}
