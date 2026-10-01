import { AMBIENT } from '../config';
import type { SettingsStore } from '../settings/SettingsStore';
import { buildAmbientGraph, type AmbientGraph } from './ambientGraph';
import { SILENT, eventChances, type AmbientLevels } from './ambientMix';

/** Ses bağlamı üreticisi (testte/başsız ortamda sahte verilebilir). */
export type AudioContextFactory = () => AudioContext;

const defaultFactory: AudioContextFactory | null =
  typeof AudioContext === 'undefined' ? null : () => new AudioContext({ latencyHint: 'playback' });

/**
 * Ortam seslerinin çalışma zamanı denetleyicisi: ses bağlamını ilk kullanımda kurar (tarayıcı otomatik ses
 * politikası kullanıcı etkileşimi ister; `start()` oyuna girildiğinde çağrılır), oyun duraklayınca askıya alır,
 * ana ses seviyesini `SettingsStore`'dan izler ve kuş/baykuş olaylarını zamanlar. Ses desteklenmiyorsa ya da
 * bağlam kurulamazsa sessizce devre dışı kalır (oyun etkilenmez).
 */
export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private graph: AmbientGraph | null = null;
  private eventTimer: ReturnType<typeof setInterval> | null = null;
  private levels: Readonly<AmbientLevels> = SILENT;
  /** Oyun şu an akıyor mu (oyuncu oyunda, duraklatılmamış)? */
  private running = false;
  private unavailable = false;
  private readonly off: () => void;

  constructor(
    private readonly settings: SettingsStore,
    private readonly factory: AudioContextFactory | null = defaultFactory,
    private readonly random: () => number = Math.random,
    private readonly buildGraph: typeof buildAmbientGraph = buildAmbientGraph,
  ) {
    this.off = settings.subscribe(() => this.sync());
  }

  /** Ses kurulabilir ve açık mı (hata ayıklama/test için). */
  get active(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Şu anda hedeflenen katman seviyeleri. */
  get currentLevels(): Readonly<AmbientLevels> {
    return this.levels;
  }

  /** Oyuna girildi/sürdürüldü (kullanıcı etkileşiminden sonra): sesi başlatır. */
  start(): void {
    this.running = true;
    this.sync();
  }

  /** Oyun duraklatıldı: bağlam askıya alınır (menüde sessizlik, CPU boşta). */
  stop(): void {
    this.running = false;
    this.sync();
  }

  /** Konum/zamandan hesaplanan yeni katman seviyeleri (düzenli aralıkla çağrılır). */
  setLevels(levels: Readonly<AmbientLevels>): void {
    this.levels = levels;
    this.graph?.setLevels(levels);
  }

  dispose(): void {
    this.off();
    this.running = false;
    this.clearTimer();
    this.graph?.dispose();
    this.graph = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
  }

  /** Çalışma durumunu (oyun akıyor + ses açık) bağlama yansıtır. */
  private sync(): void {
    const volume = this.settings.current.volume;
    const wanted = this.running && volume > 0 && !this.unavailable;
    if (wanted) {
      if (!this.ensureContext()) return;
      this.applyVolume(volume);
      void this.ctx?.resume().catch(() => undefined);
      this.graph?.setLevels(this.levels);
      this.startTimer();
    } else {
      this.clearTimer();
      if (this.master) this.applyVolume(volume);
      if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
    }
  }

  private ensureContext(): boolean {
    if (this.ctx) return true;
    if (!this.factory) {
      this.unavailable = true;
      return false;
    }
    try {
      const ctx = this.factory();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.graph = this.buildGraph(ctx, master, this.random);
      return true;
    } catch (error) {
      console.warn('Ortam sesleri başlatılamadı', error);
      this.unavailable = true;
      this.ctx = null;
      return false;
    }
  }

  /** Ana kazanç: algıya uygun (karesel) eğri × başlık payı. */
  private applyVolume(volume: number): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(AMBIENT.headroom * volume * volume, this.ctx.currentTime, 0.1);
  }

  private startTimer(): void {
    if (this.eventTimer !== null) return;
    this.eventTimer = setInterval(() => this.tickEvents(), AMBIENT.eventTickMs);
  }

  private clearTimer(): void {
    if (this.eventTimer !== null) clearInterval(this.eventTimer);
    this.eventTimer = null;
  }

  /** Kuş/baykuş olaylarını olasılıkla zamanlar. */
  private tickEvents(): void {
    if (!this.ctx || !this.graph) return;
    const chances = eventChances(this.levels, AMBIENT.eventTickMs / 1000);
    const at = this.ctx.currentTime + 0.05;
    if (this.random() < chances.bird) this.graph.chirp(at);
    if (this.random() < chances.owl) this.graph.hoot(at);
  }
}
