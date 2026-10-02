import { BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Matrix4 } from 'three';
import type { BufferGeometry } from 'three';
import type { Camp, CampLayout } from '../bandits/camps';
import { createRandom, seedFrom } from '../utils/random';
import { merge, place, type Part } from './propGeometry';

/**
 * Eşkıya kampının geometrisi (Faz 11, 11.6): çadırlar (piramit kıl çadır + yer örtüsü), taş halkalı ateş ocağı ve
 * kütükler, kütük oturaklar, demir kuşaklı ganimet sandığı, nöbet yerinde direkli siper. Kamp başına tek birleşik
 * geometri (tek draw call); yerel orijin kamp merkezi, `baseY` yüksekliğinde. Her parça kendi zeminine oturur, yamaçta
 * havada kalmasın diye zemine gömülü etek taşır. Çarpışan kutular `campSolidBoxes` (çadırlar ve sandık).
 */

const COLORS = {
  canvas: 0x6b5a45,
  canvasDark: 0x4a3d2f,
  door: 0x231c16,
  sheet: 0x3e3a2f,
  log: 0x5a3e27,
  logEnd: 0xb08a5a,
  stone: 0x77736b,
  ash: 0x2a2725,
  plank: 0x7d5a3a,
  iron: 0x3a3835,
  pole: 0x6b4b2d,
} as const;

/** Çadır: taban yarı kenarı ve yüksekliği (oyun m). */
export const TENT = { half: 1.2, height: 1.75 } as const;
/** Sandık ölçüsü. */
export const CAMP_CHEST = { width: 0.95, depth: 0.6, height: 0.6 } as const;

type HeightAt = (x: number, z: number) => number;

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y0: number,
  z: number,
  color: number,
  yaw = 0,
): Part {
  const g = new BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  if (yaw !== 0) g.applyMatrix4(new Matrix4().makeRotationY(yaw));
  return { geometry: place(g, x, y0, z), color };
}

function log(length: number, radius: number, x: number, y: number, z: number, yaw: number): Part[] {
  const g = new CylinderGeometry(radius, radius, length, 6);
  g.applyMatrix4(new Matrix4().makeRotationZ(Math.PI / 2));
  g.applyMatrix4(new Matrix4().makeRotationY(yaw));
  return [{ geometry: place(g, x, y + radius, z), color: COLORS.log }];
}

/** Kampın birleşik geometrisi (yerel: kamp merkezi, y = `baseY`). Çağıran `dispose()` eder. */
export function buildCampGeometry(
  camp: Camp,
  layout: CampLayout,
  heightAt: HeightAt,
  baseY: number,
): BufferGeometry {
  const random = createRandom(seedFrom(camp.id, 41));
  const parts: Part[] = [];
  const local = (p: { x: number; z: number }) => ({
    x: p.x - camp.x,
    z: p.z - camp.z,
    y: heightAt(p.x, p.z) - baseY,
  });

  for (const tent of layout.tents) {
    const p = local(tent);
    // Yamaçta tabanı en alçak köşeye indir: yer örtüsü etek olur.
    const cone = new ConeGeometry(TENT.half * Math.SQRT2, TENT.height, 4, 1);
    cone.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 4 + tent.yaw));
    parts.push({
      geometry: place(cone, p.x, p.y + TENT.height / 2, p.z),
      color: random.next() < 0.5 ? COLORS.canvas : COLORS.canvasDark,
    });
    parts.push(
      box(TENT.half * 2.1, 0.6, TENT.half * 2.1, p.x, p.y - 0.55, p.z, COLORS.sheet, tent.yaw),
    );
    // Kapı: ateşe bakan yüzde koyu üçgen yerine ince koyu kutu.
    const dx = Math.sin(tent.yaw) * (TENT.half * 0.62);
    const dz = Math.cos(tent.yaw) * (TENT.half * 0.62);
    parts.push(box(0.55, 0.9, 0.06, p.x + dx, p.y, p.z + dz, COLORS.door, tent.yaw));
  }

  // Ateş ocağı: taş halka, kül, çapraz kütükler (alevi katman ayrıca çizer).
  const fire = local(layout.fire);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const g = new DodecahedronGeometry(0.17, 0);
    g.scale(1.2, 0.8, 1);
    parts.push({
      geometry: place(g, fire.x + Math.cos(a) * 0.62, fire.y + 0.08, fire.z + Math.sin(a) * 0.62),
      color: COLORS.stone,
    });
  }
  parts.push(box(1.0, 0.06, 1.0, fire.x, fire.y - 0.02, fire.z, COLORS.ash));
  parts.push(...log(0.9, 0.07, fire.x, fire.y, fire.z, 0.6));
  parts.push(...log(0.9, 0.07, fire.x, fire.y + 0.06, fire.z, -0.7));

  for (const seat of layout.seats) {
    const p = local(seat);
    // Oturak kütüğü ateşe yan durur (ateşe bakan oturanın önünde değil, altında).
    parts.push(...log(1.1, 0.17, p.x, p.y - 0.1, p.z, seat.yaw + Math.PI / 2));
  }

  const chest = local(layout.chest);
  parts.push(
    box(
      CAMP_CHEST.width,
      CAMP_CHEST.height + 0.3,
      CAMP_CHEST.depth,
      chest.x,
      chest.y - 0.3,
      chest.z,
      COLORS.plank,
      layout.chest.yaw,
    ),
  );
  parts.push(
    box(
      CAMP_CHEST.width + 0.04,
      0.12,
      CAMP_CHEST.depth + 0.04,
      chest.x,
      chest.y + CAMP_CHEST.height - 0.1,
      chest.z,
      COLORS.iron,
      layout.chest.yaw,
    ),
  );

  // Nöbet yeri: iki direk ve aralarına çapraz kalaslı siper.
  const post = local(layout.post);
  const side = { x: Math.cos(layout.post.yaw), z: -Math.sin(layout.post.yaw) };
  for (const s of [-1, 1]) {
    parts.push(
      box(
        0.12,
        1.9,
        0.12,
        post.x + side.x * s * 0.8,
        post.y - 0.4,
        post.z + side.z * s * 0.8,
        COLORS.pole,
      ),
    );
  }
  parts.push(box(1.8, 0.9, 0.08, post.x, post.y - 0.3, post.z, COLORS.log, layout.post.yaw));

  return merge(parts, random);
}

/** Çarpışan kutular (dünya uzayı, eksen yaw ile döner): çadırlar ve sandık. Ateş, oturak ve siper geçilir. */
export interface CampBox {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
}

export function campSolidBoxes(layout: CampLayout, heightAt: HeightAt): CampBox[] {
  const out: CampBox[] = layout.tents.map((t) => ({
    x: t.x,
    y: heightAt(t.x, t.z) + TENT.height * 0.35,
    z: t.z,
    hx: TENT.half * 0.85,
    hy: TENT.height * 0.45,
    hz: TENT.half * 0.85,
    yaw: t.yaw,
  }));
  out.push({
    x: layout.chest.x,
    y: heightAt(layout.chest.x, layout.chest.z) + CAMP_CHEST.height / 2 - 0.1,
    z: layout.chest.z,
    hx: CAMP_CHEST.width / 2,
    hy: CAMP_CHEST.height / 2 + 0.1,
    hz: CAMP_CHEST.depth / 2,
    yaw: layout.chest.yaw,
  });
  return out;
}
