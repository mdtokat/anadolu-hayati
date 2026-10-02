import type { ItemId } from '../items/itemDefs';

/**
 * Faz 11 sözleşmesi (11.0; docs/faz-11-paralel-plan.md §3.5): ekin kimlikleri ekilen eşyanın kimliğidir (buğday
 * tohumu, mısır tohumu, kuru fasulye, patates). `FARMING.growDays` anahtarlarıyla aynıdır; yalnızca sona eklenir. C
 * (11.4) büyüme mantığını `farming/` altında yazar.
 */
export const CROP_IDS = [
  'wheat_seed',
  'corn_seed',
  'dry_beans',
  'potato',
] as const satisfies readonly ItemId[];
export type CropId = (typeof CROP_IDS)[number];

export function isCropId(value: unknown): value is CropId {
  return typeof value === 'string' && (CROP_IDS as readonly string[]).includes(value);
}
