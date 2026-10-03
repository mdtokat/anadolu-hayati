import type { PerfSummary, SpikeRecord } from '../core/perfStats';

/** Göstergenin girdisi: istatistik özeti, çizim bilgisi ve sistem durumları. */
export interface PerfViewInput {
  summary: PerfSummary;
  spike: SpikeRecord | null;
  /** Şimdiki zaman (ms; takılmanın ne kadar önce olduğu için). */
  now: number;
  drawCalls: number;
  triangles: number;
  /** Uygulanan piksel oranı ve otomatik çözünürlük ölçeği (kapalıysa null). */
  pixelRatio: number;
  resolutionScale: number | null;
  /** JS yığını (MB; tarayıcı vermiyorsa null). */
  heapMb: number | null;
  /** Son karede kare bütçesi yüzünden ertelenen akışlı iş sayısı. */
  deferred: number;
}

export interface PerfView {
  head: string;
  rows: Array<readonly [label: string, value: string]>;
  sections: string[];
  spike: string;
}

const ms = (v: number): string => `${v.toFixed(1)} ms`;

/** Göstergenin metinleri (saf). */
export function perfView(input: PerfViewInput): PerfView {
  const s = input.summary;
  const rows: Array<readonly [string, string]> = [
    ['%1 en kötü', `${Math.round(s.lowFps)} FPS`],
    ['p99 · en uzun', `${ms(s.p99Ms)} · ${ms(s.maxMs)}`],
    ['İşlemci (kare)', ms(s.cpuMs)],
    ['Draw call · üçgen', `${input.drawCalls} · ${formatCount(input.triangles)}`],
    [
      'Çözünürlük',
      input.resolutionScale === null
        ? `×${input.pixelRatio.toFixed(2)} (sabit)`
        : `×${input.pixelRatio.toFixed(2)} (%${Math.round(input.resolutionScale * 100)})`,
    ],
  ];
  if (input.heapMb !== null) rows.push(['JS belleği', `${Math.round(input.heapMb)} MB`]);
  rows.push(['Ertelenen iş', String(input.deferred)]);
  return {
    head: s.avgMs > 0 ? `${Math.round(s.fps)} FPS · ${ms(s.avgMs)}` : '— FPS',
    rows,
    sections: s.sections.map((x) => `${x.label} ${x.ms.toFixed(1)}`),
    spike: spikeText(input.spike, input.now),
  };
}

function spikeText(spike: SpikeRecord | null, now: number): string {
  if (!spike) return 'Takılma yok';
  const ago = Math.max(0, Math.round((now - spike.at) / 1000));
  const parts = spike.sections
    .filter((x) => x.ms >= 0.5)
    .map((x) => `${x.label} ${Math.round(x.ms)}`)
    .join(', ');
  // İşlemci işi karenin küçük bir kısmıysa neden büyük olasılıkla ekran kartı ya da tarayıcıdır.
  const gpu = spike.cpuMs < spike.frameMs * 0.4 ? ' · çoğu GPU/tarayıcı' : '';
  return `Son takılma: ${Math.round(spike.frameMs)} ms, ${ago} sn önce${gpu}${parts ? ` — ${parts}` : ''}`;
}

function formatCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} bin`;
  return String(n);
}
