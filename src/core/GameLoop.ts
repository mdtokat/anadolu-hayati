import { FIXED_STEP, MAX_FRAME_TIME } from '../config';

export interface GameLoopCallbacks {
  /** Sabit adımla çağrılır; `step` saniye cinsindendir (her zaman FIXED_STEP). */
  update: (step: number) => void;
  /** Her çizim karesinde çağrılır; `alpha` (0..1) son iki mantık durumu arası oran. */
  render: (alpha: number) => void;
  /** Her karenin başında (adımlardan önce) çağrılır; `frameTime` önceki kareden beri geçen süre (sn, kırpılmamış). */
  frame?: (frameTime: number) => void;
}

/**
 * Sabit zaman adımlı oyun döngüsü ("Fix Your Timestep").
 * Mantık/fizik sabit adımla, render ise requestAnimationFrame ile serbest çalışır.
 * `advance` saf hesaplamadır ve tarayıcıya bağlı değildir, bu yüzden test edilebilir.
 */
export class GameLoop {
  private accumulator = 0;
  private lastTimestamp: number | null = null;
  private rafId: number | null = null;
  private isPaused = false;

  constructor(
    private readonly callbacks: GameLoopCallbacks,
    private readonly step: number = FIXED_STEP,
    private readonly maxFrameTime: number = MAX_FRAME_TIME,
  ) {}

  get running(): boolean {
    return this.rafId !== null;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  /**
   * Duraklatınca mantık adımları durur, render sürer (menü arkasında sahne çizilmeye devam eder).
   * Devam edince biriken süre atılır: duraklama süresi kadar "yetişme" adımı çalışmaz.
   */
  setPaused(paused: boolean): void {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    this.accumulator = 0;
  }

  /**
   * `frameTime` saniye kadar zamanı ilerletir; kaç sabit adım çalıştığını döndürür.
   * Ardından `render(alpha)` çağrılır.
   */
  advance(frameTime: number): number {
    this.callbacks.frame?.(frameTime);
    if (this.isPaused) {
      this.callbacks.render(0);
      return 0;
    }

    this.accumulator += Math.min(Math.max(frameTime, 0), this.maxFrameTime);

    let steps = 0;
    // Kayan nokta birikimi bir adımı kaçırmasın diye küçük bir tolerans bırakılır.
    while (this.accumulator >= this.step - 1e-9) {
      this.callbacks.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0;

    this.callbacks.render(this.accumulator / this.step);
    return steps;
  }

  start(): void {
    if (this.rafId !== null) return;
    this.lastTimestamp = null;
    const frame = (timestamp: number): void => {
      if (this.lastTimestamp !== null) {
        this.advance((timestamp - this.lastTimestamp) / 1000);
      }
      this.lastTimestamp = timestamp;
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.lastTimestamp = null;
  }
}
