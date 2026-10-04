import { Color, CylinderGeometry, DoubleSide, Mesh, ShaderMaterial } from 'three';
import type { Circle } from '../battleRoyale/area';

/** Duvarın tabanı ve yüksekliği (oyun m; en yüksek dağ ≈ 2600 / 15 ≈ 175 m). */
const BASE_Y = -30;
const HEIGHT = 260;
/** Çember dilim sayısı (6,6 km yarıçapta kiriş sapması ≈ 2 m). */
const SEGMENTS = 160;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    // Aşağıda yoğun, yukarı doğru solar; yavaş akan çapraz şeritler (sınır uzaktan seçilsin).
    float fade = pow(1.0 - vUv.y, 1.6);
    float stripes = 0.55 + 0.45 * sin((vWorld.y * 0.25 + vUv.x * 900.0) - uTime * 1.5);
    float alpha = uOpacity * fade * (0.6 + 0.4 * stripes);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/**
 * Güvenli bölgenin sınırı (BR.6): açık uçlu, yarı saydam silindir (tek mesh, tek draw call). Daire her kare `set` ile
 * güncellenir (ölçek + konum; geometri değişmez). Maç yokken gizlidir.
 */
export class ZoneWall {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor() {
    const geometry = new CylinderGeometry(1, 1, 1, SEGMENTS, 1, true);
    geometry.translate(0, 0.5, 0); // taban y = 0
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uColor: { value: new Color('#e0301f') },
        uTime: { value: 0 },
        uOpacity: { value: 0.38 },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = 'zone-wall';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  /** Daireyi gösterir (null: gizler). */
  set(circle: Circle | null, time: number): void {
    if (!circle || circle.r <= 0.5) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set(circle.x, BASE_Y, circle.z);
    this.mesh.scale.set(circle.r, HEIGHT, circle.r);
    this.material.uniforms.uTime!.value = time;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
