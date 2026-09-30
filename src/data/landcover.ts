/**
 * Arazi örtüsü sınıfları (`landcover.bin`, bkz. CLAUDE.md "Bölge Veri Formatı").
 * Sıra sözleşmedir (tools/landcover.py `CLASSES`): değer = indeks; yalnızca sona eklenir.
 */
export const LANDCOVER_CLASSES = [
  'none',
  'forest',
  'shrub',
  'grass',
  'crop',
  'barren',
  'urban',
  'snow',
  'wetland',
] as const;

export type LandCoverClass = (typeof LANDCOVER_CLASSES)[number];

/** Sınıf adı → uint8 değeri. */
export const LANDCOVER_VALUE: Readonly<Record<LandCoverClass, number>> = Object.fromEntries(
  LANDCOVER_CLASSES.map((name, index) => [name, index]),
) as Record<LandCoverClass, number>;

/** meta.json `landcover` alanı. */
export interface LandCoverMeta {
  file: string;
  classes: readonly string[];
}

/** Sınıf tablosu bu kodun tablosuyla birebir aynı mı? (Veri ile kod ayrışırsa sessizce yanlış çalışmasın.) */
export function classesMatch(classes: readonly string[]): boolean {
  return (
    classes.length === LANDCOVER_CLASSES.length &&
    LANDCOVER_CLASSES.every((name, index) => classes[index] === name)
  );
}
