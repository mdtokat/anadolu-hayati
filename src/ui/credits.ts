/**
 * Veri atıfları: kullanılan veri kaynaklarının lisansları atıf şart koşar; menüde gösterilir
 * (README.md ile tutarlı olmalı). OpenStreetMap (ODbL) Faz 4'te veri kullanılınca eklenecek.
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
];
