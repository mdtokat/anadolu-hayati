/**
 * Veri atıfları: kullanılan veri kaynaklarının lisansları atıf şart koşar; menüde gösterilir
 * (README.md ile tutarlı olmalı).
 */
export interface Credit {
  /** Kısa başlık (ne için kullanıldığı). */
  label: string;
  /** Atıf metni. */
  text: string;
  /** Lisans/kaynak bağlantısı. */
  url: string;
}

export const CREDITS: readonly Credit[] = [
  {
    label: 'Yükseklik verisi',
    text: 'Contains modified Copernicus DEM GLO-30 data © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA; all rights reserved.',
    url: 'https://registry.opendata.aws/copernicus-dem/',
  },
  {
    label: 'İl sınırları',
    text: 'geoBoundaries — Runfola, D. et al. (2020), CC BY 4.0.',
    url: 'https://www.geoboundaries.org/',
  },
  {
    label: 'Akarsu ve göller',
    text: '© OpenStreetMap katkıcıları, ODbL 1.0; Overture Maps Foundation dağıtımından (base/water) türetilmiştir.',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    label: 'Arazi örtüsü',
    text: '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium, CC BY 4.0; Overture Maps Foundation dağıtımından (base/land_cover) türetilmiştir.',
    url: 'https://esa-worldcover.org/',
  },
];

/** Kullanılan açık kaynak yazılımlar (lisansları atıf/lisans metni korunmasını şart koşar). */
export const SOFTWARE_CREDITS: readonly Credit[] = [
  {
    label: 'Three.js',
    text: '3B görüntüleme — © three.js authors, MIT lisansı.',
    url: 'https://github.com/mrdoob/three.js/blob/dev/LICENSE',
  },
  {
    label: 'Rapier',
    text: 'Fizik motoru (@dimforge/rapier3d-compat) — © Dimforge, Apache-2.0 lisansı.',
    url: 'https://github.com/dimforge/rapier/blob/master/LICENSE',
  },
];

/** Atıfların altında gösterilen açıklama: veri ölçeklenmiş/sadeleştirilmiştir, hayvan dağılımı yaklaşıktır. */
export const CREDITS_NOTE =
  'Harita verisi oyun için ölçeklenmiş ve sadeleştirilmiştir (yatay 1:50, dikey 1:15; arazi örtüsü 100 m hücrelerle). ' +
  'Hayvan dağılımı gerçek bir dağılım haritası değil, oyun dengesi için arazi örtüsü, rakım ve eğimden türetilmiş bir yaklaşımdır.';
