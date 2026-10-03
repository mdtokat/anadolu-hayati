import type { PlaceGroup } from './types';

/**
 * Çekirdek grup (tools/groups/cekirdek.yaml): Faz 12 öncesi dünyanın 9 hedef ili. Pilot il (Zonguldak) yerleri
 * `PILOT.places`'tedir (`config.ts`); burada **pilot dışındaki** tüm iller bulunur (Faz 8'in Zonguldak çalışmasının
 * Bartın, Karabük, Düzce ve Bolu'ya, sonra Kastamonu, Çankırı, Sinop ve Sakarya'ya uygulanması). Yeniden doğma/
 * başlangıç pilot ille sınırlı değildir (`CITY_START`); bu tablo yer adı bildirimi ve Shift ışınlanması içindir.
 */
export const CEKIRDEK: PlaceGroup = {
  places: {
    Bartın: [
      { name: 'Bartın merkez', lat: 41.6344, lon: 32.3375 },
      { name: 'Amasra', lat: 41.7494, lon: 32.3853 },
      { name: 'Kurucaşile', lat: 41.8433, lon: 32.7253 },
      { name: 'Ulus', lat: 41.5833, lon: 32.6397 },
      { name: 'Kozcağız', lat: 41.5917, lon: 32.1583 },
      { name: 'Güzelcehisar', lat: 41.6556, lon: 32.2831 },
      { name: 'Çaylıoğlu', lat: 41.6, lon: 32.4 },
      { name: 'Bartın Irmağı', lat: 41.5667, lon: 32.5 },
    ],
    Karabük: [
      { name: 'Karabük merkez', lat: 41.2061, lon: 32.6204 },
      { name: 'Safranbolu', lat: 41.2517, lon: 32.6939 },
      { name: 'Yenice', lat: 41.2028, lon: 32.3358 },
      { name: 'Eskipazar', lat: 40.9475, lon: 32.5439 },
      { name: 'Eflani', lat: 41.4278, lon: 32.9553 },
      { name: 'Ovacık', lat: 41.0728, lon: 32.9319 },
      { name: 'Yörük köyü', lat: 41.2667, lon: 32.7667 },
      { name: 'Soğanlı', lat: 41.15, lon: 32.4833 },
    ],
    Düzce: [
      { name: 'Düzce merkez', lat: 40.8438, lon: 31.1565 },
      { name: 'Akçakoca', lat: 41.0864, lon: 31.1167 },
      { name: 'Gölyaka', lat: 40.7728, lon: 31.0069 },
      { name: 'Cumayeri', lat: 40.8697, lon: 30.9511 },
      { name: 'Kaynaşlı', lat: 40.7728, lon: 31.3167 },
      { name: 'Yığılca', lat: 40.9561, lon: 31.4506 },
      { name: 'Çilimli', lat: 40.8947, lon: 31.0239 },
      { name: 'Gümüşova', lat: 40.85, lon: 30.9333 },
      { name: 'Efteni Gölü', lat: 40.7978, lon: 31.0533 },
    ],
    Bolu: [
      { name: 'Bolu merkez', lat: 40.7392, lon: 31.6089 },
      { name: 'Abant Gölü', lat: 40.6115, lon: 31.2765 },
      { name: 'Yedigöller', lat: 40.9441, lon: 31.7497 },
      { name: 'Mudurnu', lat: 40.4658, lon: 31.1808 },
      { name: 'Göynük', lat: 40.3969, lon: 30.7864 },
      { name: 'Mengen', lat: 40.9317, lon: 32.0958 },
      { name: 'Gerede', lat: 40.8, lon: 32.1972 },
      { name: 'Seben', lat: 40.4125, lon: 31.5736 },
      { name: 'Yeniçağa', lat: 40.7792, lon: 32.03 },
      { name: 'Kıbrıscık', lat: 40.4178, lon: 31.8528 },
    ],
    // Faz 11 sonrası genişleme: Kastamonu ve Çankırı.
    Kastamonu: [
      { name: 'Kastamonu merkez', lat: 41.3767, lon: 33.7765 },
      { name: 'Tosya', lat: 41.015, lon: 34.039 },
      { name: 'Taşköprü', lat: 41.51, lon: 34.215 },
      { name: 'İnebolu', lat: 41.975, lon: 33.76 },
      { name: 'Cide', lat: 41.89, lon: 33.005 },
      { name: 'Daday', lat: 41.473, lon: 33.465 },
      { name: 'Araç', lat: 41.242, lon: 33.327 },
      { name: 'Küre', lat: 41.806, lon: 33.711 },
      { name: 'Abana', lat: 41.98, lon: 34.01 },
      { name: 'Azdavay', lat: 41.642, lon: 33.299 },
    ],
    Çankırı: [
      { name: 'Çankırı merkez', lat: 40.6013, lon: 33.6134 },
      { name: 'Ilgaz', lat: 40.923, lon: 33.627 },
      { name: 'Çerkeş', lat: 40.815, lon: 32.894 },
      { name: 'Kurşunlu', lat: 40.842, lon: 33.262 },
      { name: 'Eldivan', lat: 40.53, lon: 33.497 },
      { name: 'Orta', lat: 40.626, lon: 33.107 },
      { name: 'Şabanözü', lat: 40.483, lon: 33.283 },
      { name: 'Atkaracalar', lat: 40.817, lon: 33.074 },
      { name: 'Yapraklı', lat: 40.759, lon: 33.779 },
      { name: 'Bayramören', lat: 40.943, lon: 33.203 },
    ],
    // Sinop–Sakarya genişlemesi (doğu ve batı kıyı).
    Sinop: [
      { name: 'Sinop merkez', lat: 42.0231, lon: 35.1531 },
      { name: 'Boyabat', lat: 41.4686, lon: 34.7733 },
      { name: 'Durağan', lat: 41.4125, lon: 35.0425 },
      { name: 'Ayancık', lat: 41.9461, lon: 34.5853 },
      { name: 'Gerze', lat: 41.8008, lon: 35.1969 },
      { name: 'Türkeli', lat: 41.9472, lon: 34.3367 },
      { name: 'Erfelek', lat: 41.8786, lon: 34.9156 },
      { name: 'Dikmen', lat: 41.6411, lon: 35.2433 },
    ],
    Sakarya: [
      { name: 'Adapazarı', lat: 40.7731, lon: 30.4028 },
      { name: 'Sapanca', lat: 40.6908, lon: 30.2689 },
      { name: 'Hendek', lat: 40.7992, lon: 30.7447 },
      { name: 'Akyazı', lat: 40.6847, lon: 30.6256 },
      { name: 'Karasu', lat: 41.0958, lon: 30.6958 },
      { name: 'Kocaali', lat: 41.0542, lon: 30.8508 },
      { name: 'Geyve', lat: 40.5069, lon: 30.2933 },
      { name: 'Ferizli', lat: 40.9425, lon: 30.485 },
      { name: 'Kaynarca', lat: 41.0344, lon: 30.3067 },
      { name: 'Taraklı', lat: 40.3969, lon: 30.4958 },
    ],
  },
  /**
   * Dünyadaki en çok kamp sayısı katkısı (uygun yer bulunamazsa daha az). Kastamonu–Çankırı genişlemesiyle 48 → 72,
   * Sinop–Sakarya ile 72 → 96 (kara alanı ve il/ilçe sayısı ~1,5–2 kat); seçim açgözlü ve seed'li olduğundan eski
   * kamplar aynı kalır, yenileri eklenir.
   */
  campCount: 96,
};
