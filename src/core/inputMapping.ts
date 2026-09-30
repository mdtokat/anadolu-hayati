import { INPUT } from '../config';

/** Tek seferlik (basıldığı anda tetiklenen) eylemler. */
export type InputAction = 'toggleCamera' | 'toggleBorders' | 'toggleInventory' | 'eat';

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
  return null;
}

/** `Digit1`…`Digit9` → 0…8 (geliştirici ışınlanma yuvası); başka tuş için null. */
export function teleportSlotForKey(code: string): number | null {
  const match = /^Digit([1-9])$/.exec(code);
  return match ? Number(match[1]) - 1 : null;
}
