import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { TERRAIN_TEST } from '../config';
import { gridCells, sampleGrid, type GridSpec, type HeightSource } from './HeightSource';

/**
 * Yükseklik ızgarasından arazi mesh'i üretir. Vertex sırası ızgarayla aynıdır
 * (satır → z, sütun → x); dolayısıyla Rapier heightfield'ı ile birebir örtüşür.
 */
export function createTerrainGeometry(heights: Float32Array, grid: GridSpec): BufferGeometry {
  const cells = gridCells(grid);
  const geometry = new PlaneGeometry(grid.size, grid.size, cells, cells);
  geometry.rotateX(-Math.PI / 2); // PlaneGeometry XY düzleminde; Y-yukarı için yatır

  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setY(i, heights[i] as number);
  geometry.computeVertexNormals();

  // Eğime göre vertex rengi: düz yerde çim, dik yerde kaya.
  const normal = geometry.getAttribute('normal');
  const grass = new Color(TERRAIN_TEST.grassColor);
  const rock = new Color(TERRAIN_TEST.rockColor);
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let i = 0; i < position.count; i++) {
    color.copy(normal.getY(i) < TERRAIN_TEST.rockNormalY ? rock : grass);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

export function createTerrainMesh(
  source: HeightSource,
  grid: GridSpec,
): Mesh<BufferGeometry, MeshStandardMaterial> {
  const heights = sampleGrid(source, grid);
  const material = new MeshStandardMaterial({ vertexColors: true, flatShading: false });
  return new Mesh(createTerrainGeometry(heights, grid), material);
}
