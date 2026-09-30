import { PLACEMENT } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Inventory } from '../items/Inventory';
import { validatePlacement, type PlaceFailure } from './placeRules';
import type { Structure, StructureKind, StructureSet } from './structures';

/** Denetleyicinin dünyaya bakışı (Three.js'siz). */
export interface PlaceWorld {
  heightAt(x: number, z: number): number;
  nearFreshWater?(x: number, z: number): boolean;
}

/** Oyuncunun ayak konumu (x, z) ve bakış yönü (yaw; kamera ile aynı sözleşme: ileri = (−sin, −cos)). */
export interface AimPose {
  x: number;
  z: number;
  yaw: number;
}

/** Yerleştirme hayaleti: hedef nokta, zemin yüksekliği ve geçerlilik. */
export interface Ghost {
  kind: StructureKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  valid: boolean;
  /** Geçersizse nedeni. */
  reason: PlaceFailure | null;
}

export type ToggleResult = 'started' | 'cancelled' | 'no_item' | 'dead';

export type ConfirmFailure = PlaceFailure | 'not_aiming' | 'no_target' | 'no_item' | 'dead';
export type ConfirmResult =
  { ok: true; structure: Readonly<Structure> } | { ok: false; reason: ConfirmFailure };

export interface PlacementDeps {
  events: EventBus<GameEvents>;
  inventory: Inventory;
  structures: StructureSet;
  world: PlaceWorld;
  isAlive: () => boolean;
}

/**
 * Yapı yerleştirme (saf mantık, Three.js'siz): bir tür seçilince hayalet oyuncunun önünde belirir ve her
 * adımda doğrulanır; `confirm` eşyayı envanterden düşüp yapıyı ekler. Geçersiz konumda, iptalde ya da
 * ölüyken eşya düşmez. Eşya envanterden kaybolursa (ör. atıldıysa) hedefleme kendiliğinden biter.
 */
export class PlacementController {
  private kind: StructureKind | null = null;
  private pose: AimPose | null = null;
  private current: Ghost | null = null;

  constructor(private readonly deps: PlacementDeps) {}

  get aiming(): StructureKind | null {
    return this.kind;
  }

  get ghost(): Readonly<Ghost> | null {
    return this.current;
  }

  /** Aynı türe basılırsa iptal eder; başka türe basılırsa o türe geçer. */
  toggle(kind: StructureKind): ToggleResult {
    if (this.kind === kind) {
      this.cancel();
      return 'cancelled';
    }
    if (!this.deps.isAlive()) return 'dead';
    if (!this.deps.inventory.has(kind)) return 'no_item';
    this.kind = kind;
    this.current = null;
    if (this.pose) this.update(this.pose);
    return 'started';
  }

  cancel(): void {
    this.kind = null;
    this.current = null;
  }

  /** Bir sabit adım: hayaleti oyuncunun önüne koyar ve doğrular. */
  update(pose: AimPose): void {
    this.pose = pose;
    if (this.kind === null) return;
    if (!this.deps.isAlive() || !this.deps.inventory.has(this.kind)) {
      this.cancel();
      return;
    }
    const target = this.targetFor(pose);
    const check = this.check(this.kind, target, pose);
    this.current = {
      kind: this.kind,
      x: target.x,
      y: this.deps.world.heightAt(target.x, target.z),
      z: target.z,
      yaw: pose.yaw,
      valid: check.ok,
      reason: check.ok ? null : check.reason,
    };
  }

  /** Hayaleti yapıya çevirir. Başarılıysa hedefleme biter. */
  confirm(): ConfirmResult {
    const { kind, pose, current } = this;
    if (kind === null) return { ok: false, reason: 'not_aiming' };
    if (!this.deps.isAlive()) {
      this.cancel();
      return { ok: false, reason: 'dead' };
    }
    if (!pose || !current) return { ok: false, reason: 'no_target' };

    // Hayalet bir önceki adımdan kalmış olabilir: yerleştirme anında yeniden doğrula.
    const check = this.check(kind, current, pose);
    if (!check.ok) return { ok: false, reason: check.reason };
    if (!this.deps.inventory.remove(kind, 1)) {
      this.cancel();
      return { ok: false, reason: 'no_item' };
    }

    const structure = this.deps.structures.add(kind, current.x, check.y, current.z, current.yaw);
    this.deps.events.emit('structure:placed', {
      id: structure.id,
      kind,
      x: structure.x,
      z: structure.z,
    });
    this.cancel();
    return { ok: true, structure };
  }

  private targetFor(pose: AimPose): { x: number; z: number } {
    return {
      x: pose.x - Math.sin(pose.yaw) * PLACEMENT.aimDistance,
      z: pose.z - Math.cos(pose.yaw) * PLACEMENT.aimDistance,
    };
  }

  private check(kind: StructureKind, target: { x: number; z: number }, pose: AimPose) {
    return validatePlacement(kind, target, pose, {
      heightAt: (x, z) => this.deps.world.heightAt(x, z),
      nearFreshWater: this.deps.world.nearFreshWater?.bind(this.deps.world),
      structures: this.deps.structures,
    });
  }
}
