/**
 * `npm run perf`: başsız Chromium'da oyunu açar, yeni oyun başlatıp koşarak yürür ve oyunun kendi bölüm ölçümünden
 * (`core/perfStats.ts`, performans göstergesinin kaynağı) kare süresi dağılımını, bölüm başına ortalama/en uzun süreyi
 * ve takılmaları Markdown tablo olarak yazar. Takılma (kare süresi sıçraması) regresyonlarını yakalamak içindir.
 *
 * Gereksinimler: geliştirme sunucusu açık olmalı (`npm run dev`; `window.__game` yalnızca dev'de vardır) ve Playwright
 * kurulu olmalı (depo bağımlılığı değildir): `PLAYWRIGHT_MODULE` ile modül yolu verilebilir (ör.
 * `/opt/node-tools/node_modules/playwright/index.mjs`), Chromium yolu `PLAYWRIGHT_CHROMIUM` ile.
 *
 * Seçenekler: `--url <adres>` (varsayılan http://localhost:5173/anadolu-hayati/), `--seconds <n>` (40), `--render`
 * (çizimi açık bırakır; varsayılan kapalıdır çünkü yazılımsal WebGL GPU'yu ölçmez, yalnızca işlemci tarafı ölçülür).
 *
 * Not: başsız ortamda sayılar gerçek oyun bilgisayarından farklıdır; aynı makinede önce/sonra karşılaştırması için.
 */

interface Options {
  url: string;
  seconds: number;
  render: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    url: 'http://localhost:5173/anadolu-hayati/',
    seconds: 40,
    render: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') options.url = String(argv[++i]);
    else if (arg === '--seconds') options.seconds = Number(argv[++i]);
    else if (arg === '--render') options.render = true;
  }
  return options;
}

/** Playwright'ın kullandığımız küçük kısmı (depo bağımlılığı olmadığından elle tanımlı). */
interface Page {
  goto(url: string, options: object): Promise<unknown>;
  waitForFunction(fn: string, arg: null, options: object): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: string): Promise<T>;
  getByText(text: string, options: object): { click(): Promise<void>; count(): Promise<number> };
  mouse: { click(x: number, y: number): Promise<void>; move(x: number, y: number): Promise<void> };
  keyboard: { down(key: string): Promise<void>; up(key: string): Promise<void> };
}
interface Playwright {
  chromium: {
    launch(options: object): Promise<{
      newPage(options: object): Promise<Page>;
      close(): Promise<void>;
    }>;
  };
}

interface Report {
  moved: number;
  frames: number[];
  sections: Record<string, { frames: number; total: number; max: number; over4: number }>;
  spikes: Array<{ frameMs: number; cpuMs: number; top: string }>;
  deferred: number;
}

/** Sayfada çalışır: oyunun bölüm ölçümünü (`perf.endFrame`) sarar ve kareleri toplar. */
const INSTRUMENT = `(() => {
  const g = window.__game;
  if (__NORENDER__) g.renderer.render = () => {};
  const perf = g.perf;
  const original = perf.endFrame.bind(perf);
  const r = (window.__perfWalk = { frames: [], sections: {}, spikes: [], deferred: 0, start: { ...g.player.position } });
  perf.endFrame = (ms) => {
    perf.section(null);
    let cpu = 0;
    const top = [];
    for (const [label, t] of perf.work) {
      const s = (r.sections[label] ??= { frames: 0, total: 0, max: 0, over4: 0 });
      s.frames++; s.total += t; if (t > s.max) s.max = t; if (t > 4) s.over4++;
      cpu += t; top.push([label, t]);
    }
    if (ms > 0 && ms < 5000) r.frames.push(ms);
    if (ms >= 50) {
      top.sort((a, b) => b[1] - a[1]);
      r.spikes.push({ frameMs: ms, cpuMs: cpu, top: top.slice(0, 3).map(([l, t]) => l + ' ' + t.toFixed(1)).join(', ') });
    }
    r.deferred += g.world.budget?.deferred ?? 0;
    original(ms);
  };
})()`;

const COLLECT = `(() => {
  const r = window.__perfWalk;
  const p = window.__game.player.position;
  return { ...r, moved: Math.hypot(p.x - r.start.x, p.z - r.start.z) };
})()`;

function percentile(sorted: readonly number[], q: number): number {
  return sorted.length === 0 ? 0 : (sorted[Math.floor(q * (sorted.length - 1))] as number);
}

function render(report: Report, options: Options): string {
  const sorted = report.frames.slice().sort((a, b) => a - b);
  const lines = [
    `## Yürüyüş performans ölçümü (${options.seconds} sn, çizim ${options.render ? 'açık' : 'kapalı'})`,
    '',
    `Yürünen yol: ${report.moved.toFixed(0)} oyun m · kare: ${sorted.length} · p50 ${percentile(sorted, 0.5).toFixed(1)} ms · ` +
      `p90 ${percentile(sorted, 0.9).toFixed(1)} · p99 ${percentile(sorted, 0.99).toFixed(1)} · en uzun ${(sorted.at(-1) ?? 0).toFixed(1)} ms · ` +
      `≥ 50 ms kare: ${report.spikes.length} · bütçe yüzünden ertelenen iş: ${report.deferred}`,
    '',
    '| Bölüm | Ortalama (ms) | En uzun (ms) | > 4 ms kare | Toplam (ms) |',
    '|---|---:|---:|---:|---:|',
  ];
  const rows = Object.entries(report.sections).sort((a, b) => b[1].total - a[1].total);
  for (const [label, s] of rows) {
    lines.push(
      `| ${label} | ${(s.total / Math.max(1, sorted.length)).toFixed(2)} | ${s.max.toFixed(1)} | ${s.over4} | ${s.total.toFixed(0)} |`,
    );
  }
  if (report.spikes.length > 0) {
    lines.push('', 'Takılmalar (ilk 10):', '');
    for (const s of report.spikes.slice(0, 10)) {
      lines.push(`- ${s.frameMs.toFixed(0)} ms (işlemci ${s.cpuMs.toFixed(1)} ms): ${s.top}`);
    }
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  let playwright: Playwright;
  try {
    playwright = (await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')) as Playwright;
  } catch {
    console.error(
      'Playwright bulunamadı. Kurulu bir modülün yolunu PLAYWRIGHT_MODULE ile verin (depo bağımlılığı değildir).',
    );
    process.exit(2);
  }
  const browser = await playwright.chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(options.url, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction('window.__game && window.__game.world', null, { timeout: 180_000 });
    await page.getByText('Yeni Oyun', { exact: true }).click();
    await page.waitForTimeout(500);
    const confirm = page.getByText('Onayla: Yeni Oyun', {});
    if ((await confirm.count()) > 0) await confirm.click();
    await page.waitForTimeout(3000);
    await page.mouse.click(640, 360); // fare kilidi: oyun başlar
    await page.waitForTimeout(1000);
    await page.evaluate(INSTRUMENT.replace('__NORENDER__', String(!options.render)));
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    for (let i = 0; i < options.seconds; i++) {
      await page.waitForTimeout(1000);
      if (i % 8 === 7) await page.mouse.move(840, 360); // yön değiştir: başka chunk'lar yüklensin
    }
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    const report = await page.evaluate<Report>(COLLECT);
    console.log(render(report, options));
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
