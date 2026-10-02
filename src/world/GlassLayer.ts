import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { BUILDING_LOOK, GLASS } from '../config';
import { localToWorld } from '../placement/structureShapes';
import type { Building } from '../settlements/layout';
import type { SettlementMap } from '../settlements/SettlementMap';
import { paneId, windowPanes, type WindowPane } from '../settlements/windows';
import { createRandom } from '../utils/random';

/** Düşen cam kırığı: konum, hız, kalan ömür (sn), boy ve dönüş. */
interface Shard {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  spin: number;
  floor: number;
}

/**
 * Pencere camları (kullanıcı talimatı: "binaların içindeyken camdan dışarısı görünsün, ateş edince cam kırılsın").
 * Oyuncuya `BUILDING_LOOK.interiorRadius` içindeki girilebilir yapıların kırılmamış camları tek saydam mesh'tir
 * (yalnızca o kademede duvar delinir; `world/buildingGeometry.ts`). Kırık camlar `broken` kümesindedir (kayda girmez:
 * oturumluk); kırılan camdan düşen kırıklar kısa ömürlü üçgenlerdir. +2 draw call (cam, kırıklar).
 */
export class GlassLayer {
  readonly group = new Group();
  /** Kırık cam kimlikleri (`settlements/windows.ts` `paneId`). Mermi sorgusu da bunu okur. */
  readonly broken = new Set<number>();
  private readonly material = new MeshStandardMaterial({
    color: GLASS.color,
    transparent: true,
    opacity: GLASS.opacity,
    roughness: 0.05,
    metalness: 0.1,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly shardMaterial = new MeshStandardMaterial({
    color: GLASS.color,
    transparent: true,
    opacity: Math.min(1, GLASS.opacity * 2.2),
    roughness: 0.1,
    side: DoubleSide,
  });
  private readonly mesh = new Mesh(new BufferGeometry(), this.material);
  private readonly shardMesh = new Mesh(new BufferGeometry(), this.shardMaterial);
  private shards: Shard[] = [];
  private lastX = NaN;
  private lastZ = NaN;
  private dirty = true;
  private readonly random = createRandom(GLASS.shardSeed);

  constructor(private readonly map: Pick<SettlementMap, 'buildingsNear'>) {
    this.mesh.name = 'window-glass';
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.shardMesh.name = 'glass-shards';
    this.shardMesh.frustumCulled = false;
    this.shardMesh.visible = false;
    this.group.add(this.mesh, this.shardMesh);
  }

  /** Camları kırar (bilinmeyen/zaten kırık kimlik yok sayılır) ve kırık parçaları saçar. */
  breakPanes(ids: readonly number[], from: { x: number; z: number }): void {
    let changed = false;
    for (const id of ids) {
      if (this.broken.has(id)) continue;
      this.broken.add(id);
      changed = true;
      const pane = this.findPane(id, from);
      if (pane) this.burst(pane.building, pane.pane, from);
    }
    if (changed) this.dirty = true;
  }

  private lastTime = NaN;

  /** Kare başına (`time`: saniye): cam mesh'i yer değiştirince/kırılınca yenilenir; kırıklar düşer. */
  update(x: number, z: number, time: number): void {
    const dt = Number.isFinite(this.lastTime)
      ? Math.min(Math.max(time - this.lastTime, 0), 0.1)
      : 0;
    this.lastTime = time;
    if (
      this.dirty ||
      !(Math.hypot(x - this.lastX, z - this.lastZ) < BUILDING_LOOK.refreshDistance / 2)
    ) {
      this.lastX = x;
      this.lastZ = z;
      this.dirty = false;
      this.rebuild(x, z);
    }
    if (this.shards.length > 0) this.stepShards(dt);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.shardMesh.geometry.dispose();
    this.material.dispose();
    this.shardMaterial.dispose();
  }

  /** Görünen cam sayısı (test/hata ayıklama). */
  get paneCount(): number {
    return (this.mesh.geometry.getAttribute('position')?.count ?? 0) / 6;
  }

  private rebuild(x: number, z: number): void {
    const positions: number[] = [];
    for (const b of this.map.buildingsNear(x, z, BUILDING_LOOK.interiorRadius)) {
      if (b.ruined || Math.hypot(b.x - x, b.z - z) > BUILDING_LOOK.interiorRadius) continue;
      for (const pane of windowPanes(b.kind)) {
        if (this.broken.has(paneId(b.id, pane.index))) continue;
        pushQuad(positions, paneCorners(b, pane));
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
  }

  private findPane(
    id: number,
    near: { x: number; z: number },
  ): { building: Building; pane: WindowPane } | null {
    for (const b of this.map.buildingsNear(near.x, near.z, GLASS.searchRadius)) {
      for (const pane of windowPanes(b.kind)) {
        if (paneId(b.id, pane.index) === id) return { building: b, pane };
      }
    }
    return null;
  }

  private burst(b: Building, pane: WindowPane, from: { x: number; z: number }): void {
    const c = localToWorld(b, pane.cx, pane.cz);
    const cy = b.y + pane.cy;
    // Kırıklar mermi yönünde (atıştan uzağa) saçılır.
    const dx = c.x - from.x;
    const dz = c.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < GLASS.shardCount; i++) {
      const r = this.random;
      this.shards.push({
        x: c.x + (r.next() - 0.5) * pane.w * 0.8,
        y: cy + (r.next() - 0.5) * pane.h * 0.8,
        z: c.z + (r.next() - 0.5) * pane.w * 0.8,
        vx: (dx / len) * (0.6 + r.next() * 1.4) + (r.next() - 0.5) * 0.8,
        vy: r.next() * 1.2,
        vz: (dz / len) * (0.6 + r.next() * 1.4) + (r.next() - 0.5) * 0.8,
        life: GLASS.shardSeconds * (0.6 + r.next() * 0.4),
        size: 0.05 + r.next() * 0.09,
        spin: r.next() * Math.PI * 2,
        floor: b.y,
      });
    }
  }

  private stepShards(dt: number): void {
    const positions: number[] = [];
    const alive: Shard[] = [];
    for (const s of this.shards) {
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vy -= GLASS.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < s.floor + 0.02) {
        s.y = s.floor + 0.02;
        s.vx *= 0.3;
        s.vz *= 0.3;
        s.vy = 0;
      } else {
        s.spin += dt * 9;
      }
      const a = Math.cos(s.spin) * s.size;
      const b = Math.sin(s.spin) * s.size;
      positions.push(
        s.x - a,
        s.y,
        s.z - b,
        s.x + a,
        s.y + s.size * 0.5,
        s.z + b,
        s.x + b * 0.5,
        s.y + s.size,
        s.z - a * 0.5,
      );
      alive.push(s);
    }
    this.shards = alive;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    this.shardMesh.geometry.dispose();
    this.shardMesh.geometry = geometry;
    this.shardMesh.visible = alive.length > 0;
  }
}

/** Camın dünya köşeleri (alt-sol, alt-sağ, üst-sağ, üst-sol): duvarın orta düzleminde. */
export function paneCorners(b: Building, pane: WindowPane): number[][] {
  const alongX = pane.face === 'front' || pane.face === 'back';
  const hw = pane.w / 2;
  const y0 = b.y + pane.cy - pane.h / 2;
  const y1 = b.y + pane.cy + pane.h / 2;
  const ends = alongX
    ? [
        [pane.cx - hw, pane.cz],
        [pane.cx + hw, pane.cz],
      ]
    : [
        [pane.cx, pane.cz - hw],
        [pane.cx, pane.cz + hw],
      ];
  const [a, c] = ends.map(([lx, lz]) => localToWorld(b, lx as number, lz as number)) as [
    { x: number; z: number },
    { x: number; z: number },
  ];
  return [
    [a.x, y0, a.z],
    [c.x, y0, c.z],
    [c.x, y1, c.z],
    [a.x, y1, a.z],
  ];
}

function pushQuad(out: number[], q: number[][]): void {
  for (const i of [0, 1, 2, 0, 2, 3]) out.push(...(q[i] as number[]));
}
