import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { CREATURE_LOOK } from '../config';
import type { CreatureKind, CreatureView } from '../creatures/kinds';
import { MODELS, type PartShape, type PartSpec } from './creatureGeometry';

/** Bir şeklin örnek tamponu: dünya matrisleri ve renkleri (`InstancedMesh` dizilerine doğrudan yazılır). */
export class InstanceBuffer {
  readonly matrices: Float32Array;
  readonly colors: Float32Array;
  count = 0;

  /** `matrices`/`colors` verilirse (ör. `InstancedMesh` dizileri) onlara doğrudan yazılır. */
  constructor(
    readonly capacity: number,
    matrices?: Float32Array,
    colors?: Float32Array,
  ) {
    this.matrices = matrices ?? new Float32Array(capacity * 16);
    this.colors = colors ?? new Float32Array(capacity * 3);
  }

  clear(): void {
    this.count = 0;
  }
}

export type PoseBuffers = Record<PartShape, InstanceBuffer>;

const TWO_PI = Math.PI * 2;

// Yeniden kullanılan ara nesneler (her karede yeni nesne üretilmez).
const creatureMatrix = new Matrix4();
const rollMatrix = new Matrix4();
const motionMatrix = new Matrix4();
const partMatrix = new Matrix4();
const finalMatrix = new Matrix4();
const pivotMatrix = new Matrix4();
const unpivotMatrix = new Matrix4();
const swingMatrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const color = new Color();
const hit = new Color(CREATURE_LOOK.hitColor);
const black = new Color(0x000000);

const BASE_COLORS: Record<CreatureKind, Color> = {
  roe_deer: new Color(CREATURE_LOOK.colors.roe_deer),
  wild_boar: new Color(CREATURE_LOOK.colors.wild_boar),
  wolf: new Color(CREATURE_LOOK.colors.wolf),
  brown_bear: new Color(CREATURE_LOOK.colors.brown_bear),
  red_deer: new Color(CREATURE_LOOK.colors.red_deer),
  red_fox: new Color(CREATURE_LOOK.colors.red_fox),
  hare: new Color(CREATURE_LOOK.colors.hare),
  pheasant: new Color(CREATURE_LOOK.colors.pheasant),
};

/** Yürüme fazının bu karedeki artışı (radyan): bir adım döngüsü = `strideLength` yer değiştirme. */
export function phaseDelta(kind: CreatureKind, speed: number, dt: number): number {
  return (Math.max(speed, 0) * Math.max(dt, 0) * TWO_PI) / MODELS[kind].strideLength;
}

/** Baş eğimi (radyan; pozitif yukarı) duruma göre. */
function headPitch(view: CreatureView): number {
  const { head } = CREATURE_LOOK;
  if (view.dead) return head.dead;
  switch (view.state) {
    case 'graze':
      return head.graze;
    case 'alert':
      return head.alert;
    case 'attack':
      return head.attack * Math.sin(Math.PI * clamp01(view.attackPhase));
    default:
      return 0;
  }
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

/** Bir parçanın hareket açısı: bacak/baş X ekseninde, kuyruk Y ekseninde döner. */
function motionAngle(part: PartSpec, view: CreatureView, phase: number, amplitude: number): number {
  switch (part.motion) {
    case 'leg':
      // Leşte bacaklar yarı bükük, sabit; canlıda faza göre sallanır.
      return view.dead
        ? Math.sign(Math.cos(part.phase ?? 0)) * 0.3
        : amplitude * Math.sin(phase + (part.phase ?? 0));
    case 'head':
      return headPitch(view);
    case 'wing':
      // Kanat: havadayken (kaçış) hızlı çırpar; yerde katlı.
      return view.dead || view.state !== 'flee'
        ? 0
        : (part.phase ?? 1) * CREATURE_LOOK.wingFlap * Math.sin(phase * 3);
    case 'tail':
      return view.dead
        ? 0
        : CREATURE_LOOK.gait.tailWag *
            Math.sin(phase * 0.5) *
            (amplitude / CREATURE_LOOK.gait.amplitude);
    default:
      return 0;
  }
}

/**
 * Bir canlının tüm parçalarını `buffers`'a yazar (saf: aynı `view` ve `phase` → aynı tampon). Yerleşim: zemin
 * `view.y`, yön `view.yaw` (0 = −Z). Leş yan yatar ve hafif koyulaşır; `hitFlash` rengi vuruş rengine karıştırır;
 * saldırı hamlesinde gövde öne atılır. Tampon kapasitesi aşılırsa kalan parçalar atlanır. Yazılan parça sayısını döner.
 */
export function writeCreature(view: CreatureView, phase: number, buffers: PoseBuffers): number {
  const model = MODELS[view.kind];
  const { gait } = CREATURE_LOOK;
  const moving = !view.dead && view.speed > 0.05;
  const amplitude = moving ? gait.amplitude * clamp01(view.speed / gait.fullSpeed) : 0;
  const bob = moving
    ? Math.abs(Math.sin(phase)) * gait.bob * clamp01(view.speed / gait.fullSpeed)
    : 0;
  const lunge = view.dead
    ? 0
    : Math.sin(Math.PI * clamp01(view.attackPhase)) *
      CREATURE_LOOK.lunge *
      (model.strideLength / 1.6);

  // Yaratığın dünya matrisi: konum · yaw · (leşte yan yatış) · (saldırı atılması).
  euler.set(0, view.yaw, 0);
  quaternion.setFromEuler(euler);
  position.set(view.x, view.y + bob, view.z);
  creatureMatrix.compose(position, quaternion, scale.set(1, 1, 1));
  if (view.dead) {
    // Gövde merkezi ekseninde 90° yan yat; yana en çok taşan nokta zemine otursun.
    position.set(0, model.halfWidth, 0);
    quaternion.setFromAxisAngle(AXIS_Z, Math.PI / 2);
    rollMatrix.compose(position, quaternion, scale.set(1, 1, 1));
    creatureMatrix.multiply(rollMatrix);
    creatureMatrix.multiply(pivotMatrix.makeTranslation(0, -model.bodyCenterY, 0));
  } else if (lunge > 0) {
    creatureMatrix.multiply(pivotMatrix.makeTranslation(0, 0, -lunge));
  }

  const base = BASE_COLORS[view.kind];
  const flash = clamp01(view.hitFlash);
  const darken = view.dead ? CREATURE_LOOK.deadDarken : 0;
  let written = 0;
  for (const part of model.parts) {
    const buffer = buffers[part.shape];
    if (buffer.count >= buffer.capacity) continue;

    // Parça yerel matrisi: (eksen etrafında hareket) · merkez/statik dönüş/boyut.
    const angle = motionAngle(part, view, phase, amplitude);
    if (part.motion !== 'none' && part.pivot && angle !== 0) {
      const [px, py, pz] = part.pivot;
      pivotMatrix.makeTranslation(px, py, pz);
      unpivotMatrix.makeTranslation(-px, -py, -pz);
      if (part.motion === 'tail') swingMatrix.makeRotationY(angle);
      else if (part.motion === 'wing') swingMatrix.makeRotationZ(angle);
      else swingMatrix.makeRotationX(angle);
      motionMatrix.copy(pivotMatrix).multiply(swingMatrix).multiply(unpivotMatrix);
    } else {
      motionMatrix.identity();
    }
    const [rx, ry, rz] = part.rot ?? [0, 0, 0];
    euler.set(rx, ry, rz);
    quaternion.setFromEuler(euler);
    position.set(part.center[0], part.center[1], part.center[2]);
    scale.set(part.size[0], part.size[1], part.size[2]);
    partMatrix.compose(position, quaternion, scale);
    finalMatrix.copy(creatureMatrix).multiply(motionMatrix).multiply(partMatrix);
    finalMatrix.toArray(buffer.matrices, buffer.count * 16);

    // Renk: tür rengi × ton (ya da sabit), leşte koyulaşır, vuruşta kırmızıya karışır.
    if ('rgb' in part.color) color.set(part.color.rgb);
    else color.copy(base).multiplyScalar(part.color.shade);
    if (darken > 0) color.lerp(black, darken);
    if (flash > 0) color.lerp(hit, flash);
    buffer.colors[buffer.count * 3] = color.r;
    buffer.colors[buffer.count * 3 + 1] = color.g;
    buffer.colors[buffer.count * 3 + 2] = color.b;
    buffer.count += 1;
    written += 1;
  }
  return written;
}

const AXIS_Z = new Vector3(0, 0, 1);
