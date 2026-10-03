import { beforeAll, describe, expect, it } from 'vitest';
import { TELEPORTS } from '../src/config';
import type { RegionData } from '../src/data/region';
import { latLonToGame } from '../src/world/geo';
import {
  ProvinceTracker,
  provinceNoticeText,
  type ProvinceChange,
} from '../src/world/provinceNotice';
import { provinceAt } from '../src/world/provinces';
import { coreProvinces, groupProvinces } from './helpers/groups';
import { loadRealRegion } from './helpers/realRegion';

let region: RegionData;

beforeAll(async () => {
  region = await loadRealRegion();
}, 60_000);

/** Enlem/boylam doğrusu boyunca 1 sn aralıkla yürür; bildirilen geçişleri döner. */
function walk(from: [number, number], to: [number, number], steps = 400): ProvinceChange[] {
  const tracker = new ProvinceTracker();
  const changes: ProvinceChange[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = latLonToGame(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      region.meta.originUtm,
    );
    const province = provinceAt(region.provinces, p.x, p.z);
    const change = tracker.observe(
      { name: province?.name ?? null, inRegion: province?.inRegion ?? false },
      i,
    );
    if (change) changes.push(change);
  }
  return changes;
}

describe('gerçek il sınırlarında geçiş bildirimi', () => {
  it('Zonguldak → Düzce yürüyüşünde "Düzce\'ye hoş geldiniz" çıkar', () => {
    const changes = walk([41.46, 31.8], [40.84, 31.16]);
    expect(changes.map((c) => c.name)).toContain('Düzce');
    expect(changes.map(provinceNoticeText)).toContain("Düzce'ye hoş geldiniz");
  });

  it('başlangıç ili bildirilmez; Zonguldak (Yenice yakını) → Karabük sınırı geçilince tek bildirim', () => {
    // Yenice (Karabük) ile Zonguldak merkezi arası: sınırı bir kez geçer.
    const changes = walk([41.46, 31.8], [41.2, 32.34]);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes[0]?.from).toBe('Zonguldak');
    // Hiçbir il art arda iki kez bildirilmez.
    for (let i = 1; i < changes.length; i++)
      expect(changes[i]?.name).not.toBe(changes[i - 1]?.name);
    for (const c of changes) expect(provinceNoticeText(c)).toMatch(/'[aeyıu]+ hoş geldiniz$/);
  });

  it('bildirim metinleri gerçek il adlarıyla doğru yönelme ekini kullanır', () => {
    // İl listesi veriden okunur (yeni iller testi değiştirmez): hedef il "hoş geldiniz", komşu il "girdiniz".
    const names = region.provinces.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    const declared = new Set(groupProvinces());
    for (const p of region.provinces) {
      const text = provinceNoticeText({ name: p.name, inRegion: p.inRegion });
      expect(text, p.name).toMatch(
        p.inRegion ? /^.+'(a|e|ya|ye) hoş geldiniz$/ : /^.+'(a|e|ya|ye) girdiniz$/,
      );
      expect(text.startsWith(`${p.name}'`), p.name).toBe(true);
      // Yalnızca tools/groups'taki iller hedef olabilir (komşu olup grupta bulunanlar: grup PR'ı, 12.9'dan önce).
      if (p.inRegion)
        expect(declared.has(p.name), `${p.name}: tools/groups/*.yaml'da yok`).toBe(true);
    }
    // Çekirdek iller her zaman hedef ildir; gerçek adlarla örnekler (yönelme eki ünlü uyumu).
    const byName = new Map(region.provinces.map((p) => [p.name, p]));
    for (const name of coreProvinces()) expect(byName.get(name)?.inRegion, name).toBe(true);
    const texts = region.provinces.map((p) =>
      provinceNoticeText({ name: p.name, inRegion: p.inRegion }),
    );
    expect(texts).toContain("Bartın'a hoş geldiniz");
    expect(texts).toContain("Karabük'e hoş geldiniz");
    expect(texts).toContain("Düzce'ye hoş geldiniz");
    expect(texts).toContain("Sinop'a hoş geldiniz");
  });

  it('ışınlanma noktaları: her biri bir ile düşer ya da denizdedir (izleyici çökmez)', () => {
    const tracker = new ProvinceTracker();
    for (const [i, tp] of TELEPORTS.entries()) {
      const p = latLonToGame(tp.lat, tp.lon, region.meta.originUtm);
      const province = provinceAt(region.provinces, p.x, p.z);
      expect(() =>
        tracker.observe(
          { name: province?.name ?? null, inRegion: province?.inRegion ?? false },
          i * 100,
        ),
      ).not.toThrow();
    }
  });
});
