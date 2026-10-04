import { describe, expect, it } from 'vitest';
import { provinceAdjacency } from '../src/battleRoyale/area';
import { defaultSetup } from '../src/battleRoyale/kinds';
import { BATTLE_ROYALE } from '../src/config';
import type { ZoneState } from '../src/battleRoyale/zone';
import type { ProvinceShape } from '../src/data/region';
import {
  aliveText,
  formatClock,
  killFeedText,
  phaseNoticeText,
  provinceButtonStates,
  provinceMapPaths,
  resultLines,
  setupSummary,
  turkishAccusative,
  zoneStatusText,
} from '../src/ui/brFormat';

const zone = (patch: Partial<ZoneState>): ZoneState => ({
  phase: 0,
  stage: 'wait',
  circle: { x: 0, z: 0, r: 100 },
  next: { x: 0, z: 0, r: 50 },
  stageEnds: 100,
  damage: 1,
  ...patch,
});

const elim = (patch: Partial<Parameters<typeof killFeedText>[0]>) => ({
  victim: 'Ayşe Kaya',
  killer: 'Mehmet Yılmaz',
  cause: 'kill' as const,
  weapon: 'rifle',
  left: 10,
  player: false,
  byPlayer: false,
  ...patch,
});

describe('Battle Royale metinleri', () => {
  it('saat ve bölge satırı', () => {
    expect(formatClock(84)).toBe('1:24');
    expect(formatClock(5.2)).toBe('0:06');
    expect(formatClock(-3)).toBe('0:00');
    expect(zoneStatusText(zone({}), 16, 0)).toBe('Bölge 1:24 sonra daralıyor · Dışarısı −1 can/sn');
    expect(zoneStatusText(zone({ stage: 'shrink' }), 40, 0)).toBe(
      'Bölge daralıyor 1:00 · Dışarısı −1 can/sn',
    );
    expect(zoneStatusText(zone({ stage: 'closed', next: null, stageEnds: Infinity }), 1, 0)).toBe(
      'Bölge kapandı · Dışarısı −1 can/sn',
    );
    expect(zoneStatusText(zone({}), 16, 342.4)).toBe(
      'Bölge 1:24 sonra daralıyor · Dışarısı −1 can/sn · Güvenli bölgeye 342 m',
    );
    expect(zoneStatusText(zone({ damage: 3.5 }), 16, 0)).toContain('−3,5 can/sn');
    expect(aliveText(23, 2)).toBe('Kalan 23 · Öldürme 2');
  });

  it('Türkçe belirtme hâli eki (ünlü uyumu, kaynaştırma)', () => {
    expect(turkishAccusative('Yılmaz')).toBe("Yılmaz'ı");
    expect(turkishAccusative('Kaya')).toBe("Kaya'yı");
    expect(turkishAccusative('Öztürk')).toBe("Öztürk'ü");
    expect(turkishAccusative('Kurt')).toBe("Kurt'u");
    expect(turkishAccusative('Çelik')).toBe("Çelik'i");
    expect(turkishAccusative('Güneş')).toBe("Güneş'i");
    expect(turkishAccusative('Koç')).toBe("Koç'u");
  });

  it('öldürme listesi cümleleri', () => {
    expect(killFeedText(elim({}))).toBe("Mehmet Yılmaz, Ayşe Kaya'yı alt etti (Piyade Tüfeği)");
    expect(killFeedText(elim({ killer: 'Sen', byPlayer: true, weapon: null }))).toBe(
      "Ayşe Kaya'yı alt ettin",
    );
    expect(killFeedText(elim({ victim: 'Sen', player: true, weapon: 'club' }))).toBe(
      'Mehmet Yılmaz seni alt etti (Sopa)',
    );
    expect(killFeedText(elim({ cause: 'zone', killer: null, weapon: null }))).toBe(
      'Ayşe Kaya bölgede kaldı',
    );
    expect(killFeedText(elim({ cause: 'zone', killer: null, player: true }))).toBe(
      'Bölgede kaldın',
    );
    expect(killFeedText(elim({ cause: 'animal', killer: null }))).toBe(
      'Ayşe Kaya hayvana yem oldu',
    );
    expect(killFeedText(elim({ cause: 'other', killer: null }))).toBe('Ayşe Kaya elendi');
    expect(phaseNoticeText({ phase: 2, shrinking: false })).toBe(
      'Yeni güvenli bölge belirlendi (3. aşama) — dışarısı −2 can/sn',
    );
    expect(phaseNoticeText({ phase: 2, shrinking: true })).toBe('Güvenli bölge daralıyor!');
  });

  it('sonuç satırları: kazanan ve kaybeden', () => {
    const win = resultLines({
      placement: 1,
      total: 24,
      kills: 5,
      survived: 1300,
      winner: { id: 0, name: 'Sen' },
      topNpc: { id: 3, name: 'Ali Koç', kills: 4 },
    });
    expect(win.title).toBe('Son Kalan Sensin!');
    expect(win.lines.map(([k]) => k)).toEqual([
      'Sıra',
      'Öldürme',
      'Hayatta kalınan süre',
      'En çok öldüren',
    ]);
    const lose = resultLines({
      placement: 7,
      total: 32,
      kills: 1,
      survived: 300,
      winner: { id: 9, name: 'Elif Arslan' },
      topNpc: null,
    });
    expect(lose.title).toBe('#7 / 32');
    expect(lose.lines).toContainEqual(['Kazanan', 'Elif Arslan']);
  });

  it('kurulum özeti', () => {
    expect(setupSummary(defaultSetup())).toBe(
      `Tüm harita · 64 kişi · ${BATTLE_ROYALE.zone.intervalMinutes.default} dk'da bir daralır · Normal`,
    );
    expect(
      setupSummary({
        ...defaultSetup(),
        area: { kind: 'provinces', names: ['Zonguldak', 'Bartın'] },
        players: 24,
        shrinkMinutes: 3,
        difficulty: 'hard',
      }),
    ).toBe("Zonguldak, Bartın · 24 kişi · 3 dk'da bir daralır · Zor");
  });
});

describe('kurulum: il düğmeleri ve harita', () => {
  const rect = (name: string, x0: number, x1: number): ProvinceShape => ({
    name,
    iso: name,
    inRegion: true,
    polygons: [[Float64Array.from([x0, 0, x1, 0, x1, 100, x0, 100])]],
    bounds: { minX: x0, minZ: 0, maxX: x1, maxZ: 100 },
  });
  const provinces = [rect('A', 0, 100), rect('B', 100, 200), rect('C', 200, 300)];
  const adjacency = provinceAdjacency(provinces);

  it('seçili / kilitli / eklenebilir / eklenemez', () => {
    expect(provinceButtonStates(['A', 'B', 'C'], [], adjacency).map((b) => b.state)).toEqual([
      'addable',
      'addable',
      'addable',
    ]);
    expect(provinceButtonStates(['A', 'B', 'C'], ['A'], adjacency).map((b) => b.state)).toEqual([
      'selected',
      'addable',
      'blocked',
    ]);
    expect(
      provinceButtonStates(['A', 'B', 'C'], ['A', 'B', 'C'], adjacency).map((b) => b.state),
    ).toEqual(['selected', 'locked', 'selected']);
  });

  it('SVG yolları ve görünüm kutusu', () => {
    const map = provinceMapPaths(provinces, 10);
    expect(map.viewBox).toEqual({ x: -10, y: -10, w: 320, h: 120 });
    expect(map.span).toBe(320);
    expect(map.provinces[1]).toMatchObject({ name: 'B', d: 'M100 0L200 0L200 100L100 100Z' });
    expect(map.provinces[1]!.cx).toBeCloseTo(150);
  });
});
