import { INPUT } from '../config';

/** Tek seferlik (basıldığı anda tetiklenen) eylemler. */
export type InputAction =
  | 'toggleCamera'
  | 'toggleBorders'
  | 'toggleInventory'
  | 'eat'
  | 'placeCampfire'
  | 'placeShelter'
  /** Yerleştirme hayaletini döndür (Faz 9). */
  | 'rotatePlacement'
  /** Test modunda Space'e çift basış: uçuşu aç/kapa (yalnızca Input üretir; Game test modu kapalıyken yok sayar). */
  | 'toggleFlight'
  /** Sol fare tuşu (yalnızca oyun kontrolündeyken): yerleştirme hayaleti varsa onayla, yoksa saldır. */
  | 'primaryAction'
  // ── Faz 11 (11.0; davranışı sahibi akış yazar) ──
  /** D: elde silah varken doldur (`R`; hayalet açıkken `rotatePlacement` kalır, bkz. `resolveContextAction`). */
  | 'reload'
  /** F: oyuncu ↔ drone görüşü (`Q`). */
  | 'droneView'
  /** F: drone'u eve döndür ve indir (`H`). */
  | 'droneHome'
  /** Performans göstergesini aç/kapa (`F3`). */
  | 'togglePerformance'
  /** Battle Royale haritası (`M`; yalnız maçta). */
  | 'toggleMap';

/** Tuş durumundan türetilen hareket niyeti. */
export interface MoveIntent {
  /** −1 (geri) … +1 (ileri). */
  forward: number;
  /** −1 (sol) … +1 (sağ). */
  strafe: number;
  run: boolean;
  jump: boolean;
  /** Uçuşta aşağı in (yalnızca test modu; yoksa false). */
  descend?: boolean;
}

function anyPressed(pressed: ReadonlySet<string>, codes: readonly string[]): boolean {
  return codes.some((code) => pressed.has(code));
}

/** Basılı tuşları hareket niyetine çevirir. Zıt tuşlar birbirini sıfırlar. */
export function mapKeysToIntent(pressed: ReadonlySet<string>): MoveIntent {
  const b = INPUT.bindings;
  return {
    forward: Number(anyPressed(pressed, b.forward)) - Number(anyPressed(pressed, b.backward)),
    strafe: Number(anyPressed(pressed, b.right)) - Number(anyPressed(pressed, b.left)),
    run: anyPressed(pressed, b.run),
    jump: anyPressed(pressed, b.jump),
    descend: anyPressed(pressed, b.descend),
  };
}

/** Basılan tuşa karşılık gelen tek seferlik eylem; yoksa null. */
export function actionForKey(code: string): InputAction | null {
  const bindings = INPUT.bindings;
  if ((bindings.toggleCamera as readonly string[]).includes(code)) return 'toggleCamera';
  if ((bindings.toggleBorders as readonly string[]).includes(code)) return 'toggleBorders';
  if ((bindings.toggleInventory as readonly string[]).includes(code)) return 'toggleInventory';
  if ((bindings.eat as readonly string[]).includes(code)) return 'eat';
  if ((bindings.placeCampfire as readonly string[]).includes(code)) return 'placeCampfire';
  if ((bindings.placeShelter as readonly string[]).includes(code)) return 'placeShelter';
  if ((bindings.rotatePlacement as readonly string[]).includes(code)) return 'rotatePlacement';
  if ((bindings.droneView as readonly string[]).includes(code)) return 'droneView';
  if ((bindings.droneHome as readonly string[]).includes(code)) return 'droneHome';
  if ((bindings.togglePerformance as readonly string[]).includes(code)) return 'togglePerformance';
  if ((bindings.toggleMap as readonly string[]).includes(code)) return 'toggleMap';
  return null;
}

/** Bağlama göre değişen eylemler için oyun durumu (Faz 11). */
export interface ActionContext {
  /** Yerleştirme hayaleti açık mı? */
  placing: boolean;
}

/**
 * Aynı tuşu paylaşan eylemlerin bağlam önceliği (Faz 11): `R` yerleştirme hayaleti açıkken döndürür, değilse
 * doldurur (`reload`; elde silah yoksa D yok sayar). Diğer eylemler olduğu gibi döner.
 */
export function resolveContextAction(action: InputAction, context: ActionContext): InputAction {
  if (action === 'rotatePlacement' && !context.placing) return 'reload';
  return action;
}

/** Sağ fare tuşunun `Input`'taki sözde kodu (`INPUT.bindings.aim`). */
export const MOUSE_RIGHT_CODE = 'MouseRight';

/** Kısayol tuşu → slot (0'dan; `INPUT.bindings.hotbar` sırası); kısayol tuşu değilse null. */
export function hotbarSlotForKey(code: string): number | null {
  const index = (INPUT.bindings.hotbar as readonly string[]).indexOf(code);
  return index < 0 ? null : index;
}

/**
 * `Digit1`…`Digit9` → 0…8, `Digit0` → 9 (geliştirici ışınlanma yuvası; klavye sırası); başka tuş için null.
 * Dev modunda rakamlar kısayol çubuğuyla paylaşılır: ışınlanma `T` ya da Shift basılıyken çalışır (`DEV_TELEPORT`).
 */
export function teleportSlotForKey(code: string): number | null {
  const match = /^Digit([0-9])$/.exec(code);
  if (!match) return null;
  const digit = Number(match[1]);
  return digit === 0 ? 9 : digit - 1;
}

/** Dev ışınlanması (Faz 9): bu tuş basılıyken rakamlar `TELEPORTS`'a, Shift basılıyken ilin yerlerine ışınlar. */
export const DEV_TELEPORT_KEY = 'KeyT';
