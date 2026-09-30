import { INPUT } from '../config';

/** Tek seferlik (basıldığı anda tetiklenen) eylemler. */
export type InputAction = 'toggleCamera' | 'toggleBorders';

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
  return null;
}
