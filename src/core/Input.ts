import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { actionForKey, mapKeysToIntent, type MoveIntent } from './inputMapping';

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
}

interface MouseLikeEvent extends Event {
  movementX: number;
  movementY: number;
}

/**
 * Klavye + fare girdisi ve pointer lock. Bakış (fare) delta'ları biriktirilir ve
 * render karesinde `consumeLook()` ile alınır; hareket niyeti basılı tuşlardan okunur.
 */
export class Input {
  private readonly pressed = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly target: InputTarget,
    private readonly doc: InputDocument,
    private readonly events: EventBus<GameEvents>,
    windowLike?: EventTarget,
  ) {
    this.listen(doc, 'keydown', (e) => this.onKeyDown(e as KeyLikeEvent));
    this.listen(doc, 'keyup', (e) => this.pressed.delete((e as KeyLikeEvent).code));
    this.listen(doc, 'mousemove', (e) => this.onMouseMove(e as MouseLikeEvent));
    this.listen(doc, 'pointerlockchange', () => this.onPointerLockChange());
    if (windowLike) this.listen(windowLike, 'blur', () => this.pressed.clear());
  }

  get pointerLocked(): boolean {
    return this.doc.pointerLockElement !== null && this.doc.pointerLockElement === this.target;
  }

  /** Şu an basılı tuşlardan hareket niyeti. */
  intent(): MoveIntent {
    return mapKeysToIntent(this.pressed);
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
    const action = actionForKey(event.code);
    // Eylemler yalnızca oyun kontrolündeyken (pointer lock) tetiklenir.
    if (action && this.pointerLocked) this.events.emit('input:action', { action });
  }

  private onMouseMove(event: MouseLikeEvent): void {
    if (!this.pointerLocked) return;
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  }

  private onPointerLockChange(): void {
    const locked = this.pointerLocked;
    if (!locked) {
      // Kilit kalkınca (ör. Esc) basılı tuşlar ve bekleyen bakış sıfırlanır: takılı tuş kalmasın.
      this.pressed.clear();
      this.lookX = 0;
      this.lookY = 0;
    }
    this.events.emit('input:pointerLockChanged', { locked });
  }
}
