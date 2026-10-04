import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';
import { ROAD_SIGNS } from '../config';
import type { FrameBudget } from '../core/FrameBudget';
import { formatPopulation, signText, type RoadSign } from '../settlements/roadSigns';
import { GrowableGeometry } from './growableGeometry';
import {
  buildSignVertices,
  faceUnits,
  signFaces,
  type SignFace,
  type SignSlot,
  type SignVertices,
} from './roadSignGeometry';

const BODY_ATTRIBUTES = [
  { name: 'position', itemSize: 3 },
  { name: 'normal', itemSize: 3 },
  { name: 'color', itemSize: 3 },
] as const;
const FACE_ATTRIBUTES = [
  { name: 'position', itemSize: 3 },
  { name: 'normal', itemSize: 3 },
  { name: 'uv', itemSize: 2 },
] as const;

/** Doku atlası: `COLS` × `ROWS` birim; birim = plaka yazısı (`UNIT_W` × `UNIT_H` piksel). */
const UNIT_W = 512;
const UNIT_H = 128;
const COLS = 4;
const ROWS = 16;
const FONT = '"Arial Narrow", "Liberation Sans Narrow", Arial, "DejaVu Sans", sans-serif';

/** Arayüz: levhaların listesi ve konuma yakın olanlar (`SettlementMap`). */
export interface SignSource {
  readonly signs: readonly RoadSign[];
}

/**
 * Yol levhaları çizimi: oyuncuya `ROAD_SIGNS.drawRadius` içindeki en yakın `maxDrawn` levha iki ortak mesh'te çizilir
 * (gövdeler renkli kutular; yazılar tek doku atlasında: iki draw call). Çizilen küme değişince atlas yeniden boyanır.
 */
export class RoadSignLayer {
  readonly group = new Group();
  private readonly bodyMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    metalness: 0.2,
    side: DoubleSide,
  });
  private readonly faceMaterial: MeshStandardMaterial;
  private readonly body: Mesh;
  private readonly faces: Mesh;
  private readonly bodyBuffer: GrowableGeometry;
  private readonly faceBuffer: GrowableGeometry;
  private readonly canvas: HTMLCanvasElement | null;
  private readonly texture: CanvasTexture | null;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private drawnKey = '';
  private drawn = 0;

  constructor(private readonly source: SignSource) {
    this.group.name = 'road-signs';
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.canvas) {
      this.canvas.width = UNIT_W * COLS;
      this.canvas.height = UNIT_H * ROWS;
    }
    this.texture = this.canvas ? new CanvasTexture(this.canvas) : null;
    if (this.texture) {
      this.texture.colorSpace = SRGBColorSpace;
      this.texture.anisotropy = 4;
    }
    // Hafif öz ışıma: levhalar (yansıtıcı kaplama gibi) gece de okunur; ışık sayısı değişmez.
    this.faceMaterial = new MeshStandardMaterial({
      map: this.texture,
      emissiveMap: this.texture,
      emissive: new Color(0xffffff),
      emissiveIntensity: 0.18,
      roughness: 0.5,
    });
    this.body = new Mesh(new BufferGeometry(), this.bodyMaterial);
    this.body.name = 'road-signs-body';
    this.body.frustumCulled = false;
    this.faces = new Mesh(new BufferGeometry(), this.faceMaterial);
    this.faces.name = 'road-signs-faces';
    this.faces.frustumCulled = false;
    this.group.add(this.body, this.faces);
    this.bodyBuffer = new GrowableGeometry(this.body, BODY_ATTRIBUTES, 1024);
    this.faceBuffer = new GrowableGeometry(this.faces, FACE_ATTRIBUTES, 256);
    // Boşken de görünür kalır: malzemeler açılıştaki ön derlemeye girsin (ilk levhada takılma olmasın).
    this.body.visible = true;
    this.faces.visible = true;
  }

  /** Şu an çizilen levha sayısı. */
  get drawnCount(): number {
    return this.drawn;
  }

  update(x: number, z: number, budget: FrameBudget | null = null): void {
    const S = ROAD_SIGNS;
    if (Math.hypot(x - this.lastX, z - this.lastZ) < S.refreshDistance) return;
    if (budget !== null && budget.exhausted) return;
    this.lastX = x;
    this.lastZ = z;
    const r2 = S.drawRadius * S.drawRadius;
    const near: Array<{ i: number; d: number }> = [];
    this.source.signs.forEach((s, i) => {
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d <= r2) near.push({ i, d });
    });
    near.sort((a, b) => a.d - b.d || a.i - b.i);
    const chosen = near.slice(0, S.maxDrawn).map((n) => n.i);
    chosen.sort((a, b) => a - b);
    const key = chosen.join(',');
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    this.rebuild(chosen);
  }

  private rebuild(ids: readonly number[]): void {
    const ctx = this.canvas?.getContext('2d') ?? null;
    if (ctx && this.canvas) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let col = 0;
    let row = 0;
    const parts: SignVertices[] = [];
    for (const id of ids) {
      const sign = this.source.signs[id] as RoadSign;
      const faces = signFaces(sign);
      const slots: SignSlot[] = [];
      let fits = true;
      for (const face of faces) {
        const units = faceUnits(face);
        if (row + units > ROWS) {
          col++;
          row = 0;
        }
        if (col >= COLS) {
          fits = false;
          break;
        }
        const px = col * UNIT_W;
        const py = row * UNIT_H;
        const h = units * UNIT_H;
        if (ctx) drawFace(ctx, face, px, py, UNIT_W, h);
        const W = UNIT_W * COLS;
        const H = UNIT_H * ROWS;
        // CanvasTexture flipY: v = 1 tuvalin üstü.
        slots.push({ u0: px / W, u1: (px + UNIT_W) / W, v0: 1 - (py + h) / H, v1: 1 - py / H });
        row += units;
      }
      if (!fits) break;
      parts.push(buildSignVertices(sign, slots));
    }
    if (this.texture) this.texture.needsUpdate = true;
    this.drawn = parts.length;
    write(
      this.bodyBuffer,
      BODY_ATTRIBUTES,
      parts.map((p) => p.body),
    );
    write(
      this.faceBuffer,
      FACE_ATTRIBUTES,
      parts.map((p) => p.face),
    );
    this.body.visible = true;
    this.faces.visible = true;
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.faces.geometry.dispose();
    this.bodyMaterial.dispose();
    this.faceMaterial.dispose();
    this.texture?.dispose();
    this.group.clear();
  }
}

function write(
  buffer: GrowableGeometry,
  attributes: ReadonlyArray<{ name: string; itemSize: number }>,
  parts: ReadonlyArray<Record<string, Float32Array>>,
): void {
  let count = 0;
  for (const p of parts) count += (p.position as Float32Array).length / 3;
  const arrays = buffer.reserve(count);
  for (const { name } of attributes) {
    let o = 0;
    for (const p of parts) {
      const src = p[name] as Float32Array;
      (arrays[name] as Float32Array).set(src, o);
      o += src.length;
    }
  }
  buffer.commit(count);
}

/** Metni genişliğe sığacak en büyük boyutta (en çok `size` px) yazı tipiyle ayarlar. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  maxWidth: number,
): void {
  let s = size;
  ctx.font = `bold ${s}px ${FONT}`;
  while (s > 12 && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `bold ${s}px ${FONT}`;
  }
}

/** Atlas dikdörtgenine bir levha yüzünü çizer. */
function drawFace(
  ctx: CanvasRenderingContext2D,
  face: SignFace,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const C = ROAD_SIGNS.colors;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.textBaseline = 'middle';
  if (face.kind === 'plate') {
    ctx.fillStyle = C.plate;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.plateText;
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
    ctx.fillStyle = C.plateText;
    const km = `${face.km} km`;
    ctx.font = `bold 60px ${FONT}`;
    const kmWidth = ctx.measureText(km).width;
    ctx.textAlign = 'right';
    ctx.fillText(km, x + w - 22, y + h / 2 + 3);
    const name = signText(face.name);
    fitFont(ctx, name, 66, w - 66 - kmWidth);
    ctx.textAlign = 'left';
    ctx.fillText(name, x + 22, y + h / 2 + 3);
  } else {
    ctx.fillStyle = C.board;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.boardText;
    ctx.lineWidth = 7;
    ctx.strokeRect(x + 9, y + 9, w - 18, h - 18);
    ctx.fillStyle = C.boardText;
    ctx.textAlign = 'center';
    const name = signText(face.name);
    if (face.kind === 'entrance') {
      fitFont(ctx, name, 92, w - 60);
      ctx.fillText(name, x + w / 2, y + h * 0.33);
      const lines: string[] = [];
      if (face.population !== null) lines.push(`NÜFUS ${formatPopulation(face.population)}`);
      lines.push(`RAKIM ${face.elevation}`);
      ctx.font = `bold 38px ${FONT}`;
      lines.forEach((line, k) => {
        const ly = lines.length === 1 ? y + h * 0.72 : y + h * (0.64 + k * 0.17);
        ctx.fillText(line, x + w / 2, ly);
      });
    } else {
      fitFont(ctx, name, 92, w - 60);
      ctx.fillText(name, x + w / 2, y + h / 2);
      ctx.strokeStyle = C.exitSlash;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(x + 34, y + h - 30);
      ctx.lineTo(x + w - 34, y + 30);
      ctx.stroke();
    }
  }
  ctx.restore();
}
