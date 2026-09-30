import { REGION_BOUNDS } from '../config';
import { RAPIER, type PhysicsWorld } from './PhysicsWorld';

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Bölge sınırında dört görünmez duvar: oyuncu haritanın dışına (heightmap'in bittiği yere)
 * yürüyüp düşmesin. Duvarların iç yüzü tam sınırdadır; dış tarafa taşar.
 */
export function createBoundsWalls(physics: PhysicsWorld, bounds: WorldBounds): RAPIER.Collider[] {
  const t = REGION_BOUNDS.wallThickness;
  const halfHeight = (REGION_BOUNDS.wallTop - REGION_BOUNDS.wallBottom) / 2;
  const centerY = (REGION_BOUNDS.wallTop + REGION_BOUNDS.wallBottom) / 2;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midZ = (bounds.minZ + bounds.maxZ) / 2;

  // Köşelerde boşluk kalmasın diye doğu/batı duvarları kalınlık kadar uzundur.
  const walls: Array<[number, number, number, number]> = [
    // [merkez x, merkez z, yarı x, yarı z]
    [bounds.minX - t / 2, midZ, t / 2, depth / 2 + t],
    [bounds.maxX + t / 2, midZ, t / 2, depth / 2 + t],
    [midX, bounds.minZ - t / 2, width / 2 + t, t / 2],
    [midX, bounds.maxZ + t / 2, width / 2 + t, t / 2],
  ];
  return walls.map(([x, z, hx, hz]) =>
    physics.addStaticCollider(
      RAPIER.ColliderDesc.cuboid(hx, halfHeight, hz).setTranslation(x, centerY, z),
    ),
  );
}
