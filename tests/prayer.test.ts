import { describe, expect, it } from 'vitest';
import { CLOCK, PRAYER } from '../src/config';
import { prayerTimes } from '../src/survival/islamicTime';
import { PrayerTracker, prayerPrompt, prayerWindow } from '../src/survival/prayer';

const times = prayerTimes(CLOCK.latitudeDeg, CLOCK.dayOfYear);
const at = (p: keyof typeof times, plus = 0.1) => (times[p] as number) + plus;

describe('prayerWindow: içinde bulunulan vakit', () => {
  it('vakitler sırayla; güneş doğuşu–öğle arası vakit değildir', () => {
    expect(prayerWindow(times, at('imsak'), 3)?.name).toBe('Sabah');
    expect(prayerWindow(times, at('gunes'), 3)).toBeNull();
    expect(prayerWindow(times, at('ogle'), 3)?.name).toBe('Öğle');
    expect(prayerWindow(times, at('ikindi'), 3)?.name).toBe('İkindi');
    expect(prayerWindow(times, at('aksam'), 3)?.name).toBe('Akşam');
    expect(prayerWindow(times, at('yatsi'), 3)?.name).toBe('Yatsı');
  });

  it('imsaktan önce dünün yatsısıdır (aynı vakit kimliği); her vaktin kimliği ayrıdır', () => {
    const lateNight = prayerWindow(times, 23.9, 3)!;
    const beforeDawn = prayerWindow(times, 1, 4)!;
    expect(beforeDawn.name).toBe('Yatsı');
    expect(beforeDawn.key).toBe(lateNight.key);
    const keys = new Set(
      (['imsak', 'ogle', 'ikindi', 'aksam', 'yatsi'] as const).map(
        (p) => prayerWindow(times, at(p), 3)!.key,
      ),
    );
    expect(keys.size).toBe(5);
    expect(prayerWindow(times, at('ogle'), 4)!.key).not.toBe(
      prayerWindow(times, at('ogle'), 3)!.key,
    );
    expect(prayerWindow(times, 0.5, 0)!.key).toBeGreaterThanOrEqual(0);
  });
});

describe('PrayerTracker', () => {
  const setup = () => {
    let health = 50;
    const prayed: string[] = [];
    const tracker = new PrayerTracker(
      (amount) => {
        health = Math.min(100, health + amount);
        return true;
      },
      (w) => prayed.push(w.name),
    );
    return { tracker, prayed, health: () => health };
  };
  const ogle = prayerWindow(times, at('ogle'), 2);
  const step = (
    t: PrayerTracker,
    seconds: number,
    held: boolean,
    ctx: Parameters<PrayerTracker['update']>[2],
  ) => {
    for (let s = 0; s < seconds; s += 1 / 60) t.update(1 / 60, held, ctx);
  };

  it('camide E basılı süre dolunca sağlık artar; aynı vakitte ikinci kez olmaz, sonraki vakitte olur', () => {
    const { tracker, prayed, health } = setup();
    const ctx = { inMosque: true, alive: true, window: ogle };
    step(tracker, PRAYER.seconds - 0.2, true, ctx);
    expect(prayed).toEqual([]);
    step(tracker, 0.4, true, ctx);
    expect(prayed).toEqual(['Öğle']);
    expect(health()).toBe(50 + PRAYER.healthGain);
    step(tracker, PRAYER.seconds * 2, true, ctx);
    expect(prayed).toEqual(['Öğle']);
    expect(tracker.offer?.status).toBe('prayed');
    expect(prayerPrompt(tracker.offer!, 'İkindi 15:20')).toContain('kılındı');
    const ikindi = prayerWindow(times, at('ikindi'), 2);
    step(tracker, PRAYER.seconds + 0.2, true, { ...ctx, window: ikindi });
    expect(prayed).toEqual(['Öğle', 'İkindi']);
  });

  it('camide değilken, vakit dışında ya da tuş bırakılınca ilerlemez; kayıt hakkı korur', () => {
    const { tracker, prayed } = setup();
    step(tracker, PRAYER.seconds + 1, true, { inMosque: false, alive: true, window: ogle });
    expect(tracker.offer).toBeNull();
    step(tracker, PRAYER.seconds + 1, true, { inMosque: true, alive: true, window: null });
    expect(tracker.offer?.status).toBe('no_time');
    expect(prayerPrompt(tracker.offer!, 'Öğle 12:05')).toContain('vakti değil');
    step(tracker, PRAYER.seconds - 1, true, { inMosque: true, alive: true, window: ogle });
    step(tracker, 0.1, false, { inMosque: true, alive: true, window: ogle });
    expect(tracker.progress).toBe(0);
    expect(prayed).toEqual([]);
    tracker.loadSave(ogle!.key);
    expect(tracker.toSave()).toBe(ogle!.key);
    step(tracker, PRAYER.seconds + 1, true, { inMosque: true, alive: true, window: ogle });
    expect(prayed).toEqual([]);
  });
});
