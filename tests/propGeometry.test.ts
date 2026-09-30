import { describe, expect, it } from 'vitest';
import { SCATTER } from '../src/config';
import { buildPropGeometry, triangleCount, type PropLod } from '../src/world/propGeometry';
import { PROP_KINDS, type PropKind } from '../src/world/propKinds';

const LODS: PropLod[] = ['near', 'far'];

/** Üçgen bütçeleri (kademe başına): uzak kademe, çok sayıda örnek çizildiği için çok daha ucuzdur. */
const BUDGET = { near: 330, far: 40 } as const;

describe('buildPropGeometry', () => {
  for (const kind of PROP_KINDS) {
    for (const lod of LODS) {
      it(`${kind}/${lod}: geçerli, bütçe içinde, zeminde, renkli`, () => {
        const geometry = buildPropGeometry(kind, lod);
        const position = geometry.getAttribute('position');
        const color = geometry.getAttribute('color');
        const normal = geometry.getAttribute('normal');

        expect(position.count).toBeGreaterThan(0);
        expect(position.count % 3).toBe(0); // non-indexed üçgen listesi
        expect(geometry.index).toBeNull();
        expect(color.count).toBe(position.count);
        expect(normal.count).toBe(position.count);
        expect(triangleCount(geometry)).toBeLessThanOrEqual(BUDGET[lod]);

        for (let i = 0; i < position.count; i++) {
          for (const v of [position.getX(i), position.getY(i), position.getZ(i)]) {
            expect(Number.isFinite(v)).toBe(true);
          }
          const len = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
          expect(len).toBeGreaterThan(0.99);
          expect(len).toBeLessThan(1.01);
          expect(color.getX(i)).toBeGreaterThanOrEqual(0);
          expect(color.getX(i)).toBeLessThanOrEqual(1.2);
        }

        // Ölçek: taban ölçeğinde tür boyuna yakın; zemin düzleminde (gömülme payı var).
        const height = SCATTER.kinds[kind].height;
        const box = geometry.boundingBox!;
        expect(box.min.y).toBeGreaterThanOrEqual(-0.25 * height);
        // yerde yatan dal: boy değil uzunluk `height`'la ölçeklenir
        expect(box.max.y).toBeGreaterThan(kind === 'stick' ? 0 : 0.5 * height);
        expect(box.max.y).toBeLessThan(1.3 * height + 0.5);
        geometry.dispose();
      });
    }
  }

  it('aynı tür/kademe her çağrıda aynı geometriyi verir (deterministik)', () => {
    for (const kind of ['tree_broadleaf', 'rock', 'berry_bush'] as PropKind[]) {
      const a = buildPropGeometry(kind, 'near').getAttribute('position').array;
      const b = buildPropGeometry(kind, 'near').getAttribute('position').array;
      expect(Array.from(a)).toEqual(Array.from(b));
    }
  });

  it('uzak kademe yakın kademeden en az 2 kat ucuz (ağaçlar ve çalı)', () => {
    for (const kind of ['tree_broadleaf', 'tree_conifer', 'bush', 'rock'] as PropKind[]) {
      expect(triangleCount(buildPropGeometry(kind, 'far')) * 2).toBeLessThanOrEqual(
        triangleCount(buildPropGeometry(kind, 'near')),
      );
    }
  });

  it('uzak kademesi olmayan türler yakın yarıçap içinde çizilir', () => {
    for (const kind of PROP_KINDS) {
      const spec = SCATTER.kinds[kind];
      if (!spec.farLod) expect(spec.maxDistance).toBeLessThanOrEqual(SCATTER.nearRadius);
    }
  });
});
