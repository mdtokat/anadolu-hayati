/**
 * Cüzdan (saf mantık): oyuncunun parası (Türk lirası, negatif olmayan tam sayı). Harcama atomiktir: yetmiyorsa
 * hiçbir şey değişmez. Kayda `economy.money` olarak girer.
 */
export class Wallet {
  private amount: number;
  private revision = 0;

  constructor(money = 0) {
    this.amount = checkedMoney(money);
  }

  /** Mevcut para (₺). */
  get money(): number {
    return this.amount;
  }

  /** Her değişiklikte artar (arayüz yeniden çizimi). */
  get version(): number {
    return this.revision;
  }

  canAfford(price: number): boolean {
    return this.amount >= checkedMoney(price);
  }

  /** Para ekler (satış, ganimet). */
  add(n: number): void {
    const v = checkedMoney(n);
    if (v === 0) return;
    this.amount += v;
    this.revision += 1;
  }

  /** Harcar; yetmiyorsa false (değişiklik yok). */
  spend(n: number): boolean {
    const v = checkedMoney(n);
    if (this.amount < v) return false;
    if (v === 0) return true;
    this.amount -= v;
    this.revision += 1;
    return true;
  }

  toSave(): number {
    return this.amount;
  }

  loadSave(money: number): void {
    this.amount = checkedMoney(money);
    this.revision += 1;
  }
}

function checkedMoney(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Geçersiz para tutarı: ${n}`);
  return n;
}

/** "1.250 ₺" biçimi (Türkçe binlik ayracı). */
export function formatMoney(n: number): string {
  return `${n.toLocaleString('tr-TR')} ₺`;
}
