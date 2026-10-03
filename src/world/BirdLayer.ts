import {
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { BIRDS } from '../config';
import { birdPose, flockForCell, type Flock } from './birdFlocks';

/** Kuş geometrisi: gövde (ince eşkenar dörtgen) + iki kanat; kanat uçları y = 1'de (çırpma ölçekle yapılır). */
function buildBirdGeometry(): BufferGeometry {
  // Ön −Z. Kanat açıklığı 1 (x: −0,5…0,5), gövde boyu 0,45.
  const p = [
    // sol kanat
    0, 0, -0.08, -0.5, 1, 0.05, 0, 0, 0.12,
    // sağ kanat
    0, 0, -0.08, 0, 0, 0.12, 0.5, 1, 0.05,
    // gövde (üstten)
    0, 0, -0.22, -0.05, 0, 0.05, 0.05, 0, 0.05, 0, 0, 0.23, 0.05, 0, 0.05, -0.05, 0, 0.05,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(p, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scale = new Vector3();
const color = new Color();

/**
 * Gökyüzü kuşlarının çizimi (`birdFlocks.ts` saf mantığı): tek `InstancedMesh` (+1 draw call). Oyuncuya
 * `BIRDS.drawRadius` içindeki hücrelerin sürüleri her karede konumlanır; gece gizlenir.
 */
export class BirdLayer {
  readonly mesh: InstancedMesh;
  private readonly geometry = buildBirdGeometry();
  private readonly material = new MeshLambertMaterial({ side: DoubleSide });
  private readonly flocks = new Map<string, Flock | null>();

  constructor(
    private readonly heightAt: (x: number, z: number) => number,
    private readonly elevationAt: (x: number, z: number) => number,
  ) {
    this.mesh = new InstancedMesh(this.geometry, this.material, BIRDS.maxBirds);
    this.mesh.name = 'birds';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /** `daylight` 0 (gece) – 1 (gündüz). */
  update(x: number, z: number, time: number, daylight: number): void {
    if (daylight < BIRDS.minDaylight) {
      this.mesh.count = 0;
      return;
    }
    const size = BIRDS.cellSize;
    const reach = Math.ceil(BIRDS.drawRadius / size);
    const c0 = Math.floor(x / size);
    const r0 = Math.floor(z / size);
    let n = 0;
    for (let dr = -reach; dr <= reach; dr++) {
      for (let dc = -reach; dc <= reach; dc++) {
        const key = `${c0 + dc},${r0 + dr}`;
        let flock = this.flocks.get(key);
        if (flock === undefined) {
          flock = flockForCell(c0 + dc, r0 + dr, this.elevationAt);
          this.flocks.set(key, flock);
        }
        if (!flock) continue;
        if (Math.hypot(flock.cx - x, flock.cz - z) > BIRDS.drawRadius) continue;
        const ground = this.heightAt(flock.cx, flock.cz);
        const spec = BIRDS.kinds[flock.kind];
        color.set(spec.color);
        for (let i = 0; i < flock.count && n < BIRDS.maxBirds; i++) {
          const pose = birdPose(flock, i, time);
          position.set(pose.x, Math.max(ground, this.heightAt(pose.x, pose.z)) + pose.y, pose.z);
          euler.set(0, pose.yaw, 0);
          quaternion.setFromEuler(euler);
          // Kanat uçları ölçekle iner/kalkar (çırpma); süzülürken hafif yukarı V.
          scale.set(spec.span, spec.span * (0.15 + 0.35 * pose.flap), spec.span);
          matrix.compose(position, quaternion, scale);
          this.mesh.setMatrixAt(n, matrix);
          this.mesh.setColorAt(n, color);
          n++;
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // Önbellek uzaktaki hücreleri unutsun.
    if (this.flocks.size > 400) this.flocks.clear();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
