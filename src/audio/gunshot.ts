import { GLASS, RANGED } from '../config';
import type { WeaponId } from '../items/weaponState';
import type { SettingsStore } from '../settings/SettingsStore';
import type { AudioContextFactory } from './AmbientAudio';

/**
 * Atış sesleri (Faz 11.5): hepsi Web Audio ile kodla sentezlenir (ses dosyası ve bağımlılık yok). Ateşli silah =
 * süzülmüş gürültü patlaması (keskin atak, üstel sönme) + alçak "gümleme" osilatörü; yay/sapan = kısa tel
 * titreşimi + hafif hışırtı. Tıkırtı (boş tetik, doldurma bitti) kısa kare dalga. Bağlam ilk seste kurulur (sol tık
 * kullanıcı etkileşimidir); ses 0 iken ya da Web Audio yoksa hiç kurulmaz, hata verirse sessizce devre dışı kalır.
 */

const defaultFactory: AudioContextFactory | null =
  typeof AudioContext === 'undefined'
    ? null
    : () => new AudioContext({ latencyHint: 'interactive' });

/** Atışın tepe kazancı (saf): ana ses² × başlık payı × silah profili × uzaklık sönümü. */
export function shotGain(volume: number, profileGain: number, distance = 0): number {
  if (!(volume > 0) || !(profileGain > 0)) return 0;
  const rolloff = RANGED.sound.distanceRolloff;
  const fall = rolloff > 0 ? 1 / (1 + Math.max(distance, 0) / rolloff) : 1;
  return RANGED.sound.headroom * volume * volume * profileGain * fall;
}

export class GunshotAudio {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private unavailable = false;

  constructor(
    private readonly settings: Pick<SettingsStore, 'current'>,
    private readonly factory: AudioContextFactory | null = defaultFactory,
  ) {}

  /** Bağlam kuruldu mu (test/hata ayıklama)? */
  get ready(): boolean {
    return this.ctx !== null;
  }

  /** `weapon`'ın atış sesi; `distance` dinleyiciye uzaklık (oyun m; eşkıya atışı). */
  play(weapon: WeaponId, distance = 0): void {
    const profile = RANGED.sound.profiles[weapon];
    const gain = shotGain(this.settings.current.volume, profile.gain, distance);
    if (gain <= 0) return;
    const ctx = this.context();
    if (!ctx) return;
    try {
      const t = ctx.currentTime + 0.005;
      const out = ctx.createGain();
      out.gain.value = gain;
      out.connect(ctx.destination);
      // Gürültü patlaması.
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(profile.lowpassHz, t);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(profile.lowpassHz * 0.25, 80),
        t + profile.decay,
      );
      const env = ctx.createGain();
      const burst = profile.twangHz > 0 ? 0.35 : 1;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(burst, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.001, t + profile.decay);
      source.connect(filter).connect(env).connect(out);
      source.start(t);
      source.stop(t + profile.decay + 0.05);
      if (profile.thumpHz > 0)
        this.tone(ctx, out, 'sine', profile.thumpHz, 0.8, profile.decay * 0.6, t);
      if (profile.twangHz > 0)
        this.tone(ctx, out, 'triangle', profile.twangHz, 0.6, profile.decay, t);
      source.onended = () => out.disconnect();
    } catch (error) {
      this.disable(error);
    }
  }

  /** Cam kırılması: yüksek geçiren gürültü şıkırtısı + birkaç kısa, tiz çınlama (kırıkların düşüşü). */
  glass(): void {
    const g = GLASS.sound;
    const gain = shotGain(this.settings.current.volume, g.gain);
    if (gain <= 0) return;
    const ctx = this.context();
    if (!ctx) return;
    try {
      const t = ctx.currentTime + 0.01;
      const out = ctx.createGain();
      out.gain.value = gain;
      out.connect(ctx.destination);
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 3200;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.9, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.001, t + g.decay);
      source.connect(filter).connect(env).connect(out);
      source.start(t);
      source.stop(t + g.decay + 0.05);
      // Çınlamalar: kırıklar sırayla yere düşer.
      const tinkles = [5200, 6900, 4400, 7800, 6100];
      tinkles.forEach((hz, i) => this.tone(ctx, out, 'sine', hz, 0.18, 0.09, t + 0.04 + i * 0.07));
      source.onended = () => out.disconnect();
    } catch (error) {
      this.disable(error);
    }
  }

  /** Kısa mekanik tıkırtı (boş tetik, doldurma bitti). */
  click(): void {
    const c = RANGED.sound.click;
    const gain = shotGain(this.settings.current.volume, c.gain);
    if (gain <= 0) return;
    const ctx = this.context();
    if (!ctx) return;
    try {
      const out = ctx.createGain();
      out.gain.value = gain;
      out.connect(ctx.destination);
      this.tone(ctx, out, 'square', c.hz, 1, 0.03, ctx.currentTime + 0.005);
    } catch (error) {
      this.disable(error);
    }
  }

  dispose(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.noise = null;
  }

  /** Perdesi hafifçe düşen, üstel sönen osilatör. */
  private tone(
    ctx: AudioContext,
    out: AudioNode,
    type: OscillatorType,
    hz: number,
    level: number,
    decay: number,
    t: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(hz * 0.55, 20), t + decay);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  private context(): AudioContext | null {
    if (this.unavailable) return null;
    if (!this.ctx) {
      if (!this.factory) {
        this.unavailable = true;
        return null;
      }
      try {
        this.ctx = this.factory();
      } catch (error) {
        this.disable(error);
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  /** Bir saniyelik beyaz gürültü (bir kez üretilir; sabit tohumlu basit üreteç: her atış aynı dokuda). */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let state = 0x9e3779b9;
    for (let i = 0; i < data.length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      data[i] = (state / 4294967296) * 2 - 1;
    }
    this.noise = buffer;
    return buffer;
  }

  private disable(error: unknown): void {
    console.warn('Atış sesi devre dışı', error);
    this.unavailable = true;
  }
}
