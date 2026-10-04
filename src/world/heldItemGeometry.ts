import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
} from 'three';
import type { ItemId } from '../items/itemDefs';
import { heldKind } from '../player/heldKinds';

/**
 * Elde tutulan eşyaların modelleri (düşük poligonlu, vertex renkli; bandit/person modelleriyle aynı yaklaşım). Her model
 * **tek geometri**dir. Ortak çerçeve: tutuş noktası orijin, eşya ileriye (−Z) uzanır, yukarısı +Y'dir; ölçüler gerçek
 * metredir (oyuncu 1,8 m). `muzzle`: ateşli silahın ağız noktası (ağız alevi buradan çıkar), `tip`: yakın silahın ucu
 * (savurma izi ve kıvılcım).
 */

export interface HeldModel {
  geometry: BufferGeometry;
  /** Ağız noktası (ateşli silah, sapan, yay); yoksa null. */
  muzzle: [number, number, number] | null;
  /** Yakın silahın ucu (iz ve kıvılcım); yoksa null. */
  tip: [number, number, number] | null;
}

interface Part {
  geometry: BufferGeometry;
  color: number;
}

const WOOD = 0x6b4a2c;
const DARK_WOOD = 0x4a3320;
const STEEL = 0x2b2a28;
const BLADE = 0xb9bdc1;
const STONE = 0x8a8d90;
const BONE = 0xd8cdb4;
const BRASS = 0xb08a3a;

function at(g: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  return g.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
}

/** Kutu: merkezi (x, y, z). */
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
): Part {
  return { geometry: at(new BoxGeometry(w, h, d), x, y, z), color };
}

/** Z ekseni boyunca silindir (uzunluk `len`, merkezi (x, y, zc)). */
function rod(
  r0: number,
  r1: number,
  len: number,
  x: number,
  y: number,
  zc: number,
  color: number,
): Part {
  // CylinderGeometry Y ekseni boyunca; Z'ye yatır (r0 öndeki −Z ucunun yarıçapı).
  const g = new CylinderGeometry(r0, r1, len, 8).applyMatrix4(
    new Matrix4().makeRotationX(Math.PI / 2),
  );
  return { geometry: at(g, x, y, zc), color };
}

/** Kutuyu X ekseni çevresinde döndürüp yerleştirir (eğik parçalar). */
function tiltedBox(
  w: number,
  h: number,
  d: number,
  rotX: number,
  x: number,
  y: number,
  z: number,
  color: number,
): Part {
  const g = new BoxGeometry(w, h, d).applyMatrix4(new Matrix4().makeRotationX(rotX));
  return { geometry: at(g, x, y, z), color };
}

function merge(parts: Part[]): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new Color();
  for (const p of parts) {
    const flat = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
    const pos = flat.getAttribute('position');
    c.setHex(p.color);
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      colors.push(c.r, c.g, c.b);
    }
    if (flat !== p.geometry) flat.dispose();
    p.geometry.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function model(
  parts: Part[],
  muzzle: HeldModel['muzzle'] = null,
  tip: HeldModel['tip'] = null,
): HeldModel {
  return { geometry: merge(parts), muzzle, tip };
}

/** Elde tutulan eşyanın modeli; elde görünümü olmayan eşyada null. Her çağrıda yeni geometri üretir (sahibi dispose eder). */
export function buildHeldModel(id: ItemId): HeldModel | null {
  const kind = heldKind(id);
  if (kind === null) return null;
  switch (id) {
    case 'pistol':
      return model(
        [
          box(0.034, 0.05, 0.2, 0, 0.03, -0.09, STEEL), // sürgü
          tiltedBox(0.034, 0.11, 0.05, 0.25, 0, -0.04, 0.02, DARK_WOOD), // kabza
          box(0.02, 0.012, 0.03, 0, 0.0, -0.03, STEEL), // tetik koruması
        ],
        [0, 0.035, -0.2],
      );
    case 'shotgun':
      return model(
        [
          rod(0.014, 0.014, 0.72, 0, 0.03, -0.34, STEEL), // namlu
          rod(0.011, 0.011, 0.5, 0, 0.0, -0.26, STEEL), // şarjör borusu
          box(0.05, 0.06, 0.22, 0, 0.02, -0.02, STEEL), // gövde
          tiltedBox(0.045, 0.1, 0.3, -0.1, 0, -0.03, 0.22, DARK_WOOD), // dipçik
          box(0.05, 0.045, 0.18, 0, -0.005, -0.3, WOOD), // ön kundak
        ],
        [0, 0.03, -0.71],
      );
    case 'rifle':
      return model(
        [
          rod(0.011, 0.011, 0.62, 0, 0.035, -0.3, STEEL),
          box(0.045, 0.07, 0.28, 0, 0.02, -0.02, STEEL),
          tiltedBox(0.04, 0.1, 0.3, -0.12, 0, -0.03, 0.22, DARK_WOOD),
          box(0.045, 0.04, 0.22, 0, 0.0, -0.3, WOOD),
          box(0.025, 0.09, 0.04, 0, -0.07, -0.08, STEEL), // şarjör
        ],
        [0, 0.035, -0.62],
      );
    case 'sniper_rifle':
      return model(
        [
          rod(0.012, 0.012, 0.8, 0, 0.04, -0.4, STEEL),
          box(0.045, 0.07, 0.3, 0, 0.02, -0.02, STEEL),
          tiltedBox(0.04, 0.11, 0.34, -0.12, 0, -0.03, 0.24, DARK_WOOD),
          box(0.045, 0.04, 0.3, 0, 0.0, -0.32, WOOD),
          rod(0.022, 0.022, 0.28, 0, 0.1, -0.08, 0x1d1c1b), // dürbün
          box(0.02, 0.05, 0.02, 0, 0.065, -0.2, STEEL),
          box(0.02, 0.05, 0.02, 0, 0.065, 0.04, STEEL),
        ],
        [0, 0.04, -0.82],
      );
    case 'slingshot':
      return model(
        [
          box(0.025, 0.11, 0.025, 0, -0.04, 0, WOOD),
          tiltedBox(0.02, 0.1, 0.02, -0.5, 0.045, 0.045, -0.04, WOOD),
          tiltedBox(0.02, 0.1, 0.02, 0.5, -0.045, 0.045, -0.04, WOOD),
          box(0.09, 0.012, 0.012, 0, 0.1, -0.075, 0x3a2c20), // lastik
        ],
        [0, 0.09, -0.09],
      );
    case 'bow':
      return model(
        [
          box(0.03, 0.14, 0.04, 0, 0, 0, DARK_WOOD), // kabza
          tiltedBox(0.025, 0.3, 0.025, 0.35, 0, 0.2, -0.06, WOOD), // üst yay kolu
          tiltedBox(0.025, 0.3, 0.025, -0.35, 0, -0.2, -0.06, WOOD), // alt yay kolu
          box(0.008, 0.62, 0.008, 0, 0, 0.05, 0xd8d0c0), // kiriş
        ],
        [0, 0, -0.1],
      );
    case 'stone_axe':
      return model(
        [
          rod(0.02, 0.022, 0.55, 0, 0, -0.17, WOOD),
          box(0.03, 0.13, 0.1, 0, 0.03, -0.42, STONE),
          box(0.045, 0.05, 0.04, 0, 0.0, -0.4, 0x6e6a60), // bağ
        ],
        null,
        [0, 0.07, -0.43],
      );
    case 'stone_spear':
      return model(
        [
          rod(0.014, 0.017, 1.3, 0, 0, -0.3, WOOD),
          tiltedBox(0.022, 0.035, 0.16, 0, 0, 0, -1.02, STONE),
        ],
        null,
        [0, 0, -1.1],
      );
    case 'bone_knife':
      return model(
        [rod(0.015, 0.017, 0.11, 0, 0, 0.03, WOOD), box(0.012, 0.032, 0.2, 0, 0.005, -0.14, BONE)],
        null,
        [0, 0, -0.24],
      );
    case 'iron_dagger':
      return model(
        [
          rod(0.015, 0.017, 0.11, 0, 0, 0.03, DARK_WOOD),
          box(0.07, 0.014, 0.02, 0, 0, -0.04, STEEL), // siper
          box(0.012, 0.034, 0.22, 0, 0.003, -0.16, BLADE),
        ],
        null,
        [0, 0, -0.27],
      );
    case 'club':
      return model([rod(0.03, 0.058, 0.62, 0, 0, -0.2, WOOD)], null, [0, 0, -0.5]);
    case 'pala':
      return model(
        [
          rod(0.016, 0.018, 0.13, 0, 0, 0.04, DARK_WOOD),
          box(0.08, 0.016, 0.02, 0, 0, -0.04, BRASS), // siper
          box(0.012, 0.05, 0.4, 0, 0.0, -0.26, BLADE),
          tiltedBox(0.012, 0.06, 0.18, -0.12, 0, 0.012, -0.56, BLADE), // pala ucu
        ],
        null,
        [0, 0.015, -0.64],
      );
    case 'torch':
      return model(
        [
          rod(0.022, 0.026, 0.5, 0, 0, -0.15, WOOD),
          box(0.07, 0.07, 0.1, 0, 0, -0.45, 0x3a2c20), // sarılı bez
          box(0.05, 0.06, 0.07, 0, 0.045, -0.46, 0xffa030), // alev
        ],
        null,
        [0, 0.05, -0.46],
      );
    case 'miner_lamp':
      return model([
        box(0.1, 0.12, 0.1, 0, 0, -0.06, 0x55524a),
        box(0.075, 0.075, 0.075, 0, 0.0, -0.06, 0xffd98a), // cam/alev
        box(0.12, 0.012, 0.012, 0, 0.09, -0.06, STEEL), // kulp
      ]);
    case 'hoe':
      return model(
        [
          rod(0.016, 0.018, 0.9, 0, 0, -0.25, WOOD),
          tiltedBox(0.1, 0.012, 0.07, 0.6, 0, -0.03, -0.69, STEEL),
        ],
        null,
        [0, -0.03, -0.7],
      );
    case 'sickle':
      return model(
        [
          rod(0.016, 0.018, 0.14, 0, 0, 0.03, WOOD),
          box(0.01, 0.04, 0.2, 0, 0.02, -0.15, BLADE),
          tiltedBox(0.01, 0.04, 0.1, 0.7, 0, 0.065, -0.3, BLADE),
        ],
        null,
        [0, 0.07, -0.32],
      );
    case 'drone':
      return model([
        box(0.16, 0.05, 0.16, 0, 0, -0.1, 0x2a2c30),
        box(0.34, 0.012, 0.012, 0, 0.02, -0.1, 0x55565a),
        box(0.012, 0.012, 0.34, 0, 0.02, -0.1, 0x55565a),
        box(0.1, 0.006, 0.1, -0.17, 0.03, -0.1, 0x8a8d90),
        box(0.1, 0.006, 0.1, 0.17, 0.03, -0.1, 0x8a8d90),
        box(0.1, 0.006, 0.1, 0, 0.03, -0.27, 0x8a8d90),
        box(0.1, 0.006, 0.1, 0, 0.03, 0.07, 0x8a8d90),
      ]);
    case 'water_container_empty':
    case 'water_container_full':
      return model([
        rod(0.06, 0.06, 0.18, 0, -0.03, -0.1, id === 'water_container_full' ? 0x4f7fb0 : 0x8a6a48),
        rod(0.025, 0.025, 0.05, 0, -0.03, -0.215, 0x5a4630),
      ]);
    case 'copper_pot':
      return model([
        rod(0.09, 0.09, 0.11, 0, -0.04, -0.1, 0xb87333),
        box(0.2, 0.012, 0.012, 0, 0.0, -0.1, 0x8a5a2a),
      ]);
    case 'wool_blanket':
      return model([box(0.22, 0.07, 0.28, 0, -0.02, -0.15, 0x9a4a3a)]);
    case 'hide_vest':
      return model([box(0.22, 0.06, 0.3, 0, -0.02, -0.15, 0x7a5a38)]);
    case 'fur_cloak':
      return model([box(0.24, 0.08, 0.3, 0, -0.02, -0.15, 0x5a4636)]);
    case 'steel_vest':
      return model([
        box(0.22, 0.07, 0.3, 0, -0.02, -0.15, 0x4f575e),
        box(0.16, 0.02, 0.1, 0, 0.02, -0.1, 0x7a848d),
      ]);
    default:
      return null;
  }
}
