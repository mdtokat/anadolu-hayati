import { describe, expect, it } from 'vitest';
import { INVENTORY, WORLD } from '../src/config';
import { Inventory } from '../src/items/Inventory';
import { StructureSet } from '../src/placement/structures';
import {
  SAVE_FORMAT_VERSION,
  SaveError,
  MIGRATIONS,
  migrateSave,
  parseSave,
  summarizeSave,
  type SaveErrorCode,
} from '../src/save/saveGame';
import { SAMPLE_IDS, sampleSave as sample } from './helpers/sampleSave';

/** Derin kopya; testlerde bozulacak veri kaynağı korunsun. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Bozma testlerinde iç içe alanlara serbestçe yazmak için gevşek tip. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bad = any;

function codeOf(fn: () => unknown): SaveErrorCode {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SaveError);
    return (error as SaveError).code;
  }
  throw new Error('SaveError bekleniyordu');
}

describe('parseSave: geçerli kayıt', () => {
  it('geçerli kaydı birebir aynı döndürür (JSON gidiş-dönüşü dahil)', () => {
    const save = sample();
    expect(parseSave(save)).toEqual(save);
    expect(parseSave(clone(save))).toEqual(save);
  });

  it('girdiyle bellek paylaşmaz', () => {
    const save = sample();
    const parsed = parseSave(save);
    parsed.world.removed.push(999);
    parsed.player.x = 0;
    expect(save.world.removed).toEqual([SAMPLE_IDS.tree]);
    expect(save.player.x).toBe(10);
  });

  it('boş dünya, boş envanter ve yapısız kaydı kabul eder', () => {
    const save = sample();
    save.world = { handDone: [], axeDone: [], removed: [] };
    save.creatures = { killed: [] };
    save.inventory = new Inventory({ slots: INVENTORY.slots }).toJSON();
    save.structures = new StructureSet().toJSON();
    expect(parseSave(save)).toEqual(save);
  });

  it('bilinmeyen ek alanları atar', () => {
    const raw = { ...clone(sample()), cheat: true, player: { ...sample().player, fov: 90 } };
    const parsed = parseSave(raw) as unknown as Record<string, unknown>;
    expect(parsed.cheat).toBeUndefined();
    expect(parsed.player).toEqual(sample().player);
  });
});

describe('parseSave: bozuk kayıt', () => {
  it.each([null, undefined, 42, 'kayıt', [1, 2]])('nesne olmayan girdi (%j) reddedilir', (raw) => {
    expect(codeOf(() => parseSave(raw))).toBe('not_object');
  });

  it.each([undefined, 0, -1, 1.5, '1', null])('geçersiz sürüm (%j) reddedilir', (version) => {
    const raw = { ...clone(sample()), version };
    expect(codeOf(() => parseSave(raw))).toBe('bad_version');
  });

  it('daha yeni sürüm anlaşılır hatayla reddedilir', () => {
    const raw = { ...clone(sample()), version: SAVE_FORMAT_VERSION + 1 };
    expect(codeOf(() => parseSave(raw))).toBe('future_version');
    expect(() => parseSave(raw)).toThrow(/güncelleyin/);
  });

  const bad: Array<[string, (s: Bad) => void]> = [
    ['savedAt tarih değil', (s) => (s.savedAt = 'dün')],
    ['regionId boş', (s) => (s.regionId = '')],
    ['player eksik', (s) => delete s.player],
    ['player.x NaN', (s) => (s.player.x = Number.NaN)],
    ['player.yaw Infinity', (s) => (s.player.yaw = Number.POSITIVE_INFINITY)],
    ['can 100 üstü', (s) => (s.survival.vitals.health = 101)],
    ['su negatif', (s) => (s.survival.vitals.hydration = -1)],
    ['exhausted mantıksal değil', (s) => (s.survival.vitals.exhausted = 'evet')],
    ['saat 24', (s) => (s.survival.clockHour = 24)],
    ['gün kesirli', (s) => (s.survival.clockDay = 1.5)],
    ['ölüm sayısı negatif', (s) => (s.survival.deaths = -1)],
    ['aliveSeconds negatif', (s) => (s.survival.aliveSeconds = -5)],
    ['world dizi değil', (s) => (s.world.removed = 'x')],
    ['world yinelenen kimlik', (s) => (s.world.handDone = [5, 5])],
    ['world negatif kimlik', (s) => (s.world.axeDone = [-1])],
    ['creatures.killed eksik', (s) => delete s.creatures.killed],
    ['creatures bekleme negatif', (s) => (s.creatures.killed[0].remainingSeconds = -1)],
    ['envanterde bilinmeyen eşya', (s) => (s.inventory.slots[0].id = 'ejderha')],
    ['envanter slot sayısı yanlış', (s) => s.inventory.slots.pop()],
    ['yapı bilinmeyen tür', (s) => (s.structures.structures[0].kind = 'kale')],
  ];
  it.each(bad)('%s → invalid', (_name, mutate) => {
    const raw = clone(sample()) as unknown as Bad;
    mutate(raw);
    expect(codeOf(() => parseSave(raw))).toBe('invalid');
  });

  it('iç doğrulayıcının hatası kök neden olarak taşınır', () => {
    const raw = clone(sample()) as unknown as Bad;
    raw.inventory.slots[0].id = 'ejderha';
    try {
      parseSave(raw);
    } catch (error) {
      expect((error as SaveError).message).toMatch(/envanter/);
      expect((error as SaveError).cause).toBeInstanceOf(Error);
      return;
    }
    throw new Error('SaveError bekleniyordu');
  });
});

describe('migrateSave: sürüm göçü', () => {
  type Raw = Record<string, unknown>;

  it('geçerli sürümde girdiyi aynen döner', () => {
    const raw = clone(sample()) as unknown as Raw;
    expect(migrateSave(raw)).toEqual(raw);
  });

  it('eski sürümü adım adım yeniye taşır ve her adımda sürümü artırır', () => {
    const order: number[] = [];
    const migrations = {
      1: (raw: Raw) => {
        order.push(1);
        return { ...raw, a: 'v2' };
      },
      2: (raw: Raw) => {
        order.push(2);
        return { ...raw, b: `${String(raw.a)}->v3` };
      },
    };
    const raw: Raw = { version: 1, keep: true };
    const out = migrateSave(raw, 3, migrations);
    expect(order).toEqual([1, 2]);
    expect(out).toEqual({ version: 3, keep: true, a: 'v2', b: 'v2->v3' });
    expect(raw).toEqual({ version: 1, keep: true }); // girdi değişmez
  });

  it('ara sürümden başlayan kayıt yalnızca kalan adımları çalıştırır', () => {
    const order: number[] = [];
    const migrations = {
      1: (raw: Raw) => (order.push(1), raw),
      2: (raw: Raw) => (order.push(2), raw),
    };
    migrateSave({ version: 2 }, 3, migrations);
    expect(order).toEqual([2]);
  });

  it('gerçek zincir: v1 (Faz 7), v2 (Faz 9), v3 (Faz 10) ve v4 (Faz 11) adımları tanımlı (ayrıntı tests/saveMigration)', () => {
    expect(SAVE_FORMAT_VERSION).toBe(5);
    expect(Object.keys(MIGRATIONS).map(Number)).toEqual([1, 2, 3, 4]);
  });

  it('v3 → v4: aranmış yapı listesi boş eklenir; v4 listesi doğrulanır ve sıralanır', () => {
    const v3 = { ...JSON.parse(JSON.stringify(sample())), version: 3 } as Record<string, unknown>;
    delete v3.settlements;
    expect(parseSave(v3).settlements).toEqual({ searched: [] });
    const v4 = { ...JSON.parse(JSON.stringify(sample())), settlements: { searched: [9, 3, 3] } };
    expect(parseSave(v4).settlements.searched).toEqual([3, 9]);
    expect(codeOf(() => parseSave({ ...sample(), settlements: { searched: [-1] } }))).toBe(
      'invalid',
    );
  });

  it('zincirde adım eksikse no_migration verir', () => {
    expect(codeOf(() => migrateSave({ version: 1 }, 3, { 2: (r) => r }))).toBe('no_migration');
  });
});

describe('summarizeSave', () => {
  it("yuva listesi için gün (1'den), saat ve can özetini verir", () => {
    expect(summarizeSave(sample())).toEqual({
      savedAt: '2026-10-01T09:30:00.000Z',
      regionId: WORLD.id,
      day: 4,
      hour: 14.25,
      health: 80,
      deaths: 2,
    });
  });
});

describe('kayıt v2 → v3 göçü (Faz 9: kısayol çubuğu, inşa)', () => {
  /** Faz 7–8 biçiminde (v2) bir kayıt: kısayol yok, yalnızca eski yapı türleri. */
  function v2(): Bad {
    const save: Bad = clone(sample());
    delete save.hotbar;
    save.version = 2;
    save.structures.structures = save.structures.structures.filter(
      (s: { kind: string }) => s.kind === 'campfire' || s.kind === 'lean_to',
    );
    return save;
  }

  it('v2 kayıt yüklenir: boş kısayol eklenir, geri kalanı aynen kalır', () => {
    const raw = v2();
    const parsed = parseSave(raw);
    expect(parsed.version).toBe(SAVE_FORMAT_VERSION);
    expect(parsed.hotbar.selected).toBeNull();
    expect(parsed.hotbar.slots.every((id) => id === null)).toBe(true);
    expect(parsed.structures).toEqual(raw.structures);
    expect(parsed.inventory).toEqual(raw.inventory);
    expect(parsed.player).toEqual(raw.player);
    expect(raw.hotbar).toBeUndefined(); // göç girdiyi değiştirmez
  });

  it('v3 kayıtta sandık içeriği ve kısayol korunur', () => {
    const parsed = parseSave(clone(sample()));
    const chest = parsed.structures.structures.find((s) => s.kind === 'storage_chest');
    expect(chest?.storage?.slots.some((s) => s?.id === 'log')).toBe(true);
    expect(parsed.hotbar.slots[0]).toBe('stone_axe');
    expect(parsed.hotbar.selected).toBe(0);
  });

  it.each([
    ['yok', undefined],
    [
      'malzeme bağlı',
      { slots: ['stick', null, null, null, null, null, null, null], selected: null },
    ],
    ['seçim sınır dışı', { slots: Array(8).fill(null), selected: 9 }],
  ])('bozuk kısayol (%s) reddedilir', (_name, hotbar) => {
    const save: Bad = clone(sample());
    save.hotbar = hotbar;
    expect(codeOf(() => parseSave(save))).toBe('invalid');
  });

  it('sandık olmayan yapıda içerik reddedilir', () => {
    const save: Bad = clone(sample());
    const chest = save.structures.structures.find(
      (s: { kind: string }) => s.kind === 'storage_chest',
    );
    const fire = save.structures.structures.find((s: { kind: string }) => s.kind === 'campfire');
    fire.storage = chest.storage;
    expect(codeOf(() => parseSave(save))).toBe('invalid');
  });
});
