import { Group, InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial } from 'three';
import { CREATURE_LOOK, CREATURES } from '../config';
import type { CreatureId, CreatureView } from '../creatures/kinds';
import {
  buildBoxGeometry,
  buildTaperGeometry,
  CREATURE_SHAPES,
  MAX_PARTS,
  type PartShape,
} from './creatureGeometry';
import { InstanceBuffer, phaseDelta, writeCreature, type PoseBuffers } from './creaturePose';
import { commitInstances, markDynamic } from './instancing';

/** Dev göstergesi / test için anlık sayımlar. */
export interface CreatureLayerStats {
  /** Şu an çizilen canlı sayısı. */
  instances: number;
  /** Çizilen parça (kutu) sayısı. */
  parts: number;
  /** Mesh sayısı (= draw call): şekil başına bir `InstancedMesh`. */
  meshes: number;
}

/**
 * Canlıların çizimi: `CreatureView[]` tüketir, hiçbir simülasyon mantığı içermez. Her canlı birkaç kutu parçadır
 * (gövde, baş, dört bacak, kuyruk…); parçalar türden bağımsız **şekil başına tek `InstancedMesh`**'te toplanır,
 * bu yüzden draw call sayısı canlı sayısından ve türden bağımsız sabittir (şekil sayısı kadar). Parça matrisleri
 * CPU'da yalnızca etkin canlılar (≤ `CREATURES.maxActive`) için her karede yazılır; yürüme fazı her canlı için
 * `speed`'den türetilir. Kaynakları `dispose()` eder.
 */
export class CreatureLayer {
  readonly group = new Group();

  private readonly material = new MeshStandardMaterial({ roughness: 1 });
  private readonly geometries = {
    box: buildBoxGeometry(),
    taper: buildTaperGeometry(),
  };
  private readonly meshes = {} as Record<PartShape, InstancedMesh>;
  private readonly buffers = {} as PoseBuffers;
  private readonly phases = new Map<CreatureId, number>();
  private readonly seen = new Set<CreatureId>();
  private lastTime: number | null = null;
  private drawn = 0;
  private drawnParts = 0;

  constructor() {
    const capacity = CREATURES.maxActive * MAX_PARTS;
    for (const shape of CREATURE_SHAPES) {
      const mesh = new InstancedMesh(this.geometries[shape], this.material, capacity);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      // Pozlar doğrudan mesh dizilerine yazılır (ek kopya yok).
      this.buffers[shape] = new InstanceBuffer(
        capacity,
        mesh.instanceMatrix.array as Float32Array,
        mesh.instanceColor.array as Float32Array,
      );
      mesh.count = 0;
      mesh.frustumCulled = false; // en çok `maxActive` canlı; sınır küresi hesabına değmez
      markDynamic(mesh);
      this.meshes[shape] = mesh;
      this.group.add(mesh);
    }
  }

  /**
   * Canlıları çizer. `timeSeconds`: monoton zaman (yürüme animasyonu için); ilk çağrıda faz ilerlemez.
   * Kapasiteyi (`maxActive`) aşan canlılar çizilmez.
   */
  update(views: ReadonlyArray<CreatureView>, timeSeconds: number): void {
    const dt =
      this.lastTime === null
        ? 0
        : Math.min(Math.max(timeSeconds - this.lastTime, 0), CREATURE_LOOK.maxFrameSeconds);
    this.lastTime = timeSeconds;

    for (const buffer of Object.values(this.buffers)) buffer.clear();
    this.seen.clear();
    let drawn = 0;
    let parts = 0;
    for (const view of views) {
      if (drawn >= CREATURES.maxActive) break;
      let phase = this.phases.get(view.id) ?? view.id * 0.7; // canlılar aynı fazda yürümesin
      if (!view.dead) phase += phaseDelta(view.kind, view.speed, dt);
      this.phases.set(view.id, phase);
      this.seen.add(view.id);
      parts += writeCreature(view, phase, this.buffers);
      drawn += 1;
    }
    // Görünümden çıkan canlıların fazı unutulur (harita büyümesin).
    if (this.phases.size > this.seen.size) {
      for (const id of this.phases.keys()) if (!this.seen.has(id)) this.phases.delete(id);
    }

    for (const shape of CREATURE_SHAPES) {
      const mesh = this.meshes[shape];
      const buffer = this.buffers[shape];
      commitInstances(mesh, buffer.count);
    }
    this.drawn = drawn;
    this.drawnParts = parts;
  }

  get stats(): CreatureLayerStats {
    return { instances: this.drawn, parts: this.drawnParts, meshes: CREATURE_SHAPES.length };
  }

  dispose(): void {
    for (const shape of CREATURE_SHAPES) {
      const mesh = this.meshes[shape];
      this.group.remove(mesh);
      mesh.dispose();
      this.geometries[shape].dispose();
    }
    this.phases.clear();
    this.seen.clear();
    this.material.dispose();
  }
}
