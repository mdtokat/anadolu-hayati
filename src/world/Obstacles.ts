import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { RAPIER, type PhysicsWorld } from '../physics/PhysicsWorld';
import type { HeightSource } from './HeightSource';
import { generateObstacles, type ObstacleSpec } from './obstacleLayout';

/**
 * Test engelleri: tek bir InstancedMesh (tek draw call) + her biri için Rapier kutu collider'ı.
 */
export class Obstacles {
  readonly mesh: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  readonly specs: readonly ObstacleSpec[];

  private readonly colliders: RAPIER.Collider[] = [];

  constructor(
    private readonly physics: PhysicsWorld,
    source: HeightSource,
  ) {
    this.specs = generateObstacles(source);
    this.mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1), // birim küp; örnek başına ölçeklenir
      new MeshStandardMaterial(),
      this.specs.length,
    );

    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const yAxis = new Vector3(0, 1, 0);
    const color = new Color();

    this.specs.forEach((spec, i) => {
      rotation.setFromAxisAngle(yAxis, spec.yaw);
      matrix.compose(
        new Vector3(spec.x, spec.y, spec.z),
        rotation,
        new Vector3(spec.sx, spec.sy, spec.sz),
      );
      this.mesh.setMatrixAt(i, matrix);
      this.mesh.setColorAt(i, color.setHex(spec.color));

      this.colliders.push(
        physics.addStaticCollider(
          RAPIER.ColliderDesc.cuboid(spec.sx / 2, spec.sy / 2, spec.sz / 2)
            .setTranslation(spec.x, spec.y, spec.z)
            .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }),
        ),
      );
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const collider of this.colliders) this.physics.removeCollider(collider);
    this.colliders.length = 0;
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
