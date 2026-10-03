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
import { isGangStyle, type BanditStyle } from '../bandits/styles';

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

/** Çete renkleri (0 kızıl, 1 lacivert, 2 yeşil): ceket/atlet rengi ve koyu süs rengi. */
const GANG_COLORS: ReadonlyArray<{ main: number; trim: number }> = [
  { main: 0x7a2a26, trim: 0x2a1412 },
  { main: 0x2c3f63, trim: 0x161e30 },
  { main: 0x2f5a3a, trim: 0x15281a },
];

/**
 * Sokak çetesi modeli: şehir kıyafeti; çeteyi ana renk ayırır (0 kızıl, 1 lacivert, 2 yeşil), çeşidi (`style`) kıyafet
 * biçimi belirler: deri ceket, kapüşonlu, takım elbise + fötr şapka, atlet + bandana.
 */
function buildGangGeometry(
  role: BanditRole,
  weapon: BanditWeapon,
  faction: number,
  style: BanditStyle,
): BanditGeometry {
  const { main, trim } = GANG_COLORS[faction % GANG_COLORS.length]!;
  const head: Part[] = [
    box(0.1, 0.08, 0.1, 0, SHOULDER_Y, 0, SKIN),
    { geometry: at(new SphereGeometry(0.115, 8, 6), 0, SHOULDER_Y + 0.2, 0), color: SKIN },
  ];
  let parts: Part[];
  let sleeves = main;
  switch (style) {
    case 'hoodie':
      parts = [
        box(0.44, SHOULDER_Y - HIP_Y + 0.02, 0.26, 0, HIP_Y, 0, main), // kapüşonlu gövde
        box(0.3, 0.1, 0.04, 0, HIP_Y + 0.08, 0.145, trim), // karın cebi
        // Kapüşon: başın arkasında ve üstünde.
        {
          geometry: at(new SphereGeometry(0.15, 8, 6), 0, SHOULDER_Y + 0.2, -0.03),
          color: main,
        },
        ...head,
      ];
      break;
    case 'suit':
      parts = [
        box(0.45, SHOULDER_Y - HIP_Y + 0.02, 0.26, 0, HIP_Y, 0, 0x1d1d22), // takım
        box(0.1, 0.42, 0.02, 0, HIP_Y + 0.08, 0.135, 0xe8e4da), // gömlek
        box(0.035, 0.3, 0.02, 0, HIP_Y + 0.06, 0.145, main), // kravat
        ...head,
        box(0.34, 0.035, 0.34, 0, SHOULDER_Y + 0.29, 0, 0x16161a), // fötr kenar
        box(0.2, 0.13, 0.2, 0, SHOULDER_Y + 0.32, 0, 0x16161a), // fötr tepe
        box(0.205, 0.03, 0.205, 0, SHOULDER_Y + 0.33, 0, main), // fötr kurdelesi
      ];
      sleeves = 0x1d1d22;
      break;
    case 'tank':
      parts = [
        box(0.42, SHOULDER_Y - HIP_Y, 0.24, 0, HIP_Y, 0, main), // atlet
        box(0.42, 0.04, 0.245, 0, SHOULDER_Y - 0.04, 0, SKIN), // omuz çizgisi
        box(0.12, 0.012, 0.012, 0, SHOULDER_Y - 0.03, 0.125, 0xd4b13a), // zincir
        ...head,
        box(0.27, 0.05, 0.27, 0, SHOULDER_Y + 0.25, 0, 0xb02a24), // bandana
        box(0.06, 0.06, 0.04, 0, SHOULDER_Y + 0.22, -0.14, 0xb02a24), // düğüm
      ];
      sleeves = SKIN;
      break;
    default:
      // jacket: deri ceket + tişört; reiste fötr şapka, üyelerde bere.
      parts = [
        box(0.42, SHOULDER_Y - HIP_Y, 0.24, 0, HIP_Y, 0, 0x2b2b2e), // tişört
        box(0.45, 0.5, 0.26, 0, HIP_Y + 0.06, 0, main), // ceket
        box(0.46, 0.06, 0.27, 0, HIP_Y + 0.02, 0, trim), // ceket eteği
        ...head,
      ];
      if (role === 'leader') {
        parts.push(box(0.34, 0.04, 0.34, 0, SHOULDER_Y + 0.3, 0, 0x1f1d1b));
        parts.push(box(0.2, 0.14, 0.2, 0, SHOULDER_Y + 0.33, 0, 0x1f1d1b));
      } else {
        parts.push({
          geometry: at(new SphereGeometry(0.13, 8, 6), 0, SHOULDER_Y + 0.25, -0.01),
          color: trim,
        });
      }
  }
  parts.push(...weaponParts(weapon));
  return limbs(merge(parts), 0x23262b, 0x16130f, sleeves);
}

/** Kamp eşkıyası (dağ eşkıyası dışındaki) çeşitleri: yol kesen, kaçakçı, nişancı, kavgacı. */
function buildCampStyleGeometry(
  role: BanditRole,
  weapon: BanditWeapon,
  style: Exclude<BanditStyle, GangStyleName>,
): BanditGeometry {
  const face: Part[] = [
    box(0.1, 0.08, 0.1, 0, SHOULDER_Y, 0, SKIN),
    { geometry: at(new SphereGeometry(0.115, 8, 6), 0, SHOULDER_Y + 0.2, 0), color: SKIN },
  ];
  let parts: Part[];
  let trousers: number;
  let sleeves: number;
  switch (style) {
    case 'highwayman':
      parts = [
        box(0.5, 0.92, 0.3, 0, HIP_Y - 0.34, 0, 0x2e2620), // uzun pelerin/palto
        box(0.52, 0.1, 0.32, 0, SHOULDER_Y - 0.1, 0, 0x241d17), // yaka
        ...face,
        box(0.22, 0.09, 0.02, 0, SHOULDER_Y + 0.17, 0.115, 0x3a1f1f), // yüz bezi
        box(0.46, 0.03, 0.46, 0, SHOULDER_Y + 0.28, 0, 0x241d17), // geniş şapka kenarı
        box(0.22, 0.17, 0.22, 0, SHOULDER_Y + 0.31, 0, 0x241d17),
      ];
      sleeves = 0x2e2620;
      trousers = 0x1f1a16;
      break;
    case 'smuggler':
      parts = [
        box(0.42, SHOULDER_Y - HIP_Y, 0.24, 0, HIP_Y, 0, 0xc9b99a), // gömlek
        box(0.44, 0.4, 0.26, 0, HIP_Y + 0.12, 0, 0x5a3d26), // deri yelek
        box(0.32, 0.4, 0.16, 0, HIP_Y + 0.05, -0.2, 0x3b4a2e), // sırt çantası
        box(0.3, 0.06, 0.12, 0, HIP_Y + 0.42, -0.2, 0x2a3320), // çanta kapağı
        ...face,
        box(0.3, 0.05, 0.3, 0, SHOULDER_Y + 0.29, 0, 0x4a4a42), // kasket
        box(0.22, 0.02, 0.12, 0, SHOULDER_Y + 0.27, 0.17, 0x35352f), // siperlik
      ];
      sleeves = 0xc9b99a;
      trousers = 0x3a3f2e;
      break;
    case 'marksman':
      parts = [
        box(0.44, SHOULDER_Y - HIP_Y + 0.02, 0.26, 0, HIP_Y, 0, 0x4a5a34), // zeytin yeşili ceket
        box(0.18, 0.14, 0.02, -0.1, HIP_Y + 0.22, 0.135, 0x38442a), // kamuflaj lekeleri
        box(0.14, 0.12, 0.02, 0.1, HIP_Y + 0.08, 0.135, 0x38442a),
        ...face,
        box(0.4, 0.03, 0.4, 0, SHOULDER_Y + 0.27, 0, 0x4a5a34), // geniş kenarlı şapka
        box(0.22, 0.1, 0.22, 0, SHOULDER_Y + 0.31, 0, 0x4a5a34),
        box(0.2, 0.06, 0.02, 0, SHOULDER_Y + 0.15, 0.11, 0x2e3a22), // yüz boyası
      ];
      sleeves = 0x4a5a34;
      trousers = 0x3a4430;
      break;
    default:
      // brawler: yırtık gömlek (kollar çıplak), kırmızı bandana.
      parts = [
        box(0.42, 0.3, 0.24, 0, HIP_Y + 0.2, 0, 0x8a8274), // kısa gömlek
        box(0.43, SHOULDER_Y - HIP_Y - 0.3, 0.245, 0, HIP_Y, 0, SKIN), // açık karın
        box(0.45, 0.07, 0.27, 0, HIP_Y - 0.02, 0, 0x6b3a2a), // kemer
        ...face,
        box(0.27, 0.05, 0.27, 0, SHOULDER_Y + 0.25, 0, 0xa33025), // bandana
        box(0.06, 0.05, 0.04, 0, SHOULDER_Y + 0.22, -0.14, 0xa33025),
        box(0.08, 0.03, 0.02, 0, SHOULDER_Y + 0.15, 0.11, 0x2a221c), // bıyık
      ];
      sleeves = SKIN;
      trousers = 0x3b3328;
  }
  if (role === 'leader' && style !== 'highwayman') {
    parts.push(box(0.3, 0.015, 0.3, 0, SHOULDER_Y + 0.4, 0, 0xc9a23c)); // reis: altın sorguç/süs
  }
  parts.push(...weaponParts(weapon));
  return limbs(merge(parts), trousers, 0x1f1a16, sleeves);
}

type GangStyleName = 'jacket' | 'hoodie' | 'suit' | 'tank';

/** Eşkıya modeli (rol, silah ve çeşide göre); `faction` 0–2 ise sokak çetesi kıyafeti. */
export function buildBanditGeometry(
  role: BanditRole,
  weapon: BanditWeapon,
  faction = -1,
  style: BanditStyle = faction >= 0 ? 'jacket' : 'mountain',
): BanditGeometry {
  if (faction >= 0) return buildGangGeometry(role, weapon, faction, style);
  if (style !== 'mountain' && !isGangStyle(style)) {
    return buildCampStyleGeometry(role, weapon, style);
  }
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
