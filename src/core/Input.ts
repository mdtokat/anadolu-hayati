import { INPUT } from '../config';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import {
  DEV_TELEPORT_KEY,
  actionForKey,
  hotbarSlotForKey,
  mapKeysToIntent,
  type MoveIntent,
} from './inputMapping';

/** Pointer lock isteyebilen öğe (canvas/konteyner). */
export interface InputTarget extends EventTarget {
  requestPointerLock?(): Promise<void> | void;
}

/** Klavye/fare olaylarını ve pointer lock durumunu veren belge. */
export interface InputDocument extends EventTarget {
  readonly pointerLockElement: Element | null;
  exitPointerLock?(): void;
}

interface KeyLikeEvent extends Event {
  code: string;
  repeat: boolean;
  shiftKey?: boolean;
}

interface WheelLikeEvent extends Event {
  deltaY: number;
  timeStamp: number;
}

export interface InputOptions {
  /**
   * Dev modu: Shift + rakam ve `T` + rakam geliştirici ışınlanmasına ayrılır, kısayol seçmez (Faz 9). Üretimde
   * kapalıdır; orada Shift (koşu) basılıyken de kısayol seçilir.
   */
  devTeleportKeys?: boolean;
}

interface MouseLikeEvent extends Event {
  movementX: number;
  movementY: number;
}

interface ButtonLikeEvent extends Event {
  button: number;
}

/**
 * Klavye + fare girdisi ve pointer lock. Bakış (fare) delta'ları biriktirilir ve
 * render karesinde `consumeLook()` ile alınır; hareket niyeti basılı tuşlardan okunur.
 */
export class Input {
  private readonly pressed = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  /** Zıplama tuşuna basıldı ama henüz bir mantık adımı bunu görmedi (çok kısa dokunuşlar kaybolmasın). */
  private jumpLatched = false;
  /** Etkileşim tuşuna (E) yeni basıldı; bir mantık adımı `consumeInteractPress` ile alana kadar durur (sandık açma). */
  private interactLatched = false;
  private lastWheelAt = Number.NEGATIVE_INFINITY;
  /** Zıplama tuşuna son (tekrarsız) basışın zamanı (ms): çift basış uçuş geçişidir. */
  private lastJumpPressAt = Number.NEGATIVE_INFINITY;
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly target: InputTarget,
    private readonly doc: InputDocument,
    private readonly events: EventBus<GameEvents>,
    windowLike?: EventTarget,
    private readonly options: InputOptions = {},
  ) {
    this.listen(doc, 'keydown', (e) => this.onKeyDown(e as KeyLikeEvent));
    this.listen(doc, 'wheel', (e) => this.onWheel(e as WheelLikeEvent));
    this.listen(doc, 'keyup', (e) => this.pressed.delete((e as KeyLikeEvent).code));
    this.listen(doc, 'mousemove', (e) => this.onMouseMove(e as MouseLikeEvent));
    this.listen(doc, 'mousedown', (e) => this.onMouseDown(e as ButtonLikeEvent));
    this.listen(doc, 'pointerlockchange', () => this.onPointerLockChange());
    this.listen(doc, 'pointerlockerror', () =>
      this.events.emit('input:pointerLockFailed', undefined),
    );
    if (windowLike) this.listen(windowLike, 'blur', () => this.pressed.clear());
  }

  get pointerLocked(): boolean {
    return this.doc.pointerLockElement !== null && this.doc.pointerLockElement === this.target;
  }

  /** Şu an basılı tuşlardan hareket niyeti (yan etkisiz). */
  intent(): MoveIntent {
    return mapKeysToIntent(this.pressed);
  }

  /** Etkileşim tuşu (E) şu an basılı mı? */
  get interactHeld(): boolean {
    return INPUT.bindings.interact.some((code) => this.pressed.has(code));
  }

  /** Bir tuş (`KeyboardEvent.code`) şu an basılı mı? */
  isHeld(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Sökme tuşu (X) şu an basılı mı? (Faz 9) */
  get dismantleHeld(): boolean {
    return INPUT.bindings.dismantle.some((code) => this.pressed.has(code));
  }

  /** E'ye son çağrıdan beri yeni basıldı mı (basılı tutma değil, basış anı)? Okununca sıfırlanır. */
  consumeInteractPress(): boolean {
    const pressed = this.interactLatched;
    this.interactLatched = false;
    return pressed;
  }

  /** Pointer lock'u bırakır (ölüm ekranı gibi fareyle tıklanan arayüzler için). */
  exitLock(): void {
    this.doc.exitPointerLock?.();
  }

  /**
   * Bir mantık adımı için hareket niyetini alır. Zıplama, tuş bu adımdan önce bırakılmış olsa
   * bile bir kez iletilir (kare arasında biten hızlı dokunuşlar kaybolmaz).
   */
  pollIntent(): MoveIntent {
    const intent = this.intent();
    if (this.jumpLatched) intent.jump = true;
    this.jumpLatched = false;
    return intent;
  }

  /** Son çağrıdan beri biriken fare hareketini (piksel) döndürür ve sıfırlar. */
  consumeLook(): { dx: number; dy: number } {
    const look = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  /** Pointer lock ister. Kullanıcı hareketi gerektirir; reddedilirse sessizce yok sayılır. */
  requestLock(): void {
    try {
      const result = this.target.requestPointerLock?.();
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // Tarayıcı isteği reddetti (ör. yakın zamanda Esc ile çıkıldı); kullanıcı tekrar tıklar.
    }
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.pressed.clear();
  }

  private listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.cleanups.push(() => target.removeEventListener(type, handler));
  }

  private onKeyDown(event: KeyLikeEvent): void {
    this.pressed.add(event.code);
    if (event.repeat) return;
    if (this.intent().jump) this.jumpLatched = true;
    if ((INPUT.bindings.jump as readonly string[]).includes(event.code) && this.pointerLocked) {
      const now = event.timeStamp;
      if (now - this.lastJumpPressAt <= INPUT.flightDoubleTapMs) {
        this.lastJumpPressAt = Number.NEGATIVE_INFINITY;
        this.events.emit('input:action', { action: 'toggleFlight' });
      } else {
        this.lastJumpPressAt = now;
      }
    }
    if (this.pointerLocked && (INPUT.bindings.interact as readonly string[]).includes(event.code)) {
      this.interactLatched = true;
    }
    const slot = hotbarSlotForKey(event.code);
    if (slot !== null && this.pointerLocked && !this.devTeleportHeld(event)) {
      this.events.emit('input:hotbarSelect', { slot });
    }
    const action = actionForKey(event.code);
    // Eylemler yalnızca oyun kontrolündeyken (pointer lock) tetiklenir.
    if (action && this.pointerLocked) {
      if (action === 'toggleInventory') event.preventDefault?.(); // Tab odağı kaydırmasın
      this.events.emit('input:action', { action });
    }
  }

  /** Dev modunda ışınlanma değiştiricisi (Shift ya da `T`) basılı mı? Üretimde hep false. */
  private devTeleportHeld(event: KeyLikeEvent): boolean {
    if (!this.options.devTeleportKeys) return false;
    return event.shiftKey === true || this.pressed.has(DEV_TELEPORT_KEY);
  }

  /** Fare tekerleği: kısayol seçimini kaydırır (aşağı = sonraki). Yalnızca oyun kontrolündeyken. */
  private onWheel(event: WheelLikeEvent): void {
    if (!this.pointerLocked || event.deltaY === 0) return;
    if (event.timeStamp - this.lastWheelAt < INPUT.hotbarWheelCooldownMs) return;
    this.lastWheelAt = event.timeStamp;
    this.events.emit('input:hotbarCycle', { step: event.deltaY > 0 ? 1 : -1 });
  }

  private onMouseMove(event: MouseLikeEvent): void {
    if (!this.pointerLocked) return;
    const cap = INPUT.maxMouseDeltaPerEvent;
    this.lookX += Math.min(Math.max(event.movementX, -cap), cap);
    this.lookY += Math.min(Math.max(event.movementY, -cap), cap);
  }

  /** Sol tık yalnızca oyun kontrolündeyken eylemdir (kilidi alan tıklama eylem sayılmaz). */
  private onMouseDown(event: ButtonLikeEvent): void {
    if (event.button !== 0 || !this.pointerLocked) return;
    this.events.emit('input:action', { action: 'primaryAction' });
  }

  private onPointerLockChange(): void {
    const locked = this.pointerLocked;
    if (!locked) {
      // Kilit kalkınca (ör. Esc) basılı tuşlar ve bekleyen bakış sıfırlanır: takılı tuş kalmasın.
      this.pressed.clear();
      this.jumpLatched = false;
      this.interactLatched = false;
      this.lookX = 0;
      this.lookY = 0;
    }
    this.events.emit('input:pointerLockChanged', { locked });
  }
}
