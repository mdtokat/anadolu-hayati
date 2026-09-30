import {
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { TERRAIN_LOOK, VERTICAL_SCALE } from '../config';
import { buildCoverWeights } from './landCoverWeights';

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
uniform sampler2D uCoverA;    // arazi örtüsü ağırlıkları: forest, shrub, grass, crop
uniform sampler2D uCoverB;    // barren, urban, snow, wetland
uniform vec4 uCoverGrid;      // (yarı genişlik, yarı yükseklik, hücre boyu, 0): hücre merkezi konumları
uniform vec2 uCoverSize;      // ızgara boyutu (hücre)
uniform vec3 uCoverForest;
uniform vec3 uCoverShrub;
uniform vec3 uCoverGrass;
uniform vec3 uCoverCrop;
uniform vec3 uCoverBarren;
uniform vec3 uCoverUrban;
uniform vec3 uCoverSnow;
uniform vec3 uCoverWetland;
uniform float uRockCoverDamp;

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

  // Arazi örtüsü: hücre merkezlerinde örneklenen ağırlıklar lineer filtrelenir (sınıf sınırları yumuşak).
  // Piksel merkezi örnekleri: x = (c − (W−1)/2)·cell → doku koordinatı (c + 0.5)/W; satır 0 kuzeyde (z −).
  vec2 coverUv = (world.xz / uCoverGrid.z + uCoverGrid.xy + 0.5) / uCoverSize;
  vec4 coverA = texture2D(uCoverA, coverUv);
  vec4 coverB = texture2D(uCoverB, coverUv);
  color = mix(color, uCoverForest, coverA.r);
  color = mix(color, uCoverShrub, coverA.g);
  color = mix(color, uCoverGrass, coverA.b);
  color = mix(color, uCoverCrop, coverA.a);
  color = mix(color, uCoverBarren, coverB.r);
  color = mix(color, uCoverUrban, coverB.g);
  color = mix(color, uCoverSnow, coverB.b);
  color = mix(color, uCoverWetland, coverB.a);

  // Dik yüzeylerde kaya (uRockSlope: başlangıç eğimi daha yüksek normal.y'ye karşılık gelir).
  // Ormanlık/çalılık yerde zayıflar: dikleşen gerçek yamaçlar orman olarak kalsın.
  float rockAmount = 1.0 - smoothstep(uRockSlope.y, uRockSlope.x, flatness);
  rockAmount *= 1.0 - uRockCoverDamp * clamp(coverA.r + coverA.g, 0.0, 1.0);
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

/** Arazi örtüsü ızgarası (landcover.bin): heightmap ile aynı ızgara ve sıra. */
export interface TerrainCover {
  classes: Uint8Array;
  width: number;
  height: number;
  /** Izgara hücre boyu (oyun metresi). */
  cell: number;
}

/** Ağırlık verisinden lineer filtreli, mipmap'li RGBA doku (veri dokusu: renk uzayı yok). */
function weightTexture(data: Uint8Array, width: number, height: number): DataTexture {
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Gerçek arazi materyali: MeshStandardMaterial (ışık ve sis çalışır) + rakım/eğime göre
 * prosedürel renk; `cover` (arazi örtüsü) verilirse sınıf renkleri bunun üstüne işlenir.
 * Doku dosyası kullanmaz (ağırlık dokuları çalışma zamanında üretilir; materyal dispose olunca serbest kalır).
 * Çift yüzlü: chunk etekleri de görünür.
 */
export function createTerrainMaterial(cover: TerrainCover | null = null): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ side: DoubleSide, roughness: 1, metalness: 0 });
  const look = TERRAIN_LOOK;

  // Örtü yoksa 1×1 sıfır doku: ağırlıklar 0, renk eskisi gibi rakım/eğimden gelir.
  const width = cover?.width ?? 1;
  const height = cover?.height ?? 1;
  const weights = cover
    ? buildCoverWeights(cover.classes)
    : { a: new Uint8Array(4), b: new Uint8Array(4) };
  const coverA = weightTexture(weights.a, width, height);
  const coverB = weightTexture(weights.b, width, height);
  material.addEventListener('dispose', () => {
    coverA.dispose();
    coverB.dispose();
  });

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
      uCoverA: { value: coverA },
      uCoverB: { value: coverB },
      uCoverGrid: {
        value: [(width - 1) / 2, (height - 1) / 2, cover?.cell ?? 1, 0],
      },
      uCoverSize: { value: [width, height] },
      uCoverForest: { value: toVec3(look.cover.forest) },
      uCoverShrub: { value: toVec3(look.cover.shrub) },
      uCoverGrass: { value: toVec3(look.cover.grass) },
      uCoverCrop: { value: toVec3(look.cover.crop) },
      uCoverBarren: { value: toVec3(look.cover.barren) },
      uCoverUrban: { value: toVec3(look.cover.urban) },
      uCoverSnow: { value: toVec3(look.cover.snow) },
      uCoverWetland: { value: toVec3(look.cover.wetland) },
      uRockCoverDamp: { value: look.rockCoverDamp },
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
  material.customProgramCacheKey = () => 'anadolu-terrain-v2';
  return material;
}
