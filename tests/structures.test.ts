import { describe, expect, it } from 'vitest';
import { FIRE } from '../src/config';
import { isLit, StructureSet } from '../src/placement/structures';

describe('StructureSet', () => {
  it("kimlikler 1'den artar ve yeniden kullanılmaz; kamp ateşi yakıtla başlar", () => {
    const set = new StructureSet();
    const a = set.add('campfire', 1, 2, 3, 0.5);
    const b = set.add('lean_to', 10, 0, 10);
    expect([a.id, b.id]).toEqual([1, 2]);
    expect(a.fuelSeconds).toBe(FIRE.burnSeconds);
    expect(b.fuelSeconds).toBeUndefined();
    expect(set.size).toBe(2);
    expect(set.get(1)).toEqual(a);
  });

  it('near yarıçap içini yakından uzağa sıralar; sınır dahildir', () => {
    const set = new StructureSet();
    set.add('campfire', 10, 0, 0);
    set.add('campfire', 3, 0, 0);
    set.add('lean_to', 5, 0, 0);
    expect(set.near(0, 0, 5).map((s) => s.x)).toEqual([3, 5]);
    expect(set.near(0, 0, 2.99)).toHaveLength(0);
    expect(set.near(0, 0, 10)).toHaveLength(3);
  });

  it('nearestCampfire sundurmayı atlar', () => {
    const set = new StructureSet();
    set.add('lean_to', 1, 0, 0);
    const fire = set.add('campfire', 3, 0, 0);
    expect(set.nearestCampfire(0, 0, 5)?.id).toBe(fire.id);
    expect(set.nearestCampfire(0, 0, 2)).toBeNull();
  });

  it('yakıt azalır; sönünce bir kez bildirilir ve sürüm yalnızca o zaman artar', () => {
    const set = new StructureSet();
    const fire = set.add('campfire', 0, 0, 0);
    const v = set.version;
    expect(set.update(10)).toEqual([]);
    expect(set.get(fire.id)?.fuelSeconds).toBe(FIRE.burnSeconds - 10);
    expect(set.version).toBe(v);
    expect(set.update(FIRE.burnSeconds)).toEqual([fire.id]);
    expect(set.get(fire.id)?.fuelSeconds).toBe(0);
    expect(isLit(set.get(fire.id)!)).toBe(false);
    expect(set.version).toBe(v + 1);
    expect(set.update(5)).toEqual([]); // sönük ateş tekrar bildirilmez
    expect(set.version).toBe(v + 1);
  });

  it('sundurma yakıt harcamaz ve asla yanık sayılmaz', () => {
    const set = new StructureSet();
    const shelter = set.add('lean_to', 0, 0, 0);
    expect(set.update(9999)).toEqual([]);
    expect(isLit(set.get(shelter.id)!)).toBe(false);
  });

  it('refuel: ekler, üst sınırda keser, gerçek eklenen süreyi döndürür', () => {
    const set = new StructureSet();
    const fire = set.add('campfire', 0, 0, 0);
    expect(set.refuel(fire.id, FIRE.fuel.stick)).toBe(FIRE.fuel.stick);
    expect(set.get(fire.id)?.fuelSeconds).toBe(FIRE.burnSeconds + FIRE.fuel.stick);
    const room = FIRE.maxFuelSeconds - (FIRE.burnSeconds + FIRE.fuel.stick);
    expect(set.refuel(fire.id, 100_000)).toBe(room);
    expect(set.get(fire.id)?.fuelSeconds).toBe(FIRE.maxFuelSeconds);
    const v = set.version;
    expect(set.refuel(fire.id, 10)).toBe(0); // depo dolu
    expect(set.version).toBe(v);
  });

  it('refuel: sönük ateş tutuşur; sundurma, bilinmeyen kimlik ve geçersiz süre 0', () => {
    const set = new StructureSet();
    const fire = set.add('campfire', 0, 0, 0);
    const shelter = set.add('lean_to', 9, 0, 9);
    set.update(FIRE.burnSeconds);
    expect(isLit(set.get(fire.id)!)).toBe(false);
    expect(set.refuel(fire.id, FIRE.fuel.log)).toBe(FIRE.fuel.log);
    expect(isLit(set.get(fire.id)!)).toBe(true);
    expect(set.refuel(shelter.id, 50)).toBe(0);
    expect(set.refuel(999, 50)).toBe(0);
    expect(set.refuel(fire.id, 0)).toBe(0);
    expect(set.refuel(fire.id, -5)).toBe(0);
    expect(set.refuel(fire.id, Number.NaN)).toBe(0);
  });
});

describe('StructureSet kaydı', () => {
  const sample = (): StructureSet => {
    const set = new StructureSet();
    set.add('campfire', 1.5, 2.5, -3.5, 1.2);
    set.add('lean_to', 20, 4, 20, 3);
    set.add('campfire', -8, 1, 5);
    set.update(123);
    set.refuel(1, FIRE.fuel.log);
    return set;
  };

  it('fromJSON(toJSON(x)) birebir aynı durumu verir (JSON gidiş-dönüşüyle de); nextId korunur', () => {
    const set = sample();
    const copy = StructureSet.fromJSON(JSON.parse(JSON.stringify(set.toJSON())));
    expect(copy.toJSON()).toEqual(set.toJSON());
    expect(copy.add('lean_to', 0, 0, 0).id).toBe(4);
  });

  it('toJSON canlı duruma bağlı değildir (kopya)', () => {
    const set = sample();
    const save = set.toJSON();
    set.update(50);
    expect(save.structures[0]?.fuelSeconds).not.toBe(set.get(1)?.fuelSeconds);
  });

  const valid = () => sample().toJSON();
  const bad: Array<[string, unknown]> = [
    ['null', null],
    ['sürüm yok', { nextId: 2, structures: [] }],
    ['bilinmeyen sürüm', { ...valid(), version: 2 }],
    ['structures dizi değil', { version: 1, nextId: 1, structures: 'x' }],
    ['nextId geçersiz', { version: 1, nextId: 0, structures: [] }],
    [
      'bilinmeyen tür',
      { version: 1, nextId: 2, structures: [{ id: 1, kind: 'tent', x: 0, y: 0, z: 0, yaw: 0 }] },
    ],
    [
      "kimlik nextId'den büyük",
      { version: 1, nextId: 1, structures: [{ id: 1, kind: 'lean_to', x: 0, y: 0, z: 0, yaw: 0 }] },
    ],
    [
      'yinelenen kimlik',
      {
        version: 1,
        nextId: 3,
        structures: [
          { id: 1, kind: 'lean_to', x: 0, y: 0, z: 0, yaw: 0 },
          { id: 1, kind: 'lean_to', x: 5, y: 0, z: 0, yaw: 0 },
        ],
      },
    ],
    [
      'sayı değil',
      {
        version: 1,
        nextId: 2,
        structures: [{ id: 1, kind: 'lean_to', x: 'a', y: 0, z: 0, yaw: 0 }],
      },
    ],
    [
      'sonsuz konum',
      {
        version: 1,
        nextId: 2,
        structures: [{ id: 1, kind: 'lean_to', x: Infinity, y: 0, z: 0, yaw: 0 }],
      },
    ],
    [
      'ateşte yakıt yok',
      {
        version: 1,
        nextId: 2,
        structures: [{ id: 1, kind: 'campfire', x: 0, y: 0, z: 0, yaw: 0 }],
      },
    ],
    [
      'negatif yakıt',
      {
        version: 1,
        nextId: 2,
        structures: [{ id: 1, kind: 'campfire', x: 0, y: 0, z: 0, yaw: 0, fuelSeconds: -1 }],
      },
    ],
    [
      'yakıt üst sınırı aşıyor',
      {
        version: 1,
        nextId: 2,
        structures: [
          {
            id: 1,
            kind: 'campfire',
            x: 0,
            y: 0,
            z: 0,
            yaw: 0,
            fuelSeconds: FIRE.maxFuelSeconds + 1,
          },
        ],
      },
    ],
    [
      'sundurmada yakıt',
      {
        version: 1,
        nextId: 2,
        structures: [{ id: 1, kind: 'lean_to', x: 0, y: 0, z: 0, yaw: 0, fuelSeconds: 5 }],
      },
    ],
  ];
  it.each(bad)('bozuk kayıt reddedilir: %s', (_name, data) => {
    expect(() => StructureSet.fromJSON(data)).toThrow(Error);
  });
});
