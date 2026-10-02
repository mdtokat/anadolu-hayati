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
import { BORDERS, ROADS, TERRAIN_LOOK, TERRAIN_OVERLAY, VERTICAL_SCALE } from '../config';
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
uniform vec4 uCoverGrid;      // (−orijin.x / hücre, −orijin.z / hücre, hücre boyu, 0): hücre merkezi konumları
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
uniform sampler2D uOverlay;   // kaplama uzaklık alanı: R köy yolu, G dağ patikası, B su/kıyı, A il sınırı
uniform sampler2D uRoads;     // yol dokusu: R anayol, G kent sokağı (uzaklık), B/A anayol evresi (cos, sin)
uniform float uMainHalf;      // anayol yarı genişliği (orta şerit konumu)
uniform vec3 uCenterLine;
uniform float uCenterLineHalf;
uniform vec3 uVillageAsphalt;
uniform vec3 uVillageWorn;
uniform float uTrailWobble;
uniform vec3 uTrailGrass;
uniform vec3 uCobble;
uniform vec3 uCobbleDark;
uniform float uCobbleSize;
uniform vec3 uSidewalk;
uniform float uSidewalkWidth;
uniform vec4 uOverlayGrid;    // (−orijin.x / hücre, −orijin.z / hücre, hücre boyu, 0)
uniform vec2 uOverlaySize;
uniform float uOverlayScale;  // bayt = 128 + uzaklık · scale
uniform float uTime;
uniform float uBorderOn;
uniform vec3 uAsphalt;
uniform vec3 uAsphaltWorn;
uniform vec3 uEdgeLine;
uniform vec2 uEdgeLineParams;  // (içeri uzaklık, görünürlük)
uniform vec3 uShoulder;
uniform float uShoulderWidth;
uniform vec3 uDirt;
uniform vec3 uDirtDark;
uniform vec3 uWater;
uniform vec3 uWaterDeep;
uniform float uWaterRoughness;
uniform float uWaterFlow;
uniform vec3 uBank;
uniform vec2 uBankParams;      // (genişlik, görünürlük)
uniform vec3 uParapet;
uniform float uParapetWidth;
uniform vec3 uBorder;
uniform vec2 uBorderParams;    // (yarı genişlik, görünürlük)

// Su payı (pürüzlülüğü düşürmek için): kaplama renginde yazılır, roughness'ta okunur.
float terrainWet = 0.0;

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
  // Piksel merkezi örnekleri: x = orijin.x + c·cell → doku koordinatı (c + 0.5)/W; satır 0 kuzeyde (z −).
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

// Uzaklık alanından kenarı yumuşatılmış kaplama: d kenar uzaklığı (içeride negatif), w piksel genişliği.
float coverage(float d, float w) {
  return 1.0 - smoothstep(-w, w, d);
}

/**
 * Kaplama: kıyı bandı → akarsu → yol bankedi → dağ patikası → köy yolu → anayol (orta şerit) → kent sokağı (parke,
 * kaldırım) → köprü korkuluğu → il sınırı. Uzaklıklar
 * doğrusal süzgeçle aradeğerlendiğinden kenarlar her uzaklıkta keskin; fwidth ile kenar yumuşatılır (titreme yok).
 */
vec3 applyOverlay(vec3 color, vec3 world, float viewDistance) {
  vec2 uv = (world.xz / uOverlayGrid.z + uOverlayGrid.xy + 0.5) / uOverlaySize;
  vec4 d = (texture2D(uOverlay, uv) * 255.0 - 128.0) / uOverlayScale;
  vec4 w = max(fwidth(d), vec4(0.04)) * 0.75;
  float fade = 1.0 - smoothstep(uNoiseFade * 0.5, uNoiseFade, viewDistance);
  float n = valueNoise(world.xz * 0.21);
  float n2 = valueNoise(world.xz * 1.3 + 17.0);

  // Kıyı: su kenarından dışarıya ıslak toprak/çakıl.
  float bank = (1.0 - smoothstep(0.0, uBankParams.x, d.b)) * uBankParams.y * step(-0.5, d.b);
  color = mix(color, uBank * (0.85 + 0.3 * n2), bank);

  // Akarsu: ortaya doğru koyulaşır, akış yönünden bağımsız yavaş dalga deseni.
  float water = coverage(d.b, w.b);
  float depth = clamp(-d.b / 1.2, 0.0, 1.0);
  float ripple = valueNoise(world.xz * 0.9 + vec2(uTime * uWaterFlow, uTime * uWaterFlow * 0.6));
  vec3 waterColor = mix(uWater, uWaterDeep, depth) * (0.9 + 0.2 * ripple * fade);
  color = mix(color, waterColor, water);
  terrainWet = water;

  vec4 rt = texture2D(uRoads, uv);
  vec2 dr = (rt.rg * 255.0 - 128.0) / uOverlayScale;   // x anayol, y kent sokağı
  vec2 wr = max(fwidth(dr), vec2(0.04)) * 0.75;
  // Patika kenarı düzensiz (doğal iz): uzaklık gürültüyle kaydırılır.
  float trailD = d.g + (valueNoise(world.xz * 0.9) - 0.5) * 2.0 * uTrailWobble * fade;

  // Yol bankedi (çakıl) anayolun, köy yolunun ve patikanın kenarında (sokakta kaldırım var).
  float roadEdge = min(min(d.r, trailD), dr.x);
  float shoulder = coverage(roadEdge - uShoulderWidth, w.r) * (1.0 - coverage(roadEdge, w.r));
  color = mix(color, uShoulder * (0.85 + 0.3 * n2), shoulder * 0.8 * (1.0 - water));

  // Dağ patikası: lekeli toprak, ortası yer yer otlu.
  float dirt = coverage(trailD, w.g);
  vec3 dirtColor = mix(uDirt, uDirtDark, smoothstep(0.35, 0.8, n) * 0.6) * (0.9 + 0.2 * n2 * fade);
  float grassMid = smoothstep(0.55, 0.85, valueNoise(world.xz * 0.6 + 3.0)) * coverage(trailD + 0.45, w.g) * 0.55 * fade;
  dirtColor = mix(dirtColor, uTrailGrass, grassMid);
  color = mix(color, dirtColor, dirt);

  // Köy yolu: açık, yamalı, çatlak eski asfalt; çizgi yok.
  float village = coverage(d.r, w.r);
  float wear = smoothstep(0.45, 0.75, valueNoise(world.xz * 0.35 + 9.0));
  vec3 villageColor = mix(uVillageAsphalt, uVillageWorn, wear * 0.85) * (0.9 + 0.2 * n2 * fade);
  color = mix(color, villageColor, village);

  // Anayol: koyu asfalt, kenar çizgileri ve kesik orta şerit.
  float mainRoad = coverage(dr.x, wr.x);
  vec3 asphalt = mix(uAsphalt, uAsphaltWorn, smoothstep(0.5, 0.85, n) * 0.6) * (0.94 + 0.12 * n2 * fade);
  float edge = coverage(dr.x + uEdgeLineParams.x, wr.x) * (1.0 - coverage(dr.x + uEdgeLineParams.x + 0.18, wr.x));
  asphalt = mix(asphalt, uEdgeLine, edge * uEdgeLineParams.y * fade);
  float centerDist = abs(dr.x + uMainHalf);
  float centerLine = 1.0 - smoothstep(uCenterLineHalf - wr.x, uCenterLineHalf + wr.x, centerDist);
  float dash = smoothstep(-0.15, 0.15, (rt.b * 255.0 - 128.0) / 127.0);
  asphalt = mix(asphalt, uCenterLine, centerLine * dash * fade * 0.85);
  color = mix(color, asphalt, mainRoad);

  // Kent sokağı: parke / Arnavut kaldırımı (hücresel taş deseni, derz), kenarda kaldırım ve bordür.
  float street = coverage(dr.y, wr.y);
  if (street > 0.001) {
    vec2 p = world.xz / uCobbleSize;
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    float stone = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = vec2(hash21(ip + g), hash21(ip + g + 31.7)) * 0.8 + 0.1;
        float dd = length(g + o - fp);
        if (dd < f1) {
          f2 = f1;
          f1 = dd;
          stone = hash21(ip + g + 7.3);
        } else if (dd < f2) {
          f2 = dd;
        }
      }
    }
    float joint = 1.0 - smoothstep(0.04, 0.12, f2 - f1);
    vec3 cobble = mix(uCobble, uCobbleDark, stone * 0.55) * (0.92 + 0.16 * n2);
    cobble = mix(cobble, uCobbleDark * 0.7, joint * fade);
    float side = coverage(-dr.y - uSidewalkWidth, wr.y); // kenar şeridi: kaldırım
    vec3 sidewalk = uSidewalk * (0.94 + 0.12 * n2);
    float curb = 1.0 - smoothstep(0.0, 0.12 + wr.y, abs(-dr.y - uSidewalkWidth));
    vec3 streetColor = mix(cobble, sidewalk, side);
    streetColor = mix(streetColor, uSidewalk * 1.12, curb * 0.8);
    color = mix(color, mix(uCobble, streetColor, fade * 0.85 + 0.15), street);
  }

  // Köprü: yol suyun üstündeyse kenarda taş korkuluk; yol suyu örter (ıslaklık kalkar).
  float road = max(max(village, dirt), max(mainRoad, street));
  float overWater = coverage(d.b - 0.8, 0.4);
  float parapet = road * (1.0 - coverage(roadEdge + uParapetWidth, min(w.r, w.g))) * overWater;
  color = mix(color, uParapet, parapet);
  terrainWet *= 1.0 - road;

  // İl sınırı: yarı saydam şerit (kıyılar elenmiştir).
  float border = coverage(d.a - uBorderParams.x, w.a) * uBorderParams.y * uBorderOn;
  color = mix(color, uBorder, border);
  return color;
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
  /** Dizinin (0, 0) örneğinin konumu (oyun m); verilmezse eski merkezli düzen. */
  origin?: { x: number; z: number };
}

/** Arazi kaplaması (`terrainOverlay.ts`): arazi ızgarasıyla aynı kafeste RGBA uzaklık alanı. */
export interface TerrainOverlay {
  data: Uint8Array;
  /** Yol dokusu (anayol, kent sokağı, orta şerit evresi); aynı ızgara. Yoksa boş. */
  roads?: Uint8Array;
  width: number;
  height: number;
  cell: number;
  origin: { x: number; z: number };
}

/** Materyalin çalışma zamanında değişen uniform'ları (zaman, il sınırı görünürlüğü). */
export interface TerrainUniforms {
  uTime: { value: number };
  uBorderOn: { value: number };
}

const UNIFORMS = new WeakMap<MeshStandardMaterial, TerrainUniforms>();

/** `createTerrainMaterial` ile kurulan materyalin değişken uniform'ları (başka materyal için null). */
export function terrainUniforms(material: MeshStandardMaterial): TerrainUniforms | null {
  return UNIFORMS.get(material) ?? null;
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
export function createTerrainMaterial(
  cover: TerrainCover | null = null,
  overlay: TerrainOverlay | null = null,
): MeshStandardMaterial {
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
  const cell = cover?.cell ?? 1;
  const coverGrid = cover?.origin
    ? [-cover.origin.x / cell, -cover.origin.z / cell, cell, 0]
    : [(width - 1) / 2, (height - 1) / 2, cell, 0];
  // Kaplama yoksa 1×1 "uzak" doku: hiçbir şey boyanmaz.
  const overlayTexture = weightTexture(
    overlay?.data ?? new Uint8Array([255, 255, 255, 255]),
    overlay?.width ?? 1,
    overlay?.height ?? 1,
  );
  const roadTexture = weightTexture(
    overlay?.roads ?? new Uint8Array([255, 255, 128, 128]),
    overlay?.roads ? overlay.width : 1,
    overlay?.roads ? overlay.height : 1,
  );
  const overlayGrid = overlay
    ? [-overlay.origin.x / overlay.cell, -overlay.origin.z / overlay.cell, overlay.cell, 0]
    : [0, 0, 1, 0];
  const live: TerrainUniforms = {
    uTime: { value: 0 },
    uBorderOn: { value: BORDERS.visibleByDefault ? 1 : 0 },
  };
  UNIFORMS.set(material, live);
  material.addEventListener('dispose', () => {
    coverA.dispose();
    coverB.dispose();
    overlayTexture.dispose();
    roadTexture.dispose();
  });
  const o = TERRAIN_OVERLAY;

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
      uCoverGrid: { value: coverGrid },
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
      uOverlay: { value: overlayTexture },
      uOverlayGrid: { value: overlayGrid },
      uOverlaySize: { value: [overlay?.width ?? 1, overlay?.height ?? 1] },
      uOverlayScale: { value: o.scale },
      uRoads: { value: roadTexture },
      uMainHalf: { value: (ROADS.width[0] as number) / 2 },
      uCenterLine: { value: toVec3(o.centerLine) },
      uCenterLineHalf: { value: o.centerLineHalf },
      uVillageAsphalt: { value: toVec3(o.villageAsphalt) },
      uVillageWorn: { value: toVec3(o.villageWorn) },
      uTrailWobble: { value: o.trailWobble },
      uTrailGrass: { value: toVec3(o.trailGrass) },
      uCobble: { value: toVec3(o.cobble) },
      uCobbleDark: { value: toVec3(o.cobbleDark) },
      uCobbleSize: { value: o.cobbleSize },
      uSidewalk: { value: toVec3(o.sidewalk) },
      uSidewalkWidth: { value: o.sidewalkWidth },
      uAsphalt: { value: toVec3(o.asphalt) },
      uAsphaltWorn: { value: toVec3(o.asphaltWorn) },
      uEdgeLine: { value: toVec3(o.edgeLine) },
      uEdgeLineParams: { value: [o.edgeLineInset, o.edgeLineStrength] },
      uShoulder: { value: toVec3(o.shoulder) },
      uShoulderWidth: { value: o.shoulderWidth },
      uDirt: { value: toVec3(o.dirt) },
      uDirtDark: { value: toVec3(o.dirtDark) },
      uWater: { value: toVec3(o.water) },
      uWaterDeep: { value: toVec3(o.waterDeep) },
      uWaterRoughness: { value: o.waterRoughness },
      uWaterFlow: { value: o.waterFlowSpeed },
      uBank: { value: toVec3(o.bank) },
      uBankParams: { value: [o.bankWidth, o.bankStrength] },
      uParapet: { value: toVec3(o.parapet) },
      uParapetWidth: { value: o.parapetWidth },
      uBorder: { value: toVec3(o.border) },
      uBorderParams: { value: [o.borderHalfWidth, o.borderStrength] },
      ...live,
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
        diffuseColor.rgb = applyOverlay(
          terrainAlbedo(vTerrainWorld, vTerrainNormal, length(vViewPosition)),
          vTerrainWorld,
          length(vViewPosition)
        );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, uWaterRoughness, terrainWet);`,
      );
  };
  // Aynı materyal örneği için program önbellek anahtarı sabit.
  material.customProgramCacheKey = () => 'anadolu-terrain-v4';
  return material;
}
