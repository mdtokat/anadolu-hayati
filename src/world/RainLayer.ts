import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  type ColorRepresentation,
} from 'three';
import { WEATHER } from '../config';
import { createRandom } from '../utils/random';

/**
 * Yağmur damlaları (`WEATHER.rainDrops`): kameranın (odağın) çevresindeki silindirde düşen kısa çizgiler; tek
 * `LineSegments` (+1 draw call, yağmur yokken gizli). Damla sayısı sabittir; şiddet görünen damla oranını ve
 * saydamlığı belirler. İçerideyken (bina, kulübe, cami) gizlenir.
 */
export class RainLayer {
  readonly object: LineSegments;
  private readonly positions: Float32Array;
  private readonly offsets: Float32Array;
  private readonly material: LineBasicMaterial;
  private intensity = 0;
  private indoor = false;
  private lastTime = NaN;
  private fall = 0;

  constructor(color: ColorRepresentation = 0xc9d6e2) {
    const { count, radius, height } = WEATHER.rainDrops;
    const random = createRandom(0x7a1d);
    this.offsets = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = random.next() * Math.PI * 2;
      const r = Math.sqrt(random.next()) * radius;
      this.offsets[i * 3] = Math.cos(a) * r;
      this.offsets[i * 3 + 1] = random.next() * height;
      this.offsets[i * 3 + 2] = Math.sin(a) * r;
    }
    this.positions = new Float32Array(count * 6);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.material = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: WEATHER.rainDrops.opacity,
      depthWrite: false,
    });
    this.object = new LineSegments(geometry, this.material);
    this.object.name = 'rain';
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** Yağış şiddeti (0–1) ve içeride olup olmadığı. */
  set(intensity: number, indoor: boolean): void {
    this.intensity = intensity;
    this.indoor = indoor;
  }

  /** Kare başına: damlalar `groundY` üstündeki silindirde düşer (`time`: saniye). */
  update(x: number, groundY: number, z: number, time: number): void {
    const dt = Number.isFinite(this.lastTime)
      ? Math.min(Math.max(time - this.lastTime, 0), 0.1)
      : 0;
    this.lastTime = time;
    const visible = this.intensity > 0.01 && !this.indoor;
    this.object.visible = visible;
    if (!visible) return;
    const { count, height, speed, length } = WEATHER.rainDrops;
    this.fall = (this.fall + dt * speed) % height;
    const shown = Math.floor(count * Math.min(1, 0.25 + this.intensity * 0.75));
    this.material.opacity = WEATHER.rainDrops.opacity * (0.5 + this.intensity * 0.5);
    // Rüzgârla hafif eğik düşüş.
    const slant = 0.12;
    const p = this.positions;
    for (let i = 0; i < count; i++) {
      const o = i * 6;
      if (i >= shown) {
        p.fill(0, o, o + 6);
        continue;
      }
      const ox = this.offsets[i * 3] as number;
      const oz = this.offsets[i * 3 + 2] as number;
      let y = (this.offsets[i * 3 + 1] as number) - this.fall;
      if (y < 0) y += height;
      const top = groundY - 2 + y;
      p[o] = x + ox;
      p[o + 1] = top;
      p[o + 2] = z + oz;
      p[o + 3] = x + ox + slant * length;
      p[o + 4] = top - length;
      p[o + 5] = z + oz;
    }
    (this.object.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}
