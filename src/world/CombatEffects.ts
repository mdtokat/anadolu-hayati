import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  RingGeometry,
  ShaderMaterial,
} from 'three';
import { COMBAT_FX } from '../config';
import type { SwingStyle } from '../player/heldKinds';

/**
 * Savaş efektleri (dünya uzayı; hepsi ışıksız): **ateşli silah** = ağız alevi + kıvılcım + duman bulutu (`muzzle`);
 * **yakın dövüş** = savurma yayı / saplama çizgisi + darbe kıvılcımı (`swing`, `impact`). İki ayrı parçacık katmanı
 * (alev/kıvılcım toplamalı, duman normal karışım) ve küçük bir yay havuzu: en çok birkaç draw call. Oyuncu ve eşkıya
 * aynı efektleri kullanır, böylece "ateş edildi" / "vuruldu" sahnede okunur.
 */

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Parçacık doğurma parametreleri. */
export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size0: number;
  size1: number;
  color: number;
  alpha: number;
  /** Hız sönümü (1/sn) ve yerçekimi ivmesi (oyun m/sn², yukarı pozitif; duman için küçük pozitif = yükselir). */
  drag?: number;
  lift?: number;
}

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 256.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAGMENT = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float a = vColor.a * smoothstep(1.0, 0.15, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
  }
`;

/** Tek `Points` nesnesi (tek draw call) olarak çizilen sabit kapasiteli parçacık havuzu. */
export class ParticleLayer {
  readonly points: Points;
  private readonly capacity: number;
  private readonly positions: Float32Array;
  private readonly sizes: Float32Array;
  private readonly colors: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly rgb: Float32Array;
  private readonly drag: Float32Array;
  private readonly lift: Float32Array;
  private readonly material: ShaderMaterial;
  private next = 0;

  constructor(capacity: number, additive: boolean, name: string) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.colors = new Float32Array(capacity * 4);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity).fill(Infinity);
    this.life = new Float32Array(capacity).fill(1);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.rgb = new Float32Array(capacity * 3);
    this.drag = new Float32Array(capacity);
    this.lift = new Float32Array(capacity);
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage),
    );
    geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aColor', new BufferAttribute(this.colors, 4).setUsage(DynamicDrawUsage));
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(geometry, this.material);
    this.points.name = name;
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.points.visible = false;
  }

  spawn(p: ParticleSpec): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const c = new Color(p.color);
    this.positions[i * 3] = p.x;
    this.positions[i * 3 + 1] = p.y;
    this.positions[i * 3 + 2] = p.z;
    this.vel[i * 3] = p.vx ?? 0;
    this.vel[i * 3 + 1] = p.vy ?? 0;
    this.vel[i * 3 + 2] = p.vz ?? 0;
    this.age[i] = 0;
    this.life[i] = Math.max(p.life, 0.01);
    this.size0[i] = p.size0;
    this.size1[i] = p.size1;
    this.alpha0[i] = p.alpha;
    this.rgb[i * 3] = c.r;
    this.rgb[i * 3 + 1] = c.g;
    this.rgb[i * 3 + 2] = c.b;
    this.drag[i] = p.drag ?? 0;
    this.lift[i] = p.lift ?? 0;
  }

  /** Canlı parçacık sayısı (test/hata ayıklama). */
  get count(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if ((this.age[i] ?? Infinity) !== Infinity) n++;
    return n;
  }

  /** `scale`: piksel/oyun-m ölçeği (`yükseklik / (2 tan(fov/2))`). */
  update(dt: number, scale: number): void {
    this.material.uniforms.uScale!.value = scale;
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      const age = (this.age[i] ?? Infinity) + dt;
      const life = this.life[i] ?? 1;
      if (age >= life) {
        this.age[i] = Infinity;
        this.sizes[i] = 0;
        this.colors[i * 4 + 3] = 0;
        continue;
      }
      this.age[i] = age;
      alive++;
      const t = age / life;
      const damp = Math.max(0, 1 - (this.drag[i] ?? 0) * dt);
      const vx = (this.vel[i * 3] ?? 0) * damp;
      const vy = (this.vel[i * 3 + 1] ?? 0) * damp + (this.lift[i] ?? 0) * dt;
      const vz = (this.vel[i * 3 + 2] ?? 0) * damp;
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      this.positions[i * 3] = (this.positions[i * 3] ?? 0) + vx * dt;
      this.positions[i * 3 + 1] = (this.positions[i * 3 + 1] ?? 0) + vy * dt;
      this.positions[i * 3 + 2] = (this.positions[i * 3 + 2] ?? 0) + vz * dt;
      const s0 = this.size0[i] ?? 0;
      this.sizes[i] = s0 + ((this.size1[i] ?? s0) - s0) * t;
      this.colors[i * 4] = this.rgb[i * 3] ?? 1;
      this.colors[i * 4 + 1] = this.rgb[i * 3 + 1] ?? 1;
      this.colors[i * 4 + 2] = this.rgb[i * 3 + 2] ?? 1;
      this.colors[i * 4 + 3] = (this.alpha0[i] ?? 1) * (1 - t) * (1 - t);
    }
    this.points.visible = alive > 0;
    if (alive > 0) {
      const g = this.points.geometry;
      (g.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (g.getAttribute('aSize') as BufferAttribute).needsUpdate = true;
      (g.getAttribute('aColor') as BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

interface ArcFx {
  mesh: Mesh;
  material: MeshBasicMaterial;
  age: number;
  life: number;
  rot0: number;
  rot1: number;
  scale0: number;
  scale1: number;
  baseOpacity: number;
  /** Saplama çizgisi mi (yay değil)? */
  streak: boolean;
}

const MUZZLE_FLASH = COMBAT_FX.muzzle;

/** Ağız efektinin boyutları (silaha göre; bilinmeyen silah tabancayı kullanır). */
export function muzzleProfile(weapon: string): (typeof MUZZLE_FLASH)[keyof typeof MUZZLE_FLASH] {
  const table = MUZZLE_FLASH as Record<string, (typeof MUZZLE_FLASH)[keyof typeof MUZZLE_FLASH]>;
  return table[weapon] ?? MUZZLE_FLASH.pistol;
}

/**
 * Savaş efektleri katmanı. `group` sahneye eklenir; `update(dt, scale)` her karede çağrılır (`scale`: noktaların piksel
 * ölçeği). Kaynakları `dispose()` eder.
 */
export class CombatEffects {
  readonly group = new Group();
  private readonly flash = new ParticleLayer(COMBAT_FX.flashCapacity, true, 'fx-flash');
  private readonly smoke = new ParticleLayer(COMBAT_FX.smokeCapacity, false, 'fx-smoke');
  private readonly arcGeometry = new RingGeometry(0.72, 1, 28, 1, 0, 1.55);
  private readonly streakGeometry = new BoxGeometry(0.035, 0.035, 1);
  private readonly arcs: ArcFx[] = [];
  private seed = 1;

  constructor() {
    this.group.name = 'combat-effects';
    this.group.add(this.flash.points, this.smoke.points);
    for (let i = 0; i < COMBAT_FX.arcPool; i++) this.arcs.push(this.makeArc(false));
    for (let i = 0; i < COMBAT_FX.streakPool; i++) this.arcs.push(this.makeArc(true));
  }

  private makeArc(streak: boolean): ArcFx {
    const material = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const mesh = new Mesh(streak ? this.streakGeometry : this.arcGeometry, material);
    mesh.rotation.order = 'YXZ';
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.group.add(mesh);
    return {
      mesh,
      material,
      age: Infinity,
      life: 1,
      rot0: 0,
      rot1: 0,
      scale0: 1,
      scale1: 1,
      baseOpacity: 1,
      streak,
    };
  }

  /** Deterministik olmayan ama bağımsız küçük rastgelelik (görsel; oyun mantığına girmez). */
  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /**
   * Ateşli silah ağız efekti: `origin` ağız noktası, `dir` namlu yönü (normalize). Susturuculuda alev yok, duman az.
   * `scale`: boyut çarpanı (birinci şahısta ağız kameraya çok yakındır: küçültülür).
   * Alev büyük parlak bir nokta + kıvılcımlar; duman yavaşça yükselen gri bulut.
   */
  muzzle(weapon: string, origin: Vec3Like, dir: Vec3Like, suppressed = false, scale = 1): void {
    const p = muzzleProfile(weapon);
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
    if (!suppressed) {
      this.flash.spawn({
        ...origin,
        x: origin.x + d.x * 0.05,
        y: origin.y + d.y * 0.05,
        z: origin.z + d.z * 0.05,
        life: COMBAT_FX.flashSeconds,
        size0: p.flashSize * scale,
        size1: p.flashSize * 0.5 * scale,
        color: 0xfff0b0,
        alpha: 1,
      });
      // Çekirdek: daha küçük, beyaz-sıcak.
      this.flash.spawn({
        ...origin,
        life: COMBAT_FX.flashSeconds * 0.8,
        size0: p.flashSize * 0.55 * scale,
        size1: p.flashSize * 0.2 * scale,
        color: 0xffffff,
        alpha: 1,
      });
      for (let i = 0; i < p.sparks; i++) {
        const speed = p.sparkSpeed * (0.5 + this.rand());
        this.flash.spawn({
          ...origin,
          vx: d.x * speed + (this.rand() - 0.5) * 3,
          vy: d.y * speed + (this.rand() - 0.5) * 3,
          vz: d.z * speed + (this.rand() - 0.5) * 3,
          life: 0.09 + this.rand() * 0.1,
          size0: 0.06,
          size1: 0.02,
          color: 0xffb040,
          alpha: 1,
          drag: 4,
        });
      }
    }
    const puffs = suppressed ? 1 : p.smoke;
    for (let i = 0; i < puffs; i++) {
      const spread = 0.5;
      this.smoke.spawn({
        x: origin.x + d.x * (0.1 + i * 0.12),
        y: origin.y + d.y * (0.1 + i * 0.12),
        z: origin.z + d.z * (0.1 + i * 0.12),
        vx: d.x * 1.4 + (this.rand() - 0.5) * spread,
        vy: d.y * 1.4 + 0.25 + this.rand() * 0.3,
        vz: d.z * 1.4 + (this.rand() - 0.5) * spread,
        life: COMBAT_FX.smokeSeconds * (0.7 + this.rand() * 0.6),
        size0: 0.14 * scale,
        size1: p.smokeSize * (0.8 + this.rand() * 0.5) * scale,
        color: 0xb8b8b4,
        alpha: suppressed ? 0.12 : 0.34,
        drag: 1.6,
        lift: 0.5,
      });
    }
  }

  /**
   * Yakın dövüş savurma izi: `origin` saldıranın göğüs hizası, `yaw`/`pitch` bakış (ileri = (−sin yaw, −cos yaw)).
   * `slash` çapraz gümüş yay, `chop` dikey yay, `smash` geniş koyu yay, `thrust` ileri çizgi, `punch` kısa küçük yay.
   */
  swing(style: SwingStyle, origin: Vec3Like, yaw: number, pitch = 0): void {
    const look = COMBAT_FX.swing[style];
    const fx = this.freeArc(style === 'thrust');
    if (!fx) return;
    const forward = {
      x: -Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * Math.cos(pitch),
    };
    const dist = look.distance;
    fx.mesh.position.set(
      origin.x + forward.x * dist,
      origin.y + forward.y * dist,
      origin.z + forward.z * dist,
    );
    fx.mesh.rotation.set(pitch, yaw, look.rot0);
    fx.material.color.setHex(look.color);
    fx.material.blending = look.dark ? NormalBlending : AdditiveBlending;
    fx.baseOpacity = look.opacity;
    fx.age = 0;
    fx.life = look.seconds;
    fx.rot0 = look.rot0;
    fx.rot1 = look.rot1;
    fx.scale0 = look.scale0;
    fx.scale1 = look.scale1;
    fx.mesh.visible = true;
  }

  /** Darbe kıvılcımı/tozu `point`'te (yakın dövüş isabeti). */
  impact(point: Vec3Like, style: SwingStyle): void {
    const look = COMBAT_FX.swing[style];
    for (let i = 0; i < look.sparks; i++) {
      this.flash.spawn({
        ...point,
        vx: (this.rand() - 0.5) * 5,
        vy: this.rand() * 3 + 0.5,
        vz: (this.rand() - 0.5) * 5,
        life: 0.15 + this.rand() * 0.15,
        size0: 0.07,
        size1: 0.02,
        color: look.sparkColor,
        alpha: 1,
        drag: 3,
        lift: -9,
      });
    }
    if (look.dust) {
      this.smoke.spawn({
        ...point,
        vy: 0.4,
        life: 0.5,
        size0: 0.12,
        size1: 0.5,
        color: 0xa89a82,
        alpha: 0.35,
        drag: 2,
      });
    }
  }

  /** Her karede: parçacıkları ve yayları ilerletir. `scale`: piksel/oyun-m ölçeği. */
  update(dt: number, scale: number): void {
    this.flash.update(dt, scale);
    this.smoke.update(dt, scale);
    for (const fx of this.arcs) {
      if (fx.age === Infinity) continue;
      fx.age += dt;
      const t = fx.age / fx.life;
      if (t >= 1) {
        fx.age = Infinity;
        fx.mesh.visible = false;
        fx.material.opacity = 0;
        continue;
      }
      // Hızlı açılır, sonra söner.
      const ease = 1 - (1 - t) * (1 - t);
      fx.mesh.rotation.z = fx.rot0 + (fx.rot1 - fx.rot0) * ease;
      const s = fx.scale0 + (fx.scale1 - fx.scale0) * ease;
      if (fx.streak) fx.mesh.scale.set(1, 1, s);
      else fx.mesh.scale.setScalar(s);
      fx.material.opacity = fx.baseOpacity * (1 - t) * (1 - t * 0.5);
    }
  }

  /** Canlı efekt sayısı (parçacık + yay; test için). */
  get activeCount(): number {
    return this.flash.count + this.smoke.count + this.arcs.filter((a) => a.age !== Infinity).length;
  }

  private freeArc(streak: boolean): ArcFx | null {
    let best: ArcFx | null = null;
    for (const fx of this.arcs) {
      if (fx.streak !== streak) continue;
      if (fx.age === Infinity) return fx;
      if (!best || fx.age > best.age) best = fx;
    }
    return best;
  }

  dispose(): void {
    this.flash.dispose();
    this.smoke.dispose();
    for (const fx of this.arcs) fx.material.dispose();
    this.arcGeometry.dispose();
    this.streakGeometry.dispose();
    this.arcs.length = 0;
    this.group.removeFromParent();
  }
}
