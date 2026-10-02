import { describe, expect, it } from 'vitest';
import { BANDITS } from '../src/config';
import {
  TRANSITIONS,
  createBrain,
  engageState,
  scheduledActivity,
  stepBandit,
  yawTo,
  type BanditBrain,
  type BanditSenses,
  type PlayerSense,
} from '../src/bandits/ai';
import type { BanditState, BanditWeapon } from '../src/bandits/kinds';
import { perceivePlayer, type BanditPlayer } from '../src/bandits/perception';
import { createRandom } from '../src/utils/random';

const DT = 1 / 60;
const rng = () => createRandom(7);

function brain(
  state: BanditState,
  patch: Partial<BanditBrain> = {},
  weapon: BanditWeapon = 'pistol',
): BanditBrain {
  return { ...createBrain(0, 0, 0, weapon, 'member', 'sit'), state, ...patch };
}

function senses(patch: Partial<BanditSenses> = {}): BanditSenses {
  return {
    player: null,
    noise: null,
    activity: 'sit',
    home: { x: 0, z: 0, yaw: 0 },
    camp: { x: 0, z: 0 },
    prey: null,
    ...patch,
  };
}

const seen = (dist: number, extra: Partial<PlayerSense> = {}): PlayerSense => ({
  x: 0,
  z: -dist,
  dist,
  visible: true,
  heard: false,
  ...extra,
});

function step(b: BanditBrain, s: BanditSenses, dt = DT) {
  return stepBandit(b, s, dt, rng());
}

describe('eşkıya geçiş tablosu (her satır)', () => {
  it('died: can bitince ölür', () => {
    expect(step(brain('shoot', { health: 0 }), senses()).next.state).toBe('dead');
  });

  it('surrender: ağır yaralı teslim olur (bir kez olay)', () => {
    const r = step(brain('chase', { health: 10 }, 'pala'), senses({ player: seen(3) }));
    expect(r.next.state).toBe('surrender');
    expect(r.actions).toContainEqual({ type: 'surrender' });
    expect(step(r.next, senses({ player: seen(3) })).actions).not.toContainEqual({
      type: 'surrender',
    });
  });

  it('retreat: yaralı savaşan bir kez geri çekilir; süre bitince görürse yeniden saldırır', () => {
    const r = step(brain('shoot', { health: 35 }), senses({ player: seen(20) }));
    expect(r.next.state).toBe('retreat');
    const back = step(
      { ...r.next, stateTime: BANDITS.retreatSeconds },
      senses({ player: seen(20) }),
    );
    expect(back.next.state).toBe('shoot');
    expect(back.next.retreated).toBe(true);
    // İkinci kez geri çekilmez.
    expect(step(back.next, senses({ player: seen(20) })).next.state).toBe('shoot');
    const lost = step({ ...r.next, stateTime: BANDITS.retreatSeconds }, senses());
    expect(lost.next.state).toBe('alert');
  });

  it('ambush_spring: pusudaki oyuncu yaklaşınca ya da vurulunca saldırır; uzaktayken bekler', () => {
    const far = step(
      brain('ambush'),
      senses({ activity: 'ambush', player: seen(BANDITS.ambushTrigger + 10) }),
    );
    expect(far.next.state).toBe('ambush');
    const near = step(
      brain('ambush', {}, 'pala'),
      senses({ activity: 'ambush', player: seen(10) }),
    );
    expect(near.next.state).toBe('chase');
    expect(near.actions).toContainEqual({ type: 'noticed' });
    const hurt = step(
      brain('ambush', { sinceHurt: 0 }),
      senses({ activity: 'ambush', player: seen(60, { visible: false }) }),
    );
    expect(hurt.next.state).toBe('shoot');
  });

  it('provoked: vurulan sakin eşkıya oyuncuyu görmese de saldırır; camide (oyuncu yok) saldırmaz', () => {
    expect(
      step(brain('sit', { sinceHurt: 0 }), senses({ player: seen(30, { visible: false }) })).next
        .state,
    ).toBe('shoot');
    expect(step(brain('sit', { sinceHurt: 0 }), senses()).next.state).toBe('sit');
  });

  it('notice: gören eşkıya silahına göre ateş eder ya da kovalar', () => {
    expect(step(brain('patrol'), senses({ activity: 'patrol', player: seen(30) })).next.state).toBe(
      'shoot',
    );
    expect(
      step(brain('wood', {}, 'club'), senses({ activity: 'wood', player: seen(30) })).next.state,
    ).toBe('chase');
    expect(engageState('rifle')).toBe('shoot');
    expect(engageState('pala')).toBe('chase');
  });

  it('wake: uyuyan görmez; gürültü, duyma ya da vurulma uyandırır', () => {
    expect(step(brain('sleep'), senses({ activity: 'sleep', player: seen(5) })).next.state).toBe(
      'sleep',
    );
    expect(
      step(brain('sleep'), senses({ activity: 'sleep', noise: { x: 5, z: 5 } })).next.state,
    ).toBe('alert');
    expect(
      step(
        brain('sleep'),
        senses({ activity: 'sleep', player: seen(5, { visible: false, heard: true }) }),
      ).next.state,
    ).toBe('alert');
  });

  it('hear: sakin eşkıya sesi araştırır', () => {
    const r = step(brain('guard'), senses({ activity: 'guard', noise: { x: 40, z: 0 } }));
    expect(r.next.state).toBe('alert');
    expect(r.next.investigate).toEqual({ x: 40, z: 0 });
    expect(r.intent.speed).toBeGreaterThan(0); // sese doğru yürür
  });

  it('alert_engage ve alert_calm', () => {
    expect(step(brain('alert'), senses({ player: seen(20) })).next.state).toBe('shoot');
    const calm = step(
      brain('alert', { stateTime: BANDITS.alertSeconds }),
      senses({ activity: 'patrol' }),
    );
    expect(calm.next.state).toBe('patrol');
    expect(step(brain('alert', { stateTime: 1 }), senses()).next.state).toBe('alert');
  });

  it('disengage: oyuncu kaybolunca (camiye girince hemen) arar', () => {
    expect(step(brain('shoot', { noticed: true }), senses()).next.state).toBe('alert');
    const lost = brain('chase', { lostTime: BANDITS.lostSeconds }, 'pala');
    expect(step(lost, senses({ player: seen(30, { visible: false }) })).next.state).toBe('alert');
    const brief = brain('chase', { lostTime: 0 }, 'pala');
    expect(step(brief, senses({ player: seen(30, { visible: false }) })).next.state).toBe('chase');
  });

  it('chase_attack ve attack_done: yakına gelince hamle, hamle sonunda vuruş ve geri kovalamaca', () => {
    const r = step(brain('chase', {}, 'pala'), senses({ player: seen(1) }));
    expect(r.next.state).toBe('attack');
    let b = r.next;
    const strikes: number[] = [];
    for (let i = 0; i < 60; i++) {
      const s = step(b, senses({ player: seen(1) }));
      for (const a of s.actions) if (a.type === 'strike') strikes.push(a.damage);
      b = s.next;
    }
    expect(strikes).toEqual([BANDITS.melee.pala.damage]);
    expect(['chase', 'attack']).toContain(b.state);
    // Bekleme sürerken yeniden hamle yok.
    expect(
      step(brain('chase', { cooldown: 1 }, 'pala'), senses({ player: seen(1) })).next.state,
    ).toBe('chase');
  });

  it('hamlede oyuncu kaçarsa vuruş isabet etmez', () => {
    let b = brain('attack', {}, 'club');
    const hits: unknown[] = [];
    for (let i = 0; i < 60; i++) {
      const s = step(b, senses({ player: seen(4) }));
      hits.push(...s.actions.filter((a) => a.type === 'strike'));
      b = s.next;
    }
    expect(hits).toEqual([]);
  });

  it('take_cover ve cover_done: ateş ederken vurulan siper alır, sonra yeniden ateş eder', () => {
    const r = step(brain('shoot', { sinceHurt: 0 }), senses({ player: seen(20) }));
    expect(r.next.state).toBe('cover');
    expect(r.intent.speed).toBe(BANDITS.runSpeed);
    expect(
      step({ ...r.next, stateTime: 3, sinceHurt: 5 }, senses({ player: seen(20) })).next.state,
    ).toBe('shoot');
  });

  it('schedule: sakin eşkıya saat değişince yeni etkinliğe geçer', () => {
    expect(step(brain('sit'), senses({ activity: 'patrol' })).next.state).toBe('patrol');
    expect(step(brain('patrol'), senses({ activity: 'sleep' })).next.state).toBe('sleep');
  });

  it('tablo: her satır adlı ve sınandı', () => {
    expect(TRANSITIONS.map((t) => t.name)).toEqual([
      'died',
      'surrender',
      'retreat',
      'retreat_done',
      'ambush_spring',
      'provoked',
      'notice',
      'wake',
      'hear',
      'alert_engage',
      'alert_calm',
      'disengage',
      'chase_attack',
      'attack_done',
      'take_cover',
      'cover_done',
      'schedule',
    ]);
  });
});

describe('davranışlar', () => {
  it('atış: görünür ve menzildeyse aralıklarla ateş eder; uzaktaysa yaklaşır', () => {
    let b = brain('shoot', { noticed: true });
    let shots = 0;
    for (let i = 0; i < 60 * 5; i++) {
      const s = step(b, senses({ player: seen(15) }));
      shots += s.actions.filter((a) => a.type === 'shoot').length;
      b = s.next;
    }
    expect(shots).toBeGreaterThanOrEqual(3);
    expect(shots).toBeLessThanOrEqual(Math.ceil(5 / BANDITS.ranged.pistol.interval) + 1);
    const far = step(brain('shoot', { noticed: true, cooldown: 1 }), senses({ player: seen(60) }));
    expect(far.intent.speed).toBeGreaterThan(0);
    expect(far.intent.heading).toBeCloseTo(yawTo(0, 0, 0, -60));
  });

  it('av: menzildeki karacaya ateş eder; menzil dışında dolaşır', () => {
    const prey = { id: 'creature:1', x: 30, z: 0, dist: 30 };
    const r = step(brain('hunt', {}, 'rifle'), senses({ activity: 'hunt', prey }));
    expect(r.actions).toContainEqual({
      type: 'shoot',
      target: 'prey',
      x: 30,
      z: 0,
      preyId: 'creature:1',
    });
    const melee = step(brain('hunt', {}, 'pala'), senses({ activity: 'hunt', prey }));
    expect(melee.actions).toEqual([]);
  });

  it('teslim olan durur ve oyuncuya bakar; kaçan oyuncudan uzaklaşır', () => {
    const s = step(brain('surrender'), senses({ player: seen(3) }));
    expect(s.intent.speed).toBe(0);
    expect(s.intent.face).toBeCloseTo(yawTo(0, 0, 0, -3));
    const f = step(brain('flee'), senses({ player: seen(3) }));
    expect(f.intent.speed).toBe(BANDITS.runSpeed);
    expect(f.intent.heading).toBeCloseTo(yawTo(0, 0, 0, -3) + Math.PI);
  });

  it('oturan yerine gider, varınca durur ve ateşe bakar', () => {
    const go = step(brain('sit'), senses({ home: { x: 10, z: 0, yaw: 1 } }));
    expect(go.intent.speed).toBeGreaterThan(0);
    const there = step(brain('sit', { x: 10 }), senses({ home: { x: 10, z: 0, yaw: 1 } }));
    expect(there.intent).toMatchObject({ speed: 0, face: 1 });
  });
});

describe('etkinlik çizelgesi', () => {
  it('gece uyku; reis ateş başında, nöbetçi nöbette; pusu yalnızca gündüz ve pusu yeri varsa', () => {
    expect(scheduledActivity('member', 1, 5, 2, true)).toBe('sleep');
    expect(scheduledActivity('leader', 0, 5, 2, true)).toBe('sleep');
    expect(scheduledActivity('leader', 0, 5, 12, true)).toBe('sit');
    expect(scheduledActivity('guard', 1, 5, 2, true)).toBe('guard');
    const day = new Set<string>();
    const night = new Set<string>();
    for (let camp = 0; camp < 40; camp++) {
      for (let h = 0; h < 24; h += 2) {
        const a = scheduledActivity('member', 2, camp, h, true);
        (h >= 7 && h < 20 ? day : night).add(a);
        expect(scheduledActivity('member', 2, camp, h, false)).not.toBe('ambush');
      }
    }
    expect([...day].sort()).toEqual(['ambush', 'hunt', 'patrol', 'sit', 'wood']);
    expect(night.has('ambush')).toBe(false);
    expect(scheduledActivity('member', 3, 9, 13, true)).toBe(
      scheduledActivity('member', 3, 9, 13, true),
    );
  });
});

describe('algı', () => {
  const self = { x: 0, z: 0, yaw: 0, eyeY: 1.6 };
  const clear = () => true;
  const player = (patch: Partial<BanditPlayer> = {}): BanditPlayer => ({
    x: 0,
    y: 0,
    z: -30,
    activity: 'walk',
    alive: true,
    sanctuary: false,
    ...patch,
  });

  it('önündeki oyuncuyu görür; arkasındakini görmez (yakın değilse); arazi görüşü keser', () => {
    expect(perceivePlayer(self, player(), 0, false, clear)?.visible).toBe(true);
    expect(perceivePlayer(self, player({ z: 30 }), 0, false, clear)?.visible).toBe(false);
    expect(perceivePlayer(self, player({ z: 3 }), 0, false, clear)?.visible).toBe(true);
    expect(perceivePlayer(self, player(), 0, false, () => false)?.visible).toBe(false);
  });

  it('gece görüş kısalır; uyurken görmez, zor duyar; koşan oyuncu uzaktan duyulur', () => {
    const at = BANDITS.sightRange * 0.8;
    expect(perceivePlayer(self, player({ z: -at }), 0, false, clear)?.visible).toBe(true);
    expect(perceivePlayer(self, player({ z: -at }), 1, false, clear)?.visible).toBe(false);
    expect(perceivePlayer(self, player({ z: -3 }), 0, true, clear)?.visible).toBe(false);
    expect(perceivePlayer(self, player({ z: -20, activity: 'run' }), 0, false, clear)?.heard).toBe(
      true,
    );
    expect(perceivePlayer(self, player({ z: -20, activity: 'rest' }), 0, false, clear)?.heard).toBe(
      false,
    );
    expect(perceivePlayer(self, player({ z: -20, activity: 'run' }), 0, true, clear)?.heard).toBe(
      false,
    );
  });

  it('camide ya da ölüyken oyuncu algılanmaz', () => {
    expect(perceivePlayer(self, player({ sanctuary: true }), 0, false, clear)).toBeNull();
    expect(perceivePlayer(self, player({ alive: false }), 0, false, clear)).toBeNull();
  });
});
