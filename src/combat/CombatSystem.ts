import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { CreatureSystem } from '../creatures/CreatureSystem';
import type { CreatureKind } from '../creatures/kinds';
import type { Inventory } from '../items/Inventory';
import type { SurvivalSystem } from '../survival/SurvivalSystem';
import { COMBAT } from '../config';
import { defenseFor, InvulnerabilityTimer, mitigate } from './damage';
import { bestWeapon, pickMeleeTarget, type MeleeAim, type MeleeHit, type WeaponId } from './melee';

/** `attack()` sonucu: neden saldırılamadığı ya da isabet durumu. */
export interface AttackResult {
  status: 'hit' | 'miss' | 'cooldown' | 'exhausted' | 'dead';
  weapon: WeaponId | null;
  /** İsabet edilen canlı (`hit` iken). */
  targetId: number | null;
  /** Bu vuruşla öldü mü? */
  killed: boolean;
}

const NO_ATTACK = (status: AttackResult['status']): AttackResult => ({
  status,
  weapon: null,
  targetId: null,
  killed: false,
});

/**
 * Oyuncu tarafı savaş ve av mantığı (saf). Canlılarla yalnızca `CreatureSystem`'in genel arayüzü ve
 * `creature:*` olayları üzerinden konuşur (docs/faz-5-paralel-plan.md §3). 5.6: hasar alma (savunma,
 * dokunulmazlık); 5.7–5.9'da saldırı, leş kesme ve pişirme eklenir.
 */
export class CombatSystem {
  private readonly invulnerability = new InvulnerabilityTimer();
  private cooldownLeft = 0;
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly inventory: Inventory,
    private readonly creatures: CreatureSystem,
    private readonly survival: SurvivalSystem,
  ) {
    this.offs.push(
      this.events.on('creature:attacked', ({ kind, damage }) => this.receiveHit(damage, kind)),
      this.events.on('player:respawned', () => this.invulnerability.reset()),
    );
  }

  /** Sabit adım (dt sn). */
  update(dt: number): void {
    this.invulnerability.update(dt);
    this.cooldownLeft = Math.max(this.cooldownLeft - dt, 0);
  }

  /** Bir sonraki saldırıya kalan bekleme (sn). */
  get cooldownSeconds(): number {
    return this.cooldownLeft;
  }

  /** Şu an vurulabilecek canlı (envanterdeki en iyi silahın menzili ve bakış koni/dikey toleransıyla); yoksa null. */
  target(aim: MeleeAim): MeleeHit | null {
    const weapon = COMBAT.weapons[bestWeapon(this.inventory)];
    const candidates = this.creatures.near(aim.x, aim.z, weapon.reach + COMBAT.aim.searchMargin);
    return pickMeleeTarget(candidates, aim, weapon);
  }

  /**
   * Oyuncu saldırısı (sol tık): envanterdeki en güçlü silahla `aim` yönüne vurur. Ölüyken, beklemedeyken ya
   * da bitkinken (enerji tükenmiş) saldırı yoktur. Iskalasa da silah bekleme ve enerji maliyeti işler;
   * `player:attacked` her gerçek salınışta bir kez yayınlanır (`hitId`: isabet edilen canlı ya da null).
   */
  attack(aim: MeleeAim): AttackResult {
    if (!this.survival.alive) return NO_ATTACK('dead');
    if (this.cooldownLeft > 0) return NO_ATTACK('cooldown');
    const { energy, exhausted } = this.survival.state;
    if (exhausted || energy <= 0) return NO_ATTACK('exhausted');

    const weaponId = bestWeapon(this.inventory);
    const weapon = COMBAT.weapons[weaponId];
    this.cooldownLeft = weapon.cooldownSeconds;
    this.survival.spendEnergy(weapon.energyCost);

    const target = this.target(aim);
    const outcome = target
      ? this.creatures.damage(target.view.id, weapon.damage, { x: aim.x, z: aim.z })
      : null;
    const hitId = outcome ? (target?.view.id ?? null) : null;
    this.events.emit('player:attacked', { weapon: weaponId, hitId });
    return {
      status: outcome ? 'hit' : 'miss',
      weapon: weaponId,
      targetId: hitId,
      killed: outcome?.killed ?? false,
    };
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  /** Bir canlının isabetini savunma ve dokunulmazlıkla işler; hasar gerçekten düştüyse dokunulmazlık başlar. */
  private receiveHit(rawDamage: number, kind: CreatureKind): void {
    if (!this.survival.alive || this.invulnerability.active) return;
    const dealt = this.survival.applyDamage(
      mitigate(rawDamage, defenseFor(this.inventory)),
      'creature',
      kind,
    );
    if (dealt > 0) this.invulnerability.start();
  }
}
