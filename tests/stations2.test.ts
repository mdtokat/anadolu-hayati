import { describe, expect, it } from 'vitest';
import { BEDS, DRYING, SOLAR, STATIONS } from '../src/config';
import { craft, craftStatus } from '../src/items/craft';
import { Inventory } from '../src/items/Inventory';
import { RECIPES } from '../src/items/recipes';
import { bedAt } from '../src/placement/beds';
import { Dismantler } from '../src/placement/dismantle';
import { rackOffer, rackVariantKey, useRack } from '../src/placement/rack';
import { solarChargeAt, solarOutput } from '../src/placement/solar';
import { stationsNear } from '../src/placement/stations';
import { StructureSet } from '../src/placement/structures';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { initialVitals, stepVitals } from '../src/survival/vitals';

describe('yeni istasyonlar: tarifler yalnızca yakında açılır', () => {
  it('demirci ocağı, taş fırın, el değirmeni: erişim yarıçapı içinde istasyon sayılır, dışında sayılmaz', () => {
    const set = new StructureSet();
    set.add('forge', 0, 0, 0, 0);
    set.add('hand_mill', 20, 0, 0, 0);
    expect(stationsNear(set, 1, 1).stations.has('forge')).toBe(true);
    expect(stationsNear(set, 1, 1).stations.has('hand_mill')).toBe(false);
    expect(stationsNear(set, 20, 2).stations.has('hand_mill')).toBe(true);
    // Erişim: istasyon kenarına STATIONS[tür].reach (merkez + yarıçap).
    expect(stationsNear(set, STATIONS.forge.reach + 1.2, 0).stations.has('forge')).toBe(false);
    expect(stationsNear(set, 2.5, 0).stations.has('forge')).toBe(true);
  });

  it('kömür ve demir külçe ocak yakınında üretilir; ocak yokken missing_station', () => {
    const inv = new Inventory();
    inv.add('log', 1);
    expect(craftStatus(inv, RECIPES.charcoal)).toMatchObject({
      ok: false,
      reason: 'missing_station',
      station: 'forge',
    });
    const set = new StructureSet();
    set.add('forge', 0, 0, 0, 0);
    const near = stationsNear(set, 0, 1);
    expect(craft(inv, RECIPES.charcoal, near).ok).toBe(true);
    expect(inv.count('charcoal')).toBe(3);
    expect(inv.count('log')).toBe(0);
    inv.add('scrap_metal', 2);
    expect(craft(inv, RECIPES.iron_ingot, near).ok).toBe(true);
    expect(inv.count('iron_ingot')).toBe(1);
    expect(inv.count('charcoal')).toBe(2);
  });

  it('un el değirmeninde, ekmek taş fırında tarifi istasyon ister', () => {
    expect(RECIPES.flour.station).toBe('hand_mill');
    expect(RECIPES.corn_flour.station).toBe('hand_mill');
  });

  it('istasyon yapıları tezgâhla üretilir ve envantere gelir', () => {
    const inv = new Inventory();
    inv.add('stone', 8);
    inv.add('log', 2);
    inv.add('scrap_metal', 2);
    inv.add('stone_axe', 1);
    const set = new StructureSet();
    set.add('workbench', 0, 0, 0, 0);
    expect(craft(inv, RECIPES.forge, stationsNear(set, 0, 1)).ok).toBe(true);
    expect(inv.count('forge')).toBe(1);
  });
});

describe('kurutma rafı', () => {
  function rackScene() {
    const set = new StructureSet();
    const rack = set.add('drying_rack', 0, 0, 0, 0);
    const inv = new Inventory();
    return { set, rack, inv };
  }

  it('çiğ eti asar (en çok kapasite kadar), süre dolunca kurutulmuş ete döner, E ile alınır', () => {
    const { set, rack, inv } = rackScene();
    inv.add('raw_meat', 6);
    const asked = useRack(set, rack.id, inv);
    expect(asked).toEqual({ ok: true, kind: 'load', pieces: DRYING.capacity });
    expect(inv.count('raw_meat')).toBe(6 - DRYING.capacity);
    expect(rackVariantKey(set.get(rack.id)!)).toBe('m');

    // Süre dolmadan: parti kuruyor, kapasite dolu; ikinci koyma ve alma işe yaramaz.
    set.update(DRYING.seconds - 1);
    expect(set.get(rack.id)?.rack).toMatchObject({ raw: DRYING.capacity, dried: 0 });
    expect(useRack(set, rack.id, inv)).toEqual({ ok: false });

    set.update(1.5);
    expect(set.get(rack.id)?.rack).toMatchObject({ raw: 0, dried: DRYING.capacity });
    const taken = useRack(set, rack.id, inv);
    expect(taken).toEqual({ ok: true, kind: 'collect', pieces: DRYING.capacity });
    expect(inv.count('dried_meat')).toBe(DRYING.capacity);
    expect(set.get(rack.id)?.rack).toMatchObject({ raw: 0, dried: 0 });
    expect(rackVariantKey(set.get(rack.id)!)).toBe('');
  });

  it('envanter dolu: hazır et alınamaz ve rafta kalır (atomik); et yokken koyma yok', () => {
    const { set, rack, inv } = rackScene();
    expect(useRack(set, rack.id, inv)).toEqual({ ok: false }); // et yok
    inv.add('raw_meat', 2);
    useRack(set, rack.id, inv);
    set.update(DRYING.seconds + 1);
    // Envanteri doldur: kurutulmuş et (yığın 10) için yer kalmasın.
    const full = new Inventory({ slots: 1 });
    full.add('stone', 10);
    expect(useRack(set, rack.id, full)).toEqual({ ok: false });
    expect(set.get(rack.id)?.rack?.dried).toBe(2);
    expect(rackOffer(set.get(rack.id)!.rack!, full)).toMatchObject({ status: 'no_space' });
  });

  it('teklif durumları: et yok / asılabilir / kuruyor (kalan süre) / alınabilir', () => {
    const { set, rack, inv } = rackScene();
    const state = () => set.get(rack.id)!.rack!;
    expect(rackOffer(state(), inv).status).toBe('no_meat');
    inv.add('raw_meat', 2);
    expect(rackOffer(state(), inv)).toMatchObject({ status: 'load', pieces: 2 });
    useRack(set, rack.id, inv);
    set.update(60);
    const drying = rackOffer(state(), inv);
    expect(drying.status).toBe('drying');
    expect(drying.remaining).toBeCloseTo(DRYING.seconds - 60);
    set.update(DRYING.seconds);
    expect(rackOffer(state(), inv).status).toBe('collect');
  });

  it('kayıttan geri gelir (süre ve et korunur); bozuk raf reddedilir', () => {
    const { set, rack, inv } = rackScene();
    inv.add('raw_meat', 3);
    useRack(set, rack.id, inv);
    set.update(100);
    const loaded = StructureSet.fromJSON(JSON.parse(JSON.stringify(set.toJSON())));
    expect(loaded.get(rack.id)?.rack).toEqual({ raw: 3, dried: 0, progress: 100 });
    loaded.update(DRYING.seconds - 100 + 1);
    expect(loaded.get(rack.id)?.rack).toMatchObject({ raw: 0, dried: 3 });

    const bad = JSON.parse(JSON.stringify(set.toJSON()));
    bad.structures[0].rack.raw = 99;
    expect(() => StructureSet.fromJSON(bad)).toThrow(/raf/);
    // Alanı olmayan eski raf boş sayılır.
    const old = JSON.parse(JSON.stringify(set.toJSON()));
    delete old.structures[0].rack;
    expect(StructureSet.fromJSON(old).get(rack.id)?.rack).toEqual({
      raw: 0,
      dried: 0,
      progress: 0,
    });
  });

  it('etli raf sökülemez; boşaltılınca sökülür', () => {
    const { set, rack, inv } = rackScene();
    const events = new EventBus<GameEvents>();
    const dismantler = new Dismantler(events, inv, set);
    inv.add('raw_meat', 1);
    useRack(set, rack.id, inv);
    expect(dismantler.inspect(set.get(rack.id)!).status).toBe('not_empty');
    set.update(DRYING.seconds + 1);
    expect(dismantler.inspect(set.get(rack.id)!).status).toBe('not_empty');
    useRack(set, rack.id, inv);
    expect(dismantler.inspect(set.get(rack.id)!).status).toBe('ready');
  });
});

describe('döşek', () => {
  it('döşeğe BEDS.reach içinde ve aynı katta durulursa üstünde sayılır', () => {
    const set = new StructureSet();
    set.add('bedroll', 0, 0, 0, 0);
    expect(bedAt(set, 0.5, 0, 0)).toBe(true);
    expect(bedAt(set, BEDS.reach + 0.5, 0, 0)).toBe(false);
    expect(bedAt(set, 0, 3, 0)).toBe(false); // başka kat
  });

  it('hareketsiz dinlenirken enerji ve can daha hızlı dolar; hareket ederken etkisi yok', () => {
    const tired = { ...initialVitals(), energy: 20, health: 50 };
    const rest = (bed: boolean) =>
      stepVitals(tired, { activity: 'rest', ambientC: 18, bed }, 1).state;
    const without = rest(false);
    const withBed = rest(true);
    expect(withBed.energy - tired.energy).toBeCloseTo(
      (without.energy - tired.energy) * BEDS.energyMultiplier,
      5,
    );
    expect(withBed.health - tired.health).toBeCloseTo(
      (without.health - tired.health) * BEDS.healthMultiplier,
      5,
    );
    const walkBed = stepVitals(tired, { activity: 'walk', ambientC: 18, bed: true }, 1).state;
    const walk = stepVitals(tired, { activity: 'walk', ambientC: 18 }, 1).state;
    expect(walkBed.energy).toBeCloseTo(walk.energy, 8);
  });

  it('barınakla birlikte çarpanlar çarpılır', () => {
    const tired = { ...initialVitals(), energy: 20 };
    const hutOnly = stepVitals(
      tired,
      { activity: 'rest', ambientC: 18, sheltered: true, shelter: 'hut' },
      1,
    ).state;
    const hutBed = stepVitals(
      tired,
      { activity: 'rest', ambientC: 18, sheltered: true, shelter: 'hut', bed: true },
      1,
    ).state;
    expect(hutBed.energy - 20).toBeCloseTo((hutOnly.energy - 20) * BEDS.energyMultiplier, 5);
  });
});

describe('güneş paneli', () => {
  it('gece/şafakta üretmez, tam güneşte tam üretir, arada doğrusaldır', () => {
    expect(solarOutput(SOLAR.minSunAltitudeDeg)).toBe(0);
    expect(solarOutput(-10)).toBe(0);
    expect(solarOutput(SOLAR.fullSunAltitudeDeg)).toBeCloseTo(SOLAR.chargePerSecond);
    expect(solarOutput(90)).toBeCloseTo(SOLAR.chargePerSecond);
    const mid = (SOLAR.minSunAltitudeDeg + SOLAR.fullSunAltitudeDeg) / 2;
    expect(solarOutput(mid)).toBeCloseTo(SOLAR.chargePerSecond / 2);
  });

  it('erişimdeki panel sayısı kadar (üst sınırla) şarj eder; uzaktaki panel sayılmaz', () => {
    const set = new StructureSet();
    expect(solarChargeAt(set, 0, 0, 60)).toBe(0);
    for (let i = 0; i < 5; i++) set.add('solar_panel', i * 0.5, 0, 0, 0);
    set.add('solar_panel', SOLAR.reach + 10, 0, 0, 0);
    expect(solarChargeAt(set, 0, 0, 60)).toBeCloseTo(SOLAR.chargePerSecond * SOLAR.maxPanels);
    expect(solarChargeAt(set, 0, 0, -5)).toBe(0);
    expect(solarChargeAt(set, 100, 0, 60)).toBe(0);
  });
});
