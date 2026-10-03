import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RegionData } from '../../src/data/region';

/**
 * İl grupları (tools/groups/*.yaml; Faz 12.0b): testler il listesini sabit dizilerden değil buradan ve yüklenen
 * dünya verisinden (`inRegion`) okur, böylece yeni il eklemek test dosyalarını değiştirmez. Grup dosyalarında
 * `provinces` ve `no_mosque_towns` **akış dizisi** olmalıdır (`anahtar: [a, b]`; Prettier uzun diziyi satırlara
 * böler, o da okunur); tools/worldconfig.py yaml'ı tam okur, burada yalnızca bu iki anahtar düz metin olarak okunur
 * (yaml bağımlılığı yok).
 */
const GROUPS_DIR = resolve(__dirname, '../../tools/groups');

function groupText(name: string): string {
  return readFileSync(resolve(GROUPS_DIR, `${name}.yaml`), 'utf-8');
}

/** `anahtar: [a, b]` akış dizisinin öğeleri (çok satırlı olabilir); anahtar yoksa hata (yazım hatası sessizce boş liste olmasın). */
export function flowList(text: string, key: string): string[] {
  const match = new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm').exec(text);
  if (match === null) throw new Error(`tools/groups: '${key}: [...]' akış dizisi yok`);
  return (match[1] as string)
    .replace(/#.*$/gm, '')
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter((item) => item !== '');
}

/** Grup dosyası adları (cekirdek, bati, dogu, guney …). */
export function groupNames(): string[] {
  return readdirSync(GROUPS_DIR)
    .filter((file) => file.endsWith('.yaml'))
    .map((file) => file.slice(0, -'.yaml'.length))
    .sort();
}

/** Çekirdek grubun (Faz 12 öncesi dünya) hedef illeri: her zaman hedef il olarak kalır. */
export function coreProvinces(): string[] {
  return flowList(groupText('cekirdek'), 'provinces');
}

/** Tüm grupların hedef illeri (yaml'daki beklenen küme; commit'li dünya verisi bunun altkümesi olabilir). */
export function groupProvinces(): string[] {
  return groupNames().flatMap((name) => flowList(groupText(name), 'provinces'));
}

/** Cami sığmayan kıyı/sıkışık merkezler (tüm gruplardan; bilinçli test istisnası). */
export function noMosqueTowns(): string[] {
  return groupNames().flatMap((name) => flowList(groupText(name), 'no_mosque_towns'));
}

/** Yüklenen dünya verisindeki hedef iller (`inRegion = true`), adla sıralı. */
export function targetProvinces(region: Pick<RegionData, 'provinces'>): string[] {
  return region.provinces
    .filter((p) => p.inRegion)
    .map((p) => p.name)
    .sort();
}
