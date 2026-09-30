import { AmbientLight, Color, DirectionalLight, Fog, type Scene } from 'three';
import { SCENE } from '../config';

/** Gökyüzü rengi, sis ve ışıklar: hem Faz 1 test sahnesi hem gerçek bölge sahnesi kullanır. */
export class Environment {
  private readonly sun = new DirectionalLight(0xffffff, SCENE.sunIntensity);
  private readonly ambient = new AmbientLight(0xffffff, SCENE.ambientIntensity);

  constructor(
    private readonly scene: Scene,
    fog: { near: number; far: number } = { near: SCENE.fogNear, far: SCENE.fogFar },
  ) {
    const sky = new Color(SCENE.skyColor);
    scene.background = sky;
    scene.fog = new Fog(sky, fog.near, fog.far);
    this.sun.position.set(...SCENE.sunPosition);
    scene.add(this.sun, this.ambient);
  }

  dispose(): void {
    this.scene.remove(this.sun, this.ambient);
    this.sun.dispose();
    this.ambient.dispose();
    this.scene.fog = null;
    this.scene.background = null;
  }
}
