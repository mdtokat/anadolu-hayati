import { ROADS } from '../config';
import type { RoadClass } from '../data/settlements';

/** Yolun genişliği (oyun m): varsa çizgiye özgü genişlik (kentin ana caddesi), yoksa sınıfınki. */
export function roadWidth(road: { cls: RoadClass; width?: number }): number {
  return road.width ?? (ROADS.width[road.cls] as number);
}

/** Yolun yarı genişliği (oyun m). */
export function roadHalfWidth(road: { cls: RoadClass; width?: number }): number {
  return roadWidth(road) / 2;
}
