import { DynamicDrawUsage, type BufferAttribute, type InstancedMesh } from 'three';

/**
 * Örnekli çizim tamponlarının GPU'ya yüklenmesi (performans). `needsUpdate` tek başına tamponun **tamamını** (kapasite
 * kadar) yükler: 144 bin kapasiteli nesne katmanında her yenilemede ~11 MB. Burada yalnızca dolu kısım (`count` örnek)
 * için güncelleme aralığı bildirilir; boş katman hiç yüklenmez (çizilmez de).
 */

/** Örnek tamponlarını sık güncellenen (dinamik) olarak işaretler: sürücüye ipucu. */
export function markDynamic(mesh: InstancedMesh): void {
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor?.setUsage(DynamicDrawUsage);
}

/** Örnek sayısını ayarlar ve ilk `count` örneğin matris/renk verisini yüklenecek diye işaretler. */
export function commitInstances(mesh: InstancedMesh, count: number): void {
  mesh.count = count;
  uploadPrefix(mesh.instanceMatrix, count);
  if (mesh.instanceColor) uploadPrefix(mesh.instanceColor, count);
}

/** Özniteliğin ilk `count` ögesini (öge = `itemSize` sayı) yüklenecek diye işaretler; `count` 0 ise yüklemez. */
export function uploadPrefix(attribute: BufferAttribute, count: number): void {
  attribute.clearUpdateRanges();
  if (count <= 0) return;
  attribute.addUpdateRange(0, Math.min(count, attribute.count) * attribute.itemSize);
  attribute.needsUpdate = true;
}
