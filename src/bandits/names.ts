import type { Random } from '../utils/random';
import type { BanditRole } from './kinds';

/**
 * Eşkıya adları (Faz 11): lakap + ad (dağ eşkıyası geleneği; argo/küfür yok). Reis "Reis" unvanıyla anılır.
 */
const NICKNAMES = ['Kara', 'Deli', 'Çakır', 'Kızıl', 'Sarı', 'Uzun', 'Yıldırım', 'Dağlı'] as const;
const NAMES = [
  'Murat',
  'Hasan',
  'Ali',
  'Rıza',
  'Bekir',
  'Kadir',
  'Halil',
  'Cemal',
  'Şaban',
  'Ramazan',
] as const;

export function banditName(random: Random, role: BanditRole): string {
  const nick = NICKNAMES[Math.floor(random.next() * NICKNAMES.length)]!;
  const name = NAMES[Math.floor(random.next() * NAMES.length)]!;
  return role === 'leader' ? `Reis ${nick} ${name}` : `${nick} ${name}`;
}
