import type { InputAction } from './inputMapping';

/** Oyun genelindeki olayların adı → yük tipi eşlemesi. Yeni sistemler buraya olay ekler. */
export interface GameEvents {
  'game:started': undefined;
  'game:disposed': undefined;
  'game:paused': undefined;
  'game:resumed': undefined;
  'input:pointerLockChanged': { locked: boolean };
  'input:pointerLockFailed': undefined;
  'input:action': { action: InputAction };
  'time:nightStarted': { day: number };
  'time:dayStarted': { day: number };
  'camera:modeChanged': { mode: 'firstPerson' | 'thirdPerson' };
}
