import { STREAMING } from '../config';

/**
 * Kare başına ortak zaman bütçesi (performans): akışlı işler (arazi mesh'i, collider, nesne dağılımı, katman
 * yenilemeleri) sayıyla değil süreyle sınırlanır. Her karede `begin` ile açılır; sistemler sırayla
 * `allows(yapılanİş, enAz)` sorar. `enAz` kadar iş bütçe tükense de yapılır (kritik iş için ilerleme garantisi, ör.
 * oyuncunun altındaki collider); kritik olmayan iş `enAz = 0` ile yalnızca süre kaldıysa yapılır. Dönemsel ağır
 * yenilemeler bütçe tükenmişse bir sonraki kareye ertelenir (`exhausted`). Saat enjekte edilebilir (test).
 *
 * Yeni bir akışlı sistem bu bütçeye bağlanmalı: takılma, sistem sayısı arttıkça büyümesin.
 */
export class FrameBudget {
  private deadline = Number.POSITIVE_INFINITY;
  private started = 0;
  /** Son karede bütçe yüzünden ertelenen iş sayısı (performans göstergesi). */
  deferred = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Yeni kare: `ms` milisaniyelik bütçe açar. */
  begin(ms: number = STREAMING.frameBudgetMs): void {
    this.started = this.now();
    this.deadline = this.started + ms;
    this.deferred = 0;
  }

  /** `done` iş yapılmışken bir iş daha yapılabilir mi? İlk `minItems` iş her zaman yapılabilir. */
  allows(done: number, minItems = 1): boolean {
    if (done < minItems) return true;
    if (this.now() < this.deadline) return true;
    this.deferred++;
    return false;
  }

  /** Bütçe tükendi mi (ertelenebilir dönemsel yenilemeler için)? Tükenmişse erteleme sayılır. */
  get exhausted(): boolean {
    if (this.now() < this.deadline) return false;
    this.deferred++;
    return true;
  }

  /** Bu karede bütçeden harcanan süre (ms). */
  get spentMs(): number {
    return this.now() - this.started;
  }
}
