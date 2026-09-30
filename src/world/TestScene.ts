import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
} from 'three';
import { SCENE } from '../config';
import { lerp } from '../utils/math';

/**
 * Faz 0 test sahnesi: zemin düzlemi, ışık, gökyüzü rengi ve dönen bir küp.
 * Küpün dönüşü sabit adımla ilerler, render sırasında alpha ile aradeğerlenir.
 */
export class TestScene {
  readonly scene = new Scene();

  private readonly cube: Mesh<BoxGeometry, MeshStandardMaterial>;
  private readonly ground: Mesh<PlaneGeometry, MeshStandardMaterial>;
  private readonly sun = new DirectionalLight(0xffffff, 2.2);
  private readonly ambient = new AmbientLight(0xffffff, 0.6);

  private previousAngle = 0;
  private currentAngle = 0;

  constructor() {
    const sky = new Color(SCENE.skyColor);
    this.scene.background = sky;
    this.scene.fog = new Fog(sky, SCENE.fogNear, SCENE.fogFar);

    this.ground = new Mesh(
      new PlaneGeometry(SCENE.groundSize, SCENE.groundSize),
      new MeshStandardMaterial({ color: SCENE.groundColor }),
    );
    this.ground.rotation.x = -Math.PI / 2; // Y yukarı: düzlemi yatır
    this.scene.add(this.ground);

    this.cube = new Mesh(
      new BoxGeometry(SCENE.cubeSize, SCENE.cubeSize, SCENE.cubeSize),
      new MeshStandardMaterial({ color: SCENE.cubeColor }),
    );
    this.cube.position.y = SCENE.cubeHeight;
    this.scene.add(this.cube);

    this.sun.position.set(30, 50, 20);
    this.scene.add(this.sun, this.ambient);
  }

  /** Sabit adımlı mantık güncellemesi. */
  update(step: number): void {
    this.previousAngle = this.currentAngle;
    this.currentAngle += SCENE.cubeSpinSpeed * step;
  }

  /** Render öncesi görsel durumu, iki mantık adımı arasında aradeğerler. */
  syncVisuals(alpha: number): void {
    this.cube.rotation.y = lerp(this.previousAngle, this.currentAngle, alpha);
    this.cube.rotation.x = this.cube.rotation.y * 0.5;
  }

  /** Geometry ve materyalleri serbest bırakır (kaynak temizliği kuralı). */
  dispose(): void {
    for (const mesh of [this.cube, this.ground]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.scene.clear();
  }
}
