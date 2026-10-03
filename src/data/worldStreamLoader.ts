import { WORLD } from '../config';
import type { SettlementData } from './settlements';
import {
  parseFeatures,
  parseProvinces,
  RegionDataError,
  type FetchLike,
  type ProvinceShape,
  type RegionFeatures,
  type RegionMeta,
} from './region';
import { unpackCompressed } from './bakedBlob';
import { regionMetaOf, parseWorldManifest, sha256Hex, waterAnchors } from './world';
import {
  parseStreamManifest,
  type OverviewBlob,
  type SettlementBlob,
  type StreamFileEntry,
  type StreamManifest,
  type TileBlob,
} from './worldStream';
import { thinFeatures } from './waterThinning';

/**
 * Akışlı dünyanın açılış yüklemesi (Faz 12): küçük küresel dosyalar (manifest, il sınırları, su vektörleri, genel
 * bakış, önceden hesaplanmış yerleşim haritası) tamamen; karolar (`fetchTile`) oyuncuya yaklaştıkça tek tek indirilir.
 * `stream.json` yoksa `null` döner (oyun tüm dünyayı belleğe alan eski yolu kullanır).
 */

export interface StreamedWorldData {
  readonly streamed: true;
  meta: RegionMeta;
  provinces: ProvinceShape[];
  features: RegionFeatures | null;
  manifest: StreamManifest;
  overview: OverviewBlob;
  settlements: SettlementBlob | null;
  /** Karoyu indirir, bayt + sha256 doğrular ve açar. */
  fetchTile(tx: number, ty: number): Promise<TileBlob>;
}

export function isStreamedWorld(region: unknown): region is StreamedWorldData {
  return typeof region === 'object' && region !== null && 'streamed' in region;
}

function fail(message: string): never {
  throw new RegionDataError(`Akış verisi geçersiz: ${message}`);
}

export async function loadWorldStream(
  id: string,
  baseUrl: string = import.meta.env.BASE_URL,
  fetchImpl: FetchLike = (url) => fetch(url),
): Promise<StreamedWorldData | null> {
  const root = `${baseUrl}${WORLD.basePath}/${id}`;
  const probe = await fetchImpl(`${root}/stream.json`).catch(() => null);
  if (!probe || !probe.ok) return null;
  const manifest = parseStreamManifest(await probe.json());
  if (manifest.worldId !== id)
    fail(`stream.json dünya kimliği '${manifest.worldId}', beklenen '${id}'`);

  async function get(file: string, tag = '') {
    const response = await fetchImpl(`${root}/${file}${tag}`);
    if (!response.ok) fail(`${file} indirilemedi (HTTP ${response.status})`);
    return response;
  }
  const verified = async (entry: StreamFileEntry): Promise<ArrayBuffer> => {
    const buffer = await (await get(entry.file, `?v=${entry.sha256.slice(0, 8)}`)).arrayBuffer();
    if (buffer.byteLength !== entry.bytes) {
      fail(`${entry.file} ${buffer.byteLength} bayt, manifestte ${entry.bytes}`);
    }
    const sha = await sha256Hex(buffer);
    if (sha !== null && sha !== entry.sha256) fail(`${entry.file} sha256 uyuşmuyor (bozuk dosya?)`);
    return buffer;
  };

  const worldBuffer = await (
    await get('world.json', `?v=${manifest.world.sha256.slice(0, 8)}`)
  ).arrayBuffer();
  const worldSha = await sha256Hex(worldBuffer);
  if (
    worldBuffer.byteLength !== manifest.world.bytes ||
    (worldSha !== null && worldSha !== manifest.world.sha256)
  ) {
    fail('stream.json eski: world.json değişmiş, `npm run bake` yeniden çalıştırılmalı');
  }
  const world = parseWorldManifest(JSON.parse(new TextDecoder().decode(worldBuffer)));
  if (world.id !== id) fail(`world.json id'si '${world.id}', beklenen '${id}'`);

  const [provinces, features, overviewBuffer, settlementBuffer] = await Promise.all([
    get(world.provinces).then((r) => r.json()),
    world.features.layers.length > 0
      ? get(world.features.file).then((r) => r.json())
      : Promise.resolve(null),
    verified(manifest.overview),
    manifest.settlements ? verified(manifest.settlements) : Promise.resolve(null),
  ]);
  const overview = await unpackCompressed<OverviewBlob>(overviewBuffer);
  const settlements = settlementBuffer
    ? await unpackCompressed<SettlementBlob>(settlementBuffer)
    : null;
  const meta = regionMetaOf(world);
  const anchors = settlements
    ? { settlements: settlements.map.settlements.map((s) => s.data as SettlementData) }
    : null;

  const tiles = new Map(manifest.tiles.map((t) => [`${t.tx},${t.ty}`, t]));
  return {
    streamed: true,
    meta,
    provinces: parseProvinces(provinces),
    // Küçük dereler ayıklanır (`WATER_THINNING`): oyun ve testler aynı su ağını görür.
    features:
      features === null
        ? null
        : thinFeatures(parseFeatures(features), waterAnchors(anchors, world.originUtm)),
    manifest,
    overview,
    settlements,
    fetchTile: async (tx, ty) => {
      const entry = tiles.get(`${tx},${ty}`);
      if (!entry) fail(`karo (${tx}, ${ty}) manifestte yok`);
      const blob = await unpackCompressed<TileBlob>(await verified(entry));
      if (blob.tx !== tx || blob.ty !== ty)
        fail(`karo dosyası (${blob.tx}, ${blob.ty}), beklenen (${tx}, ${ty})`);
      return blob;
    },
  };
}
