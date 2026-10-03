import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Inventory } from '../items/Inventory';
import { isFenceKind, resolveFence } from './fences';
import { isPieceKind, pieceRotation, resolvePiece } from './pieces';
import {
  aimDistanceOf,
  buildingClash,
  validatePlacement,
  type PlaceBuilding,
  type PlaceCheck,
  type PlaceFailure,
} from './placeRules';
import type { Structure, StructureKind, StructureSet } from './structures';

/** Denetleyicinin dünyaya bakışı (Three.js'siz). */
export interface PlaceWorld {
  heightAt(x: number, z: number): number;
  nearFreshWater?(x: number, z: number): boolean;
  /** Tapu kuralları (yerleşimli dünyada; `placeRules.ts` `PlaceContext`). */
  buildingAt?(x: number, z: number, margin: number): PlaceBuilding | null;
  ownedFloorNear?(x: number, z: number, reach: number): number | null;
}

/**
 * Oyuncunun ayak konumu (x, z) ve bakış yönü (yaw; kamera ile aynı sözleşme: ileri = (−sin, −cos)). `y` (ayak
 * yüksekliği) ve `pitch` (bakış eğimi, yukarı +) modüler parçaların katını seçmek içindir; yoksa zeminden varsayılır.
 */
export interface AimPose {
  x: number;
  z: number;
  yaw: number;
  y?: number;
  pitch?: number;
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
  /** Faz 11 (B): yalnızca çitlerde, uç yüksekliği farkı (oyun m; geometri bu eğimle çizilir). */
  rise?: number;
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
  /** Test modu: eşya gerekmez ve harcanmaz (yoksa hep false). */
  freeBuild?: () => boolean;
}

/** Izgara yapılarının yerleşim yapısına çakışma payı (oyun m): taban hücresi (yarım hücre) ve kenar parçaları. */
const PIECE_CLASH_MARGIN = { floor: 0.9, edge: 0.2 } as const;

/**
 * Yapı yerleştirme (saf mantık, Three.js'siz): bir tür seçilince hayalet oyuncunun önünde belirir ve her
 * adımda doğrulanır; `confirm` eşyayı envanterden düşüp yapıyı ekler. Geçersiz konumda, iptalde ya da
 * ölüyken eşya düşmez. Eşya envanterden kaybolursa (ör. atıldıysa) hedefleme kendiliğinden biter.
 */
export class PlacementController {
  private kind: StructureKind | null = null;
  private pose: AimPose | null = null;
  private current: Ghost | null = null;
  /** Hayaletin bakış yönüne göre ek dönüşü (radyan; `R` ile 90° adımlarla, Faz 9). */
  private rotation = 0;
  /** Modüler duvar/kapı iç-dış yüzü çevrik mi (`R`). */
  private flip = false;

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
    if (!this.owns(kind)) return 'no_item';
    this.kind = kind;
    this.current = null;
    this.rotation = 0;
    this.flip = false;
    if (this.pose) this.update(this.pose);
    return 'started';
  }

  cancel(): void {
    this.kind = null;
    this.current = null;
    this.rotation = 0;
    this.flip = false;
  }

  /**
   * Hayaleti döndürür (yalnızca hedeflerken); döndürdüyse true. Eski yapılar 90° adımlarla döner; modüler parçalar
   * ızgaraya kilitlidir: duvar/kapı iç-dış yüzünü çevirir (kapının menteşe yanı değişir), merdiven yönünü tersine,
   * beşik çatı mahya eksenini çevirir; taban/çatı/direk/giriş basamağı/alın duvarının yönü yuvadan gelir.
   */
  rotate(): boolean {
    if (this.kind === null) return false;
    // Faz 11 (B): çit yuvası tercihi (bakışa dik / paralel kenar) çevrilir.
    if (isFenceKind(this.kind)) {
      this.flip = !this.flip;
    } else if (isPieceKind(this.kind)) {
      if (pieceRotation(this.kind) === 'none') return false;
      this.flip = !this.flip;
    } else {
      this.rotation = (this.rotation + Math.PI / 2) % (Math.PI * 2);
    }
    if (this.pose) this.update(this.pose);
    return true;
  }

  /** Bir sabit adım: hayaleti oyuncunun önüne koyar (modüler parçalar en yakın yuvaya yapışır) ve doğrular. */
  update(pose: AimPose): void {
    this.pose = pose;
    if (this.kind === null) return;
    if (!this.deps.isAlive() || !this.owns(this.kind)) {
      this.cancel();
      return;
    }
    const spot = this.evaluate(this.kind, pose);
    this.current = {
      kind: this.kind,
      x: spot.x,
      y: spot.check.ok ? spot.check.y : spot.y,
      z: spot.z,
      yaw: spot.yaw,
      valid: spot.check.ok,
      reason: spot.check.ok ? null : spot.check.reason,
      ...(spot.rise !== undefined ? { rise: spot.rise } : {}),
    };
  }

  /** Hayaleti yapıya çevirir. Başarılıysa hedefleme biter (modüler parçada, eşya sürüyorsa hedefleme devam eder). */
  confirm(): ConfirmResult {
    const { kind, pose, current } = this;
    if (kind === null) return { ok: false, reason: 'not_aiming' };
    if (!this.deps.isAlive()) {
      this.cancel();
      return { ok: false, reason: 'dead' };
    }
    if (!pose || !current) return { ok: false, reason: 'no_target' };

    // Hayalet bir önceki adımdan kalmış olabilir: yerleştirme anında yeniden doğrula.
    const spot = this.evaluate(kind, pose);
    if (!spot.check.ok) return { ok: false, reason: spot.check.reason };
    if (!this.deps.freeBuild?.() && !this.deps.inventory.remove(kind, 1)) {
      this.cancel();
      return { ok: false, reason: 'no_item' };
    }

    const structure = this.deps.structures.add(
      kind,
      spot.x,
      spot.check.y,
      spot.z,
      spot.yaw,
      spot.rise,
    );
    this.deps.events.emit('structure:placed', {
      id: structure.id,
      kind,
      x: structure.x,
      z: structure.z,
    });
    // Modüler parçalar ve çitler art arda kurulur: eşya sürdükçe (ya da test modunda) hedefleme açık kalır.
    if ((isPieceKind(kind) || isFenceKind(kind)) && this.owns(kind)) {
      this.update(pose);
    } else {
      this.cancel();
    }
    return { ok: true, structure };
  }

  /** Yapıyı kurmaya hakkı var mı: eşyası envanterde ya da test modunda (eşyasız) serbest inşa. */
  private owns(kind: StructureKind): boolean {
    return this.deps.freeBuild?.() === true || this.deps.inventory.has(kind);
  }

  /** Hedef konum, yön ve geçerlilik: modüler parçalar ızgara yuvasına, diğerleri bakış noktasına oturur. */
  private evaluate(
    kind: StructureKind,
    pose: AimPose,
  ): { x: number; y: number; z: number; yaw: number; rise?: number; check: PlaceCheck } {
    const context = {
      heightAt: (x: number, z: number) => this.deps.world.heightAt(x, z),
      nearFreshWater: this.deps.world.nearFreshWater?.bind(this.deps.world),
      buildingAt: this.deps.world.buildingAt?.bind(this.deps.world),
      ownedFloorNear: this.deps.world.ownedFloorNear?.bind(this.deps.world),
      structures: this.deps.structures,
    };
    // Izgaraya oturan yapılar yerleşim yapısının içine/duvarına kurulmaz (tabanın hücresi yarım hücre payıyla).
    if (isPieceKind(kind)) {
      const { target, check } = resolvePiece(kind, pose, this.flip, context);
      const margin = kind === 'foundation' ? PIECE_CLASH_MARGIN.floor : PIECE_CLASH_MARGIN.edge;
      return { ...target, check: buildingClash(check, target, margin, context) };
    }
    if (isFenceKind(kind)) {
      const { target, check } = resolveFence(kind, pose, this.flip, context);
      return { ...target, check: buildingClash(check, target, PIECE_CLASH_MARGIN.edge, context) };
    }
    const distance = aimDistanceOf(kind);
    const x = pose.x - Math.sin(pose.yaw) * distance;
    const z = pose.z - Math.cos(pose.yaw) * distance;
    return {
      x,
      y: context.heightAt(x, z),
      z,
      yaw: pose.yaw + this.rotation,
      check: validatePlacement(kind, { x, z }, pose, context),
    };
  }
}
