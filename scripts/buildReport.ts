/**
 * Derleme raporu ve bütçe denetiminin saf mantığı (dosya sistemi yok; `check-build.ts` girdiyi toplar).
 * `tests/buildReport.test.ts` ile testlidir.
 */

/** Bütçe biçimi (`buildBudget.ts`'deki sabit buna uyar; testler daha küçük bütçeler verir). */
export interface BudgetShape {
  chunks: Readonly<Record<string, { gzipKB: number; rawKB?: number }>>;
  otherChunk: { gzipKB: number; rawKB?: number };
  initialGzipKB: number;
  data: { totalKB: number; maxFileKB: number };
  load: { referenceMbps: number; maxSeconds: number };
  /** Karo akışlı dünya (Faz 12): açılışta inen karo sayısı ve bu durumdaki ilk yükleme sınırı (sn). */
  stream?: { startTiles: number; maxSeconds: number };
  warnRatio: number;
}

/** `dist/assets/` altındaki bir JS/CSS dosyası. */
export interface AssetStat {
  /** `dist/`'e göreli yol (`assets/index-B5wsWrZK.js`). */
  file: string;
  raw: number;
  gzip: number;
}

/** `dist/data/` altındaki bir dosya. */
export interface DataStat {
  /** `dist/`'e göreli yol. */
  file: string;
  raw: number;
  gzip: number;
}

export interface BuildInput {
  assets: AssetStat[];
  /** index.html'in açılışta çektiği dosyalar (`dist/`'e göreli). */
  initialFiles: string[];
  data: DataStat[];
  /**
   * Karo akışlı dünya varsa: veri dosyalarının açılıştaki rolü (`dist/`'e göreli yol → rol). `initial` açılışta tam
   * iner, `streamTile` oyuncuya yaklaştıkça iner (açılışta `budget.stream.startTiles` kadarı), `legacyTile` akışlı
   * dünyada hiç indirilmez (eski tam bellek yolunun karoları). Verilmezse tüm dosyalar açılışta iner.
   */
  dataRoles?: ReadonlyMap<string, DataRole>;
}

export type DataRole = 'initial' | 'streamTile' | 'legacyTile';

/**
 * Açılışta inen veri baytı (aktarım): akışlı dünyada `initial` dosyalar + `startTiles` ortalama karo; `legacyTile`
 * indirilmez, `streamTile`'ın kalanı sonradan iner.
 */
export function startupDataTransfer(
  data: readonly DataStat[],
  roles: ReadonlyMap<string, DataRole> | undefined,
  startTiles: number,
): number {
  if (!roles) return sum(data.map(transferBytes));
  const tiles = data.filter((stat) => roles.get(stat.file) === 'streamTile');
  const tileMean = tiles.length === 0 ? 0 : sum(tiles.map(transferBytes)) / tiles.length;
  const initial = data.filter((stat) => (roles.get(stat.file) ?? 'initial') === 'initial');
  return sum(initial.map(transferBytes)) + Math.min(startTiles, tiles.length) * tileMean;
}

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  label: string;
  actual: number;
  limit: number;
  unit: 'B' | 's';
  status: CheckStatus;
}

export interface ModuleGroup {
  name: string;
  bytes: number;
  modules: number;
}

/** `assets/three-BtJG7nsr.js` → `three.js` (içerik özeti atılır); kalıba uymazsa dosya adı. */
export function chunkKey(file: string): string {
  const base = file.slice(file.lastIndexOf('/') + 1);
  const match = /^(.+)-[A-Za-z0-9_-]{8}\.(js|css)$/.exec(base);
  return match ? `${match[1]}.${match[2]}` : base;
}

export function checkLimit(
  label: string,
  actual: number,
  limit: number,
  warnRatio: number,
  unit: Check['unit'] = 'B',
): Check {
  const status: CheckStatus = actual > limit ? 'fail' : actual > limit * warnRatio ? 'warn' : 'ok';
  return { label, actual, limit, unit, status };
}

/** Metin dosyaları sunucuda gzip'lenir; ikili veriye güvenilmez (bkz. `BUILD_BUDGET.load`). */
export function transferBytes(stat: DataStat | AssetStat): number {
  return /\.(js|css|json|geojson|html)$/.test(stat.file) ? stat.gzip : stat.raw;
}

export function estimateLoadSeconds(bytes: number, mbps: number): number {
  return (bytes * 8) / (mbps * 1_000_000);
}

export function evaluateBuild(input: BuildInput, budget: BudgetShape): Check[] {
  const { warnRatio } = budget;
  const kb = (value: number): number => value * 1000;
  const checks: Check[] = [];

  for (const asset of input.assets) {
    const key = chunkKey(asset.file);
    const limits = budget.chunks[key] ?? budget.otherChunk;
    checks.push(checkLimit(`${key} (gzip)`, asset.gzip, kb(limits.gzipKB), warnRatio));
    if (limits.rawKB !== undefined)
      checks.push(checkLimit(`${key} (ham)`, asset.raw, kb(limits.rawKB), warnRatio));
  }

  const initial = input.assets.filter((asset) => input.initialFiles.includes(asset.file));
  const initialGzip = sum(initial.map((asset) => asset.gzip));
  checks.push(
    checkLimit('açılış JS + CSS (gzip)', initialGzip, kb(budget.initialGzipKB), warnRatio),
  );

  const dataRaw = sum(input.data.map((stat) => stat.raw));
  checks.push(
    checkLimit('dünya verisi toplamı (ham)', dataRaw, kb(budget.data.totalKB), warnRatio),
  );
  const largest = input.data.reduce<DataStat | null>(
    (max, stat) => (max === null || stat.raw > max.raw ? stat : max),
    null,
  );
  if (largest)
    checks.push(
      checkLimit(
        `en büyük veri dosyası (${largest.file})`,
        largest.raw,
        kb(budget.data.maxFileKB),
        warnRatio,
      ),
    );

  const streamed =
    input.dataRoles !== undefined && [...input.dataRoles.values()].includes('streamTile');
  const startTiles = budget.stream?.startTiles ?? 9;
  const transfer =
    sum(initial.map(transferBytes)) +
    startupDataTransfer(input.data, streamed ? input.dataRoles : undefined, startTiles);
  checks.push(
    checkLimit(
      `tahmini ilk yükleme @ ${budget.load.referenceMbps} Mbit/s${streamed ? ` (karo akışı, ${startTiles} karo)` : ''}`,
      estimateLoadSeconds(transfer, budget.load.referenceMbps),
      streamed ? (budget.stream?.maxSeconds ?? budget.load.maxSeconds) : budget.load.maxSeconds,
      warnRatio,
      's',
    ),
  );
  return checks;
}

/**
 * Modülleri pakete/klasöre göre toplar: `node_modules/three/src/…` → `three`,
 * `node_modules/@dimforge/rapier3d-compat/…` → `@dimforge/rapier3d-compat`, `src/world/…` → `src/world`.
 */
export function groupModules(modules: Record<string, number>): ModuleGroup[] {
  const groups = new Map<string, ModuleGroup>();
  for (const [id, bytes] of Object.entries(modules)) {
    const name = moduleGroupName(id);
    const group = groups.get(name) ?? { name, bytes: 0, modules: 0 };
    group.bytes += bytes;
    group.modules += 1;
    groups.set(name, group);
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
}

export function moduleGroupName(id: string): string {
  const path = id.replace(/\\/g, '/').replace(/^\0/, '');
  const nm = path.lastIndexOf('node_modules/');
  if (nm >= 0) {
    const parts = path.slice(nm + 'node_modules/'.length).split('/');
    return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1] ?? ''}` : (parts[0] ?? path);
  }
  const src = /^(src\/[^/]+)\/.+/.exec(path);
  if (src) return src[1] ?? path;
  return path;
}

/** index.html'deki `src`/`href` değerleri (yalnızca yerel yollar; `data:`/`http(s):` hariç). */
export function htmlAssetRefs(html: string): string[] {
  const refs: string[] = [];
  for (const match of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    const ref = match[1] ?? '';
    if (!/^(data:|https?:|\/\/|#)/.test(ref)) refs.push(ref);
  }
  return refs;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1000) return `${(bytes / 1000).toFixed(1)} kB`;
  return `${bytes} B`;
}

export function formatValue(value: number, unit: Check['unit']): string {
  return unit === 's' ? `${value.toFixed(1)} sn` : formatBytes(value);
}

const STATUS_ICON: Record<CheckStatus, string> = { ok: '✅', warn: '⚠️', fail: '❌' };

/** Rapor: bütçe tablosu, sorunlar ve (varsa) modül dağılımı; Markdown (GitHub job özeti de bunu gösterir). */
export function renderReport(options: {
  title: string;
  checks: Check[];
  problems: string[];
  notes?: string[];
  moduleGroups?: Record<string, ModuleGroup[]>;
  topModules?: number;
}): string {
  const lines = [`## ${options.title}`, ''];
  for (const note of options.notes ?? []) lines.push(`- ${note}`);
  if (options.notes?.length) lines.push('');
  lines.push('| Ölçüt | Değer | Sınır | Oran | Durum |', '|---|---:|---:|---:|:---:|');
  for (const check of options.checks) {
    const ratio = check.limit > 0 ? `%${Math.round((check.actual / check.limit) * 100)}` : '—';
    lines.push(
      `| ${check.label} | ${formatValue(check.actual, check.unit)} | ${formatValue(check.limit, check.unit)} | ${ratio} | ${STATUS_ICON[check.status]} |`,
    );
  }
  lines.push('');
  if (options.problems.length > 0) {
    lines.push('### Sorunlar', '');
    for (const problem of options.problems) lines.push(`- ❌ ${problem}`);
    lines.push('');
  }
  const top = options.topModules ?? 8;
  for (const [chunk, groups] of Object.entries(options.moduleGroups ?? {})) {
    lines.push(
      `### ${chunk} — en büyük ${Math.min(top, groups.length)} kaynak (ham, küçültülmüş)`,
      '',
    );
    lines.push('| Kaynak | Modül | Boyut |', '|---|---:|---:|');
    for (const group of groups.slice(0, top))
      lines.push(`| ${group.name} | ${group.modules} | ${formatBytes(group.bytes)} |`);
    lines.push('');
  }
  return lines.join('\n');
}

export function worstStatus(checks: Check[], problems: string[]): CheckStatus {
  if (problems.length > 0 || checks.some((check) => check.status === 'fail')) return 'fail';
  return checks.some((check) => check.status === 'warn') ? 'warn' : 'ok';
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
