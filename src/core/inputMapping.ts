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
  /** Sol fare tuşu (yalnızca oyun kontrolündeyken): yerleştirme hayaleti varsa onayla, yoksa saldır. */
  | 'primaryAction';

/** Tuş durumundan türetilen hareket niyeti. */
export interface MoveIntent {
  /** −1 (geri) … +1 (ileri). */
  forward: number;
  /** −1 (sol) … +1 (sağ). */
  strafe: number;
  run: boolean;
  jump: boolean;
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
  return null;
}

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
