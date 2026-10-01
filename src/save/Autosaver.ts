/** Belirli aralıkla (oyun adımlarında biriken gerçek süreyle) `onDue` çağıran sayaç; ilk çağrı tam aralık sonra gelir. */
export class Autosaver {
  private elapsed = 0;

  constructor(
    private readonly intervalSeconds: number,
    private readonly onDue: () => void,
  ) {}

  /** Sabit adım (dt sn). Aralık dolunca `onDue` çağrılır ve sayaç sıfırlanır. */
  update(dt: number): void {
    this.elapsed += dt;
    if (this.elapsed >= this.intervalSeconds) {
      this.elapsed = 0;
      this.onDue();
    }
  }

  /** Sayacı sıfırlar (elle kayıt/yükleme sonrası hemen otomatik kayıt çıkmasın). */
  reset(): void {
    this.elapsed = 0;
  }
}
