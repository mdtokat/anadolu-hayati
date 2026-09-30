import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  createBrain,
  forceWander,
  stepCreature,
  type Brain,
  type Senses,
} from '../src/creatures/ai';
import type { CreatureKind, CreatureState } from '../src/creatures/kinds';
import type { PlayerSense } from '../src/creatures/perception';
import { SPECIES } from '../src/creatures/species';
import { createRandom } from '../src/utils/random';

const DT = 1 / 60;

/** Kuzeyde (−Z) `dist` uzaklıkta, fark edilmiş oyuncu. */
function ps(dist: number, patch: Partial<PlayerSense> = {}): PlayerSense {
  return {
    dist,
    dx: 0,
    dz: -dist,
    visible: true,
    heard: true,
    noticed: true,
    weakness: 0,
    ...patch,
  };
}

function senses(patch: Partial<Senses> = {}): Senses {
  return { player: null, threat: null, fire: null, darkness: 0, ...patch };
}

function brainIn(
  kind: CreatureKind,
  state: CreatureState,
  patch: Partial<Brain> = {},
  seed = 1,
): Brain {
  const brain = createBrain(kind, 0, 0, 0, createRandom(seed));
  brain.state = state;
  Object.assign(brain, patch);
  return brain;
}

interface Scenario {
  kind: CreatureKind;
  from: CreatureState;
  brain?: Partial<Brain>;
  senses: Senses;
  to: CreatureState;
}

/** Geçiş tablosundaki her satır için: koşul sağlanınca hedef duruma geçer. */
const SCENARIOS: Record<string, Scenario> = {
  fire_flee: {
    kind: 'wild_boar',
    from: 'idle',
    senses: senses({ fire: { x: 0, z: -3, dist: 3 } }),
    to: 'flee',
  },
  wounded_flee: {
    kind: 'wolf',
    from: 'chase',
    brain: { health: 10 },
    senses: senses({ player: ps(30) }),
    to: 'flee',
  },
  provoked_flee: {
    kind: 'roe_deer',
    from: 'idle',
    brain: { alarm: 5 },
    senses: senses(),
    to: 'flee',
  },
  threat_close_flee: {
    kind: 'roe_deer',
    from: 'wander',
    senses: senses({ threat: { x: 0, z: -30, dist: 30 } }),
    to: 'flee',
  },
  threat_alert: {
    kind: 'roe_deer',
    from: 'idle',
    senses: senses({ threat: { x: 0, z: -100, dist: 100 } }),
    to: 'alert',
  },
  alert_persist_flee: {
    kind: 'roe_deer',
    from: 'alert',
    brain: { stateTime: 3.5 },
    senses: senses({ threat: { x: 0, z: -100, dist: 100 } }),
    to: 'flee',
  },
  alert_calm: {
    kind: 'roe_deer',
    from: 'alert',
    brain: { stateTime: 3.5 },
    senses: senses(),
    to: 'graze',
  },
  flee_safe: {
    kind: 'roe_deer',
    from: 'flee',
    brain: { stateTime: 7 },
    senses: senses(),
    to: 'wander',
  },
  provoked_chase: {
    kind: 'wild_boar',
    from: 'graze',
    brain: { alarm: 5 },
    senses: senses(),
    to: 'chase',
  },
  chase_attack: {
    kind: 'wild_boar',
    from: 'chase',
    brain: { cooldown: 0 },
    senses: senses({ player: ps(1) }),
    to: 'attack',
  },
  attack_done: {
    kind: 'wild_boar',
    from: 'attack',
    brain: { stateTime: 1.1 },
    senses: senses({ player: ps(1) }),
    to: 'chase',
  },
  chase_lost: {
    kind: 'wild_boar',
    from: 'chase',
    brain: { stateTime: 11 },
    senses: senses({ player: ps(20) }),
    to: 'wander',
  },
  alert_lost: {
    kind: 'wild_boar',
    from: 'alert',
    brain: { stateTime: 4.5 },
    senses: senses(),
    to: 'wander',
  },
  alert_bored: {
    kind: 'brown_bear',
    from: 'alert',
    brain: { stateTime: 16 },
    senses: senses({ player: ps(40) }),
    to: 'wander',
  },
  aggro_chase: {
    kind: 'brown_bear',
    from: 'wander',
    senses: senses({ player: ps(10) }),
    to: 'chase',
  },
  notice_alert: {
    kind: 'brown_bear',
    from: 'idle',
    senses: senses({ player: ps(50) }),
    to: 'alert',
  },
  hunt_stalk: {
    kind: 'wolf',
    from: 'wander',
    senses: senses({ player: ps(50), darkness: 1 }),
    to: 'stalk',
  },
  hunter_notice: {
    kind: 'wolf',
    from: 'idle',
    senses: senses({ player: ps(50), darkness: 0 }),
    to: 'alert',
  },
  stalk_charge: {
    kind: 'wolf',
    from: 'stalk',
    senses: senses({ player: ps(15), darkness: 1 }),
    to: 'chase',
  },
  stalk_abort: {
    kind: 'wolf',
    from: 'stalk',
    senses: senses({ player: ps(200), darkness: 1 }),
    to: 'wander',
  },
  timeout_to_idle: {
    kind: 'roe_deer',
    from: 'graze',
    brain: { plan: 'idle', stateTime: 100 },
    senses: senses(),
    to: 'idle',
  },
  timeout_to_graze: {
    kind: 'roe_deer',
    from: 'idle',
    brain: { plan: 'graze', stateTime: 100 },
    senses: senses(),
    to: 'graze',
  },
  timeout_to_wander: {
    kind: 'roe_deer',
    from: 'idle',
    brain: { plan: 'wander', stateTime: 100 },
    senses: senses(),
    to: 'wander',
  },
};

describe('AI geçiş tablosu', () => {
  it('her tablo satırının bir senaryosu var ve adlar benzersiz', () => {
    const names = TRANSITIONS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(Object.keys(SCENARIOS).sort());
  });

  it.each(Object.entries(SCENARIOS))('%s', (name, scenario) => {
    const transition = TRANSITIONS.find((t) => t.name === name)!;
    expect(transition.from).toContain(scenario.from);
    expect(transition.to).toBe(scenario.to);
    expect(transition.behaviors).toContain(SPECIES[scenario.kind].behavior);

    const brain = brainIn(scenario.kind, scenario.from, scenario.brain);
    const { next } = stepCreature(brain, scenario.senses, DT, createRandom(9));
    expect(next.state).toBe(scenario.to);
  });

  it('koşul bozulunca geçiş olmaz (algı koşulunun tersi)', () => {
    const rng = createRandom(3);
    // Karaca uzaktaki tehdidi görmezse otlamaya devam eder.
    const grazing = brainIn('roe_deer', 'graze', { plan: 'graze', stateTime: 0 });
    expect(stepCreature(grazing, senses(), DT, rng).next.state).toBe('graze');
    // Sağlıklı kurt gündüz, zayıf olmayan oyuncuyu izlemez (yalnızca uyarı).
    const wolf = brainIn('wolf', 'wander', { target: { x: 0, z: 50 } });
    expect(stepCreature(wolf, senses({ player: ps(50), darkness: 0 }), DT, rng).next.state).toBe(
      'alert',
    );
    // Zayıf oyuncu gündüz de izlenir.
    expect(
      stepCreature(wolf, senses({ player: ps(50, { weakness: 0.6 }), darkness: 0 }), DT, rng).next
        .state,
    ).toBe('stalk');
    // Menzil dışındaki oyuncu sinsi yaklaşmayı başlatmaz.
    expect(stepCreature(wolf, senses({ player: ps(150), darkness: 1 }), DT, rng).next.state).toBe(
      'alert',
    );
    // Ayı, oyuncu uzakken kovalamaz.
    const bear = brainIn('brown_bear', 'wander', { target: { x: 0, z: 50 } });
    expect(stepCreature(bear, senses({ player: ps(60) }), DT, rng).next.state).toBe('alert');
  });

  it('yaralı olmayan kurt kovalamayı sürdürür; yaralı kaçar', () => {
    const rng = createRandom(3);
    const healthy = brainIn('wolf', 'chase', { stateTime: 1 });
    expect(stepCreature(healthy, senses({ player: ps(10) }), DT, rng).next.state).toBe('chase');
    const hurt = brainIn('wolf', 'chase', { stateTime: 1, health: 20 });
    expect(stepCreature(hurt, senses({ player: ps(10) }), DT, rng).next.state).toBe('flee');
  });

  it('oyuncu ölünce (algı null) kovalama sona erer', () => {
    const brain = brainIn('wild_boar', 'chase', { stateTime: 1 });
    expect(stepCreature(brain, senses({ player: null }), DT, createRandom(2)).next.state).toBe(
      'wander',
    );
  });
});

describe('saldırı', () => {
  it('hazırlık → vuruş (bir kez) → bekleme; vuruş `attackPhase` ile ilerler', () => {
    const sp = SPECIES.wild_boar;
    let brain = brainIn('wild_boar', 'chase', { cooldown: 0 });
    const rng = createRandom(4);
    const near = senses({ player: ps(1) });

    let strikes = 0;
    let sawAttack = false;
    let lastPhase = 0;
    let cooldownAfter = -1;
    for (let i = 0; i < 60 * 3; i++) {
      const step = stepCreature(brain, near, DT, rng);
      strikes += step.events.filter((e) => e.type === 'strike').length;
      if (step.next.state === 'attack') {
        sawAttack = true;
        if (brain.state !== 'attack') lastPhase = 0; // yeni saldırı hamlesi
        expect(step.next.attackPhase).toBeGreaterThanOrEqual(lastPhase);
        lastPhase = step.next.attackPhase;
        // Vuruş hazırlık bitmeden gelmez.
        if (step.next.stateTime < sp.attackWindup) expect(step.next.struck).toBe(false);
      } else if (brain.state === 'attack') {
        // Saldırı bitti: bekleme başladı, faz sıfırlandı.
        cooldownAfter = step.next.cooldown;
        expect(step.next.attackPhase).toBe(0);
      }
      brain = step.next;
    }
    expect(sawAttack).toBe(true);
    // 3 sn içinde: ilk saldırı (~0.5 sn), sonra ~1 sn toparlanma + 1 sn bekleme → en çok 2 vuruş; her saldırıda tam 1.
    const attackCount = Math.floor(strikes);
    expect(attackCount).toBeGreaterThanOrEqual(1);
    expect(attackCount).toBeLessThanOrEqual(2);
    expect(cooldownAfter).toBeGreaterThan(0);
  });

  it('bir saldırı hamlesi tam bir `strike` üretir ve ham hasarı taşır', () => {
    let brain = brainIn('brown_bear', 'attack', { stateTime: 0 });
    const rng = createRandom(4);
    const events: Array<{ type: string; damage?: number }> = [];
    for (let i = 0; i < 120; i++) {
      const step = stepCreature(brain, senses({ player: ps(1.5) }), DT, rng);
      events.push(...step.events);
      brain = step.next;
      if (brain.state !== 'attack') break;
    }
    const strikes = events.filter((e) => e.type === 'strike');
    expect(strikes).toHaveLength(1);
    expect(strikes[0]?.damage).toBe(SPECIES.brown_bear.attackDamage);
  });

  it('menzil dışına çıkan oyuncu vuruştan kurtulur (ıska)', () => {
    let brain = brainIn('brown_bear', 'attack', { stateTime: 0 });
    const rng = createRandom(4);
    let strikes = 0;
    for (let i = 0; i < 120; i++) {
      const step = stepCreature(brain, senses({ player: ps(10) }), DT, rng);
      strikes += step.events.filter((e) => e.type === 'strike').length;
      brain = step.next;
    }
    expect(strikes).toBe(0);
  });
});

describe('ateş', () => {
  it('ateşin yakınındaki yırtıcı yaklaşmaz: kovalarken bile kaçışa geçer ve ateş sürdükçe geri dönmez', () => {
    const rng = createRandom(6);
    const fire = { x: 0, z: 0, dist: 10 };
    let brain = brainIn('wolf', 'chase', { stateTime: 1 });
    for (let i = 0; i < 600; i++) {
      const step = stepCreature(brain, senses({ player: ps(8), darkness: 1, fire }), DT, rng);
      brain = step.next;
      expect(['flee']).toContain(brain.state);
    }
  });

  it('ayı için ateş yarıçapı küçüktür: yakın ateşte kaçar', () => {
    const brain = brainIn('brown_bear', 'chase', { stateTime: 1 });
    const { next } = stepCreature(
      brain,
      senses({ player: ps(5), fire: { x: 0, z: 0, dist: 4 } }),
      DT,
      createRandom(2),
    );
    expect(next.state).toBe('flee');
  });

  it('kaçış ateşin tersi yöne gider', () => {
    const brain = brainIn('wolf', 'idle');
    // Ateş kuzeyde (−Z): kaçış güneye (+Z) → yaw ≈ π.
    const step = stepCreature(
      brain,
      senses({ fire: { x: 0, z: -10, dist: 10 } }),
      DT,
      createRandom(2),
    );
    expect(step.next.state).toBe('flee');
    expect(Math.abs(step.intent.heading)).toBeCloseTo(Math.PI, 1);
    expect(step.intent.speed).toBe(SPECIES.wolf.runSpeed);
  });
});

describe('durum içi davranış', () => {
  it('dolaşma hedefe doğru yürüme hızıyla gider, varınca hedefi bırakır', () => {
    const brain = brainIn('roe_deer', 'wander', { target: { x: 0, z: -20 }, plan: 'idle' });
    const step = stepCreature(brain, senses(), DT, createRandom(1));
    expect(step.intent.heading).toBeCloseTo(0);
    expect(step.intent.speed).toBe(SPECIES.roe_deer.walkSpeed);

    const arrived = brainIn('roe_deer', 'wander', {
      target: { x: 0.5, z: 0 },
      plan: 'idle',
      stateTime: 0,
    });
    const done = stepCreature(arrived, senses(), DT, createRandom(1));
    expect(done.intent.speed).toBe(0);
  });

  it('koşma/kaçma hızları tür tablosundan', () => {
    const chase = stepCreature(
      brainIn('wolf', 'chase'),
      senses({ player: ps(30) }),
      DT,
      createRandom(1),
    );
    expect(chase.intent.speed).toBe(SPECIES.wolf.runSpeed);
    const stalk = stepCreature(
      brainIn('wolf', 'stalk'),
      senses({ player: ps(40), darkness: 1 }),
      DT,
      createRandom(1),
    );
    expect(stalk.intent.speed).toBe(SPECIES.wolf.walkSpeed);
  });

  it('dönüş hızı sınırlıdır ve uyumsuz yönde hız kısılır', () => {
    // Oyuncu tam arkada (+Z): canlı kuzeye bakıyor.
    const brain = brainIn('wolf', 'chase');
    const behind = senses({ player: ps(30, { dx: 0, dz: 30 }) });
    const step = stepCreature(brain, behind, DT, createRandom(1));
    expect(Math.abs(step.next.yaw)).toBeLessThanOrEqual(SPECIES.wolf.turnRate * DT + 1e-9);
    expect(step.next.speed).toBeLessThan(SPECIES.wolf.runSpeed);
    expect(step.next.speed).toBeGreaterThan(0);
  });

  it('uyarıda tehdide dönülür, hız sıfırdır', () => {
    const brain = brainIn('roe_deer', 'alert');
    const step = stepCreature(
      brain,
      senses({ threat: { x: -50, z: 0, dist: 50 }, player: null }),
      DT,
      createRandom(1),
    );
    expect(step.intent.speed).toBe(0);
    expect(step.intent.heading).toBeCloseTo(Math.PI / 2);
  });
});

describe('fark etme olayı', () => {
  it('oyuncuyu ilk fark edişte bir kez yayınlanır, pasife dönünce yeniden', () => {
    const rng = createRandom(2);
    let brain = brainIn('brown_bear', 'wander', { target: { x: 0, z: 50 } });
    const noticed = senses({ player: ps(50) });

    let step = stepCreature(brain, noticed, DT, rng);
    expect(step.events).toEqual([{ type: 'noticed', state: 'alert' }]);
    brain = step.next;

    // Uyarıda kalırken tekrar yayınlanmaz.
    for (let i = 0; i < 30; i++) {
      step = stepCreature(brain, noticed, DT, rng);
      expect(step.events).toEqual([]);
      brain = step.next;
    }

    // Oyuncu kaybolur → pasife döner (noticed sıfırlanır).
    const lost = senses();
    for (let i = 0; i < 60 * 8 && brain.state === 'alert'; i++) {
      brain = stepCreature(brain, lost, DT, rng).next;
    }
    expect(['idle', 'wander', 'graze']).toContain(brain.state);
    expect(brain.noticed).toBe(false);

    // Yeniden fark eder → yeniden olay.
    step = stepCreature(brain, noticed, DT, rng);
    expect(step.events.some((e) => e.type === 'noticed')).toBe(true);
  });

  it('savunmacı yakınsa doğrudan kovalamaya geçerken `chase` bildirir', () => {
    const step = stepCreature(
      brainIn('wild_boar', 'wander', { target: { x: 0, z: 30 } }),
      senses({ player: ps(5) }),
      DT,
      createRandom(2),
    );
    expect(step.next.state).toBe('chase');
    expect(step.events).toEqual([{ type: 'noticed', state: 'chase' }]);
  });
});

describe('ölü canlı ve determinizm', () => {
  it('ölü canlı hiçbir girdiyle durum değiştirmez', () => {
    const dead = brainIn('wolf', 'dead', { health: 0 });
    const step = stepCreature(
      dead,
      senses({ player: ps(1), fire: { x: 0, z: 0, dist: 1 }, darkness: 1 }),
      1,
      createRandom(1),
    );
    expect(step.next).toBe(dead);
    expect(step.next.state).toBe('dead');
    expect(step.intent.speed).toBe(0);
    expect(step.events).toEqual([]);
  });

  it('aynı girdi + aynı tohum → aynı sonuç', () => {
    const run = (seed: number) => {
      const rng = createRandom(seed);
      let brain = createBrain('wild_boar', 10, 20, 0.3, rng);
      const trace: string[] = [];
      for (let i = 0; i < 600; i++) {
        const player = i > 300 ? ps(40 - i / 20) : null;
        const step = stepCreature(brain, senses({ player }), DT, rng);
        brain = step.next;
        trace.push(`${brain.state}:${brain.yaw.toFixed(4)}:${step.events.length}`);
      }
      return trace;
    };
    expect(run(11)).toEqual(run(11));
    expect(run(11)).not.toEqual(run(12));
  });

  it('girdi beyni değiştirilmez', () => {
    const brain = brainIn('wolf', 'idle');
    const snapshot = JSON.stringify(brain);
    stepCreature(brain, senses({ player: ps(20), darkness: 1 }), DT, createRandom(1));
    expect(JSON.stringify(brain)).toBe(snapshot);
  });

  it('forceWander yeni bir dolaşma hedefi verir', () => {
    const brain = brainIn('wolf', 'chase');
    forceWander(brain, createRandom(5));
    expect(brain.state).toBe('wander');
    expect(brain.target).not.toBeNull();
  });
});

describe('otobur döngüsü', () => {
  it('pasif döngü: idle/graze/wander arasında dolaşır, hep canlı durumda kalır', () => {
    const rng = createRandom(8);
    let brain = createBrain('roe_deer', 0, 0, 0, rng);
    const seen = new Set<CreatureState>();
    for (let i = 0; i < 60 * 120; i++) {
      const step = stepCreature(brain, senses(), DT, rng);
      brain = step.next;
      // Hareketi uygula (hedefe varabilsin).
      brain.x -= Math.sin(brain.yaw) * brain.speed * DT;
      brain.z -= Math.cos(brain.yaw) * brain.speed * DT;
      seen.add(brain.state);
    }
    expect(seen.has('idle')).toBe(true);
    expect(seen.has('graze')).toBe(true);
    expect(seen.has('wander')).toBe(true);
    expect([...seen].every((s) => ['idle', 'graze', 'wander'].includes(s))).toBe(true);
  });
});
