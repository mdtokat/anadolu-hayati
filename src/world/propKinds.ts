/**
 * Dünyaya yerleştirilen nesne türleri (bkz. docs/faz-4-paralel-plan.md §2.1). Liste sözleşmedir:
 * 4.6'daki toplama etkileşimi her türü bir eşyaya eşler; sıra yalnızca sona eklenir
 * (örnek tamponlarında tür indeksi olarak kullanılır).
 */
export const PROP_KINDS = [
  'tree_broadleaf', // yapraklı (kayın, gürgen, meşe)
  'tree_conifer', // iğne yapraklı (karaçam, göknar)
  'bush', // genel çalı
  'rock', // kaya
  'berry_bush', // böğürtlen/yaban mersini çalısı (yenebilir)
  'hazel', // fındık ağaççığı (yenebilir)
  'chestnut', // kestane ağacı (yenebilir)
  'mushroom', // yenebilir mantar (küçük)
  'stick', // yerde dal (küçük)
  'stone', // yerde taş (küçük)
] as const;

export type PropKind = (typeof PROP_KINDS)[number];

/** Tür adı → `PROP_KINDS` indeksi (tamponlarda kullanılan bayt değeri). */
export const PROP_KIND_INDEX: Readonly<Record<PropKind, number>> = Object.fromEntries(
  PROP_KINDS.map((kind, index) => [kind, index]),
) as Record<PropKind, number>;

/** Bir nesnenin oturumlar ve yeniden yüklemeler boyunca sabit kimliği: aynı seed → aynı kimlik. */
export type PropId = number;

/** Bir nesnenin sorgu sonucu (bkz. PropLayer.propsNear). */
export interface PropRef {
  id: PropId;
  kind: PropKind;
  /** Oyun koordinatı; y = zemin. */
  x: number;
  y: number;
  z: number;
  scale: number;
}
