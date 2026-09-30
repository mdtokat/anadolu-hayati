import RAPIER from '@dimforge/rapier3d-compat';
import { FIXED_STEP, PHYSICS } from '../config';

/** Rapier ad alanı; diğer modüller paketi doğrudan import etmek yerine buradan alır. */
export { RAPIER };

let initPromise: Promise<void> | null = null;

/** Rapier WASM'ını başlatır. Birden çok kez çağrılabilir; yükleme bir kez yapılır. */
export function initPhysics(): Promise<void> {
  initPromise ??= RAPIER.init();
  return initPromise;
}

/**
 * Rapier dünyası için ince sarmalayıcı. `initPhysics()` beklendikten sonra kurulmalıdır.
 * Sabit 60 Hz adımla ilerler; adım süresi `FIXED_STEP` ile aynıdır.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;

  constructor(gravity: number = PHYSICS.gravity) {
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    this.world.timestep = FIXED_STEP;
  }

  /** Fiziği bir sabit adım ilerletir. */
  step(): void {
    this.world.step();
  }

  /** Sabit (hareketsiz) bir collider ekler. */
  addStaticCollider(desc: RAPIER.ColliderDesc): RAPIER.Collider {
    return this.world.createCollider(desc);
  }

  removeCollider(collider: RAPIER.Collider): void {
    this.world.removeCollider(collider, false);
  }

  /** WASM tarafındaki belleği serbest bırakır (kaynak temizliği kuralı). */
  dispose(): void {
    this.world.free();
  }
}
