import { describe, expect, it } from 'vitest';
import { runEncounter } from './helpers/encounter';

/**
 * Denge sözleşmesi (5.12): gerçek `CreatureSystem`/`CombatSystem`/`SurvivalSystem` ile bot karşılaşmaları.
 * Sayılar elle oyun denemesinin yerini tutmaz; "tasarım niyeti bozulmasın" diye aralıklarla kilitlenir
 * (plan §3.5: ayı kaçılacak/ateşle uzak tutulacak bir tehdit, kurt sürüsü tehlikeli ama yenilebilir).
 */
describe('karşılaşma dengesi (düz orman, başsız)', () => {
  it('yumrukla yaban domuzuyla dövüşmek ölümcüldür; baltayla/mızrakla kazanılır ve ~35 can kaybedilir', () => {
    const fist = runEncounter({
      kind: 'wild_boar',
      distance: 5,
      policy: 'stand',
      provoke: true,
      seconds: 40,
    });
    expect(fist.playerDied).toBe(true);

    for (const weapon of ['stone_axe', 'stone_spear'] as const) {
      const r = runEncounter({
        kind: 'wild_boar',
        distance: 5,
        policy: 'stand',
        weapon,
        provoke: true,
        seconds: 40,
      });
      expect(r.playerDied).toBe(false);
      expect(r.kills).toBe(1);
      expect(r.damageTaken).toBeGreaterThan(10);
      expect(r.damageTaken).toBeLessThan(60);
    }
  });

  it('kurt yenilebilir: mızrakla ~24 can, baltayla ~24 can; yumrukla yenilemez ama ölmeden kaçar', () => {
    for (const weapon of ['stone_axe', 'stone_spear'] as const) {
      const r = runEncounter({
        kind: 'wolf',
        distance: 5,
        policy: 'stand',
        weapon,
        provoke: true,
        seconds: 40,
      });
      expect(r.playerDied).toBe(false);
      expect(r.kills).toBe(1);
      expect(r.damageTaken).toBeLessThan(50);
    }
    const fist = runEncounter({
      kind: 'wolf',
      distance: 5,
      policy: 'stand',
      provoke: true,
      seconds: 40,
    });
    expect(fist.kills).toBe(0); // 70 can / 4 hasar: yaralanınca kaçmaz, ama yenilmez de
  });

  it('kurt sürüsü gece tehlikelidir ama mızraklı oyuncu yenebilir', () => {
    const r = runEncounter({
      kind: 'wolf',
      distance: 30,
      policy: 'stand',
      weapon: 'stone_spear',
      count: 3,
      night: true,
      provoke: true,
      seconds: 40,
    });
    expect(r.damageTaken).toBeGreaterThan(30);
    expect(r.kills).toBeGreaterThanOrEqual(1);
  });

  it('boz ayı hiçbir silahla yenilemez (kaçılacak/ateşle uzak tutulacak tehdit)', () => {
    for (const weapon of [null, 'stone_axe', 'stone_spear'] as const) {
      const r = runEncounter({
        kind: 'brown_bear',
        distance: 5,
        policy: 'stand',
        weapon,
        provoke: true,
        seconds: 40,
      });
      expect(r.playerDied).toBe(true);
      expect(r.kills).toBe(0);
    }
  });

  it('koşan oyuncu domuzdan kurtulur; kurt koşan oyuncuyu ısırır ama öldürmez', () => {
    const boar = runEncounter({
      kind: 'wild_boar',
      distance: 15,
      policy: 'flee',
      provoke: true,
      seconds: 40,
    });
    expect(boar.damageTaken).toBe(0);
    const wolf = runEncounter({
      kind: 'wolf',
      distance: 15,
      policy: 'flee',
      provoke: true,
      seconds: 40,
    });
    expect(wolf.playerDied).toBe(false);
    expect(wolf.damageTaken).toBeGreaterThan(0);
  });

  it('ateş caydırır: ateşin başında kurt sürüsü de ayı da hasar veremez', () => {
    const wolves = runEncounter({
      kind: 'wolf',
      distance: 30,
      policy: 'stand',
      weapon: 'stone_spear',
      count: 3,
      night: true,
      fireAtPlayer: true,
      seconds: 60,
    });
    expect(wolves.damageTaken).toBe(0);
    const bear = runEncounter({
      kind: 'brown_bear',
      distance: 12,
      policy: 'stand',
      fireAtPlayer: true,
      provoke: true,
      seconds: 40,
    });
    expect(bear.damageTaken).toBe(0);
  });

  it('deri yelek hasarı azaltır', () => {
    const plain = runEncounter({
      kind: 'wild_boar',
      distance: 5,
      policy: 'stand',
      weapon: 'stone_spear',
      provoke: true,
      seconds: 40,
    });
    const vest = runEncounter({
      kind: 'wild_boar',
      distance: 5,
      policy: 'stand',
      weapon: 'stone_spear',
      vest: true,
      provoke: true,
      seconds: 40,
    });
    expect(vest.damageTaken).toBeLessThan(plain.damageTaken);
  });

  it('karaca avlanabilir: arkasından yaklaşıp uyarıda atılan avcı 2 vuruşta alır; önden yaklaşan uzaktan fark edilir', () => {
    const behind = runEncounter({
      kind: 'roe_deer',
      distance: 40,
      policy: 'ambush',
      weapon: 'stone_spear',
      facing: 'away',
      seconds: 90,
    });
    expect(behind.kills).toBe(1);
    expect(behind.damageTaken).toBe(0);

    const head = runEncounter({
      kind: 'roe_deer',
      distance: 100,
      policy: 'ambush',
      weapon: 'stone_spear',
      facing: 'toward',
      seconds: 90,
    });
    expect(head.kills).toBe(0);
  });
});
