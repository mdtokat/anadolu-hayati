import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
} from 'three';
import { BUILDING_LOOK } from '../config';
import {
  BUILDING_SHAPES,
  GOVERNMENT_FLAG,
  isMosque,
  type BuildingKind,
} from '../settlements/kinds';
import type { Building } from '../settlements/layout';
import type { SettlementMap, Stair } from '../settlements/SettlementMap';
import { commitInstances } from './instancing';
import {
  buildBuildingGeometry,
  buildFarGenericGeometry,
  buildPlinthGeometry,
  farGenericSpec,
  buildStairsGeometry,
  drawTurkishFlag,
  type BuildingLod,
} from './buildingGeometry';

/** Dev göstergesi / test için anlık sayımlar. */
export interface SettlementLayerStats {
  /** Çizilen yapı (yakın + uzak) ve örneği olan mesh (≈ draw call) sayısı. */
  near: number;
  far: number;
  meshes: number;
}

interface Tier {
  key: string;
  lod: BuildingLod;
  mesh: InstancedMesh;
  count: number;
}

/** Yapının geometri varyantı: tür (+ yıkık) (+ apartman kat sayısı). */
export function variantKey(b: Building): string {
  if (b.kind === 'apartment') return `apartment:${b.floors}`;
  return b.ruined ? `${b.kind}:ruined` : b.kind;
}

function parseKey(key: string): { kind: BuildingKind; ruined: boolean; floors?: number } {
  const [kind, extra] = key.split(':') as [BuildingKind, string | undefined];
  if (kind === 'apartment') return { kind, ruined: false, floors: Number(extra) };
  return { kind, ruined: extra === 'ruined' };
}

const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpPos = new Vector3();
const tmpScale = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Yerleşim yapılarının çizimi (Faz 10): her geometri varyantı için yakın ve uzak `InstancedMesh`. Oyuncu
 * `refreshDistance` kadar yer değiştirince örnekler yeniden dağıtılır (yakın: `nearRadius`, uzak: `drawRadius`).
 * Ayrıca taş temeller (yamaçta görünen set), kapı önü merdivenleri ve hükümet konaklarının bayrakları birer örnekli
 * mesh'tir. Toplam draw call ≈ görünür varyant sayısı (+3). Kaynaklar `dispose()` ile bırakılır.
 */
export class SettlementLayer {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  private readonly geometries: BufferGeometry[] = [];
  private readonly tiers: Tier[] = [];
  private readonly tierOf = new Map<string, Tier>();
  private readonly plinths: InstancedMesh;
  private readonly stairs: InstancedMesh;
  private readonly flags: InstancedMesh;
  private readonly flagMaterial: MeshStandardMaterial;
  private readonly flagTexture: CanvasTexture | null;
  private readonly stairsByBuilding = new Map<number, Stair>();
  private readonly governments: Building[];
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private nearCount = 0;
  private farCount = 0;
  private drawRadius: number = BUILDING_LOOK.drawRadius;

  constructor(private readonly map: SettlementMap) {
    this.group.name = 'settlements';
    const counts = new Map<string, number>();
    for (const b of map.buildings) counts.set(variantKey(b), (counts.get(variantKey(b)) ?? 0) + 1);
    // Uzak kademe: camiler kendi siluetleriyle (kubbe, minare), diğerleri iki ortak mesh'le (çatılı / düz).
    let generic = 0;
    for (const b of map.buildings) if (!isMosque(b.kind)) generic++;
    for (const roofed of [true, false]) {
      const geometry = buildFarGenericGeometry(roofed);
      this.geometries.push(geometry);
      const key = roofed ? FAR_ROOFED : FAR_FLAT;
      const mesh = this.instanced(geometry, this.material, Math.max(1, generic), `building-${key}`);
      const tier: Tier = { key, lod: 'far', mesh, count: 0 };
      this.tiers.push(tier);
      this.tierOf.set(`${key}/far`, tier);
    }
    for (const [key, count] of [...counts.entries()].sort()) {
      const spec = parseKey(key);
      const lods: BuildingLod[] = ['near'];
      if (hasInterior(spec.kind)) lods.unshift('interior');
      if (isMosque(spec.kind)) lods.push('far');
      for (const lod of lods) {
        const geometry = buildBuildingGeometry(spec.kind, lod, spec);
        this.geometries.push(geometry);
        const mesh = this.instanced(geometry, this.material, count, `building-${key}-${lod}`);
        const tier: Tier = { key, lod, mesh, count: 0 };
        this.tiers.push(tier);
        this.tierOf.set(`${key}/${lod}`, tier);
      }
    }
    const plinth = buildPlinthGeometry();
    this.geometries.push(plinth);
    this.plinths = this.instanced(plinth, this.material, map.buildings.length, 'building-plinths');
    const stairs = buildStairsGeometry();
    this.geometries.push(stairs);
    for (const s of map.stairs) this.stairsByBuilding.set(s.building, s);
    this.stairs = this.instanced(
      stairs,
      this.material,
      Math.max(1, map.stairs.length),
      'building-stairs',
    );

    // Hükümet konaklarında Türk bayrağı (kanvas dokusu; tarayıcı dışında düz kırmızı).
    this.governments = map.buildings.filter((b) => b.kind === 'government');
    this.flagTexture = createFlagTexture();
    this.flagMaterial = new MeshStandardMaterial({
      color: this.flagTexture ? 0xffffff : 0xe30a17,
      map: this.flagTexture,
      side: DoubleSide,
      roughness: 0.9,
    });
    const flagGeometry = new PlaneGeometry(GOVERNMENT_FLAG.width, GOVERNMENT_FLAG.height);
    this.geometries.push(flagGeometry);
    this.flags = this.instanced(
      flagGeometry,
      this.flagMaterial,
      Math.max(1, this.governments.length),
      'flags',
      false,
    );
  }

  private instanced(
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    capacity: number,
    name: string,
    colored = true,
  ): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.count = 0;
    if (colored)
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.group.add(mesh);
    return mesh;
  }

  get stats(): SettlementLayerStats {
    let meshes = 0;
    for (const t of this.tiers) if (t.mesh.count > 0) meshes++;
    for (const m of [this.plinths, this.stairs, this.flags]) if (m.count > 0) meshes++;
    return { near: this.nearCount, far: this.farCount, meshes };
  }

  /** Çizim yarıçapını değiştirir (grafik kalitesi). */
  setDrawRadius(radius: number): void {
    this.drawRadius = radius;
    this.lastX = Number.NaN;
  }

  update(x: number, z: number): void {
    if (Math.hypot(x - this.lastX, z - this.lastZ) < BUILDING_LOOK.refreshDistance) return;
    this.lastX = x;
    this.lastZ = z;
    this.fill(x, z);
  }

  private fill(fx: number, fz: number): void {
    for (const t of this.tiers) t.count = 0;
    let plinths = 0;
    let stairs = 0;
    this.nearCount = 0;
    this.farCount = 0;
    const near2 = BUILDING_LOOK.nearRadius ** 2;
    const interior2 = BUILDING_LOOK.interiorRadius ** 2;
    const far2 = this.drawRadius ** 2;
    const [toneLo, toneHi] = BUILDING_LOOK.toneRange;
    for (const b of this.map.buildings) {
      const dx = b.x - fx;
      const dz = b.z - fz;
      const d2 = dx * dx + dz * dz;
      if (d2 > far2) continue;
      const lod: BuildingLod =
        d2 <= interior2 && hasInterior(b.kind) ? 'interior' : d2 <= near2 ? 'near' : 'far';
      const far =
        lod === 'far' && !isMosque(b.kind) ? farGenericSpec(b.kind, b.floors, b.ruined) : null;
      const key = far ? (far.roofed ? FAR_ROOFED : FAR_FLAT) : variantKey(b);
      const tier = this.tierOf.get(`${key}/${lod}`);
      if (!tier) continue;
      tmpQuat.setFromAxisAngle(UP, b.yaw);
      tmpPos.set(b.x, b.y, b.z);
      if (far) tmpScale.set(far.w, far.h, far.d);
      else tmpScale.set(1, 1, 1);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      tier.mesh.setMatrixAt(tier.count, tmpMatrix);
      let tone = toneLo + b.tone * (toneHi - toneLo);
      if (b.ruined) tone *= BUILDING_LOOK.ruinDarken;
      if (far) tier.mesh.setColorAt(tier.count, tintOf(far.tint, tone));
      else tier.mesh.setColorAt(tier.count, colorOf(tone));
      tier.count++;
      if (lod === 'far') this.farCount++;
      else this.nearCount++;

      // Taş temel: ayak izinin altında zeminden kata kadar (yamaçta görünen set).
      const shape = BUILDING_SHAPES[b.kind];
      const height = b.y - b.base + BUILDING_LOOK.plinthSink;
      if (b.y - b.base > 0.05) {
        tmpPos.set(b.x, b.base - BUILDING_LOOK.plinthSink, b.z);
        tmpScale.set(shape.width * 0.98, height, shape.depth * 0.98);
        tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
        this.plinths.setMatrixAt(plinths, tmpMatrix);
        this.plinths.setColorAt(plinths, colorOf(0.9 + b.tone * 0.15));
        plinths++;
      }
      const stair = this.stairsByBuilding.get(b.id);
      if (stair && lod !== 'far') {
        tmpPos.set(stair.x, stair.y0, stair.z);
        tmpScale.set(stair.width, stair.rise, stair.run);
        tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
        this.stairs.setMatrixAt(stairs, tmpMatrix);
        this.stairs.setColorAt(stairs, colorOf(1));
        stairs++;
      }
    }
    for (const t of this.tiers) commit(t.mesh, t.count);
    commit(this.plinths, plinths);
    commit(this.stairs, stairs);

    // Bayraklar: yakındaki hükümet konaklarının direk tepesinde.
    let flags = 0;
    for (const b of this.governments) {
      if ((b.x - fx) ** 2 + (b.z - fz) ** 2 > far2) continue;
      const pole = flagPoleTop(b);
      tmpQuat.setFromAxisAngle(UP, b.yaw + Math.PI / 2);
      tmpPos.set(pole.x, pole.y, pole.z);
      tmpScale.set(1, 1, 1);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      // Bayrak direğin yanında dalgalanır: düzlemi yarım genişlik kadar kaydır.
      tmpMatrix.multiply(new Matrix4().makeTranslation(GOVERNMENT_FLAG.width / 2, 0, 0));
      this.flags.setMatrixAt(flags, tmpMatrix);
      flags++;
    }
    commit(this.flags, flags);
  }

  dispose(): void {
    for (const m of this.group.children) (m as InstancedMesh).dispose();
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
    this.flagMaterial.dispose();
    this.flagTexture?.dispose();
    this.group.clear();
    this.tiers.length = 0;
  }
}

const sharedColor = new Color();

/** Türün ayrı iç mekân kademesi var mı (girilebilir yapılar: oda, cami, han)? */
function hasInterior(kind: BuildingKind): boolean {
  return BUILDING_SHAPES[kind].interior !== null;
}
/** Uzak ortak mesh anahtarları. */
const FAR_ROOFED = 'far-roofed';
const FAR_FLAT = 'far-flat';

/** Duvar tonu × solgunluk (uzak ortak mesh'in örnek rengi). */
function tintOf(hex: number, tone: number): Color {
  return sharedColor.setHex(hex).multiplyScalar(tone);
}
function colorOf(tone: number): Color {
  return sharedColor.setRGB(tone, tone, tone);
}

function commit(mesh: InstancedMesh, count: number): void {
  commitInstances(mesh, count);
  mesh.computeBoundingSphere();
}

/** Hükümet konağının bayrak direği tepesi (buildingGeometry `governmentParts` ile aynı konum). */
export function flagPoleTop(b: Building): { x: number; y: number; z: number } {
  const lx = GOVERNMENT_FLAG.poleX;
  const lz = GOVERNMENT_FLAG.poleZ;
  const cos = Math.cos(b.yaw);
  const sin = Math.sin(b.yaw);
  return {
    x: b.x + lx * cos + lz * sin,
    y: b.y + GOVERNMENT_FLAG.poleHeight - GOVERNMENT_FLAG.height / 2 - 0.2,
    z: b.z - lx * sin + lz * cos,
  };
}

function createFlagTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 128;
  drawTurkishFlag(canvas);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
