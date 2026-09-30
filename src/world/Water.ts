import { DoubleSide, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { WATER } from '../config';
import type { Bounds } from './RegionHeightSource';

/** GLSL: dünya konumundan animasyonlu dalga normali (iki yönde kayan sinüs desenleri). */
const WAVE_FUNCTIONS = /* glsl */ `
varying vec3 vWaterWorld;
uniform float uTime;
uniform float uWaveFrequency;
uniform float uWaveSpeed;
uniform float uWaveStrength;

// Dünya X/Z düzleminde normal bozulması (yatay bileşenler)
vec2 waveSlope(vec2 p, float t) {
  vec2 s = vec2(0.0);
  vec2 d1 = vec2(0.8, 0.6);
  vec2 d2 = vec2(-0.5, 0.86);
  vec2 d3 = vec2(0.2, -0.98);
  float k = uWaveFrequency;
  s += d1 * cos(dot(p, d1) * k * 1.0 + t * uWaveSpeed * 1.0) * 1.0;
  s += d2 * cos(dot(p, d2) * k * 2.3 + t * uWaveSpeed * 1.7) * 0.6;
  s += d3 * cos(dot(p, d3) * k * 4.1 + t * uWaveSpeed * 2.9) * 0.35;
  return s;
}
`;

/**
 * Deniz yüzeyi: bölgeyi ve ufka kadar çevresini kaplayan tek düzlem. MeshStandardMaterial
 * (ışık, güneş parıltısı ve sis çalışır) + fragment'te animasyonlu dalga normali.
 * Yarı saydamdır: sığ kıyıda taban görünür. Çift yüzlü: sualtından bakınca da görünür.
 */
export class Water {
  readonly mesh: Mesh<PlaneGeometry, MeshStandardMaterial>;
  /** Shader uniform'ları; `update` zamanı buraya yazar. */
  readonly uniforms = {
    uTime: { value: 0 },
    uWaveFrequency: { value: WATER.waveFrequency },
    uWaveSpeed: { value: WATER.waveSpeed },
    uWaveStrength: { value: WATER.waveStrength },
  };

  constructor(bounds: Bounds) {
    const width = bounds.maxX - bounds.minX + 2 * WATER.margin;
    const depth = bounds.maxZ - bounds.minZ + 2 * WATER.margin;
    const geometry = new PlaneGeometry(width, depth, 1, 1);
    geometry.rotateX(-Math.PI / 2); // Y-yukarı: düzlemi yatır

    const material = new MeshStandardMaterial({
      color: WATER.color,
      transparent: true,
      opacity: WATER.opacity,
      roughness: WATER.roughness,
      metalness: 0,
      side: DoubleSide,
      depthWrite: false,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vWaterWorld;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${WAVE_FUNCTIONS}\nvoid main() {`)
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec2 slope = waveSlope(vWaterWorld.xz, uTime) * uWaveStrength;
            // Dünya uzayındaki bozulmayı görüş uzayına çevirip normale ekle
            vec3 perturb = (viewMatrix * vec4(-slope.x, 0.0, -slope.y, 0.0)).xyz;
            normal = normalize(normal + perturb);
          }`,
        );
    };
    material.customProgramCacheKey = () => 'anadolu-water-v1';

    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'sea';
    this.mesh.position.set(
      (bounds.minX + bounds.maxX) / 2,
      WATER.level,
      (bounds.minZ + bounds.maxZ) / 2,
    );
    // Şeffaf nesneler opaklardan sonra çizilir; sıralama sorunu olmasın diye en sonda.
    this.mesh.renderOrder = 10;
  }

  /** Saniye cinsinden zaman: dalgaları hareket ettirir. */
  update(timeSeconds: number): void {
    this.uniforms.uTime.value = timeSeconds;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
