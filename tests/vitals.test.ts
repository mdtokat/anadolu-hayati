import { describe, expect, it } from 'vitest';
import { CLIMATE, CLOCK, SHELTER_EFFECTS, SURVIVAL } from '../src/config';
import { ambientTemperature } from '../src/survival/climate';
import {
  applyConsumable,
  bodyTempEquilibrium,
  canSprint,
  causeOfDeath,
  initialVitals,
  stepVitals,
  type Activity,
  type DeathCause,
  type VitalsInput,
  type VitalsState,
} from '../src/survival/vitals';

const DT = 1 / 60;

interface SimResult {
  state: VitalsState;
  seconds: number;
  dead: boolean;
  cause: DeathCause | null;
  /** Simülasyon boyunca görülen en yüksek tek-kaynak hasarları toplamı. */
  hypothermiaDamage: number;
}

/** Sabit girdiyle `maxSeconds`'a kadar (ölene dek) simüle eder. */
function simulate(
  input: VitalsInput,
  maxSeconds: number,
  start: VitalsState = initialVitals(),
  dt = DT,
  keep?: (state: VitalsState) => VitalsState,
): SimResult {
  let state = start;
  let hypothermiaDamage = 0;
  const steps = Math.round(maxSeconds / dt);
  for (let i = 0; i < steps; i++) {
    const result = stepVitals(state, input, dt);
    state = keep ? keep(result.state) : result.state;
    hypothermiaDamage += result.damage.hypothermia;
    if (result.dead) {
      return { state, seconds: (i + 1) * dt, dead: true, cause: result.cause, hypothermiaDamage };
    }
  }
  return { state, seconds: steps * dt, dead: false, cause: null, hypothermiaDamage };
}

const rest = (ambientC: number, extra: Partial<VitalsInput> = {}): VitalsInput => ({
  activity: 'rest',
  ambientC,
  ...extra,
});
const comfortable = SURVIVAL.comfortAmbientC + 2; // 20 °C: vücut ısısı etkilenmez

describe('başlangıç durumu ve saflık', () => {
  it('her şey dolu, ısı normal, tükenmiş değil', () => {
    expect(initialVitals()).toEqual({
      health: 100,
      satiety: 100,
      hydration: 100,
      energy: 100,
      bodyTemp: SURVIVAL.bodyTempNormalC,
      exhausted: false,
    });
  });

  it('stepVitals girdi durumunu değiştirmez', () => {
    const state = initialVitals();
    const copy = { ...state };
    stepVitals(state, rest(comfortable), 1);
    expect(state).toEqual(copy);
  });

  it('konforlu sıcaklıkta kısa süre içinde gösterge değerleri 0–100 arasında kalır', () => {
    const { state } = simulate({ activity: 'run', ambientC: comfortable }, 300);
    for (const v of [state.health, state.satiety, state.hydration, state.energy]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('susuzluk ve açlık', () => {
  it('hareketsizken su ve tokluk config süresinde biter (±%1)', () => {
    const thirst = SURVIVAL.hydrationEmptyMinutes * 60;
    const half = simulate(rest(comfortable), thirst / 2).state;
    expect(half.hydration).toBeCloseTo(50, 0);
    const empty = simulate(rest(comfortable), thirst * 1.01).state;
    expect(empty.hydration).toBe(0);

    const hunger = SURVIVAL.satietyEmptyMinutes * 60;
    expect(simulate(rest(comfortable, { drinking: true }), hunger * 0.5).state.satiety).toBeCloseTo(
      50,
      0,
    );
  });

  it('yürümek 1,6×, koşmak 3× hızlı tüketir', () => {
    const drain = (activity: Activity) =>
      100 -
      simulate({ activity, ambientC: comfortable }, 60, { ...initialVitals(), energy: 100 }).state
        .hydration;
    expect(drain('walk') / drain('rest')).toBeCloseTo(SURVIVAL.activityDrain.walk, 1);
    expect(drain('run') / drain('rest')).toBeCloseTo(SURVIVAL.activityDrain.run, 1);
  });

  it('sıcak havada susuzluk hızlanır', () => {
    const cool = 100 - simulate(rest(20), 60).state.hydration;
    const hot = 100 - simulate(rest(38), 60).state.hydration;
    expect(hot).toBeGreaterThan(cool * 1.4);
  });

  it('adım boyundan bağımsız: 1 sn ve 1/60 sn adımları aynı sonucu verir', () => {
    const a = simulate({ activity: 'walk', ambientC: 5 }, 120, initialVitals(), 1).state;
    const b = simulate({ activity: 'walk', ambientC: 5 }, 120, initialVitals(), DT).state;
    expect(a.hydration).toBeCloseTo(b.hydration, 6);
    expect(a.satiety).toBeCloseTo(b.satiety, 6);
    expect(a.bodyTemp).toBeCloseTo(b.bodyTemp, 6); // üstel kapalı form
    expect(a.energy).toBeCloseTo(b.energy, 6);
  });
});

describe('içme ve yeme', () => {
  it('içerken su hızla dolar (0 → 100 birkaç saniyede)', () => {
    const start = { ...initialVitals(), hydration: 0 };
    const seconds = SURVIVAL.maxValue / SURVIVAL.drinkPerSecond;
    const drunk = simulate(rest(comfortable, { drinking: true }), seconds * 1.1, start).state;
    expect(drunk.hydration).toBe(100);
    expect(seconds).toBeLessThan(20);
  });

  it('içmek can kaybını durdurur; ardından can yenilenir', () => {
    const dying = { ...initialVitals(), hydration: 0, health: 40 };
    const drinking = simulate(rest(comfortable, { drinking: true }), 30, dying).state;
    expect(drinking.hydration).toBeGreaterThan(50);
    const recovered = simulate(rest(comfortable, { drinking: true }), 300, dying).state;
    expect(recovered.health).toBeGreaterThan(40 + 20);
  });

  it('applyConsumable seviyeleri artırır ve 100 ile sınırlar', () => {
    const state = { ...initialVitals(), satiety: 30, hydration: 90 };
    const fed = applyConsumable(state, { satiety: 50, hydration: 50 });
    expect(fed.satiety).toBe(80);
    expect(fed.hydration).toBe(100);
    expect(applyConsumable(state, {})).toEqual(state);
  });
});

describe('enerji (yorgunluk)', () => {
  it('koşarak runEmptySeconds içinde tükenir ve koşma kapanır', () => {
    const almost = simulate(
      { activity: 'run', ambientC: comfortable },
      SURVIVAL.runEmptySeconds * 0.9,
    ).state;
    expect(almost.exhausted).toBe(false);
    expect(canSprint(almost)).toBe(true);
    const spent = simulate(
      { activity: 'run', ambientC: comfortable },
      SURVIVAL.runEmptySeconds * 1.05,
    ).state;
    expect(spent.energy).toBe(0);
    expect(spent.exhausted).toBe(true);
    expect(canSprint(spent)).toBe(false);
  });

  it('tükenince yeniden açılmak için eşiğin üstüne çıkmalı (histerezis)', () => {
    let state = simulate(
      { activity: 'run', ambientC: comfortable },
      SURVIVAL.runEmptySeconds * 1.1,
    ).state;
    expect(state.exhausted).toBe(true);
    // Eşiğe ulaşmadan (≈ %25) hâlâ tükenmiş
    const beforeRecover = (SURVIVAL.exhaustedRecoverAt / 100) * SURVIVAL.restRefillSeconds * 0.8;
    state = simulate(rest(comfortable), beforeRecover, state).state;
    expect(state.exhausted).toBe(true);
    state = simulate(rest(comfortable), SURVIVAL.restRefillSeconds, state).state;
    expect(state.exhausted).toBe(false);
    expect(state.energy).toBe(100);
  });

  it('tükenmişken koşu isteği enerjiyi daha da düşürmez', () => {
    const spent = { ...initialVitals(), energy: 0, exhausted: true };
    const next = stepVitals(spent, { activity: 'run', ambientC: comfortable }, 1).state;
    expect(next.energy).toBe(0);
  });

  it('yürürken enerji yavaş, dinlenirken hızlı dolar', () => {
    const half = { ...initialVitals(), energy: 50 };
    const walk = simulate({ activity: 'walk', ambientC: comfortable }, 20, half).state.energy;
    const idle = simulate(rest(comfortable), 20, half).state.energy;
    expect(idle).toBeGreaterThan(walk);
    expect(walk).toBeGreaterThan(50);
  });
});

describe('vücut ısısı', () => {
  it('konforlu ortamda normal ısıda kalır', () => {
    const { state } = simulate(rest(comfortable), 30 * 60, initialVitals(), 1);
    expect(state.bodyTemp).toBeCloseTo(SURVIVAL.bodyTempNormalC, 6);
  });

  it('denge ısısı: soğukta düşer, sıcakta yükselir, aktivite ısı ekler', () => {
    expect(bodyTempEquilibrium(comfortable, 'rest')).toBe(SURVIVAL.bodyTempNormalC);
    expect(bodyTempEquilibrium(0, 'rest')).toBeCloseTo(
      SURVIVAL.bodyTempNormalC - SURVIVAL.comfortAmbientC * SURVIVAL.coldSlope,
      9,
    );
    expect(bodyTempEquilibrium(40, 'rest')).toBeGreaterThan(SURVIVAL.bodyTempNormalC);
    expect(bodyTempEquilibrium(0, 'run')).toBeGreaterThan(bodyTempEquilibrium(0, 'walk'));
    expect(bodyTempEquilibrium(0, 'walk')).toBeGreaterThan(bodyTempEquilibrium(0, 'rest'));
  });

  it('soğukta ısı üstel olarak dengeye iner (zaman sabiti)', () => {
    const ambient = 0;
    const eq = bodyTempEquilibrium(ambient, 'rest');
    const tau = SURVIVAL.bodyTempTauSeconds;
    const after = simulate(rest(ambient), tau, initialVitals(), 1).state.bodyTemp;
    // t = τ → farkın %63,2'si kapanır
    expect(after).toBeCloseTo(eq + (SURVIVAL.bodyTempNormalC - eq) * Math.exp(-1), 3);
  });

  it('ısı, hipotermi eşiğinin altına inince can gider ve neden hipotermidir', () => {
    const start = { ...initialVitals(), bodyTemp: SURVIVAL.hypothermiaBelowC - 3 };
    const result = stepVitals(start, rest(0), 1);
    expect(result.damage.hypothermia).toBeGreaterThan(0);
    expect(result.state.health).toBeLessThan(100);
  });

  it('hipertermi: aşırı sıcakta ısı yükselir ve hasar verir', () => {
    const { state, dead, cause } = simulate({ activity: 'run', ambientC: 55 }, 20 * 60, {
      ...initialVitals(),
    });
    expect(state.bodyTemp).toBeGreaterThan(SURVIVAL.hyperthermiaAboveC);
    expect(dead).toBe(true);
    expect(['hyperthermia', 'dehydration']).toContain(cause);
  });
});

describe('ölüm ve neden', () => {
  it('causeOfDeath en büyük hasarı seçer', () => {
    expect(
      causeOfDeath({ dehydration: 0.1, starvation: 0, hypothermia: 0.3, hyperthermia: 0 }),
    ).toBe('hypothermia');
    expect(
      causeOfDeath({ dehydration: 0.5, starvation: 0.4, hypothermia: 0, hyperthermia: 0 }),
    ).toBe('dehydration');
    expect(causeOfDeath({ dehydration: 0, starvation: 0.2, hypothermia: 0, hyperthermia: 0 })).toBe(
      'starvation',
    );
  });

  it('can 0 olunca ölür, cause verilir; canlıyken cause null', () => {
    const alive = stepVitals(initialVitals(), rest(comfortable), 1);
    expect(alive.dead).toBe(false);
    expect(alive.cause).toBeNull();
    const dying = stepVitals(
      { ...initialVitals(), health: 0.05, hydration: 0 },
      rest(comfortable),
      1,
    );
    expect(dying.dead).toBe(true);
    expect(dying.cause).toBe('dehydration');
    expect(dying.state.health).toBe(0);
  });
});

describe('KABUL: hiçbir şey yapmayan oyuncu makul sürede ölür', () => {
  it("konforlu havada ~20 dk içinde, susuzluktan (config'ten türetilen aralıkta)", () => {
    const thirstEmpty = SURVIVAL.hydrationEmptyMinutes * 60;
    const healthDrain = SURVIVAL.maxValue / SURVIVAL.dehydrationDamagePerSecond;
    const expected = thirstEmpty + healthDrain; // ≈ 1220 sn ≈ 20,3 dk
    const result = simulate(rest(comfortable), expected * 1.3);
    expect(result.dead).toBe(true);
    expect(result.cause).toBe('dehydration');
    expect(result.seconds).toBeGreaterThan(expected * 0.98);
    expect(result.seconds).toBeLessThan(expected * 1.02);
    expect(result.seconds / 60).toBeGreaterThan(19);
    expect(result.seconds / 60).toBeLessThan(22);
  });

  it("su içen ama yemeyen oyuncu açlıktan ölür (Faz 4'e kadar yemek yok): ≈ 46 dk", () => {
    const keepWatered = (s: VitalsState): VitalsState => ({ ...s, hydration: 100 });
    const expected =
      SURVIVAL.satietyEmptyMinutes * 60 + SURVIVAL.maxValue / SURVIVAL.starvationDamagePerSecond;
    const result = simulate(
      rest(comfortable),
      expected * 1.3,
      initialVitals(),
      1 / 10,
      keepWatered,
    );
    expect(result.dead).toBe(true);
    expect(result.cause).toBe('starvation');
    expect(result.seconds).toBeGreaterThan(expected * 0.97);
    expect(result.seconds).toBeLessThan(expected * 1.03);
  });

  it('koşan oyuncu daha erken ölür', () => {
    const idle = simulate(rest(comfortable), 40 * 60, initialVitals(), 1 / 10);
    const walking = simulate(
      { activity: 'walk', ambientC: comfortable },
      40 * 60,
      initialVitals(),
      1 / 10,
    );
    expect(walking.seconds).toBeLessThan(idle.seconds);
  });
});

describe('KABUL: yüksek rakımda gece belirgin biçimde daha tehlikeli', () => {
  const nightHour = CLIMATE.warmestHour - 12; // günün en soğuk saati
  const ambientAt = (elevationM: number) =>
    ambientTemperature({ hour: nightHour, dayOfYear: CLOCK.dayOfYear, elevationM });
  /** Su ve tokluk sürekli dolu tutulur: yalnızca soğuğun etkisi ölçülür. */
  const keepFed = (s: VitalsState): VitalsState => ({ ...s, hydration: 100, satiety: 100 });

  it('kıyıda gece (≈ 50 m) hipotermi hasarı yok, ısı güvenli kalır', () => {
    const coast = ambientAt(50);
    expect(bodyTempEquilibrium(coast, 'rest')).toBeGreaterThanOrEqual(SURVIVAL.hypothermiaBelowC);
    const result = simulate(rest(coast), 2 * 3600, initialVitals(), 1, keepFed);
    expect(result.dead).toBe(false);
    expect(result.hypothermiaDamage).toBe(0);
    expect(result.state.health).toBe(100);
  });

  it('zirvede gece (≈ 1995 m) donmaya yakın: hipotermiyle birkaç dakikada ölür', () => {
    const summit = ambientAt(1995);
    expect(summit).toBeLessThan(3);
    const result = simulate(rest(summit), 30 * 60, initialVitals(), 1 / 10, keepFed);
    expect(result.dead).toBe(true);
    expect(result.cause).toBe('hypothermia');
    expect(result.seconds / 60).toBeGreaterThan(3);
    expect(result.seconds / 60).toBeLessThan(15); // en kötü durum (sabit en soğuk saat) ≈ 10 dk
  });

  it('ölüm süresi rakımla tekdüze kısalır; yüksek rakım çok daha tehlikelidir', () => {
    const timeToDie = (elevationM: number) =>
      simulate(rest(ambientAt(elevationM)), 3 * 3600, initialVitals(), 1 / 10, keepFed).seconds;
    const t500 = timeToDie(500);
    const t1000 = timeToDie(1000);
    const t2000 = timeToDie(2000);
    expect(t1000).toBeLessThanOrEqual(t500);
    expect(t2000).toBeLessThan(t1000);
    // 2000 m'de ölüm süresi, 500 m'dekinin en çok yarısı (ölmeyip 3 saat sınırına dayanan durum dahil)
    expect(t2000).toBeLessThan(t500 / 2);
  });

  it('gündüz aynı rakımda çok daha az tehlikeli: 1500 m gündüz ısı güvende, gece hasar var', () => {
    const day = ambientTemperature({
      hour: CLIMATE.warmestHour,
      dayOfYear: CLOCK.dayOfYear,
      elevationM: 1500,
    });
    const night = ambientAt(1500);
    expect(bodyTempEquilibrium(day, 'rest')).toBeGreaterThan(SURVIVAL.hypothermiaBelowC - 1.5);
    expect(bodyTempEquilibrium(night, 'rest')).toBeLessThan(SURVIVAL.hypothermiaBelowC - 2);
    expect(day - night).toBeCloseTo(2 * CLIMATE.dailyAmplitudeC, 9);
  });

  it('hareket ısıtır: zirvede koşarak hayatta kalma süresi uzar', () => {
    const summit = ambientAt(1995);
    const resting = simulate(rest(summit), 3600, initialVitals(), 1 / 10, keepFed).seconds;
    const running = simulate(
      { activity: 'run', ambientC: summit },
      3600,
      initialVitals(),
      1 / 10,
      (s) => ({
        ...keepFed(s),
        energy: 100,
        exhausted: false,
      }),
    ).seconds;
    expect(running).toBeGreaterThan(resting);
  });
});

describe('ateş ısısı ve barınak (Faz 4.9)', () => {
  const nightHour = CLIMATE.warmestHour - 12;
  const ambientAt = (elevationM: number) =>
    ambientTemperature({ hour: nightHour, dayOfYear: CLOCK.dayOfYear, elevationM });
  const keepFed = (s: VitalsState): VitalsState => ({ ...s, hydration: 100, satiety: 100 });
  const { fireWarmth, shelter } = SHELTER_EFFECTS;

  it('etki yokken (varsayılan girdi) denge değeri eskisiyle aynı', () => {
    expect(bodyTempEquilibrium(0, 'rest', 0, false)).toBe(bodyTempEquilibrium(0, 'rest'));
    const a = stepVitals(initialVitals(), rest(5), 1).state;
    const b = stepVitals(initialVitals(), rest(5, { warmthC: 0, sheltered: false }), 1).state;
    expect(b).toEqual(a);
  });

  it('ateş dengeyi yükseltir, ama normal ısı + aktivite ısısının üstüne çıkarmaz', () => {
    const cold = bodyTempEquilibrium(0, 'rest');
    expect(bodyTempEquilibrium(0, 'rest', 3)).toBeCloseTo(cold + 3, 9);
    // çok güçlü ateş bile konfor ısısında durur
    expect(bodyTempEquilibrium(0, 'rest', 100)).toBe(SURVIVAL.bodyTempNormalC);
    expect(bodyTempEquilibrium(0, 'run', 100)).toBe(
      SURVIVAL.bodyTempNormalC + SURVIVAL.activityHeatC.run,
    );
    // sıcak havada ateş dengeyi değiştirmez (aşırı ısıtmaz)
    expect(bodyTempEquilibrium(40, 'rest', fireWarmth.maxC)).toBe(bodyTempEquilibrium(40, 'rest'));
  });

  it('barınak yalnızca soğuk etkisini kırpar; konforlu ve sıcak havada fark yok', () => {
    const cold = bodyTempEquilibrium(0, 'rest');
    const covered = bodyTempEquilibrium(0, 'rest', 0, true);
    expect(SURVIVAL.bodyTempNormalC - covered).toBeCloseTo(
      (SURVIVAL.bodyTempNormalC - cold) * shelter.coldFactor,
      9,
    );
    expect(bodyTempEquilibrium(comfortable, 'rest', 0, true)).toBe(SURVIVAL.bodyTempNormalC);
    expect(bodyTempEquilibrium(40, 'rest', 0, true)).toBe(bodyTempEquilibrium(40, 'rest'));
  });

  it('barınakta dinlenirken enerji daha hızlı dolar; yürürken fark yok', () => {
    const tired = { ...initialVitals(), energy: 0, exhausted: true };
    const plain = stepVitals(tired, rest(comfortable), 1).state.energy;
    const covered = stepVitals(tired, rest(comfortable, { sheltered: true }), 1).state.energy;
    expect(covered).toBeCloseTo(plain * shelter.restRefillFactor, 9);
    const walkPlain = stepVitals(tired, { activity: 'walk', ambientC: comfortable }, 1).state
      .energy;
    const walkCovered = stepVitals(
      tired,
      { activity: 'walk', ambientC: comfortable, sheltered: true },
      1,
    ).state.energy;
    expect(walkCovered).toBe(walkPlain);
  });

  it('barınakta bitkinlikten daha çabuk çıkılır', () => {
    const tired = { ...initialVitals(), energy: 0, exhausted: true };
    const secondsToRecover = (sheltered: boolean) => {
      let state = tired;
      let t = 0;
      while (state.exhausted && t < 600) {
        state = stepVitals(state, rest(comfortable, { sheltered }), 0.5).state;
        t += 0.5;
      }
      return t;
    };
    expect(secondsToRecover(true)).toBeLessThan(secondsToRecover(false) / 2);
  });

  it('barınakta dinlenirken can daha hızlı yenilenir', () => {
    const hurt = { ...initialVitals(), health: 50 };
    const plain = stepVitals(hurt, rest(comfortable), 1).state.health - 50;
    const covered = stepVitals(hurt, rest(comfortable, { sheltered: true }), 1).state.health - 50;
    expect(covered).toBeCloseTo(plain * shelter.restHealthFactor, 9);
  });

  describe('KABUL: ateş ve barınak geceyi hayatta geçirtir', () => {
    /** Bir oyun gecesi ≈ 12 gerçek dk; en soğuk saat sabit tutulur (en kötü durum), su/tokluk dolu. */
    const NIGHT_SECONDS = 15 * 60;
    const night = (elevationM: number, extra: Partial<VitalsInput>) =>
      simulate(rest(ambientAt(elevationM), extra), NIGHT_SECONDS, initialVitals(), 1, keepFed);

    it('1500 m gece: korunmasız ölür; ateş başında hasar bile yok', () => {
      const bare = night(1500, {});
      expect(bare.dead).toBe(true);
      expect(bare.cause).toBe('hypothermia');
      const fire = night(1500, { warmthC: fireWarmth.maxC });
      expect(fire.dead).toBe(false);
      expect(fire.hypothermiaDamage).toBe(0);
      expect(fire.state.health).toBe(100);
    });

    it('koruma ateşe uzaklıkla azalır: ateşin kenarında 2000 m gece neredeyse ölümcül', () => {
      const near = night(2000, { warmthC: fireWarmth.maxC });
      const edge = night(2000, { warmthC: 2 });
      const far = night(2000, {});
      expect(far.dead).toBe(true);
      expect(edge.state.health).toBeLessThan(near.state.health);
      expect(edge.state.health).toBeLessThan(30);
      expect(near.hypothermiaDamage).toBe(0);
    });

    it('yalnızca barınak: 1500 m geceyi can kaybıyla atlatır; 1000 m gecede neredeyse hasarsız', () => {
      const sheltered = night(1500, { sheltered: true });
      expect(sheltered.dead).toBe(false);
      expect(sheltered.hypothermiaDamage).toBeGreaterThan(0);
      expect(sheltered.state.health).toBeLessThan(100);
      const bare1000 = night(1000, {});
      const covered1000 = night(1000, { sheltered: true });
      expect(covered1000.dead).toBe(false);
      expect(covered1000.hypothermiaDamage).toBeLessThan(bare1000.hypothermiaDamage / 5);
    });

    it('ateş + barınak: 2000 m zirve gecesi bile güvenli, vücut ısısı normal', () => {
      const both = night(2000, { sheltered: true, warmthC: fireWarmth.maxC });
      expect(both.dead).toBe(false);
      expect(both.hypothermiaDamage).toBe(0);
      expect(both.state.bodyTemp).toBeGreaterThan(SURVIVAL.hypothermiaBelowC + 1.5);
    });
  });
});
