import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  SphereGeometry,
} from 'three';
import type { PersonRole } from '../people/roles';

/**
 * İnsan modelleri (Faz 10): düşük poligonlu, vertex renkli. Gövde (baş, kıyafet, taşıdığı eşya) tek geometri;
 * bacaklar ve kollar yürürken sallanır (omuz/kalça eklem noktası geometrinin üstünde, y = 0). Kıyafetler Anadolu
 * köy ve yol giysileridir: çobanın yeleği ve kasketi, teyzenin yazması ve uzun etekliği, dervişin hırkası ve sikkesi.
 */

interface Part {
  geometry: BufferGeometry;
  color: number;
}

export interface PersonGeometry {
  body: BufferGeometry;
  leg: BufferGeometry;
  arm: BufferGeometry;
  /** Kalça ve omuz yüksekliği, omuz yarı açıklığı (oyun m). */
  hipY: number;
  shoulderY: number;
  shoulderX: number;
  hipX: number;
}

const SKIN = 0xc99a78;

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

interface Outfit {
  shirt: number;
  vest: number | null;
  trousers: number;
  shoes: number;
  /** Uzun giysi (etek, hırka): bacakları örter, yere kadar iner. */
  robe: number | null;
  sleeves: number;
}

const OUTFITS: Record<PersonRole, Outfit> = {
  yolcu: {
    shirt: 0x34485e,
    vest: null,
    trousers: 0x55575a,
    shoes: 0x2b2420,
    robe: null,
    sleeves: 0x34485e,
  },
  coban: {
    shirt: 0xe4ddcf,
    vest: 0x5c4330,
    trousers: 0x2f2c2a,
    shoes: 0x3a2a1c,
    robe: null,
    sleeves: 0xe4ddcf,
  },
  oduncu: {
    shirt: 0x8a2f2a,
    vest: null,
    trousers: 0x3b3f2c,
    shoes: 0x3a2a1c,
    robe: null,
    sleeves: 0x8a2f2a,
  },
  yasli: {
    shirt: 0x4a3c56,
    vest: null,
    trousers: 0x4a3c56,
    shoes: 0x2b2420,
    robe: 0x5b3d4c,
    sleeves: 0x3e3247,
  },
  dervis: {
    shirt: 0xeae4d4,
    vest: null,
    trousers: 0xeae4d4,
    shoes: 0x4a3626,
    robe: 0xd9d2c0,
    sleeves: 0xd9d2c0,
  },
  esnaf: {
    shirt: 0xd8d2c4,
    vest: 0x3d4a5c,
    trousers: 0x3a3632,
    shoes: 0x2b2420,
    robe: null,
    sleeves: 0xd8d2c4,
  },
};

export function buildPersonGeometry(role: PersonRole): PersonGeometry {
  const o = OUTFITS[role];
  const hipY = 0.88;
  const shoulderY = 1.44;
  const shoulderX = 0.27;
  const hipX = 0.1;
  const parts: Part[] = [
    box(0.42, shoulderY - hipY, 0.24, 0, hipY, 0, o.shirt),
    // boyun ve baş
    box(0.1, 0.08, 0.1, 0, shoulderY, 0, SKIN),
    { geometry: at(new SphereGeometry(0.115, 8, 6), 0, shoulderY + 0.2, 0), color: SKIN },
  ];
  if (o.vest !== null) parts.push(box(0.44, 0.42, 0.26, 0, hipY + 0.12, 0, o.vest));
  if (o.robe !== null) {
    // Etek/hırka: kalçadan yere iner (bacakları örter; bacaklar yine hafifçe sallanır).
    parts.push({
      geometry: at(new CylinderGeometry(0.2, 0.3, hipY + 0.05, 8, 1), 0, (hipY + 0.05) / 2, 0),
      color: o.robe,
    });
  }
  switch (role) {
    case 'yolcu':
      parts.push(box(0.3, 0.42, 0.16, 0, hipY + 0.12, -0.2, 0x6b4f33)); // sırt çantası
      parts.push(box(0.25, 0.06, 0.27, 0, shoulderY + 0.29, 0.02, 0x34485e)); // şapka
      break;
    case 'coban':
      parts.push(box(0.27, 0.06, 0.3, 0, shoulderY + 0.29, 0.03, 0x4c4a47)); // kasket
      parts.push({
        geometry: at(new CylinderGeometry(0.02, 0.02, 1.5, 4), shoulderX + 0.1, 0.75, 0.12),
        color: 0x7a5a38,
      }); // değnek
      break;
    case 'oduncu': {
      parts.push(box(0.26, 0.05, 0.26, 0, shoulderY + 0.29, 0, 0x2f3a2a)); // bere
      const handle = new BoxGeometry(0.04, 0.9, 0.04);
      handle.applyMatrix4(new Matrix4().makeRotationZ(0.9));
      parts.push({ geometry: at(handle, -0.12, shoulderY + 0.1, -0.16), color: 0x8a6a42 }); // omuzda balta
      parts.push(box(0.16, 0.12, 0.04, -0.47, shoulderY + 0.38, -0.16, 0x8f979e));
      break;
    }
    case 'yasli':
      // Yazma (başörtüsü): beyaz zemin, oyalı kenar.
      parts.push({
        geometry: at(new SphereGeometry(0.135, 8, 6), 0, shoulderY + 0.22, -0.01),
        color: 0xf1ebdd,
      });
      parts.push(box(0.29, 0.03, 0.29, 0, shoulderY + 0.14, 0, 0xb3402e));
      break;
    case 'dervis':
      // Sikke (uzun keçe külah) ve asa.
      parts.push({
        geometry: at(new CylinderGeometry(0.09, 0.12, 0.34, 8), 0, shoulderY + 0.42, 0),
        color: 0xb79a72,
      });
      parts.push({
        geometry: at(new ConeGeometry(0.09, 0.06, 8), 0, shoulderY + 0.62, 0),
        color: 0xb79a72,
      });
      parts.push({
        geometry: at(new CylinderGeometry(0.025, 0.025, 1.7, 4), shoulderX + 0.1, 0.85, 0.12),
        color: 0x5e4630,
      });
      break;
    case 'esnaf':
      // Beyaz önlük (yelek üstünde, dizlere kadar) ve kasket.
      parts.push(box(0.38, 0.9, 0.04, 0, 0.45, 0.15, 0xf2efe6));
      parts.push(box(0.27, 0.06, 0.3, 0, shoulderY + 0.29, 0.03, 0x5a4a3a));
      break;
  }
  const leg = merge([
    box(0.16, hipY - 0.08, 0.18, 0, -hipY + 0.08, 0, o.robe ?? o.trousers),
    box(0.17, 0.08, 0.24, 0, -hipY, 0.03, o.shoes),
  ]);
  const arm = merge([
    box(0.11, 0.5, 0.12, 0, -0.52, 0, o.sleeves),
    box(0.09, 0.1, 0.1, 0, -0.62, 0, SKIN),
  ]);
  return { body: merge(parts), leg, arm, hipY, shoulderY, shoulderX, hipX };
}
