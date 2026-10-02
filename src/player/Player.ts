import { PLAYER } from '../config';
import type { MoveIntent } from '../core/inputMapping';
import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld';
import { lerp } from '../utils/math';
import { stepFlight, stepVelocity, type Vec3 } from './movement';

const DEG_TO_RAD = Math.PI / 180;

/** Kapsül merkezinin ayak tabanından yüksekliği. */
const CENTER_OFFSET = PLAYER.height / 2;
/** Silindir kısmın yarı uzunluğu: (toplam boy − 2·yarıçap) / 2. */
const CAPSULE_HALF_HEIGHT = (PLAYER.height - 2 * PLAYER.radius) / 2;
/** Tavana çarpmayı ayırt etmek için dikey tolerans. */
const EPSILON = 1e-4;

export interface PlayerOptions {
  /** Tırmanılabilir en dik yamaç (derece). Varsayılan: PLAYER.maxSlopeDeg. */
  maxSlopeDeg?: number;
}

/**
 * Oyuncu: Rapier kinematic character controller ile çarpışma duyarlı hareket.
 * Konum "ayak tabanı" cinsindendir. Three.js'e bağımlı değildir; render katmanı
 * `renderPosition(alpha)` ile aradeğerlenmiş konumu okur.
 */
export class Player {
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;

  private previous: Vec3;
  private current: Vec3;
  private velocity: Vec3 = { x: 0, y: 0, z: 0 };
  private onGround = false;
  /** Uçuş (test modu): yerçekimi yok, dikey hareket tuşlarla; çarpışma sürer. */
  private flying = false;
  private readonly scratchCollision = new RAPIER.CharacterCollision();
  /** Bu değerin altında normal.y'ye sahip yüzeyler (maksimum eğimden dik) tırmanılamaz sayılır. */
  private readonly minClimbableNormalY: number;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly spawn: Vec3,
    options: PlayerOptions = {},
  ) {
    const world = physics.world;
    const maxSlopeDeg = options.maxSlopeDeg ?? PLAYER.maxSlopeDeg;
    this.minClimbableNormalY = Math.cos(maxSlopeDeg * DEG_TO_RAD);
    this.previous = { ...spawn };
    this.current = { ...spawn };

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawn.x,
        spawn.y + CENTER_OFFSET,
        spawn.z,
      ),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, PLAYER.radius),
      this.body,
    );

    const controller = world.createCharacterController(PLAYER.controllerOffset);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setSlideEnabled(true);
    // Tırmanma sınırı ile kayma eşiği aynı: sınırı aşan yamaçlarda oyuncu ilerleyemez ve kayar.
    controller.setMaxSlopeClimbAngle(maxSlopeDeg * DEG_TO_RAD);
    controller.setMinSlopeSlideAngle(maxSlopeDeg * DEG_TO_RAD);
    controller.enableAutostep(PLAYER.autostepHeight, PLAYER.autostepMinWidth, false);
    controller.enableSnapToGround(PLAYER.snapToGroundDistance);
    controller.setApplyImpulsesToDynamicBodies(false);
    this.controller = controller;
  }

  /** Ayak tabanı konumu (mantık adımının sonundaki gerçek konum). */
  get position(): Readonly<Vec3> {
    return this.current;
  }

  get grounded(): boolean {
    return this.onGround;
  }

  /** Uçuyor mu (test modu)? */
  get isFlying(): boolean {
    return this.flying;
  }

  /** Uçuşu açar/kapatır. Kapanınca dikey hız sıfırlanır (düşmeye yerçekimiyle başlar). */
  setFlying(on: boolean): void {
    if (this.flying === on) return;
    this.flying = on;
    this.velocity.y = 0;
  }

  /** Anlık hız (m/s). */
  get currentVelocity(): Readonly<Vec3> {
    return this.velocity;
  }

  /**
   * Bir sabit adım ilerletir. Fizik dünyası bu çağrıdan SONRA `step()` edilmelidir:
   * kinematik gövdenin yeni konumu o adımda collider'a yansır.
   */
  update(dt: number, intent: MoveIntent, yaw: number): void {
    this.velocity = this.flying
      ? stepFlight(this.velocity, intent, yaw, dt)
      : stepVelocity(this.velocity, this.onGround, intent, yaw, dt);

    const desired = {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    };
    this.controller.computeColliderMovement(this.collider, desired);
    const moved = this.controller.computedMovement();
    this.onGround = this.controller.computedGrounded();

    // Yatay hız: tırmanılabilir zeminde komut hızı korunur (Rapier yamaçta yatay mesafeyi
    // kısaltır; bunu hıza geri yazmak her adımda birikip oyuncuyu yamaca "yapıştırırdı").
    // Duvar/dik yüzeye çarpınca ya da havadayken gerçek harekete göre sönümlenir.
    if (!this.onGround || this.hitUnclimbableSurface()) {
      this.velocity.x = moved.x / dt;
      this.velocity.z = moved.z / dt;
    }
    if (this.onGround && this.velocity.y < 0) this.velocity.y = 0;
    if (this.velocity.y > 0 && moved.y < desired.y - EPSILON) this.velocity.y = 0; // tavan

    this.previous = this.current;
    this.current = {
      x: this.current.x + moved.x,
      y: this.current.y + moved.y,
      z: this.current.z + moved.z,
    };
    this.body.setNextKinematicTranslation({
      x: this.current.x,
      y: this.current.y + CENTER_OFFSET,
      z: this.current.z,
    });

    if (this.current.y < PLAYER.fallRespawnY) this.respawn();
  }

  /** Son hareket hesabında maksimum eğimden dik bir yüzeye (duvar, dik yamaç) çarpıldı mı? */
  private hitUnclimbableSurface(): boolean {
    const count = this.controller.numComputedCollisions();
    for (let i = 0; i < count; i++) {
      const hit = this.controller.computedCollision(i, this.scratchCollision);
      // normal1: yüzey normali (zemin ≈ +Y, duvar ≈ yatay, tavan ≈ −Y); tavan ayrıca ele alınır.
      if (hit && hit.normal1.y >= 0 && hit.normal1.y < this.minClimbableNormalY) return true;
    }
    return false;
  }

  /** İki mantık adımı arasında aradeğerlenmiş görsel konum (ayak tabanı). */
  renderPosition(alpha: number): Vec3 {
    return {
      x: lerp(this.previous.x, this.current.x, alpha),
      y: lerp(this.previous.y, this.current.y, alpha),
      z: lerp(this.previous.z, this.current.z, alpha),
    };
  }

  /** Doğma noktasına ışınlar ve hızı sıfırlar. */
  respawn(): void {
    this.teleport(this.spawn);
  }

  /** Ayak tabanı `position`'a ışınlar ve hızı sıfırlar (fizik dünyasında collider hazır olmalı). */
  teleport(position: Vec3): void {
    this.previous = { ...position };
    this.current = { ...position };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.onGround = false;
    const center = { x: position.x, y: position.y + CENTER_OFFSET, z: position.z };
    this.body.setTranslation(center, true);
    this.body.setNextKinematicTranslation(center);
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeCollider(this.collider, false);
    this.physics.world.removeRigidBody(this.body);
  }
}
