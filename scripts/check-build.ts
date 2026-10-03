/**
 * `npm run build:check`: `dist/`'i denetler ve raporlar (`npm run build`'den sonra çalışır).
 *
 * - Bütçe: chunk boyutları (ham + gzip), açılış yükü, dünya verisi, tahmini ilk yükleme süresi
 *   (`scripts/buildBudget.ts`).
 * - Yayın bütünlüğü: index.html'deki yollar üretim `base`'iyle (`/anadolu-hayati/`) başlar ve
 *   dosyalar vardır; `public/`'teki her dosya `dist/`'e aynı boyutta kopyalanmıştır; her dünya
 *   manifestindeki karolar bayt + sha256 ile doğrudur; `build-info.json` vardır.
 * - `build-stats.json` varsa (`npm run build:analyze`) chunk başına en büyük kaynaklar.
 *
 * Rapor Markdown'dır; GitHub Actions'ta job özetine (`GITHUB_STEP_SUMMARY`) de yazılır.
 * Bütçe aşımı ya da bütünlük sorunu çıkış kodu 1 verir.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { BuildInfo } from '../src/buildInfo.ts';
import { formatBuildInfo } from '../src/buildInfo.ts';
import { BUILD_BUDGET } from './buildBudget.ts';
import {
  chunkKey,
  evaluateBuild,
  formatBytes,
  groupModules,
  htmlAssetRefs,
  renderReport,
  worstStatus,
  type AssetStat,
  type DataRole,
  type DataStat,
  type ModuleGroup,
} from './buildReport.ts';
import { PAGES_BASE } from './site.ts';
import { BUILD_INFO_FILE, BUILD_STATS_FILE, type BuildStats } from './vitePlugins.ts';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');

/** Dizindeki tüm dosyalar, köke göreli ve `/` ayraçlı. */
function walk(dir: string, base: string = dir): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path, base));
    else if (entry.isFile()) files.push(relative(base, path).split(sep).join('/'));
  }
  return files.sort();
}

function stat(file: string): AssetStat {
  const bytes = readFileSync(join(DIST, file));
  return { file, raw: bytes.byteLength, gzip: gzipSync(bytes, { level: 9 }).byteLength };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** index.html yolları: base ile başlamalı ve `dist/`'te bulunmalı. Açılış dosyalarını döndürür. */
function checkIndexHtml(problems: string[]): string[] {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const initial: string[] = [];
  const refs = htmlAssetRefs(html);
  if (refs.length === 0) problems.push('index.html hiçbir yerel dosyaya bağlanmıyor');
  for (const ref of refs) {
    if (!ref.startsWith(PAGES_BASE)) {
      problems.push(`index.html: '${ref}' üretim base'i (${PAGES_BASE}) ile başlamıyor`);
      continue;
    }
    const file = ref.slice(PAGES_BASE.length);
    if (!existsSync(join(DIST, file))) problems.push(`index.html: '${ref}' dist/'te yok`);
    else initial.push(file);
  }
  return initial;
}

/** `public/` → `dist/` kopyası eksiksiz mi (Vite `public/`'i olduğu gibi kopyalar). */
function checkPublicCopy(problems: string[]): void {
  for (const file of walk(PUBLIC)) {
    const target = join(DIST, file);
    if (!existsSync(target)) problems.push(`public/${file} dist/'e kopyalanmamış`);
    else if (statSync(target).size !== statSync(join(PUBLIC, file)).size)
      problems.push(`dist/${file} boyutu public/ kopyasından farklı`);
  }
}

interface WorldManifest {
  tileSize: number;
  tiles: Array<{ height: string; cover: string; bytes: number; sha256: string }>;
  provinces: string;
  features: { file: string };
  /** Faz 10: yerleşim verisi (isteğe bağlı). */
  settlements?: { file: string; bytes: number; sha256: string } | null;
}

/** `stream.json` (Faz 12; ayrıntı `src/data/worldStream.ts`): denetimin okuduğu alanlar. */
interface StreamManifestLite {
  world: { bytes: number; sha256: string };
  overview: { file: string; bytes: number; sha256: string };
  settlements: { file: string; bytes: number; sha256: string } | null;
  tiles: Array<{ file: string; bytes: number; sha256: string }>;
}

/** Her `dist/data/world/<id>/world.json` için karo bayt + sha256 ve yan dosyalar. */
function checkWorlds(problems: string[]): string[] {
  const notes: string[] = [];
  const worldsDir = join(DIST, 'data', 'world');
  if (!existsSync(worldsDir)) {
    problems.push('dist/data/world yok: dünya verisi yayına girmemiş');
    return notes;
  }
  for (const id of readdirSync(worldsDir)) {
    const dir = join(worldsDir, id);
    const manifestPath = join(dir, 'world.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = readJson<WorldManifest>(manifestPath);
    const listed = new Set<string>(['world.json', manifest.provinces, manifest.features.file]);
    for (const tile of manifest.tiles) {
      listed.add(tile.height);
      listed.add(tile.cover);
      const heightPath = join(dir, tile.height);
      const coverPath = join(dir, tile.cover);
      if (!existsSync(heightPath) || !existsSync(coverPath)) {
        problems.push(`${id}: ${tile.height} ya da ${tile.cover} eksik`);
        continue;
      }
      const height = readFileSync(heightPath);
      if (height.byteLength !== tile.bytes)
        problems.push(`${id}: ${tile.height} ${height.byteLength} bayt, manifest ${tile.bytes}`);
      else if (createHash('sha256').update(height).digest('hex') !== tile.sha256)
        problems.push(`${id}: ${tile.height} sha256 manifestle uyuşmuyor`);
      const coverBytes = statSync(coverPath).size;
      if (coverBytes !== manifest.tileSize * manifest.tileSize)
        problems.push(
          `${id}: ${tile.cover} ${coverBytes} bayt, beklenen ${manifest.tileSize ** 2}`,
        );
    }
    for (const file of [manifest.provinces, manifest.features.file])
      if (!existsSync(join(dir, file))) problems.push(`${id}: ${file} eksik`);
    const settlements = manifest.settlements;
    if (settlements) {
      listed.add(settlements.file);
      const path = join(dir, settlements.file);
      if (!existsSync(path)) problems.push(`${id}: ${settlements.file} eksik`);
      else {
        const blob = readFileSync(path);
        if (blob.byteLength !== settlements.bytes)
          problems.push(
            `${id}: ${settlements.file} ${blob.byteLength} bayt, manifest ${settlements.bytes}`,
          );
        else if (createHash('sha256').update(blob).digest('hex') !== settlements.sha256)
          problems.push(`${id}: ${settlements.file} sha256 manifestle uyuşmuyor`);
      }
    }
    // Karo akışı (Faz 12): `stream.json` varsa bake'in güncel olduğu ve dosyaların bayt + sha256'sı denetlenir.
    const streamPath = join(dir, 'stream.json');
    if (existsSync(streamPath)) {
      listed.add('stream.json');
      const stream = readJson<StreamManifestLite>(streamPath);
      const worldBytes = readFileSync(manifestPath);
      if (
        worldBytes.byteLength !== stream.world.bytes ||
        createHash('sha256').update(worldBytes).digest('hex') !== stream.world.sha256
      )
        problems.push(`${id}: stream.json eski (world.json değişmiş): \`npm run bake\` çalıştır`);
      const entries = [
        stream.overview,
        ...(stream.settlements ? [stream.settlements] : []),
        ...stream.tiles,
      ];
      for (const entry of entries) {
        listed.add(entry.file);
        const path = join(dir, entry.file);
        if (!existsSync(path)) {
          problems.push(`${id}: ${entry.file} eksik`);
          continue;
        }
        const blob = readFileSync(path);
        if (blob.byteLength !== entry.bytes)
          problems.push(`${id}: ${entry.file} ${blob.byteLength} bayt, manifest ${entry.bytes}`);
        else if (createHash('sha256').update(blob).digest('hex') !== entry.sha256)
          problems.push(`${id}: ${entry.file} sha256 manifestle uyuşmuyor`);
      }
      notes.push(`Dünya \`${id}\`: karo akışı, ${stream.tiles.length} karo dosyası doğrulandı`);
    }
    const unlisted = walk(dir).filter((file) => !listed.has(file));
    if (unlisted.length > 0)
      notes.push(
        `${id}: manifestte olmayan ${unlisted.length} dosya yayında (${unlisted.slice(0, 3).join(', ')}…)`,
      );
    notes.push(`Dünya \`${id}\`: ${manifest.tiles.length} karo, bayt + sha256 doğrulandı`);
  }
  return notes;
}

/**
 * Karo akışlı dünyaların (`stream.json` olan) dosya rolleri: akış karoları (`stream/t_*.bin`) yaklaştıkça iner, eski
 * karolar (`tiles/*.bin`) akışlı dünyada hiç inmez, geri kalan her şey açılışta iner. Akışlı dünya yoksa null.
 */
function dataRolesOf(files: readonly string[]): ReadonlyMap<string, DataRole> | undefined {
  const roles = new Map<string, DataRole>();
  const streamed = new Set(
    files
      .filter((file) => file.endsWith('/stream.json'))
      .map((file) => file.slice(0, -'stream.json'.length)),
  );
  if (streamed.size === 0) return undefined;
  for (const file of files) {
    const world = [...streamed].find((prefix) => file.startsWith(prefix));
    if (world === undefined) continue;
    const rel = file.slice(world.length);
    if (/^stream\/t_.+\.bin$/.test(rel)) roles.set(file, 'streamTile');
    else if (/^tiles\/.+\.bin$/.test(rel)) roles.set(file, 'legacyTile');
  }
  return roles;
}

function main(): void {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/index.html yok: önce `npm run build` çalıştır.');
    process.exit(1);
  }
  const started = performance.now();
  const problems: string[] = [];
  const notes: string[] = [];

  const infoPath = join(DIST, BUILD_INFO_FILE);
  if (existsSync(infoPath)) {
    const info = readJson<BuildInfo>(infoPath);
    notes.push(`Derleme: ${formatBuildInfo(info)}`);
    if (info.dirty) notes.push('⚠️ Derleme commit edilmemiş değişiklik içeriyor');
  } else problems.push(`${BUILD_INFO_FILE} yok (vite.config.ts buildInfoPlugin)`);

  const initialFiles = checkIndexHtml(problems);
  checkPublicCopy(problems);
  notes.push(...checkWorlds(problems));

  const files = walk(DIST);
  const assets = files.filter((file) => /^assets\/.+\.(js|css)$/.test(file)).map(stat);
  const data: DataStat[] = files.filter((file) => file.startsWith('data/')).map(stat);
  const dataGzip = data.reduce((total, item) => total + item.gzip, 0);
  notes.push(`Veri: ${data.length} dosya; gzip'lenebilseydi toplam ${formatBytes(dataGzip)}`);

  let moduleGroups: Record<string, ModuleGroup[]> | undefined;
  const statsPath = join(DIST, BUILD_STATS_FILE);
  if (existsSync(statsPath)) {
    const stats = readJson<BuildStats>(statsPath);
    moduleGroups = {};
    for (const [file, chunk] of Object.entries(stats.chunks))
      moduleGroups[chunkKey(file)] = groupModules(chunk.modules);
  }

  const dataRoles = dataRolesOf(data.map((stat) => stat.file));
  const checks = evaluateBuild({ assets, initialFiles, data, dataRoles }, BUILD_BUDGET);
  const status = worstStatus(checks, problems);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const title = `Derleme raporu — ${status === 'fail' ? '❌ başarısız' : status === 'warn' ? '⚠️ uyarılı' : '✅ bütçe içinde'}`;
  const report = renderReport({
    title,
    checks,
    problems,
    notes: [...notes, `Denetim ${seconds} sn sürdü`],
    moduleGroups,
  });

  console.log(report);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `${report}\n`);
  if (status === 'fail') process.exit(1);
}

main();
