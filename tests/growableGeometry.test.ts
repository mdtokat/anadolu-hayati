import { describe, expect, it } from 'vitest';
import { BufferGeometry, Mesh, MeshBasicMaterial, type BufferAttribute } from 'three';
import { flatNormals, GrowableGeometry } from '../src/world/growableGeometry';
import { RoadStructureLayer } from '../src/world/RoadStructureLayer';

const ATTRS = [
  { name: 'position', itemSize: 3 },
  { name: 'color', itemSize: 3 },
] as const;

describe('GrowableGeometry', () => {
  it('kapasite içinde aynı geometriyi kullanır, yalnız dolu kısmı çizer/yükler', () => {
    const mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
    const buffer = new GrowableGeometry(mesh, ATTRS, 16);
    const first = mesh.geometry;
    let disposed = 0;
    first.addEventListener('dispose', () => disposed++);

    buffer.set({ position: new Float32Array(9).fill(1), color: new Float32Array(9) }, 3);
    expect(mesh.geometry).toBe(first);
    expect(mesh.geometry.drawRange).toEqual({ start: 0, count: 3 });
    expect((mesh.geometry.getAttribute('position') as BufferAttribute).updateRanges).toEqual([
      { start: 0, count: 9 },
    ]);
    expect(mesh.visible).toBe(true);

    buffer.set({ position: [], color: [] }, 0);
    expect(mesh.geometry).toBe(first);
    expect(mesh.visible).toBe(false);
    expect(disposed).toBe(0);
  });

  it('kapasite yetmezse büyür (en az iki kat), eski geometri dispose edilir, veri doğru yazılır', () => {
    const mesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
    const buffer = new GrowableGeometry(mesh, ATTRS, 4);
    const first = mesh.geometry;
    let disposed = false;
    first.addEventListener('dispose', () => (disposed = true));
    const n = 5;
    const position = Float32Array.from({ length: n * 3 }, (_, i) => i);
    buffer.set({ position, color: new Float32Array(n * 3) }, n);
    expect(disposed).toBe(true);
    expect(mesh.geometry).not.toBe(first);
    expect(buffer.vertexCapacity).toBeGreaterThanOrEqual(8);
    const written = mesh.geometry.getAttribute('position').array as Float32Array;
    expect(Array.from(written.subarray(0, n * 3))).toEqual(Array.from(position));
  });

  it('flatNormals üçgenin yüz normalini üç köşeye yazar', () => {
    const p = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, -1]);
    const n = new Float32Array(9);
    flatNormals(p, n, 3);
    expect(Array.from(n, (v) => v + 0)).toEqual([0, 1, 0, 0, 1, 0, 0, 1, 0]);
  });
});

describe('RoadStructureLayer', () => {
  it('yenilemede tamponu yeniden kullanır ve yapı köşelerini önbellekten yazar', () => {
    const box = {
      x: 0,
      y: 1,
      z: 0,
      hl: 2,
      hw: 1,
      hh: 1,
      fx: 1,
      fy: 0,
      fz: 0,
      rx: 0,
      rz: 1,
      color: 0x808080,
    };
    const index = {
      near: (x: number) => (x < 100 ? [0, 1] : [1]),
      shape: (id: number) => ({ boxes: id === 0 ? [box] : [box, { ...box, x: 5 }] }),
    };
    const layer = new RoadStructureLayer(index as never);
    layer.update(0, 0);
    const mesh = layer.group.children[0] as Mesh;
    const geometry = mesh.geometry;
    expect(geometry.drawRange.count).toBe(3 * 36);
    layer.update(200, 0);
    expect(mesh.geometry).toBe(geometry); // aynı tampon
    expect(mesh.geometry.drawRange.count).toBe(2 * 36);
    layer.dispose();
  });
});
