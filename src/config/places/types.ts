/** Bir yer: ad ve yaklaşık enlem/boylam. */
export interface PlaceDef {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

/**
 * Bir il grubunun (tools/groups/<grup>.yaml ile aynı ad) oyun tarafı katkısı (Faz 12.0b): yer adları ve eşkıya kampı
 * sayısı. Her grubun oturumu yalnızca kendi dosyasını düzenler (docs/faz-12-paralel-plan.md §2.2); `config.ts`
 * dosyaları birleştirir, bu yüzden yeni il eklemek ortak dosyalara dokunmaz.
 */
export interface PlaceGroup {
  /**
   * İl adına (`provinces.geojson` adı) göre yerler (ilçe merkezleri ve belirgin yerler). `PILOT.places` ile aynı
   * kurallar: konumlar yaklaşık enlem/boylamdır (en yakın yürünebilir nokta bulunur), il başına en çok 10 yer
   * (Shift + 1–9, 0 tuşları), her yer kendi ilinde, karada ve yürünebilir olmalıdır (`tests/pilotPlaces`).
   */
  readonly places: Readonly<Record<string, readonly PlaceDef[]>>;
  /**
   * Grubun `BANDITS.campCount`'a katkısı: toplam kamp sayısı grupların toplamıdır. Elle ayarlanmaz; grup, yeni
   * illerinin ölçümüne göre (kara alanı × il/ilçe sayısı) kendi katkısını yazar (çekirdek: 9 ilde 96).
   */
  readonly campCount: number;
}
