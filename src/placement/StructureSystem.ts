import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { StructureSet } from './structures';

/** Yapıları sabit adımda ilerletir (ateş yakıtı) ve `structure:extinguished` yayınlar. */
export class StructureSystem {
  constructor(
    private readonly events: EventBus<GameEvents>,
    readonly structures: StructureSet = new StructureSet(),
  ) {}

  update(dt: number): void {
    for (const id of this.structures.update(dt)) {
      this.events.emit('structure:extinguished', { id });
    }
  }
}
