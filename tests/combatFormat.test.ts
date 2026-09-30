import { describe, expect, it } from 'vitest';
import { CombatSystem } from '../src/combat/CombatSystem';
import { COMBAT_HUD } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import type { CreatureSystem } from '../src/creatures/CreatureSystem';
import { CREATURE_KINDS } from '../src/creatures/kinds';
import { Inventory } from '../src/items/Inventory';
import { SurvivalSystem } from '../src/survival/SurvivalSystem';
import {
  attackPrompt,
  defenseLabel,
  hitMarkerKind,
  noticedToast,
  vignetteStrength,
} from '../src/ui/combatFormat';
import { deathCauseText } from '../src/ui/survivalFormat';
import { CREATURE_NAMES } from '../src/combat/promptText';
import { FakeCreatures, makeView } from './helpers/fakeCreatures';

describe('vignetteStrength', () => {
  it('hasar yoksa 0; küçük hasarda en az minVignette; büyükte 1', () => {
    expect(vignetteStrength(0)).toBe(0);
    expect(vignetteStrength(-3)).toBe(0);
    expect(vignetteStrength(1)).toBe(COMBAT_HUD.minVignette);
    expect(vignetteStrength(COMBAT_HUD.fullVignetteDamage)).toBe(1);
    expect(vignetteStrength(COMBAT_HUD.fullVignetteDamage * 3)).toBe(1);
  });

  it('hasarla monoton artar', () => {
    const a = vignetteStrength(12);
    const b = vignetteStrength(24);
    expect(b).toBeGreaterThan(a);
  });
});

describe('hitMarkerKind', () => {
  it('öldüren vuruş ayrı', () => {
    expect(hitMarkerKind(true)).toBe('kill');
    expect(hitMarkerKind(false)).toBe('hit');
  });
});

describe('noticedToast', () => {
  it('yırtıcı sinsi/kovalamada "Tehlike: <ad>"; tetikte ya da zararsız tür yok', () => {
    expect(noticedToast('wolf', 'stalk')).toBe('Tehlike: Kurt');
    expect(noticedToast('brown_bear', 'chase')).toBe('Tehlike: Boz ayı');
    expect(noticedToast('wild_boar', 'chase')).toBe('Tehlike: Yaban domuzu');
    expect(noticedToast('wolf', 'alert')).toBeNull();
    expect(noticedToast('roe_deer', 'flee')).toBeNull();
    expect(noticedToast('roe_deer', 'chase')).toBeNull();
  });

  it('her türün Türkçe adı var', () => {
    for (const kind of CREATURE_KINDS) expect(CREATURE_NAMES[kind].length).toBeGreaterThan(0);
  });
});

describe('ipucu ve gösterge metinleri', () => {
  it('saldırı ipucu tür adını içerir', () => {
    expect(attackPrompt('wolf')).toBe('Sol tık: Saldır · Kurt');
  });

  it('savunma etiketi yüzdeyi yazar; savunma yoksa boş', () => {
    expect(defenseLabel(0)).toBe('');
    expect(defenseLabel(0.2)).toBe('Savunma %20');
    expect(defenseLabel(2)).toBe('Savunma %100');
    expect(defenseLabel(-1)).toBe('');
  });

  it('ölüm ekranı nedeni hayvan saldırısı', () => {
    expect(deathCauseText('mauled')).toBe('Hayvan saldırısında öldün.');
  });
});

describe('CombatSystem.target (saldırı ipucu)', () => {
  it('bakılan canlıyı verir, arkadakini vermez, saldırmadan bekleme/enerji harcamaz', () => {
    const events = new EventBus<GameEvents>();
    const survival = new SurvivalSystem(events);
    const creatures = new FakeCreatures(events);
    const combat = new CombatSystem(
      events,
      new Inventory(),
      creatures as unknown as CreatureSystem,
      survival,
    );
    const aim = { x: 0, y: 0, z: 0, eyeY: 1.65, yaw: 0, pitch: 0 };
    creatures.add(makeView({ z: 1.2 })); // arkada
    expect(combat.target(aim)).toBeNull();
    const id = creatures.add(makeView({ z: -1.2 }));
    expect(combat.target(aim)?.view.id).toBe(id);
    expect(combat.cooldownSeconds).toBe(0);
    expect(survival.state.energy).toBe(100);
  });
});
