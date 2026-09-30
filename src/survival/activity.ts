import type { MoveIntent } from '../core/inputMapping';
import type { Activity } from './vitals';

/** Oyuncu yürümeye çalışıyor mu (ileri/geri ya da yan tuşu basılı)? */
export function isMoving(intent: MoveIntent): boolean {
  return intent.forward !== 0 || intent.strafe !== 0;
}

/**
 * Bitkin oyuncu koşamaz ve zıplayamaz (`canSprint`); niyetin bu kısıtlı kopyasını verir.
 * Girdi nesnesini değiştirmez.
 */
export function gateIntent(intent: MoveIntent, canRun: boolean): MoveIntent {
  return canRun ? intent : { ...intent, run: false, jump: false };
}

/** Kısıtlanmış niyetten hayatta kalma etkinliği: dinlenme / yürüme / koşma. */
export function activityFromIntent(intent: MoveIntent): Activity {
  if (!isMoving(intent)) return 'rest';
  return intent.run ? 'run' : 'walk';
}
