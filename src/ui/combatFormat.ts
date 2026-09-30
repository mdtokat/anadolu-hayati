import { COMBAT_HUD } from '../config';
import type { CreatureKind, CreatureState } from '../creatures/kinds';
import { CREATURE_NAMES } from '../combat/promptText';

/** Hasar vinyetinin parlaklığı (0–1): hasarla orantılı, en az `minVignette`, en çok 1. Hasar yoksa 0. */
export function vignetteStrength(amount: number): number {
  if (!(amount > 0)) return 0;
  return Math.min(Math.max(amount / COMBAT_HUD.fullVignetteDamage, COMBAT_HUD.minVignette), 1);
}

export type HitMarkerKind = 'hit' | 'kill';

/** Vuruş işareti türü: öldüren vuruş ayrı gösterilir. */
export function hitMarkerKind(killed: boolean): HitMarkerKind {
  return killed ? 'kill' : 'hit';
}

/**
 * Canlı oyuncuyu fark edince uyarı metni: yalnızca tehlikeli bir durumda (`stalk`/`chase`) ve zararsız olmayan
 * türlerde ("Tehlike: Kurt"); aksi halde null (kaçan karaca bildirim üretmez).
 */
export function noticedToast(kind: CreatureKind, state: CreatureState): string | null {
  if ((COMBAT_HUD.harmlessKinds as readonly string[]).includes(kind)) return null;
  if (!(COMBAT_HUD.dangerStates as readonly string[]).includes(state)) return null;
  return `Tehlike: ${CREATURE_NAMES[kind]}`;
}

/** Bakılan canlı için saldırı ipucu: "Sol tık: Saldır · Kurt". */
export function attackPrompt(kind: CreatureKind): string {
  return `Sol tık: Saldır · ${CREATURE_NAMES[kind]}`;
}

/** Savunma göstergesi ("Savunma %20"); savunma yoksa boş. */
export function defenseLabel(defense: number): string {
  const percent = Math.round(Math.min(Math.max(defense, 0), 1) * 100);
  return percent > 0 ? `Savunma %${percent}` : '';
}
