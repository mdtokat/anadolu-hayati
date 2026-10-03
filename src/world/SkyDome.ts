import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { SKY } from '../config';

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vWorld;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunCos;
uniform float uSunAlpha;
uniform vec3 uMoonDir;
uniform float uMoonCos;
uniform float uMoonAlpha;
uniform float uStarAlpha;
uniform float uCloud;
uniform vec3 uCloudColor;
uniform vec3 uCloudShade;
uniform float uTime;

// Yönden sözde rastgele sayı (yıldız yerleşimi için)
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// Değer gürültüsü + fbm (bulutlar)
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(vec3(i, 1.0));
  float b = hash(vec3(i + vec2(1.0, 0.0), 1.0));
  float c = hash(vec3(i + vec2(0.0, 1.0), 1.0));
  float d = hash(vec3(i + vec2(1.0, 1.0), 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int k = 0; k < 5; k++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(13.1, 7.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float up = clamp(dir.y, -1.0, 1.0);

  // Ufuktan tepeye gradyan; ufkun altı ufuk rengiyle kalır (deniz/arazi arkasında sis rengi)
  float t = pow(clamp(up, 0.0, 1.0), 0.55);
  vec3 color = mix(uHorizon, uZenith, t);

  // Yıldızlar: yön ızgarasında hücre başına en fazla bir yıldız
  vec3 scaled = dir * 420.0;
  vec3 cell = floor(scaled);
  float h = hash(cell);
  // Hücre merkezine yakın küçük nokta (kare değil): merkezden uzaklığa göre sönümlenir
  float centre = length(fract(scaled) - 0.5);
  float star = step(0.9985, h) * smoothstep(0.35, 0.05, centre) * smoothstep(0.0, 0.25, up);
  color += vec3(star) * uStarAlpha * (0.6 + 0.4 * hash(cell + 7.0));

  // Ay ve güneş diskleri (+ kenar parıltısı)
  float sunDot = dot(dir, uSunDir);
  float sunDisc = smoothstep(uSunCos - 0.00035, uSunCos, sunDot);
  float sunGlow = pow(max(sunDot, 0.0), 64.0) * 0.35;
  color += uSunColor * (sunDisc * 1.6 + sunGlow) * uSunAlpha;

  float moonDot = dot(dir, uMoonDir);
  float moonDisc = smoothstep(uMoonCos - 0.0003, uMoonCos, moonDot);
  color = mix(color, vec3(0.92, 0.94, 1.0), moonDisc * uMoonAlpha);
  color += vec3(0.25, 0.3, 0.45) * pow(max(moonDot, 0.0), 96.0) * 0.5 * uMoonAlpha;

  // Bulutlar: gök düzlemine izdüşüm, rüzgârla kayar; örtü uCloud ile artar (açıkta seyrek pamuk bulutlar).
  if (up > 0.0 && uCloud > 0.0) {
    vec2 uv = dir.xz / (up + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv);
    float cover = mix(0.78, 0.02, uCloud);
    float density = smoothstep(cover, cover + 0.22, n) * smoothstep(0.0, 0.18, up);
    float shade = smoothstep(cover, cover + 0.5, fbm(uv * 1.7 + 4.0));
    vec3 cloud = mix(uCloudColor, uCloudShade, shade * 0.8);
    color = mix(color, cloud, density * 0.92);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Gökyüzü kubbesi: kameraya bakan içi görünen dev küre. Gradyan (ufuk→tepe), yıldızlar ile
 * güneş/ay diskleri fragment shader'da çizilir; ışıktan ve sisten etkilenmez.
 * Kubbe her karede odağın (oyuncunun) X/Z'sine taşınır.
 */
export class SkyDome {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  readonly uniforms = {
    uZenith: { value: new Color() },
    uHorizon: { value: new Color() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Color(1, 1, 1) },
    uSunCos: { value: Math.cos((SKY.sunDiscRadiusDeg * Math.PI) / 180) },
    uSunAlpha: { value: 1 },
    uMoonDir: { value: new Vector3(0, -1, 0) },
    uMoonCos: { value: Math.cos((SKY.moonDiscRadiusDeg * Math.PI) / 180) },
    uMoonAlpha: { value: 0 },
    uStarAlpha: { value: 0 },
    uCloud: { value: 0 },
    uCloudColor: { value: new Color(1, 1, 1) },
    uCloudShade: { value: new Color(0.5, 0.5, 0.5) },
    uTime: { value: 0 },
  };

  constructor() {
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(SKY.domeRadius, 32, 16), material);
    this.mesh.name = 'sky-dome';
    this.mesh.frustumCulled = false;
    // Her şeyden önce çizilir; derinlik yazmadığı için arazi üstüne biner.
    this.mesh.renderOrder = -1000;
  }

  /** Kubbeyi odağa taşır (kubbe her zaman oyuncuyu çevreler). */
  follow(x: number, z: number): void {
    this.mesh.position.set(x, 0, z);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
