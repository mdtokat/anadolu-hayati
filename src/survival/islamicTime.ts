import { solarDeclinationDeg } from './astronomy';

/**
 * Namaz vakitleri ve Hicrî takvim (Faz 10; saf). Oyun saati yerel güneş saatidir (12:00 = güneş öğlesi), bu yüzden
 * vakitler güneşin ufuk yüksekliğinden hesaplanır (Diyanet açıları): imsak −18°, güneş doğuşu/akşam −0,833°
 * (kırılma + güneş yarıçapı), öğle = zeval + temkin, ikindi = gölge boyu 1× (asr-ı evvel), yatsı −17°.
 */

const DEG = Math.PI / 180;

export const PRAYERS = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'] as const;
export type Prayer = (typeof PRAYERS)[number];

/** Vaktin görünen adı. */
export const PRAYER_NAMES: Readonly<Record<Prayer, string>> = {
  imsak: 'İmsak',
  gunes: 'Güneş',
  ogle: 'Öğle',
  ikindi: 'İkindi',
  aksam: 'Akşam',
  yatsi: 'Yatsı',
};

/** Öğle vaktine eklenen temkin (saat): zeval vaktinden sonra kılınır. */
const NOON_TEMKIN_H = 5 / 60;

/** Güneşin `altitudeDeg` yüksekliğine geldiği saat açısı (saat); hiç ulaşmıyorsa null (kutup günü/gecesi). */
function hourAngleFor(
  altitudeDeg: number,
  latitudeDeg: number,
  declinationDeg: number,
): number | null {
  const phi = latitudeDeg * DEG;
  const delta = declinationDeg * DEG;
  const cosH =
    (Math.sin(altitudeDeg * DEG) - Math.sin(phi) * Math.sin(delta)) /
    (Math.cos(phi) * Math.cos(delta));
  if (cosH < -1 || cosH > 1) return null;
  return Math.acos(cosH) / DEG / 15;
}

/** Günün vakitleri (yerel güneş saati, 0–24); hesaplanamayan vakit null. */
export function prayerTimes(latitudeDeg: number, dayOfYear: number): Record<Prayer, number | null> {
  const delta = solarDeclinationDeg(dayOfYear);
  const sunrise = hourAngleFor(-0.833, latitudeDeg, delta);
  const fajr = hourAngleFor(-18, latitudeDeg, delta);
  const isha = hourAngleFor(-17, latitudeDeg, delta);
  // İkindi: gölge boyu = cisim boyu + öğledeki gölge → cot(a) = 1 + tan|φ − δ|.
  const asrAltitude = Math.atan(1 / (1 + Math.tan(Math.abs(latitudeDeg - delta) * DEG))) / DEG;
  const asr = hourAngleFor(asrAltitude, latitudeDeg, delta);
  return {
    imsak: fajr === null ? null : 12 - fajr,
    gunes: sunrise === null ? null : 12 - sunrise,
    ogle: 12 + NOON_TEMKIN_H,
    ikindi: asr === null ? null : 12 + asr,
    aksam: sunrise === null ? null : 12 + sunrise,
    yatsi: isha === null ? null : 12 + isha,
  };
}

/** Saatten sonraki ilk vakit (gün döner: yatsıdan sonra ertesi imsak). */
export function nextPrayer(
  times: Readonly<Record<Prayer, number | null>>,
  hour: number,
): { prayer: Prayer; hour: number } {
  for (const p of PRAYERS) {
    const t = times[p];
    if (t !== null && t > hour + 1e-9) return { prayer: p, hour: t };
  }
  const first = PRAYERS.find((p) => times[p] !== null) ?? 'ogle';
  return { prayer: first, hour: (times[first] as number) + 24 };
}

/** `from` → `to` saatleri arasında (gün dönümü dahil) giren vakitler, sırasıyla. */
export function prayersBetween(
  times: Readonly<Record<Prayer, number | null>>,
  from: number,
  to: number,
): Prayer[] {
  if (to < from) return [...prayersBetween(times, from, 24), ...prayersBetween(times, 0, to)];
  return PRAYERS.filter((p) => {
    const t = times[p];
    return t !== null && t > from && t <= to;
  });
}

// -- Hicrî takvim --------------------------------------------------------------

/** Hicrî ay adları (Türkçe kullanım). */
export const HIJRI_MONTHS = [
  'Muharrem',
  'Safer',
  'Rebiülevvel',
  'Rebiülâhir',
  'Cemaziyelevvel',
  'Cemaziyelâhir',
  'Recep',
  'Şaban',
  'Ramazan',
  'Şevval',
  'Zilkade',
  'Zilhicce',
] as const;

/** Miladî ay adları (Türkçe). */
export const GREGORIAN_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

/** Miladî tarih → Jülyen gün sayısı (öğlen). */
export function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** Jülyen gün sayısı → Miladî tarih. */
export function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

/**
 * Jülyen gün sayısı → Hicrî tarih, tablo (aritmetik) takvimle (30 yıllık döngü, "Kuveyt" algoritması).
 * Gözleme dayalı resmî takvimle ±1 gün farklı olabilir (oyun için yeterli).
 */
export function jdnToHijri(jdn: number): { year: number; month: number; day: number } {
  const l0 = jdn - 1948440 + 10632;
  const n = Math.floor((l0 - 1) / 10631);
  const l1 = l0 - 10631 * n + 354;
  const j =
    Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719) +
    Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238);
  const l2 =
    l1 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l2) / 709);
  const day = l2 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

/** Oyun gününün Miladî ve Hicrî tarihi: "22 Eylül 2026 · 10 Rebiülâhir 1448". */
export function formatGameDate(startYear: number, dayOfYear: number, dayIndex: number): string {
  const jdn = gregorianToJdn(startYear, 1, 1) + (dayOfYear - 1) + dayIndex;
  const g = jdnToGregorian(jdn);
  const h = jdnToHijri(jdn);
  return `${g.day} ${GREGORIAN_MONTHS[g.month - 1]} ${g.year} · ${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year}`;
}
