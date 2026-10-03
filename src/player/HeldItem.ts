import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type PerspectiveCamera,
  Vector3,
} from 'three';
import { HELD_ITEM } from '../config';
import type { ItemId } from '../items/itemDefs';
import { buildHeldModel, type HeldModel } from '../world/heldItemGeometry';
import { heldKind, type HeldKind, type SwingStyle } from './heldKinds';
import { recoilOffset, restPose, swingPose, type HeldPose } from './heldPose';
import type { PlayerModel } from './PlayerModel';

/** Her kare verilen görünüm durumu. */
export interface HeldViewState {
  /** Görüntü birinci şahıstan mı (seçili mod ya da nişan)? */
  firstPerson: boolean;
  /** Oyuncu yürüyor mu (sallanma) ve yatay hızı (oyun m/sn). */
  speed: number;
  /** Nişan oranı (0–1): dürbüne bakarken görünüm gizlenir. */
  aim: number;
  /** Oyuncu canlı ve oyun donuk değil mi (envanter/menü açıkken yine çizilir ama sallanmaz). */
  visible: boolean;
}

interface Slot {
  mesh: Mesh | null;
  model: HeldModel | null;
}

const SKIN = 0xc29470;
const SLEEVE = 0x4f6f9e;

/**
 * Eldeki eşyanın görünümü (kullanıcı talimatı: "ele alınan eşyalar, silahlar elde de görünsün"). İki görünüm:
 * **birinci şahıs** kameranın sağ altında (sahne kökünde, her karede kameraya göre konumlanır; eşyayla birlikte yumruk ve
 * ön kol) ve **üçüncü şahıs** oyuncu modelinin sağ elinde. Modeller önbelleğe alınır (eşya başına tek geometri). Savurma
 * (`swing`) ve tepme (`recoil`) animasyonları `heldPose.ts`'tedir. Ağız noktası (`muzzleWorld`) ağız alevi için döner.
 */
export class HeldItem {
  /** Birinci şahıs kökü: sahneye eklenir. */
  readonly viewRoot = new Group();
  private readonly pivot = new Group();
  private readonly fist: Mesh;
  private readonly forearm: Mesh;
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  private readonly skinMaterial = new MeshStandardMaterial({ color: SKIN, roughness: 0.9 });
  private readonly sleeveMaterial = new MeshStandardMaterial({ color: SLEEVE, roughness: 0.9 });
  private readonly models = new Map<ItemId, HeldModel | null>();
  private readonly firstSlot: Slot = { mesh: null, model: null };
  private readonly thirdSlot: Slot = { mesh: null, model: null };
  private readonly thirdPivot = new Group();
  private readonly fistGeometry = new BoxGeometry(0.055, 0.055, 0.075);
  private readonly forearmGeometry = new BoxGeometry(0.06, 0.06, 0.5);
  private item: ItemId | null = null;
  private kind: HeldKind | null = null;
  private swingStyle: SwingStyle | null = null;
  private swingT = 1;
  private swingDuration: number = HELD_ITEM.swingSeconds;
  private recoilT = 1;
  private bob = 0;
  private muzzleFirst = new Vector3();
  private muzzleThird = new Vector3();
  private lastFirstPerson = true;
  private hasMuzzle = false;

  constructor(private readonly playerModel: PlayerModel) {
    this.viewRoot.name = 'held-item-view';
    this.pivot.position.set(
      HELD_ITEM.firstPerson.x,
      HELD_ITEM.firstPerson.y,
      HELD_ITEM.firstPerson.z,
    );
    this.fist = new Mesh(this.fistGeometry, this.skinMaterial);
    this.forearm = new Mesh(this.forearmGeometry, this.sleeveMaterial);
    this.forearm.position.set(0.03, -0.045, 0.31);
    this.pivot.add(this.fist, this.forearm);
    this.viewRoot.add(this.pivot);
    this.playerModel.hand.add(this.thirdPivot);
    for (const mesh of [this.fist, this.forearm]) mesh.frustumCulled = false;
    this.viewRoot.visible = false;
  }

  /** Şu an elde görünen eşya. */
  get held(): ItemId | null {
    return this.item;
  }

  /** Elde tutulan eşyayı değiştirir (`null`: boş el). Elde görünümü olmayan eşya boş el sayılır. */
  setItem(id: ItemId | null): void {
    if (id === this.item) return;
    this.item = id;
    this.kind = heldKind(id);
    this.swingT = 1;
    this.recoilT = 1;
    this.clearSlot(this.firstSlot, this.pivot);
    this.clearSlot(this.thirdSlot, this.thirdPivot);
    if (id === null || this.kind === null) {
      this.hasMuzzle = false;
      return;
    }
    let model = this.models.get(id);
    if (model === undefined) {
      model = buildHeldModel(id);
      this.models.set(id, model);
    }
    if (!model) return;
    const make = (slot: Slot, parent: Group): void => {
      const mesh = new Mesh(model.geometry, this.material);
      mesh.frustumCulled = false;
      parent.add(mesh);
      slot.mesh = mesh;
      slot.model = model;
    };
    make(this.firstSlot, this.pivot);
    make(this.thirdSlot, this.thirdPivot);
    this.hasMuzzle = model.muzzle !== null;
    // Eşya varsa yumruk eşyanın tutuşundadır (ön kol arkada kalır); fist/ön kol her zaman görünür.
  }

  /** Yakın dövüş savurması başlatır (görünüm animasyonu; hasarı oyun mantığı verir). */
  swing(style: SwingStyle, seconds: number = HELD_ITEM.swingSeconds): void {
    this.swingStyle = style;
    this.swingT = 0;
    this.swingDuration = Math.max(seconds, 0.05);
  }

  /** Ateşli silah tepmesi. */
  recoil(): void {
    this.recoilT = 0;
  }

  /**
   * Her çizim karesinde: eşyayı kameraya (birinci şahıs) ya da modelin eline (üçüncü şahıs) yerleştirir ve duruşu
   * uygular. `dt` gerçek saniye.
   */
  update(dt: number, camera: PerspectiveCamera, state: HeldViewState): void {
    if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt / this.swingDuration);
    if (this.recoilT < 1) this.recoilT = Math.min(1, this.recoilT + dt / HELD_ITEM.recoilSeconds);
    this.bob += state.speed * dt * HELD_ITEM.bobRate * 0.25;

    const rest = restPose(this.kind);
    const base: HeldPose =
      this.swingStyle !== null && this.swingT < 1
        ? swingPose(this.swingStyle, this.swingT, rest)
        : rest;
    const recoil = recoilOffset(this.recoilT);
    const hideForAim = state.aim >= HELD_ITEM.hideAimFraction;
    this.lastFirstPerson = state.firstPerson;

    // ── Birinci şahıs ──
    const showFirst = state.firstPerson && state.visible && !hideForAim;
    this.viewRoot.visible = showFirst;
    if (showFirst) {
      this.viewRoot.position.copy(camera.position);
      this.viewRoot.quaternion.copy(camera.quaternion);
      const bobX = Math.sin(this.bob) * HELD_ITEM.bobAmplitude * Math.min(state.speed / 4, 1.5);
      const bobY =
        Math.abs(Math.cos(this.bob)) * HELD_ITEM.bobAmplitude * Math.min(state.speed / 4, 1.5);
      this.pivot.position.set(
        HELD_ITEM.firstPerson.x + bobX,
        HELD_ITEM.firstPerson.y + bobY + (base.theta - rest.theta) * 0.05,
        HELD_ITEM.firstPerson.z - base.push + recoil.back,
      );
      // Ucun kalkışı: bekleme duruşundaki eğim + savurma farkı + tepme.
      this.pivot.rotation.set(base.beta * 0.85 + recoil.pitch - 0.1, base.yaw, 0, 'YXZ');
      this.pivot.updateMatrixWorld(true);
      if (this.firstSlot.model?.muzzle) {
        const m = this.firstSlot.model.muzzle;
        this.muzzleFirst.set(m[0], m[1], m[2]);
        this.firstSlot.mesh?.localToWorld(this.muzzleFirst);
      }
    }

    // ── Üçüncü şahıs ──
    {
      const arm = this.playerModel.arm;
      arm.rotation.set(base.theta + recoil.pitch * 0.6, base.yaw * 0.7, 0, 'YXZ');
      this.playerModel.hand.rotation.set(-base.theta - recoil.pitch * 0.6, 0, 0);
      this.thirdPivot.rotation.set(base.beta, 0, 0);
      this.thirdPivot.position.z = -base.push * 0.6 + recoil.back;
      this.playerModel.object.updateMatrixWorld(true);
      if (this.thirdSlot.model?.muzzle) {
        const m = this.thirdSlot.model.muzzle;
        this.muzzleThird.set(m[0], m[1], m[2]);
        this.thirdSlot.mesh?.localToWorld(this.muzzleThird);
      }
    }
  }

  /**
   * Eldeki ateşli silahın ağız noktası (dünya) ve görünümün birinci şahıs olup olmadığı; ağzı olmayan eşyada null.
   * Son `update`'in sonucudur (önce `update` çağrılmalı).
   */
  muzzleWorld(): { point: Vector3; firstPerson: boolean } | null {
    if (!this.hasMuzzle) return null;
    return this.lastFirstPerson
      ? { point: this.muzzleFirst, firstPerson: true }
      : { point: this.muzzleThird, firstPerson: false };
  }

  dispose(): void {
    this.clearSlot(this.firstSlot, this.pivot);
    this.clearSlot(this.thirdSlot, this.thirdPivot);
    for (const model of this.models.values()) model?.geometry.dispose();
    this.models.clear();
    this.fistGeometry.dispose();
    this.forearmGeometry.dispose();
    this.material.dispose();
    this.skinMaterial.dispose();
    this.sleeveMaterial.dispose();
    this.viewRoot.removeFromParent();
    this.thirdPivot.removeFromParent();
  }

  private clearSlot(slot: Slot, parent: Group): void {
    if (slot.mesh) parent.remove(slot.mesh);
    slot.mesh = null;
    slot.model = null;
  }
}
