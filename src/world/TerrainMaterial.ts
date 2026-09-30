import { Color, DoubleSide, MeshStandardMaterial } from 'three';
import { TERRAIN_LOOK, VERTICAL_SCALE } from '../config';

/** GLSL: dünya konumu ve normalden rakım/eğime bağlı arazi rengi. */
const FRAGMENT_FUNCTIONS = /* glsl */ `
varying vec3 vTerrainWorld;
varying vec3 vTerrainNormal;
uniform float uElevationScale;
uniform vec3 uSand;
uniform vec3 uGrass;
uniform vec3 uForest;
uniform vec3 uAlpine;
uniform vec3 uRock;
uniform vec2 uForestFrom;
uniform vec2 uAlpineFrom;
uniform vec2 uRockSlope;      // eğim eşikleri: normal.y cinsinden (başlangıç, tam)
uniform float uSandMax;
uniform float uSandBlend;
uniform float uNoiseFrequency;
uniform float uNoiseStrength;
uniform float uNoiseFade;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 terrainAlbedo(vec3 world, vec3 normal, float viewDistance) {
  float elevation = world.y * uElevationScale;
  float flatness = clamp(normalize(normal).y, 0.0, 1.0);

  // Gürültü: iki oktav; uzaklaştıkça söner (aliasing/titreşim olmasın).
  float n = valueNoise(world.xz * uNoiseFrequency) * 0.65 + valueNoise(world.xz * uNoiseFrequency * 4.3) * 0.35;
  float fade = 1.0 - smoothstep(uNoiseFade * 0.5, uNoiseFade, viewDistance);
  float variation = 1.0 + (n - 0.5) * 2.0 * uNoiseStrength * fade;

  // Rakıma göre taban renk: kum → çim → orman zemini → yüksek çayır
  vec3 color = uGrass;
  float sandAmount = 1.0 - smoothstep(uSandMax, uSandMax + uSandBlend, elevation);
  color = mix(color, uSand, sandAmount);
  // Gürültü orman zemini geçişini de kaydırır: sınır düz bir çizgi olmasın.
  float forestAmount = smoothstep(uForestFrom.x, uForestFrom.y, elevation + (n - 0.5) * 120.0);
  color = mix(color, uForest, forestAmount);
  float alpineAmount = smoothstep(uAlpineFrom.x, uAlpineFrom.y, elevation + (n - 0.5) * 200.0);
  color = mix(color, uAlpine, alpineAmount);

  // Dik yüzeylerde kaya (uRockSlope: başlangıç eğimi daha yüksek normal.y'ye karşılık gelir)
  float rockAmount = 1.0 - smoothstep(uRockSlope.y, uRockSlope.x, flatness);
  color = mix(color, uRock, rockAmount);

  return color * variation;
}
`;

function toVec3(hex: number): Color {
  return new Color(hex);
}

function slopeToNormalY(deg: number): number {
  return Math.cos((deg * Math.PI) / 180);
}

/**
 * Gerçek arazi materyali: MeshStandardMaterial (ışık ve sis çalışır) + rakım/eğime göre
 * prosedürel renk. Doku dosyası kullanmaz. Çift yüzlü: chunk etekleri de görünür.
 */
export function createTerrainMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ side: DoubleSide, roughness: 1, metalness: 0 });
  const look = TERRAIN_LOOK;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uElevationScale: { value: VERTICAL_SCALE },
      uSand: { value: toVec3(look.sandColor) },
      uGrass: { value: toVec3(look.grassColor) },
      uForest: { value: toVec3(look.forestColor) },
      uAlpine: { value: toVec3(look.alpineColor) },
      uRock: { value: toVec3(look.rockColor) },
      uForestFrom: { value: look.forestFrom },
      uAlpineFrom: { value: look.alpineFrom },
      // Eğim (derece) → normal.y: başlangıç (x) ve tam (y) eşikleri
      uRockSlope: {
        value: [slopeToNormalY(look.rockSlopeDeg[0]), slopeToNormalY(look.rockSlopeDeg[1])],
      },
      uSandMax: { value: look.sandMaxElevation },
      uSandBlend: { value: look.sandBlend },
      uNoiseFrequency: { value: look.noiseFrequency },
      uNoiseStrength: { value: look.noiseStrength },
      uNoiseFade: { value: look.noiseFadeDistance },
    });

    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'varying vec3 vTerrainWorld;\nvarying vec3 vTerrainNormal;\nvoid main() {',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${FRAGMENT_FUNCTIONS}\nvoid main() {`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = terrainAlbedo(vTerrainWorld, vTerrainNormal, length(vViewPosition));`,
      );
  };
  // Aynı materyal örneği için program önbellek anahtarı sabit.
  material.customProgramCacheKey = () => 'anadolu-terrain-v1';
  return material;
}
