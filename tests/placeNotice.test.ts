import { beforeAll, describe, expect, it } from 'vitest';
import { PILOT, PLACE_NOTICE } from '../src/config';
import type { RegionData } from '../src/data/region';
import { initPhysics } from '../src/physics/PhysicsWorld';
import { PlaceTracker, type PlaceCenter } from '../src/world/placeNotice';
import { setupWorld } from './helpers/walker';
import { loadRealWorld } from './helpers/realRegion';

const places: PlaceCenter[] = [
  { name: 'A', x: 0, z: 0 },
  { name: 'B', x: 100, z: 0 },
];
const make = () =>
  new PlaceTracker(places, {
    enterRadius: 10,
    exitRadius: 15,
    confirmSeconds: 1,
    cooldownSeconds: 5,
  });

describe('PlaceTracker', () => {
  it('ilk gözlemde bulunulan yer sessizce kabul edilir', () => {
    const t = make();
    expect(t.observe(1, 0, 0)).toBeNull();
    expect(t.place).toBe('A');
    expect(t.observe(1, 0, 10)).toBeNull();
  });

  it('yerde değilken başlamak da sessizdir; sonra bir yere girince onay süresinden sonra bildirir', () => {
    const t = make();
    expect(t.observe(50, 0, 0)).toBeNull();
    expect(t.place).toBeNull();
    expect(t.observe(99, 0, 1)).toBeNull(); // aday
    expect(t.observe(99, 0, 1.5)).toBeNull(); // onay süresi dolmadı
    expect(t.observe(99, 0, 2.1)).toBe('B');
    expect(t.place).toBe('B');
    expect(t.observe(99, 0, 3)).toBeNull(); // aynı yerde tekrar bildirmez
  });

  it('onay süresinden önce çıkılırsa (yerin kenarından geçiş) bildirim olmaz', () => {
    const t = make();
    t.observe(50, 0, 0);
    expect(t.observe(95, 0, 1)).toBeNull();
    expect(t.observe(60, 0, 1.5)).toBeNull(); // yerden çıktı, aday sıfırlandı
    expect(t.observe(95, 0, 2)).toBeNull(); // yeniden aday
    expect(t.observe(95, 0, 2.5)).toBeNull();
    expect(t.observe(95, 0, 3.2)).toBe('B');
  });

  it('çıkış histerezisi: giriş ile çıkış yarıçapı arasında gidip gelmek yeni bildirim üretmez', () => {
    const t = make();
    t.observe(0, 0, 0); // A'da başla (sessiz)
    // A'nın merkezinden 12 m: giriş yarıçapı (10) dışında ama çıkış yarıçapı (15) içinde → hâlâ A'dadır
    expect(t.observe(12, 0, 10)).toBeNull();
    expect(t.place).toBe('A');
    expect(t.observe(5, 0, 11)).toBeNull();
    expect(t.observe(12, 0, 12)).toBeNull();
    expect(t.place).toBe('A');
  });

  it('yerden çıkıp aynı yere geri dönmek yeni bildirimdir (bekleme süresi sonrası)', () => {
    const t = make();
    t.observe(0, 0, 0);
    expect(t.observe(50, 0, 1)).toBeNull(); // çıkış (kimse yok)
    expect(t.place).toBeNull();
    expect(t.observe(0, 0, 6)).toBeNull(); // aday
    expect(t.observe(0, 0, 7.1)).toBe('A');
  });

  it('bekleme süresi içindeki geçiş bildirilmeden işlenir', () => {
    const t = make();
    t.observe(50, 0, 0);
    expect(t.observe(99, 0, 1)).toBeNull();
    expect(t.observe(99, 0, 2.1)).toBe('B'); // t = 2.1'de bildirildi
    expect(t.observe(1, 0, 2.2)).toBeNull(); // A adayı
    expect(t.observe(1, 0, 3.4)).toBeNull(); // A'ya geçildi ama bekleme (5 sn) dolmadı: sessiz
    expect(t.place).toBe('A');
  });

  it('en yakın yer kazanır (çakışan yarıçaplar)', () => {
    const t = new PlaceTracker(
      [
        { name: 'Sol', x: 0, z: 0 },
        { name: 'Sağ', x: 8, z: 0 },
      ],
      { enterRadius: 10, exitRadius: 15, confirmSeconds: 1, cooldownSeconds: 0 },
    );
    t.observe(100, 0, 0);
    t.observe(6, 0, 1);
    expect(t.observe(6, 0, 2.5)).toBe('Sağ');
  });

  it('reset: sonraki gözlem yine sessiz kabul edilir', () => {
    const t = make();
    t.observe(0, 0, 0);
    t.reset();
    expect(t.place).toBeNull();
    expect(t.observe(99, 0, 1)).toBeNull();
    expect(t.place).toBe('B');
  });

  it('yer listesi boşsa hiçbir şey bildirmez', () => {
    const t = new PlaceTracker([]);
    expect(t.observe(0, 0, 0)).toBeNull();
    expect(t.observe(0, 0, 100)).toBeNull();
  });

  it('config: çıkış yarıçapı girişten büyük', () => {
    expect(PLACE_NOTICE.exitRadiusM).toBeGreaterThan(PLACE_NOTICE.enterRadiusM);
    expect(PLACE_NOTICE.confirmSeconds).toBeGreaterThan(0);
  });
});

describe('RegionWorld.placeCenters (gerçek dünya)', () => {
  let region: RegionData;
  beforeAll(async () => {
    await initPhysics();
    region = await loadRealWorld();
  }, 60_000);

  it('PILOT.places ile aynı adlar; her merkez kendi giriş yarıçapında ve bildirilir', () => {
    const { world, dispose } = setupWorld(region);
    const centers = world.placeCenters();
    expect(centers.map((c) => c.name)).toEqual(PILOT.places.map((p) => p.name));
    for (const center of centers) {
      const t = new PlaceTracker(centers);
      t.observe(center.x + 5000, center.z, 0); // yerin dışında başla
      expect(t.observe(center.x, center.z, 1)).toBeNull();
      expect(t.observe(center.x, center.z, 1 + PLACE_NOTICE.confirmSeconds + 0.1)).toBe(
        center.name,
      );
    }
    dispose();
  }, 60_000);
});
