/**
 * Engel sorgusu (Faz 11 ortak sözleşmesi, docs/faz-11-paralel-plan.md §3.4; saf mantık). Kinematik hareket eden
 * canlılar, insanlar, eşkıyalar ve domuz baskını bir adımda (x0, z0) → (x1, z1) yürümeden önce yolun oyuncu
 * duvarları/çitleri/kapalı kapılarıyla (ve yerleşim ayak izleriyle) kesilip kesilmediğini sorar. 11.0'da hiçbir
 * şey engel değildir (`NO_OBSTACLES`); B gerçek uygulamayı yazar, imza değişmez.
 */
export interface ObstacleQuery {
  /** `radius` kalınlığındaki bir gövde (x0, z0)'dan (x1, z1)'e giderken bir engele çarpar mı? */
  blocked(x0: number, z0: number, x1: number, z1: number, radius: number): boolean;
}

/** Hiçbir şeyin engel olmadığı sorgu (11.0 varsayılanı; testlerde de kullanılır). */
export const NO_OBSTACLES: ObstacleQuery = {
  blocked: () => false,
};
