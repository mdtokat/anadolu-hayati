import { HORIZONTAL_SCALE } from '../config';
import { directionName, distanceWords } from '../people/roles';

/**
 * Eşkıya konuşma metinleri (Faz 11; argo/küfür yok): teslim olan eşkıyanın yakarışı ve yolcuların eşkıya uyarısı.
 */
export const SURRENDER_TEXT = {
  plea: 'Aman ağam, canımı bağışla! Silahımı bırakırım, bir daha bu dağlarda görünmem.',
  spare: 'Bağışla: silahını bırakıp gitsin',
  spared: 'Allah razı olsun ağam! Bir daha yolumuz kesişmesin.',
  campQuestion: 'Kampınız nerede?',
  silent: 'Sus! (konuşmayı bitir)',
  silentReply: '…',
  subtitle: 'Teslim olan eşkıya. Bağışlarsan silahını bırakıp kaçar.',
} as const;

/** "Kampımız kuzeybatı tarafında, 2 kilometre kadar ötede…" ya da kamp yoksa kaçamak cevap. */
export function campAnswer(
  from: { x: number; z: number },
  camp: { x: number; z: number } | null,
): string {
  if (!camp) return 'Kampımız kalmadı ağam, dağıldık.';
  const dx = camp.x - from.x;
  const dz = camp.z - from.z;
  return `Kampımız ${directionName(dx, dz)} tarafında, ${distanceWords(Math.hypot(dx, dz), HORIZONTAL_SCALE)} ötede. Sandıkta erzak da silah da var.`;
}

/** Yolcunun sorusu ve cevabı (en yakın temizlenmemiş kamp). */
export const WARNING_QUESTION = 'Bu yollar güvenli mi?';

export function banditWarning(
  address: string,
  from: { x: number; z: number },
  camp: { x: number; z: number } | null,
): string {
  if (!camp)
    return `Şimdilik sakin ${address}. Yine de şehirde cebine dikkat et, yankesiciler dolaşır.`;
  const dx = camp.x - from.x;
  const dz = camp.z - from.z;
  const dir = directionName(dx, dz);
  return `Ormanda eşkıya var ${address}: ${dir} tarafında, ${distanceWords(Math.hypot(dx, dz), HORIZONTAL_SCALE)} ötede kamp kurmuşlar. Yol kenarında pusu kurarlar; gece uyurlar. Şehirde de yankesicilere dikkat et.`;
}
