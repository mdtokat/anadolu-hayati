import { PERF_OVERLAY } from '../config';

/** Bölüm ölçümü arayüzü (dünya ve diğer sistemler yalnızca bunu görür). */
export interface PerfProbe {
  section(label: string | null): void;
}

/** Takılma kaydı: kare süresi ve o kareyi doğuran işin bölümlere göre dökümü. */
export interface SpikeRecord {
  /** Kaydın zamanı (ms, `performance.now` saati). */
  at: number;
  /** Uzayan karenin süresi (ms; iki çizim arası). */
  frameMs: number;
  /** O karenin ölçülen işlemci işi (ms; bölümlerin toplamı). */
  cpuMs: number;
  /** En uzun bölümler, büyükten küçüğe. */
  sections: ReadonlyArray<{ label: string; ms: number }>;
}

/** Gösterge özeti (son `PERF_OVERLAY.windowFrames` kare). */
export interface PerfSummary {
  fps: number;
  avgMs: number;
  p99Ms: number;
  maxMs: number;
  /** En kötü %1 karelerin FPS karşılığı ("1% low"). */
  lowFps: number;
  /** Son karenin işlemci işi (ms; bölümler toplamı). */
  cpuMs: number;
  /** Son karenin bölümleri (büyükten küçüğe). */
  sections: ReadonlyArray<{ label: string; ms: number }>;
}

/**
 * Kare süresi istatistikleri ve takılma dökümü (saf mantık; performans göstergesi). Sistemler `section(etiket)` ile
 * sırayla bölüm açar (bir sonraki çağrı öncekini kapatır, `null` durdurur); aynı etiket bir karede birden çok kez
 * açılırsa (60 Hz adımlar) süreler toplanır. Döngü her `requestAnimationFrame` çağrısının başında `endFrame(süre)`
 * çağırır: süre (iki çağrı arası) **biten** karenin işini (adımlar + çizim) ve bekleme/GPU süresini kapsar; uzun kare o
 * karenin bölümleriyle eşlenir. İşlemci işi kısa ama kare uzunsa neden ekran kartı ya da tarayıcıdır (çöp toplama,
 * sürücü).
 */
export class PerfStats implements PerfProbe {
  private readonly frames: Float32Array;
  private head = 0;
  private filled = 0;
  /** Süren karenin bölümleri ve son biten karenin bölümleri. */
  private work = new Map<string, number>();
  private last = new Map<string, number>();
  private openLabel: string | null = null;
  private openAt = 0;
  private lastSpike: SpikeRecord | null = null;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly config = PERF_OVERLAY,
  ) {
    this.frames = new Float32Array(config.windowFrames);
  }

  /** Bölüm açar (öncekini kapatır); `null` yalnızca kapatır. */
  section(label: string | null): void {
    const t = this.now();
    if (this.openLabel !== null) {
      this.work.set(this.openLabel, (this.work.get(this.openLabel) ?? 0) + t - this.openAt);
    }
    this.openLabel = label;
    this.openAt = t;
  }

  /** Süren kareyi kapatır; `frameMs` onun süresidir (bu çağrıyla öncekinin arası). */
  endFrame(frameMs: number): void {
    this.section(null);
    if (frameMs > 0 && Number.isFinite(frameMs)) {
      this.frames[this.head] = frameMs;
      this.head = (this.head + 1) % this.frames.length;
      this.filled = Math.min(this.filled + 1, this.frames.length);
      if (frameMs >= this.config.spikeMs) {
        this.lastSpike = {
          at: this.now(),
          frameMs,
          cpuMs: total(this.work),
          sections: ranked(this.work, this.config.spikeSections),
        };
      }
    }
    const done = this.last;
    this.last = this.work;
    this.work = done;
    this.work.clear();
  }

  /** Son takılma (yoksa null). */
  get spike(): SpikeRecord | null {
    return this.lastSpike;
  }

  /** Son karelerin kare süreleri, eskiden yeniye (grafik). */
  history(): Float32Array {
    const n = this.filled;
    const out = new Float32Array(n);
    const start = (this.head - n + this.frames.length) % this.frames.length;
    for (let i = 0; i < n; i++) out[i] = this.frames[(start + i) % this.frames.length] as number;
    return out;
  }

  summary(): PerfSummary {
    const values = this.history();
    const n = values.length;
    const sections = ranked(this.last, this.config.listSections);
    if (n === 0) {
      return { fps: 0, avgMs: 0, p99Ms: 0, maxMs: 0, lowFps: 0, cpuMs: 0, sections };
    }
    let sum = 0;
    for (const v of values) sum += v;
    const sorted = values.slice().sort();
    const p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))] as number;
    // En kötü %1'in ortalaması (en az bir kare).
    const worst = Math.max(1, Math.floor(n * 0.01));
    let worstSum = 0;
    for (let i = n - worst; i < n; i++) worstSum += sorted[i] as number;
    const avg = sum / n;
    return {
      fps: 1000 / avg,
      avgMs: avg,
      p99Ms: p99,
      maxMs: sorted[n - 1] as number,
      lowFps: 1000 / (worstSum / worst),
      cpuMs: total(this.last),
      sections,
    };
  }
}

function total(map: ReadonlyMap<string, number>): number {
  let sum = 0;
  for (const v of map.values()) sum += v;
  return sum;
}

function ranked(
  map: ReadonlyMap<string, number>,
  limit: number,
): Array<{ label: string; ms: number }> {
  return [...map.entries()]
    .map(([label, ms]) => ({ label, ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, limit);
}
