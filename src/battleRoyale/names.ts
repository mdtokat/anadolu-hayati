import type { Random } from '../utils/random';

/** Yarışmacı adları (ad + soyad; yaygın Türk adları, tekrarsız). */
const FIRST = [
  'Ahmet',
  'Mehmet',
  'Mustafa',
  'Ali',
  'Hüseyin',
  'Hasan',
  'İbrahim',
  'Yusuf',
  'Emre',
  'Burak',
  'Ömer',
  'Murat',
  'Kemal',
  'Selim',
  'Ayşe',
  'Fatma',
  'Zeynep',
  'Elif',
  'Merve',
  'Esra',
  'Hatice',
  'Emine',
  'Kübra',
  'Seda',
] as const;
const LAST = [
  'Yılmaz',
  'Kaya',
  'Demir',
  'Şahin',
  'Çelik',
  'Yıldız',
  'Aydın',
  'Öztürk',
  'Arslan',
  'Doğan',
  'Kılıç',
  'Aslan',
  'Çetin',
  'Koç',
  'Kurt',
  'Özdemir',
  'Şimşek',
  'Polat',
  'Korkmaz',
  'Güneş',
] as const;

/** `count` tekrarsız ad (en çok ad × soyad kadar; sonrası numaralanır). */
export function contestantNames(count: number, random: Random): string[] {
  const all: string[] = [];
  for (const f of FIRST) for (const l of LAST) all.push(`${f} ${l}`);
  for (let i = all.length - 1; i > 0; i--) {
    const j = random.int(0, i);
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  const out = all.slice(0, count);
  for (let i = out.length; i < count; i++) out.push(`${all[i % all.length]!} ${i}`);
  return out;
}
