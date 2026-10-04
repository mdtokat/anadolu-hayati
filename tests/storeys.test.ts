import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER } from '../src/config';
import type { MoveIntent } from '../src/core/inputMapping';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';
import { Player } from '../src/player/Player';
import type { Building } from '../src/settlements/layout';
import {
  ROOMS,
  SHAPE_DIMS,
  containerBox,
  indoorCeiling,
  shapeVariant,
  storeyPlanOf,
  type BuildingKind,
  type LocalBox,
} from '../src/settlements/kinds';
import {
  STAIR_ANGLE_DEG,
  ceilingAbove,
  isUnderRoof,
  SLAB,
  PARAPET,
} from '../src/settlements/storeys';
import type { SettlementMap } from '../src/settlements/SettlementMap';
import { SettlementColliders } from '../src/world/SettlementColliders';

const DT = 1 / 60;
const MULTI: ReadonlyArray<{ kind: BuildingKind; floors?: number }> = [
  { kind: 'konak' },
  { kind: 'konak', floors: 3 },
  { kind: 'lojman' },
  { kind: 'government' },
  { kind: 'apartment', floors: 2 },
  { kind: 'apartment', floors: 3 },
  { kind: 'apartment', floors: 4 },
  { kind: 'apartment', floors: 6 },
  { kind: 'apartment', floors: 10 },
];

beforeAll(async () => {
  await initPhysics();
});

describe('kat planı', () => {
  it('yapı yüksekliği kat planıyla tutarlı (çatı terası + korkuluk)', () => {
    for (const kind of ['konak', 'lojman', 'government'] as const) {
      const plan = storeyPlanOf(kind)!;
      expect(plan.storeys).toBe(2);
      expect(plan.parapetTop).toBeCloseTo(SHAPE_DIMS[kind].h, 6);
      expect(shapeVariant(kind).height).toBeCloseTo(plan.parapetTop, 6);
    }
    for (const floors of [2, 3, 4, 5, 6, 8, 10]) {
      const plan = storeyPlanOf('apartment', floors)!;
      expect(plan.storeys).toBe(floors);
      expect(plan.roofY).toBeCloseTo(floors * SHAPE_DIMS.apartment.floorH, 6);
    }
  });

  it('katsız yapıda plan yok; yıkık katlı yapı yalnızca zemin kat', () => {
    expect(storeyPlanOf('house')).toBeNull();
    expect(shapeVariant('house').storeys).toBeNull();
    const ruined = shapeVariant('konak', undefined, true);
    expect(ruined.storeys).toBeNull();
    expect(ruined.ramps).toHaveLength(0);
    expect(ruined.solids.length).toBeLessThan(shapeVariant('konak').solids.length);
  });

  it('merdiven kolları ardışık: her kol bir sonraki katın zeminine varır, U dönüşü aynı uçta', () => {
    for (const { kind, floors } of MULTI) {
      const plan = storeyPlanOf(kind, floors)!;
      expect(plan.flights).toHaveLength(plan.storeys);
      plan.flights.forEach((f, k) => {
        expect(f.y0).toBeCloseTo(plan.floorY[k]!, 6);
        expect(f.y1).toBeCloseTo(plan.floorY[k + 1]!, 6);
        const angle = (Math.atan2(f.y1 - f.y0, Math.abs(f.zTo - f.zFrom)) * 180) / Math.PI;
        expect(angle).toBeLessThanOrEqual(STAIR_ANGLE_DEG + 5);
        expect(angle).toBeGreaterThan(20);
        const next = plan.flights[k + 1];
        if (next) {
          expect(next.zFrom).toBeCloseTo(f.zTo, 6); // aynı uçta başlar (diğer şeritte)
          expect(next.x).not.toBeCloseTo(f.x, 3);
        }
      });
      // Her kol zemin katın iç dikdörtgeninde kalır.
      const shape = shapeVariant(kind, floors);
      const inner = shape.interior!;
      for (const f of plan.flights) {
        expect(Math.abs(f.x) + f.width / 2).toBeLessThanOrEqual(inner.halfWidth);
        expect(Math.min(f.zFrom, f.zTo)).toBeGreaterThan(inner.back);
        expect(Math.max(f.zFrom, f.zTo)).toBeLessThan(inner.front);
      }
    }
  });

  it('merdiven kapının karşı yanında; kaplar merdiven şeritlerine denk gelmez', () => {
    for (const { kind, floors } of MULTI) {
      const plan = storeyPlanOf(kind, floors)!;
      const doorX = ROOMS[kind]!.doorX;
      for (const f of plan.flights) expect(Math.sign(f.x)).toBe(doorX >= 0 ? -1 : 1);
      const shape = shapeVariant(kind, floors);
      for (const c of shape.containers) {
        const b = containerBox(c);
        for (const f of plan.flights) {
          const overlapX = Math.abs(b.cx - f.x) < b.hx + f.width / 2;
          const overlapZ =
            b.cz + b.hz > Math.min(f.zFrom, f.zTo) && b.cz - b.hz < Math.max(f.zFrom, f.zTo);
          expect(overlapX && overlapZ, `${kind}: kap merdiveni kesiyor`).toBe(false);
        }
      }
    }
  });

  it('merdiven boyunca baş payı: yürüyen gövde hiçbir katı kutuya girmez', () => {
    const half = PLAYER.radius;
    for (const { kind, floors } of MULTI) {
      const shape = shapeVariant(kind, floors);
      const plan = shape.storeys!;
      const hits = (x: number, y: number, z: number): LocalBox | undefined =>
        shape.solids.find(
          (b) =>
            Math.abs(x - b.cx) < b.hx + half - 0.02 &&
            Math.abs(z - b.cz) < b.hz + half - 0.02 &&
            y + 1.8 > b.cy - b.hy + 0.02 &&
            y + 0.3 < b.cy + b.hy - 0.02,
        );
      for (const f of plan.flights) {
        const steps = 40;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const z = f.zFrom + (f.zTo - f.zFrom) * t;
          // Ayak, rampa yüzeyinde; kutular ayak üstünden (0,3 m) başlayarak sınanır (basamak/kenar payı).
          const y = f.y0 + (f.y1 - f.y0) * t;
          expect(hits(f.x, y, z), `${kind} kol ${f.level} t=${t}`).toBeUndefined();
        }
      }
    }
  });
});

describe('kat/tavan sorguları', () => {
  it('ayağın üstündeki tavan bulunduğu kata göre; çatı terasında yok', () => {
    const plan = storeyPlanOf('konak')!;
    expect(ceilingAbove(plan, 0)).toBeCloseTo(2.8, 6);
    expect(ceilingAbove(plan, 1)).toBeCloseTo(1.8, 6);
    // 1. katta (zemin 3,1): tavan 5,7
    expect(ceilingAbove(plan, plan.floorY[1]!)).toBeCloseTo(2.6, 6);
    expect(ceilingAbove(plan, plan.roofY)).toBeNull();
    expect(isUnderRoof(plan, plan.floorY[1]!)).toBe(true);
    expect(isUnderRoof(plan, plan.roofY)).toBe(false);
    expect(indoorCeiling('konak', undefined, false, plan.floorY[1]!)).toBeCloseTo(2.6, 6);
    expect(indoorCeiling('house', undefined, false, 0.5)).toBeCloseTo(3.2 - 0.5, 6);
  });

  it('çatı korkuluğu kutuları collider listesinde: yüksek ve kapısız', () => {
    const shape = shapeVariant('apartment', 4);
    const plan = shape.storeys!;
    const walls = shape.solids.filter((b) => b.cy + b.hy >= plan.parapetTop - 1e-6);
    expect(walls.length).toBeGreaterThanOrEqual(4);
    expect(plan.parapetTop - plan.roofY).toBeCloseTo(PARAPET, 6);
    expect(SLAB).toBeGreaterThan(0.2);
  });
});

/** Yapıyı (yaw = 0, y = 0) Rapier'e kurar; oyuncuyu kapı önünden başlatıp merdivenden çatıya yürütür. */
function climb(kind: BuildingKind, floors?: number) {
  const shape = shapeVariant(kind, floors);
  const plan = shape.storeys!;
  const building = {
    id: 1,
    kind,
    x: 0,
    z: 0,
    y: 0,
    base: 0,
    yaw: 0,
    floors: floors ?? 4,
    ruined: false,
  } as unknown as Building;
  const physics = new PhysicsWorld();
  physics.addStaticCollider(RAPIER.ColliderDesc.cuboid(100, 1, 100).setTranslation(0, -1, 0));
  const map = { stairs: [], buildingsNear: () => [building] } as unknown as SettlementMap;
  const colliders = new SettlementColliders(physics, map);
  colliders.update(0, 0, true);
  const door = shape.door;
  const player = new Player(physics, { x: door.x, y: 0.05, z: door.z + 1.5 }, { maxSlopeDeg: 60 });
  const forward: MoveIntent = { forward: 1, strafe: 0, run: false, jump: false };
  const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);
  /** (x, z) noktasına gidene kadar yürür; takılırsa false. */
  const walkTo = (x: number, z: number, maxSeconds = 12): boolean => {
    for (let i = 0; i < maxSeconds * 60; i++) {
      const dx = x - player.position.x;
      const dz = z - player.position.z;
      if (Math.hypot(dx, dz) < 0.25) return true;
      player.update(DT, forward, yawToward(dx, dz));
      physics.step();
    }
    return false;
  };
  const inner = shape.interior!;
  const path: Array<[number, number]> = [
    [door.x, door.z - 0.5],
    [door.x, inner.front - 1.2],
  ];
  const last = (plan.flights[0] as { x: number }).x;
  path.push([last, inner.front - 0.4]);
  plan.flights.forEach((f) => {
    const dir = Math.sign(f.zTo - f.zFrom);
    path.push([f.x, f.zFrom - dir * 0.5]);
    path.push([f.x, f.zTo + dir * 0.5]);
  });
  const reached: Array<[number, number, boolean, number]> = [];
  for (const [x, z] of path) {
    const ok = walkTo(x, z);
    reached.push([x, z, ok, player.position.y]);
    if (!ok) break;
  }
  const result = { reached, y: player.position.y, plan };
  player.dispose();
  colliders.dispose();
  physics.dispose();
  return result;
}

describe('merdivenle çatıya çıkış (Rapier, oyuncu fiziği)', () => {
  for (const { kind, floors } of MULTI) {
    it(`${kind}${floors ? ` (${floors} kat)` : ''}: kapıdan girip her kata ve çatıya çıkılır`, () => {
      const { reached, y, plan } = climb(kind, floors);
      const failed = reached.find(([, , ok]) => !ok);
      expect(failed, `takıldığı nokta: ${JSON.stringify(failed)}`).toBeUndefined();
      expect(y).toBeGreaterThan(plan.roofY - 0.3);
      expect(y).toBeLessThan(plan.roofY + 0.4);
    }, 120_000);
  }
});
