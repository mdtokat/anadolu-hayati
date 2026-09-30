import { AmbientLight, Color, DirectionalLight, Fog, type Scene } from 'three';
import { SCENE, SKY } from '../config';
import { skyDirection, moonPosition, type SkyPosition } from '../survival/astronomy';
import { SkyDome } from './SkyDome';
import { skyLook, type Rgb } from './skyModel';

/** Öğle güneşi: saat verilmeden önce ve test arenasında kullanılan varsayılan görünüm. */
const NOON_SUN: SkyPosition = { altitudeDeg: 60, azimuthDeg: 180 };

const toColor = (target: Color, rgb: Rgb): Color => target.setRGB(rgb[0], rgb[1], rgb[2]);

/**
 * Gökyüzü kubbesi, sis, güneş/ay ışığı ve ortam ışığı: hem Faz 1 test sahnesi hem gerçek bölge
 * kullanır. Görünüm `setSun` ile güneşin konumundan (saatten) türetilir.
 */
export class Environment {
  private readonly dome = new SkyDome();
  private readonly sun = new DirectionalLight(0xffffff, 0);
  private readonly moon = new DirectionalLight(SKY.moonColor, 0);
  private readonly ambient = new AmbientLight(0xffffff, 0);
  private readonly fog: Fog;
  private readonly background = new Color();

  constructor(
    private readonly scene: Scene,
    fog: { near: number; far: number } = { near: SCENE.fogNear, far: SCENE.fogFar },
  ) {
    this.fog = new Fog(this.background, fog.near, fog.far);
    scene.background = this.background;
    scene.fog = this.fog;
    scene.add(this.dome.mesh, this.sun, this.moon, this.ambient);
    this.setSun(NOON_SUN);
  }

  /** Güneşin konumuna göre gökyüzü, sis ve ışıkları günceller (moon konumu güneşin karşısıdır). */
  setSun(sun: SkyPosition): void {
    const look = skyLook(sun);
    const sunDir = skyDirection(sun);
    const moonDir = skyDirection(moonPosition(sun));

    this.sun.position.set(sunDir.x, sunDir.y, sunDir.z).multiplyScalar(SKY.lightDistance);
    this.sun.intensity = look.sunIntensity;
    toColor(this.sun.color, look.sunColor);
    this.sun.visible = look.sunIntensity > 0;

    this.moon.position.set(moonDir.x, moonDir.y, moonDir.z).multiplyScalar(SKY.lightDistance);
    this.moon.intensity = look.moonIntensity;
    toColor(this.moon.color, look.moonColor);
    this.moon.visible = look.moonIntensity > 0;

    this.ambient.intensity = look.ambientIntensity;
    toColor(this.ambient.color, look.ambientColor);

    toColor(this.background, look.horizon); // sis rengi aynı Color nesnesidir
    const u = this.dome.uniforms;
    toColor(u.uZenith.value, look.zenith);
    toColor(u.uHorizon.value, look.horizon);
    u.uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z);
    toColor(u.uSunColor.value, look.sunColor);
    // Disk yalnızca ufkun üstünde ve gündüze doğru görünür; ufuk altındakini arazi/deniz örter.
    u.uSunAlpha.value = look.sunIntensity > 0 ? 1 : 0;
    u.uMoonDir.value.set(moonDir.x, moonDir.y, moonDir.z);
    u.uMoonAlpha.value = look.moonIntensity > 0 ? 1 : 0;
    u.uStarAlpha.value = look.starAlpha;
  }

  /** Kubbeyi odağa taşır. */
  follow(x: number, z: number): void {
    this.dome.follow(x, z);
  }

  dispose(): void {
    this.scene.remove(this.dome.mesh, this.sun, this.moon, this.ambient);
    this.dome.dispose();
    this.sun.dispose();
    this.moon.dispose();
    this.ambient.dispose();
    this.scene.fog = null;
    this.scene.background = null;
  }
}
