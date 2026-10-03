import './ui.css';
import { PERF_OVERLAY } from '../config';
import { perfView, type PerfViewInput } from './perfView';

/**
 * Performans göstergesi (üretimde de; `F3` ya da Ayarlar → "Performans göstergesi"): FPS, kare süresi grafiği, en kötü
 * %1, draw call/üçgen, çözünürlük, bellek, karenin en uzun işleri ve son takılmanın dökümü. Görünüm `refreshMs`'te bir
 * yenilenir (her karede DOM yazılmaz); gizliyken hiçbir şey yapmaz.
 */
export class PerfOverlay {
  private readonly root = document.createElement('div');
  private readonly head = document.createElement('div');
  private readonly graph = document.createElement('canvas');
  private readonly rows = document.createElement('dl');
  private readonly sections = document.createElement('div');
  private readonly spike = document.createElement('div');
  private lastRefresh = Number.NEGATIVE_INFINITY;

  constructor(parent: HTMLElement) {
    this.root.className = 'perf-overlay';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Performans göstergesi');
    this.head.className = 'perf-head';
    this.graph.className = 'perf-graph';
    this.graph.width = 200;
    this.graph.height = 40;
    this.rows.className = 'perf-rows';
    this.sections.className = 'perf-sections';
    this.spike.className = 'perf-spike';
    this.root.append(this.head, this.graph, this.rows, this.sections, this.spike);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    this.lastRefresh = Number.NEGATIVE_INFINITY;
  }

  /** Görünürse ve yenileme zamanı geldiyse göstergeyi yazar; girdi yalnızca o zaman hesaplanır. */
  update(now: number, input: () => PerfViewInput, history: () => Float32Array): void {
    if (this.root.hidden || now - this.lastRefresh < PERF_OVERLAY.refreshMs) return;
    this.lastRefresh = now;
    const view = perfView(input());
    this.head.textContent = view.head;
    this.rows.replaceChildren(
      ...view.rows.flatMap(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
    this.sections.textContent =
      view.sections.length > 0 ? `Kare: ${view.sections.join(' · ')}` : '';
    this.spike.textContent = view.spike;
    this.drawGraph(history());
  }

  dispose(): void {
    this.root.remove();
  }

  /** Kare süresi grafiği: çubuklar (16,7 ve 33,3 ms çizgileriyle); uzun kareler kırmızı. */
  private drawGraph(frames: Float32Array): void {
    const ctx = this.graph.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.graph;
    const max = PERF_OVERLAY.graphMaxMs;
    ctx.clearRect(0, 0, width, height);
    const y = (ms: number): number => height - (Math.min(ms, max) / max) * height;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    for (const line of [1000 / 60, 1000 / 30]) ctx.fillRect(0, Math.round(y(line)), width, 1);
    const n = frames.length;
    const bar = width / PERF_OVERLAY.windowFrames;
    for (let i = 0; i < n; i++) {
      const v = frames[i] as number;
      ctx.fillStyle = v >= PERF_OVERLAY.spikeMs ? '#e5533f' : v > 1000 / 45 ? '#f0b43c' : '#8fcf6b';
      const top = y(v);
      ctx.fillRect(width - (n - i) * bar, top, Math.max(1, bar), height - top);
    }
  }
}
