import { beforeAll, describe, expect, it } from 'vitest';
import type { RegionData } from '../src/data/region';
import { auditOverlaps, type AuditResult } from './helpers/overlapAudit';
import { loadRealRegion } from './helpers/realRegion';
import { buildSettlementWorld } from './helpers/settlementWorld';

/**
 * İç içe geçme denetimi (gerçek dünya; kullanıcı talimatı: "köprü, yol, dere, dağ vb. yapıların iç içe geçtiği kısımlar"):
 * köprü güvertesi/korkuluğu arazide gömülü kalmaz, yol akarsuyu ve gölü köprüsüz kesmez, köprü/tünel bina ya da
 * birbirleriyle çakışmaz. Sayılar `docs/faz-10-ic-ice-gecme-olcumler.md`'de.
 */
let audit: AuditResult;

beforeAll(async () => {
  const region: RegionData = await loadRealRegion();
  const sw = buildSettlementWorld(region);
  audit = auditOverlaps(sw.map, (x, z) => sw.source.heightAt(x, z), region.features?.water ?? null);
}, 180_000);

describe('yol yapıları iç içe geçme denetimi', () => {
  it('köprü güvertesi ve korkuluğu 1 metreden fazla arazinin içinde kalmaz', () => {
    expect(audit.buriedDecks.map((o) => `${o.a} ${o.detail}`)).toEqual([]);
  });

  it('yol, akarsuyu köprüsüz neredeyse hiç kesmez (kavşakta biten yollara köprü ayağı yaslanır)', () => {
    // Önce 77: yolun ucundaki (kavşak) geçişlere köprü planlanmıyordu.
    expect(audit.streamCrossings.length).toBeLessThanOrEqual(8);
  });

  it('yol göl, gölet ve rezervuar içinden köprüsüz geçmez', () => {
    expect(audit.lakeRoads.length).toBeLessThanOrEqual(2);
  });

  it('köprü bina ile çakışmaz', () => {
    expect(audit.bridgeBuilding.map((o) => `${o.a} ~ ${o.b}`)).toEqual([]);
  });

  it('köprüler yalnızca ortak kavşak ayağında üst üste biner (kavşak dışı çakışma ≤ 3)', () => {
    const away = audit.bridgeBridge.filter((o) => o.detail !== 'junction');
    expect(away.map((o) => `${o.a} ~ ${o.b} ${o.detail}`).length).toBeLessThanOrEqual(3);
  });

  it('gerçek dünyada yeterince yapı denetlendi', () => {
    expect(audit.spans).toBeGreaterThan(300);
  });
});
