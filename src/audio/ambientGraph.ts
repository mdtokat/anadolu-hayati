import { AMBIENT } from '../config';
import type { AmbientLevels } from './ambientMix';

/**
 * Ortam seslerinin Web Audio grafiği: hepsi kodla sentezlenir (ses dosyası yok, lisans derdi yok).
 * Sürekli katmanlar (rüzgâr, deniz, yaprak) döngülü gürültünün filtrelenip yavaş LFO'larla canlandırılmasıdır;
 * gece böcekleri vurgulu, kapılı osilatörlerdir. Kuş ve baykuş tek seferlik olaylardır (`chirp`, `hoot`);
 * ne zaman çalacağına `AmbientAudio` karar verir. `BaseAudioContext` ile çalışır, yani `OfflineAudioContext`'te
 * de kurulabilir (başsız doğrulama için).
 */
export interface AmbientGraph {
  /** Katman seviyelerini (0–1) `timeConstant` sn'lik yumuşamayla hedefler. */
  setLevels(levels: Readonly<AmbientLevels>, timeConstant?: number): void;
  /** Bir kuş ötüşü (2–4 kısa nota) `time`'da başlatır. */
  chirp(time: number): void;
  /** Bir baykuş (iki alçak nota) `time`'da başlatır. */
  hoot(time: number): void;
  dispose(): void;
}

/** Her katmanın nihai karışımdaki göreli kazancı (katmanlar birbirini ezmesin). */
const MIX = {
  wind: 0.9,
  sea: 0.8,
  leaves: 0.35,
  birds: 0.22,
  night: 0.2,
  owl: 0.3,
  rain: 0.55,
} as const;

/** Tek bir ortam grafiği kurar ve `destination`'a bağlar (genelde ana kazanç düğümü). */
export function buildAmbientGraph(
  ctx: BaseAudioContext,
  destination: AudioNode,
  random: () => number = Math.random,
): AmbientGraph {
  const nodes: AudioNode[] = [];
  const sources: Array<AudioScheduledSourceNode> = [];
  const track = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };

  const noise = makeNoiseBuffer(ctx, 4, random);

  /** Döngülü gürültü kaynağı (her çağrıda farklı başlangıç ofseti: katmanlar birbiriyle ilintisiz). */
  const noiseSource = (): AudioBufferSourceNode => {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.start(0, random() * noise.duration);
    sources.push(source);
    return track(source);
  };

  const lfo = (
    frequency: number,
    depth: number,
    target: AudioParam,
    type: OscillatorType = 'sine',
  ): void => {
    const osc = track(ctx.createOscillator());
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = track(ctx.createGain());
    gain.gain.value = depth;
    osc.connect(gain).connect(target);
    osc.start();
    sources.push(osc);
  };

  const levelGain = (mix: number): GainNode => {
    const gain = track(ctx.createGain());
    gain.gain.value = 0;
    gain.connect(destination);
    return Object.assign(gain, { mix });
  };

  // ── Rüzgâr: bant geçiren gürültü; sert esintiler yavaş LFO'larla ──────────────────
  const windLevel = levelGain(MIX.wind);
  {
    const filter = track(ctx.createBiquadFilter());
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.8;
    lfo(0.045, 160, filter.frequency);
    const gust = track(ctx.createGain());
    gust.gain.value = 0.65;
    lfo(0.11, 0.3, gust.gain);
    lfo(0.023, 0.15, gust.gain);
    noiseSource().connect(filter).connect(gust).connect(windLevel);
  }

  // ── Deniz: alçak gümbürtü + köpük tıslaması, ~9 sn'lik dalga döngüsü ───────────────
  const seaLevel = levelGain(MIX.sea);
  {
    const swell = track(ctx.createGain());
    swell.gain.value = 0.55;
    lfo(0.11, 0.4, swell.gain);
    const rumble = track(ctx.createBiquadFilter());
    rumble.type = 'lowpass';
    rumble.frequency.value = 520;
    noiseSource().connect(rumble).connect(swell);

    const hiss = track(ctx.createBiquadFilter());
    hiss.type = 'bandpass';
    hiss.frequency.value = 2800;
    hiss.Q.value = 0.6;
    const hissGain = track(ctx.createGain());
    hissGain.gain.value = 0.16;
    noiseSource().connect(hiss).connect(hissGain).connect(swell);
    swell.connect(seaLevel);
  }

  // ── Yaprak hışırtısı: yüksek bantlı gürültü, hızlı küçük dalgalanmalar ─────────────
  const leavesLevel = levelGain(MIX.leaves);
  {
    const filter = track(ctx.createBiquadFilter());
    filter.type = 'bandpass';
    filter.frequency.value = 3600;
    filter.Q.value = 0.5;
    const rustle = track(ctx.createGain());
    rustle.gain.value = 0.7;
    lfo(0.37, 0.25, rustle.gain);
    lfo(0.91, 0.1, rustle.gain);
    noiseSource().connect(filter).connect(rustle).connect(leavesLevel);
  }

  // ── Gece: iki cırcır böceği (darbe katarı × kapı), iki farklı perde ve hız ─────────
  const nightLevel = levelGain(MIX.night);
  for (const [carrierHz, pulseHz, gateHz] of [
    [4300, 31, 3.1],
    [4750, 27, 2.3],
  ] as const) {
    const carrier = track(ctx.createOscillator());
    carrier.type = 'sine';
    carrier.frequency.value = carrierHz;
    const pulse = track(ctx.createGain());
    pulse.gain.value = 0.25;
    lfo(pulseHz, 0.25, pulse.gain);
    const gate = track(ctx.createGain());
    gate.gain.value = 0.5;
    lfo(gateHz, 0.5, gate.gain, 'square');
    const part = track(ctx.createGain());
    part.gain.value = 0.5;
    carrier.connect(pulse).connect(gate).connect(part).connect(nightLevel);
    carrier.start();
    sources.push(carrier);
  }

  // ── Yağmur: geniş bantlı hışırtı + yüksek bantlı damla tıpırtısı (hızlı dalgalanma) ─────
  const rainLevel = levelGain(MIX.rain);
  {
    const wash = track(ctx.createBiquadFilter());
    wash.type = 'bandpass';
    wash.frequency.value = 1500;
    wash.Q.value = 0.35;
    const washGain = track(ctx.createGain());
    washGain.gain.value = 0.7;
    noiseSource().connect(wash).connect(washGain).connect(rainLevel);
    const patter = track(ctx.createBiquadFilter());
    patter.type = 'highpass';
    patter.frequency.value = 5200;
    const patterGain = track(ctx.createGain());
    patterGain.gain.value = 0.35;
    lfo(7.3, 0.18, patterGain.gain);
    lfo(13.1, 0.1, patterGain.gain);
    noiseSource().connect(patter).connect(patterGain).connect(rainLevel);
  }

  // Kuş ve baykuş olayları kendi veri yollarına (seviye düğümü) bağlanır.
  const birdsLevel = levelGain(MIX.birds);
  const owlBus = levelGain(MIX.owl);

  const note = (
    bus: AudioNode,
    time: number,
    from: number,
    to: number,
    seconds: number,
    peak: number,
  ): void => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, time);
    osc.frequency.exponentialRampToValueAtTime(to, time + seconds);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peak, time + seconds * 0.15);
    env.gain.exponentialRampToValueAtTime(0.0001, time + seconds);
    osc.connect(env).connect(bus);
    osc.start(time);
    osc.stop(time + seconds + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  };

  const graph: AmbientGraph = {
    setLevels(levels, timeConstant = AMBIENT.rampSeconds) {
      const now = ctx.currentTime;
      const apply = (node: GainNode & { mix?: number }, level: number): void => {
        node.gain.cancelScheduledValues(now);
        node.gain.setTargetAtTime(level * (node.mix ?? 1), now, Math.max(timeConstant, 0.001));
      };
      apply(windLevel, levels.wind);
      apply(seaLevel, levels.sea);
      apply(leavesLevel, levels.leaves);
      apply(birdsLevel, levels.birds);
      apply(nightLevel, levels.night);
      apply(owlBus, levels.night);
      apply(rainLevel, levels.rain);
    },

    chirp(time) {
      // 2–4 kısa nota; her ötüşün perdesi ve hızı farklı.
      const base = 2400 + random() * 2200;
      const count = 2 + Math.floor(random() * 3);
      let t = time;
      for (let i = 0; i < count; i++) {
        const from = base * (0.9 + random() * 0.3);
        const to = from * (random() < 0.5 ? 1.25 : 0.8);
        const seconds = 0.05 + random() * 0.07;
        note(birdsLevel, t, from, to, seconds, 0.6);
        t += seconds + 0.04 + random() * 0.06;
      }
    },

    hoot(time) {
      // "huu-hu": iki alçak, azalan nota.
      note(owlBus, time, 420, 360, 0.42, 0.8);
      note(owlBus, time + 0.62, 400, 330, 0.55, 0.8);
    },

    dispose() {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // zaten durmuş olabilir
        }
      }
      for (const node of nodes) node.disconnect();
    },
  };
  return graph;
}

/** `seconds` saniyelik beyaz gürültü tamponu (tek kanal). */
function makeNoiseBuffer(
  ctx: BaseAudioContext,
  seconds: number,
  random: () => number,
): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = random() * 2 - 1;
  return buffer;
}
