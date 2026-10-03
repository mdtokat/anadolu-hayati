import { describe, expect, it } from 'vitest';
import { BIRDS } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { isButcherable, lootFor } from '../src/combat/loot';
import { CreatureSystem } from '../src/creatures/CreatureSystem';
import type { CreatureContext } from '../src/creatures/kinds';
import { SPECIES } from '../src/creatures/species';
import { birdPose, flockForCell } from '../src/world/birdFlocks';
import { fakeTerrain } from './helpers/fakeTerrain';

const DT = 1 / 60;

function ctx(): CreatureContext {
  return {
    player: { x: 0, y: 0, z: 0, activity: 'walk', alive: true, yaw: 0 },
    hour: 12,
    sunAltitudeDeg: 50,
    isNight: false,
    fires: [],
    terrain: fakeTerrain({ cover: 'grass', elevation: 400 }),
  };
}

describe('yeni türler (kızıl geyik, tilki, yabani tavşan, sülün)', () => {
  it('helal türlerin eti, tilkinin yalnız postu alınır', () => {
    for (const kind of ['red_deer', 'hare', 'pheasant'] as const) {
      expect(
        lootFor(kind).some((s) => s.id === 'raw_meat'),
        kind,
      ).toBe(true);
    }
    expect(lootFor('red_fox')).toEqual([{ id: 'hide', count: 1 }]);
    expect(isButcherable('red_fox')).toBe(true);
    expect(isButcherable('wild_boar')).toBe(false);
  });

  it('yaban domuzu azaltıldı: grup 1–3, yoğunluk karacadan düşük', () => {
    expect(SPECIES.wild_boar.group).toEqual([1, 3]);
    expect(SPECIES.wild_boar.habitat.density).toBeLessThan(SPECIES.roe_deer.habitat.density);
  });

  it('sülün kaçarken havalanır, kaçış bitince konar; vurulunca düşer', () => {
    const system = new CreatureSystem(new EventBus<GameEvents>());
    const c = ctx();
    system.update(DT, c); // ızgara ve arazi kurulur
    const id = system.spawnAt('pheasant', 0, -20)!;
    expect(id).not.toBeNull();
    const view = () => system.views().find((v) => v.id === id)!;
    // Oyuncu üstüne yürür: sülün kaçar ve havalanır.
    c.player.activity = 'run';
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      c.player.z = -20 + Math.min(i * 0.3, 17);
      system.update(DT, c);
      peak = Math.max(peak, view().y);
    }
    expect(peak).toBeGreaterThan(2);
    expect(peak).toBeLessThanOrEqual(SPECIES.pheasant.flightHeight! + 1e-6);
    system.damage(id, 100, { x: c.player.x, z: c.player.z });
    for (let i = 0; i < 180; i++) system.update(DT, c);
    expect(view().dead).toBe(true);
    expect(view().y).toBeCloseTo(0, 5);
  });
});

describe('gökyüzü kuşları (birdFlocks)', () => {
  it('hücre sürüsü deterministik; kıyıda martı, karada karga/yırtıcı', () => {
    let gulls = 0;
    let land = 0;
    for (let c = 0; c < 40; c++) {
      const sea = flockForCell(c, 3, () => 10);
      const inland = flockForCell(c, 3, () => 800);
      expect(flockForCell(c, 3, () => 10)).toEqual(sea);
      if (sea) {
        expect(sea.kind).toBe('gull');
        gulls++;
      }
      if (inland) {
        expect(inland.kind).not.toBe('gull');
        land++;
      }
    }
    expect(gulls).toBeGreaterThan(5);
    expect(land).toBeGreaterThan(5);
  });

  it('kuşlar sürü dairesinde ve yüksekte uçar', () => {
    let flock = null;
    for (let c = 0; !flock; c++) flock = flockForCell(c, 0, () => 800);
    for (let i = 0; i < flock.count; i++) {
      for (const t of [0, 3.5, 40]) {
        const p = birdPose(flock, i, t);
        const r = Math.hypot(p.x - flock.cx, p.z - flock.cz);
        expect(Math.abs(r - flock.radius)).toBeLessThanOrEqual(BIRDS.kinds[flock.kind].spread);
        expect(p.y).toBeGreaterThan(5);
        expect(Math.abs(p.flap)).toBeLessThanOrEqual(1);
      }
    }
  });
});
