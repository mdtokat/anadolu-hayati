import type { InputAction } from './inputMapping';

/** Oyun genelindeki olayların adı → yük tipi eşlemesi. Yeni sistemler buraya olay ekler. */
export interface GameEvents {
  'game:started': undefined;
  'game:disposed': undefined;
  'game:paused': undefined;
  'game:resumed': undefined;
  'input:pointerLockChanged': { locked: boolean };
  'input:action': { action: InputAction };
  'camera:modeChanged': { mode: 'firstPerson' | 'thirdPerson' };
}
