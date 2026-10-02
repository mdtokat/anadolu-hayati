/**
 * Görüş odağı (Faz 11, 11.8 drone görüşü; saf): fizik/collider akışı her zaman oyuncunun ayağındadır (bedeni orada),
 * çizim (arazi LOD'u, nesne çizim merkezi, yerleşim ve yapı çizimi, gökyüzü/su) ise varsa görüş odağına taşınır.
 */
export interface ViewCenters {
  physics: { x: number; z: number };
  visual: { x: number; z: number };
}

export function viewCenters(
  focus: { x: number; z: number },
  view: { x: number; z: number } | null,
): ViewCenters {
  return {
    physics: { x: focus.x, z: focus.z },
    visual: view ? { x: view.x, z: view.z } : { x: focus.x, z: focus.z },
  };
}
