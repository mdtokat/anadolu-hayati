import { PROP_SOLIDS } from '../config';
import type { PropKind } from './propKinds';

/** Katı bir nesnenin gövdesi: dikey silindir (yarıçap ve boy, oyun m). */
export interface PropSolid {
  radius: number;
  height: number;
}

/** En büyük katı yarıçap (ölçek payıyla); uzamsal sorgularda arama payı. */
export const MAX_PROP_SOLID_RADIUS =
  Math.max(...Object.values(PROP_SOLIDS.kinds).map((k) => k?.radius ?? 0)) * 2.4;

/** Nesne türü ve ölçeği için katı gövde; geçilebilir türler (dal, taş, mantar) için null. */
export function propSolid(kind: PropKind, scale: number): PropSolid | null {
  const spec = PROP_SOLIDS.kinds[kind];
  if (!spec) return null;
  return {
    radius: Math.max(spec.radius * scale, PROP_SOLIDS.minRadius),
    height: spec.scaleHeight ? spec.height * scale : spec.height,
  };
}
