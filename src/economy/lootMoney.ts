import { ECONOMY } from '../config';
import type { BuildingKind } from '../settlements/kinds';
import { createRandom, seedFrom } from '../utils/random';

/** Kasası olan yapılar (dükkân, kahvehane, han): para `ECONOMY.loot.shopScale` kat. */
const TILLS: ReadonlySet<BuildingKind> = new Set<BuildingKind>(['shop_row', 'kahvehane', 'han']);

/**
 * Aramada bulunan para (₺; saf, deterministik): aynı kap/yapı her oyunda aynı parayı verir. `target`: kapıdan aranan
 * yapı ya da bina içi kap; `id` kayıt kimliğidir (yapı ya da `containerId`).
 */
export function searchMoney(
  target: 'door' | 'container',
  id: number,
  building: { kind: BuildingKind; ruined: boolean },
): number {
  const L = ECONOMY.loot;
  const random = createRandom(seedFrom(L.seed, id, target === 'door' ? 1 : 2));
  const chance = target === 'door' ? L.doorChance : L.containerChance;
  if (random.next() >= chance * (building.ruined ? L.ruinedScale : 1)) return 0;
  const min = target === 'door' ? L.doorMin : L.containerMin;
  const max = target === 'door' ? L.doorMax : L.containerMax;
  const scale = TILLS.has(building.kind) ? L.shopScale : 1;
  const raw = (min + random.next() * (max - min)) * scale;
  return Math.max(L.step, Math.round(raw / L.step) * L.step);
}
