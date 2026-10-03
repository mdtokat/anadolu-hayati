import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  SphereGeometry,
} from 'three';
import type { BanditRole, BanditWeapon } from '../bandits/kinds';

/**
 * Eşkıya ve yankesici modelleri (Faz 11): düşük poligonlu, vertex renkli; `personGeometry` ile aynı iskelet (gövde,
 * sallanan bacaklar ve kollar; omuz/kalça eklemi geometrinin üstünde, y = 0). Dağ eşkıyası: siyah şalvar, beyaz gömlek,
 * koyu yelek, belde kırmızı kuşak, göğüste çapraz fişeklik, başta poşu; reiste kalpak. Silah gövdeye bağlı (sırtta tüfek,
 * belde tabanca/pala, elde sopa). Yankesici: gri ceket, kasket.
 */

interface Part {
  geometry: BufferGeometry;
  color: number;
}

export interface BanditGeometry {
  body: BufferGeometry;
  leg: BufferGeometry;
  arm: BufferGeometry;
  hipY: number;
  shoulderY: number;
  shoulderX: number;
  hipX: number;
}

const SKIN = 0xc29470;

function at(g: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  return g.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y0: number,
  z: number,
  color: number,
): Part {
  return { geometry: at(new BoxGeometry(w, h, d), x, y0 + h / 2, z), color };
}

function tilted(
  g: BufferGeometry,
  angleZ: number,
  x: number,
  y: number,
  z: number,
  color: number,
): Part {
  g.applyMatrix4(new Matrix4().makeRotationZ(angleZ));
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

const HIP_Y = 0.88;
const SHOULDER_Y = 1.44;
const SHOULDER_X = 0.27;
const HIP_X = 0.1;

/** Silahın gövdedeki duruşu (model ön yüzü +z). */
function weaponParts(weapon: BanditWeapon): Part[] {
  switch (weapon) {
    case 'rifle':
    case 'sniper_rifle': {
      const parts = [
        tilted(new BoxGeometry(0.05, 1.15, 0.06), 0.55, 0.02, SHOULDER_Y - 0.15, -0.17, 0x3b2a1c),
        tilted(new BoxGeometry(0.03, 0.7, 0.03), 0.55, 0.15, SHOULDER_Y + 0.05, -0.17, 0x2b2a28),
      ];
      if (weapon === 'sniper_rifle') {
        parts.push(
          tilted(
            new CylinderGeometry(0.035, 0.035, 0.3, 6),
            0.55,
            0.05,
            SHOULDER_Y,
            -0.22,
            0x1d1c1b,
          ),
        );
      }
      return parts;
    }
    case 'shotgun':
      return [
        tilted(new BoxGeometry(0.05, 1.0, 0.06), -0.6, -0.02, SHOULDER_Y - 0.15, -0.17, 0x4a3320),
        tilted(new BoxGeometry(0.06, 0.55, 0.035), -0.6, -0.16, SHOULDER_Y + 0.02, -0.17, 0x2b2a28),
      ];
    case 'pistol':
      return [box(0.07, 0.16, 0.14, 0.24, HIP_Y - 0.05, 0.05, 0x242322)];
    case 'pala':
      return [
        tilted(new BoxGeometry(0.04, 0.62, 0.09), 0.25, -0.26, HIP_Y - 0.2, 0.05, 0xb9bdc1),
        box(0.06, 0.12, 0.06, -0.23, HIP_Y + 0.08, 0.05, 0x3b2a1c),
      ];
    case 'club':
      return [
        tilted(
          new CylinderGeometry(0.06, 0.035, 0.85, 6),
          -0.15,
          0.36,
          HIP_Y - 0.1,
          0.12,
          0x6b4a2c,
        ),
      ];
  }
}

/** Sokak çetesi modeli: şehir kıyafeti (deri ceket, kasket/bere); çeteyi ceket rengi ayırır (0 kızıl, 1 lacivert). */
function buildGangGeometry(
  role: BanditRole,
  weapon: BanditWeapon,
  faction: number,
): BanditGeometry {
  const jacket = faction === 0 ? 0x7a2a26 : 0x2c3f63;
  const trim = faction === 0 ? 0x2a1412 : 0x161e30;
  const parts: Part[] = [
    box(0.42, SHOULDER_Y - HIP_Y, 0.24, 0, HIP_Y, 0, 0x2b2b2e), // tişört
    box(0.45, 0.5, 0.26, 0, HIP_Y + 0.06, 0, jacket), // ceket
    box(0.46, 0.06, 0.27, 0, HIP_Y + 0.02, 0, trim), // ceket eteği
    box(0.1, 0.08, 0.1, 0, SHOULDER_Y, 0, SKIN),
    { geometry: at(new SphereGeometry(0.115, 8, 6), 0, SHOULDER_Y + 0.2, 0), color: SKIN },
  ];
  if (role === 'leader') {
    // Reis: fötr şapka.
    parts.push(box(0.34, 0.04, 0.34, 0, SHOULDER_Y + 0.3, 0, 0x1f1d1b));
    parts.push(box(0.2, 0.14, 0.2, 0, SHOULDER_Y + 0.33, 0, 0x1f1d1b));
  } else {
    // Üyeler: bere.
    parts.push({
      geometry: at(new SphereGeometry(0.13, 8, 6), 0, SHOULDER_Y + 0.25, -0.01),
      color: trim,
    });
  }
  parts.push(...weaponParts(weapon));
  return limbs(merge(parts), 0x23262b, 0x16130f, jacket);
}

/** Eşkıya modeli (rol ve silaha göre); `faction` 0/1 ise sokak çetesi kıyafeti. */
export function buildBanditGeometry(
  role: BanditRole,
  weapon: BanditWeapon,
  faction = -1,
): BanditGeometry {
  if (faction >= 0) return buildGangGeometry(role, weapon, faction);
  const parts: Part[] = [
    box(0.42, SHOULDER_Y - HIP_Y, 0.24, 0, HIP_Y, 0, 0xd8d0c0), // gömlek
    box(0.44, 0.44, 0.26, 0, HIP_Y + 0.1, 0, 0x3b2a1e), // yelek
    box(0.45, 0.1, 0.27, 0, HIP_Y - 0.02, 0, 0x8a2f2a), // kuşak
    tilted(new BoxGeometry(0.06, 0.62, 0.02), 0.7, 0, HIP_Y + 0.3, 0.135, 0x6b5233), // fişeklik
    box(0.1, 0.08, 0.1, 0, SHOULDER_Y, 0, SKIN),
    { geometry: at(new SphereGeometry(0.115, 8, 6), 0, SHOULDER_Y + 0.2, 0), color: SKIN },
    box(0.08, 0.03, 0.02, 0, SHOULDER_Y + 0.15, 0.11, 0x2a221c), // bıyık
  ];
  if (role === 'leader') {
    parts.push({
      geometry: at(new CylinderGeometry(0.13, 0.12, 0.2, 8), 0, SHOULDER_Y + 0.36, 0),
      color: 0x3a3029,
    }); // kalpak
  } else {
    // Poşu: başa sarılı siyah-beyaz yemeni.
    parts.push({
      geometry: at(new SphereGeometry(0.13, 8, 6), 0, SHOULDER_Y + 0.25, -0.01),
      color: 0x2a2826,
    });
    parts.push(box(0.27, 0.04, 0.27, 0, SHOULDER_Y + 0.25, 0, 0xd9d4c8));
  }
  parts.push(...weaponParts(weapon));
  return limbs(merge(parts), 0x2a2622, 0x1f1a16, 0xd8d0c0);
}

/** Yankesici modeli: gri ceket, koyu pantolon, kasket. */
export function buildPickpocketGeometry(): BanditGeometry {
  const parts: Part[] = [
    box(0.42, SHOULDER_Y - HIP_Y, 0.24, 0, HIP_Y, 0, 0x55575a),
    box(0.1, 0.08, 0.1, 0, SHOULDER_Y, 0, SKIN),
    { geometry: at(new SphereGeometry(0.115, 8, 6), 0, SHOULDER_Y + 0.2, 0), color: SKIN },
    box(0.27, 0.06, 0.32, 0, SHOULDER_Y + 0.29, 0.04, 0x3a3a3a),
  ];
  return limbs(merge(parts), 0x2d2f33, 0x1f1a16, 0x55575a);
}

function limbs(
  body: BufferGeometry,
  trousers: number,
  shoes: number,
  sleeves: number,
): BanditGeometry {
  const leg = merge([
    box(0.17, HIP_Y - 0.08, 0.19, 0, -HIP_Y + 0.08, 0, trousers),
    box(0.17, 0.08, 0.24, 0, -HIP_Y, 0.03, shoes),
  ]);
  const arm = merge([
    box(0.11, 0.5, 0.12, 0, -0.52, 0, sleeves),
    box(0.09, 0.1, 0.1, 0, -0.62, 0, SKIN),
  ]);
  return { body, leg, arm, hipY: HIP_Y, shoulderY: SHOULDER_Y, shoulderX: SHOULDER_X, hipX: HIP_X };
}
