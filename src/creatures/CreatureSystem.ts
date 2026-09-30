import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { CreatureContext, CreatureId, CreatureStats, CreatureView } from './kinds';

/**
 * Canlıların simülasyonu (saf mantık). **İskelet (5.0):** arayüz sabittir, gövde boştur; 5.1–5.5'te
 * Hesap A doldurur (docs/faz-5-paralel-plan.md §3.3). Oyuncu tarafı (`combat/`, çizim) yalnızca bu
 * arayüzü çağırır.
 */
export class CreatureSystem {
  constructor(private readonly events?: EventBus<GameEvents>) {}

  /** Sabit adım (dt sn). */
  update(dt: number, context: CreatureContext): void {
    void dt;
    void context;
    void this.events;
  }

  /** Etkin canlılar (leşler dahil). */
  views(): ReadonlyArray<CreatureView> {
    return [];
  }

  /** (x, z)'ye `radius` içindeki etkin canlılar, yakından uzağa. */
  near(x: number, z: number, radius: number): CreatureView[] {
    void x;
    void z;
    void radius;
    return [];
  }

  /**
   * Canlıya hasar verir. `from`: vuranın konumu (kaçış/saldırı yönü ve geri tepme için). Canlı değilse ya da
   * yoksa null.
   */
  damage(
    id: CreatureId,
    amount: number,
    from: { x: number; z: number },
  ): { killed: boolean } | null {
    void id;
    void amount;
    void from;
    return null;
  }

  /** Kesilen leşi kaldırır; leş yoksa/canlıysa false. */
  removeCarcass(id: CreatureId): boolean {
    void id;
    return false;
  }

  get stats(): CreatureStats {
    return { active: 0, carcasses: 0 };
  }

  dispose(): void {
    // 5.4: durum haritalarını temizle.
  }
}
