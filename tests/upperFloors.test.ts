import { beforeAll, describe, expect, it } from 'vitest';
import { PLAYER, SEARCH } from '../src/config';
import type { MoveIntent } from '../src/core/inputMapping';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics/PhysicsWorld';
import { Player } from '../src/player/Player';
import { BALCONY } from '../src/settlements/balconies';
import { boxesOverlap } from '../src/settlements/boxMath';
import {
  CONTAINER_DIMS,
  containerBox,
  containerFront,
  shapeVariant,
  storeyPlanOf,
  type BuildingKind,
} from '../src/settlements/kinds';
import type { Building } from '../src/settlements/layout';
import { rollUpperContainerLoot } from '../src/settlements/loot';
import {
  UPPER_CONTAINER_BASE,
  containerId,
  searchTarget,
  upperContainerId,
} from '../src/settlements/search';
import type { SettlementMap } from '../src/settlements/SettlementMap';
import { paneHole, windowPanes } from '../src/settlements/windows';
import { SettlementColliders } from '../src/world/SettlementColliders';

/**
 * Katlı yapıların üst katları (kullanıcı talimatı: "yüksek katlı binaların üst katlarında da camlar ve eşyalar olsun;
 * balkonlar da kullanılabilir olsun"): her katta camlı pencere ve aranabilir kap, apartman balkonuna kapıdan çıkılır.
 */

const DT = 1 / 60;
const MULTI: ReadonlyArray<{ kind: BuildingKind; floors?: number }> = [
  { kind: 'konak' },
  { kind: 'lojman' },
  { kind: 'government' },
  { kind: 'apartment', floors: 3 },
  { kind: 'apartment', floors: 6 },
];

const building = (kind: BuildingKind, floors = 4, id = 7): Building =>
  ({ id, kind, x: 0, z: 0, y: 0, base: 0, yaw: 0, floors, ruined: false }) as unknown as Building;

beforeAll(async () => {
  await initPhysics();
});

describe('üst kat camları', () => {
  it('her katın pencereleri camlı (apartmanda kat sayısına göre); kimlikler ayrık', () => {
    for (const { kind, floors } of MULTI) {
      const plan = storeyPlanOf(kind, floors)!;
      const panes = windowPanes(kind, floors);
      for (let k = 1; k < plan.storeys; k++) {
        const y0 = plan.floorY[k]!;
        const y1 = y0 + plan.clear[k]!;
        const onFloor = panes.filter((p) => p.cy > y0 && p.cy < y1);
        expect(onFloor.length, `${kind} ${k}. kat`).toBeGreaterThanOrEqual(4);
        // Cam katın içinde: denizlik zeminden yukarıda, üstü tavanın altında.
        for (const p of onFloor) {
          expect(p.cy - p.h / 2).toBeGreaterThan(y0);
          expect(p.cy + p.h / 2).toBeLessThan(y1);
        }
      }
      expect(new Set(panes.map((p) => p.index)).size).toBe(panes.length);
    }
    expect(windowPanes('apartment', 6).length).toBeGreaterThan(windowPanes('apartment', 3).length);
  });

  it('balkon kapısı ile ön cephe camları çakışmaz', () => {
    for (const floors of [3, 4, 5, 6]) {
      const shape = shapeVariant('apartment', floors);
      expect(shape.balconies).toHaveLength((floors - 1) * 2);
      const holes = windowPanes('apartment', floors).map((p) => paneHole(p, 0));
      for (const b of shape.balconies) {
        const door = {
          cx: b.doorX,
          cy: b.floorY + BALCONY.doorHeight / 2,
          cz: b.wallZ,
          hx: BALCONY.doorWidth / 2 + 0.05,
          hy: BALCONY.doorHeight / 2,
          hz: 0.4,
        };
        expect(holes.some((h) => boxesOverlap(h, door))).toBe(false);
      }
    }
  });
});

describe('üst kat kapları', () => {
  it('her üst katta kap var; merdivene, merdiven boşluğuna, cama ve birbirine değmez; iç dikdörtgende', () => {
    for (const { kind, floors } of MULTI) {
      const shape = shapeVariant(kind, floors);
      const plan = shape.storeys!;
      const levels = new Set(shape.upperContainers.map((c) => c.level));
      for (let k = 1; k < plan.storeys; k++) expect(levels.has(k), `${kind} ${k}. kat`).toBe(true);
      const holes = windowPanes(kind, floors).map((p) => paneHole(p, 0));
      const boxes = shape.upperContainers.map(containerBox);
      shape.upperContainers.forEach((c, i) => {
        const b = boxes[i]!;
        expect(b.cy - b.hy).toBeCloseTo(plan.floorY[c.level!]!, 6);
        expect(Math.abs(b.cx) + b.hx).toBeLessThanOrEqual(plan.upperW / 2 - 0.3);
        expect(Math.abs(b.cz) + b.hz).toBeLessThanOrEqual(plan.upperD / 2 - 0.3);
        for (const f of plan.flights) {
          const overlapX = Math.abs(b.cx - f.x) < b.hx + f.width / 2;
          const overlapZ =
            b.cz + b.hz > Math.min(f.zFrom, f.zTo) && b.cz - b.hz < Math.max(f.zFrom, f.zTo);
          expect(overlapX && overlapZ, `${kind}: kap merdiveni kesiyor`).toBe(false);
        }
        // Dolap pencereyi örtmez (iki pencerenin arasında, ≥ 10 cm pay; sandık alçaktır, denizlik altında kalır).
        if (c.kind === 'cupboard') {
          const grown = { ...b, hx: b.hx + 0.1, hz: b.hz + 0.1 };
          expect(holes.some((h) => boxesOverlap(h, grown))).toBe(false);
        }
        boxes.forEach((o, j) => {
          if (j !== i) expect(boxesOverlap(b, o)).toBe(false);
        });
      });
    }
  });

  it('katta kabın önüne gelip bakınca aranır; kimlik üst kat uzayında, zemin kat kimlikleri değişmez', () => {
    const b = building('apartment', 5, 12345);
    const shape = shapeVariant('apartment', 5);
    const seen = new Set<number>();
    shape.upperContainers.forEach((c, index) => {
      const front = containerFront(c);
      const reach = CONTAINER_DIMS[c.kind].d / 2 + 0.8;
      const pose = {
        x: c.x + front.x * reach,
        y: c.y!,
        z: c.z + front.z * reach,
        // Kaba bakış (ileri = (−sin yaw, −cos yaw)).
        yaw: Math.atan2(front.x, front.z),
      };
      const target = searchTarget([b], pose);
      expect(target?.type).toBe('container');
      if (target?.type !== 'container') return;
      expect(target.upper).toBe(true);
      expect(target.index).toBe(index);
      expect(target.id).toBe(upperContainerId(b, index));
      expect(target.id).toBeGreaterThanOrEqual(UPPER_CONTAINER_BASE);
      expect(Number.isSafeInteger(target.id)).toBe(true);
      seen.add(target.id);
      // Bir alt katta aynı noktadan bu kap görülmez (dikey erişim).
      const below = searchTarget([b], { ...pose, y: pose.y - 2.9 });
      expect(below?.id === target.id).toBe(false);
    });
    expect(seen.size).toBe(shape.upperContainers.length);
    expect(containerId(b, 0)).toBe(12345 * 8);
    expect(SEARCH.containerVerticalReach).toBeLessThan(2.9 / 2 + 0.2);
  });

  it('üst kat ganimeti deterministik; katlar ayrı zarlanır, kapların çoğu boş değil', () => {
    let nonEmpty = 0;
    let total = 0;
    for (let id = 1; id <= 40; id++) {
      const b = building('apartment', 5, id * 977);
      const shape = shapeVariant('apartment', 5);
      shape.upperContainers.forEach((_, index) => {
        const loot = rollUpperContainerLoot(b, index);
        expect(rollUpperContainerLoot(b, index)).toEqual(loot);
        total++;
        if (loot.length > 0) nonEmpty++;
      });
    }
    expect(nonEmpty / total).toBeGreaterThan(0.3);
    expect(rollUpperContainerLoot({ ...building('apartment', 5), ruined: true }, 0)).toEqual([]);
  });
});

/** Yapıyı (yaw = 0, y = 0) Rapier'e kurar; oyuncu `start`'tan başlar. */
function setup(kind: BuildingKind, floors: number, start: { x: number; y: number; z: number }) {
  const b = building(kind, floors);
  const physics = new PhysicsWorld();
  physics.addStaticCollider(RAPIER.ColliderDesc.cuboid(100, 1, 100).setTranslation(0, -1, 0));
  const map = { stairs: [], buildingsNear: () => [b] } as unknown as SettlementMap;
  const colliders = new SettlementColliders(physics, map);
  colliders.update(0, 0, true);
  const player = new Player(physics, start, { maxSlopeDeg: 60 });
  const forward: MoveIntent = { forward: 1, strafe: 0, run: false, jump: false };
  const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);
  const walkTo = (x: number, z: number, maxSeconds = 8): boolean => {
    for (let i = 0; i < maxSeconds * 60; i++) {
      const dx = x - player.position.x;
      const dz = z - player.position.z;
      if (Math.hypot(dx, dz) < 0.25) return true;
      player.update(DT, forward, yawToward(dx, dz));
      physics.step();
    }
    return false;
  };
  const dispose = () => {
    player.dispose();
    colliders.dispose();
    physics.dispose();
  };
  return { player, walkTo, dispose };
}

describe('balkon (Rapier, oyuncu fiziği)', () => {
  it('odadan balkon kapısıyla balkona çıkılır; korkuluk düşmeyi önler', () => {
    const floors = 4;
    const shape = shapeVariant('apartment', floors);
    for (const b of shape.balconies.filter((x) => x.level === 2)) {
      const inside = { x: b.doorX, y: b.floorY + 0.05, z: b.wallZ - 1.4 };
      const { player, walkTo, dispose } = setup('apartment', floors, inside);
      // Kapıdan geçip balkonun ortasına.
      expect(walkTo(b.doorX, b.wallZ + b.depth / 2)).toBe(true);
      expect(player.position.y).toBeGreaterThan(b.floorY - 0.15);
      // Korkuluğa doğru yürümeye devam: balkonda kalır, aşağı düşmez.
      walkTo(b.doorX, b.wallZ + b.depth + 3, 2);
      expect(player.position.z).toBeLessThan(b.wallZ + b.depth);
      expect(player.position.y).toBeGreaterThan(b.floorY - 0.15);
      // Geri odaya.
      expect(walkTo(b.doorX, b.wallZ - 1.2)).toBe(true);
      expect(player.position.y).toBeGreaterThan(b.floorY - 0.15);
      dispose();
    }
    expect(BALCONY.doorWidth).toBeGreaterThan(PLAYER.radius * 2 + 0.2);
  }, 60_000);
});
