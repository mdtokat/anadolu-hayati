import { beforeAll, describe, expect, it } from 'vitest';
import type { RegionData } from '../src/data/region';
import { groundRuns } from '../src/settlements/roadProfile';
import { signPosts, type EntranceSign } from '../src/settlements/roadSigns';
import { byClass, roadSlopeStats, type SlopeStats } from './helpers/roadSlopeAudit';
import { loadRealRegion } from './helpers/realRegion';
import { buildSettlementWorld, type SettlementWorld } from './helpers/settlementWorld';

/**
 * Yol yüzeyi ve levhalar (gerçek dünya; kullanıcı talimatı: "eğik, yatay mantık dışı yolları düzelt; yol ayrımlarına
 * illerin yönünü gösteren tabela, il girişlerine şehir adı ve nüfus tabelası"). Enine eğim: yolun iki kenarı arasındaki
 * yükseklik farkı / genişlik (düzeltilmiş zeminde). Önce kent sokakları ve bağlantıları hiç düzeltilmiyordu: örneklerin
 * %39'u 8,5°'den, %22'si 17°'den yan yatıktı; köy yolunda %3,9, patikada %11.
 */
let sw: SettlementWorld;
let region: RegionData;
const stats = new Map<string, SlopeStats>();

beforeAll(async () => {
  region = await loadRealRegion();
  sw = buildSettlementWorld(region);
  const h = (x: number, z: number) => sw.source.heightAt(x, z);
  for (const [cls, lines] of byClass(groundRuns(sw.map.plan)))
    stats.set(`ağ ${cls}`, roadSlopeStats(lines, h));
  stats.set('kent', roadSlopeStats([...sw.map.streetLines, ...sw.map.joinLines], h));
}, 240_000);

describe('yol yüzeyi', () => {
  it('anayol, köy yolu ve kent içi ağ yolu neredeyse hiç yan yatmaz', () => {
    // Ölçülen (banket 1,4 m): anayol %1,9, köy yolu %1,7, cadde %1,2 (> 8,5°); kalanı 2 m arazi ızgarasının köşeleri.
    for (const key of ['ağ 0', 'ağ 1', 'ağ 3']) expect(stats.get(key)!.cross15).toBeLessThan(0.03);
  });

  it('dağ patikası dik yamaçta bile çoğunlukla düz enine kesitlidir', () => {
    // Ölçülen %5,7 (önce %11); patika 2,2 m dar, dik yamaçta kenar hücreleri şeve karışır.
    expect(stats.get('ağ 2')!.cross15).toBeLessThan(0.08);
  });

  it('kent sokakları ve bağlantıları zemine uydurulur (önce %39 yan yatık)', () => {
    // Ölçülen ~%12: kalan, sokağa bitişik yapıların kilitli zemini (teras/temel değişmez).
    const kent = stats.get('kent')!;
    expect(kent.cross15).toBeLessThan(0.18);
    expect(kent.cross30).toBeLessThan(0.08);
  });
});

describe('yol levhaları (gerçek dünya)', () => {
  it('kavşaklarda yön levhaları: yolda, yapıda ve suda değil; her kolda en az bir hedef', () => {
    const dir = sw.map.signs.filter((s) => s.kind === 'direction');
    expect(dir.length).toBeGreaterThan(400);
    for (const s of dir) {
      expect(s.arms.length).toBeGreaterThan(0);
      for (const a of s.arms) {
        expect(a.lines.length).toBeGreaterThan(0);
        for (const l of a.lines) expect(l.km).toBeGreaterThanOrEqual(1);
      }
      expect(sw.map.roads.onRoad(s.x, s.z, 0.3)).toBe(false);
      expect(sw.map.footprints.contains(s.x, s.z, 0.3)).toBe(false);
      expect(sw.water?.nearest(s.x, s.z, 0.5) ?? null).toBeNull();
    }
  });

  it('il merkezlerinin hepsine, ilçe merkezlerinin çoğuna giriş levhası (ad, nüfus, rakım)', () => {
    const ent = sw.map.signs.filter((s): s is EntranceSign => s.kind === 'entrance');
    const named = new Set(ent.map((s) => s.name));
    const towns = region.settlements!.settlements.filter((s) => s.rank !== 'koy');
    for (const il of towns.filter((s) => s.rank === 'il')) expect(named.has(il.name)).toBe(true);
    // Ölçülen 176 / 186: eksikler büyükşehirlerin il merkezinin içinde kalan merkez ilçeleri (Altındağ, Keçiören, İzmit,
    // İlkadım, Adapazarı …): kente giren yol önce il merkezine girer.
    expect(named.size / towns.length).toBeGreaterThan(0.9);
    for (const s of ent) {
      for (const p of [s, ...signPosts(s)]) {
        expect(sw.map.roads.onRoad(p.x, p.z, 0.3)).toBe(false);
        expect(sw.map.footprints.contains(p.x, p.z, 0.3)).toBe(false);
      }
      expect(s.elevation).toBeGreaterThanOrEqual(0);
    }
  });
});
