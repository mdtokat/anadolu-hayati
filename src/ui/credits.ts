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
