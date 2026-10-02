import { beforeAll, describe, expect, it } from 'vitest';
import { PLACEMENT, REGION_PLAYER, SCATTER, VERTICAL_SCALE } from '../src/config';
import type { RegionData } from '../src/data/region';
import { slopeDegAt, validatePlacement } from '../src/placement/placeRules';
import { STRUCTURE_KINDS, StructureSet, type StructureKind } from '../src/placement/structures';
import { RegionHeightSource } from '../src/world/RegionHeightSource';
import { loadRealRegion } from './helpers/realRegion';

let region: RegionData;
let source: RegionHeightSource;

beforeAll(async () => {
  region = await loadRealRegion();
  source = RegionHeightSource.fromRegion(region);
});

const STEP = 37;

function samples() {
  const b = source.bounds;
  const points: Array<{ x: number; z: number }> = [];
  for (let x = b.minX + 5; x < b.maxX; x += STEP) {
    for (let z = b.minZ + 5; z < b.maxZ; z += STEP) points.push({ x, z });
  }
  return points;
}

describe('validatePlacement (gerçek bölge)', () => {
  it('deniz ve kıyı hücreleri hiçbir türde kabul edilmez; geçerli noktalar kara ve eğim sınırında', () => {
    const structures = new StructureSet();
    const heightAt = (x: number, z: number) => source.heightAt(x, z);
    for (const kind of STRUCTURE_KINDS) {
      for (const p of samples()) {
        const r = validatePlacement(kind, p, p, { heightAt, structures });
        const elevation = source.elevationAt(p.x, p.z);
        if (elevation <= SCATTER.minElevation) {
          expect(r, `deniz ${p.x},${p.z}`).toEqual({ ok: false, reason: 'in_sea' });
        }
        if (r.ok) {
          expect(elevation).toBeGreaterThan(SCATTER.minElevation);
          expect(slopeDegAt(heightAt, p.x, p.z)).toBeLessThanOrEqual(
            PLACEMENT.kinds[kind].maxSlopeDeg,
          );
          expect(r.y).toBe(source.heightAt(p.x, p.z));
          expect(r.y * VERTICAL_SCALE).toBeGreaterThan(SCATTER.minElevation);
        }
      }
    }
  }, 30_000); // Faz 11: 29 yapı türü × örnekler

  it('karanın makul bir bölümü yerleştirmeye uygundur (oyuncu sürekli "olmaz" duymasın)', () => {
    const structures = new StructureSet();
    const heightAt = (x: number, z: number) => source.heightAt(x, z);
    const share = (kind: StructureKind) => {
      let land = 0;
      let ok = 0;
      for (const p of samples()) {
        if (source.elevationAt(p.x, p.z) <= SCATTER.minElevation) continue;
        land++;
        if (validatePlacement(kind, p, p, { heightAt, structures }).ok) ok++;
      }
      return ok / land;
    };
    const fire = share('campfire');
    const shelter = share('lean_to');
    expect(fire).toBeGreaterThan(0.4);
    expect(shelter).toBeGreaterThan(0.3);
    expect(fire).toBeGreaterThanOrEqual(shelter);
    // Faz 9: sandık/tezgâh küçük yapılardır; kulübe düzlük ister (ölçülen ≈ %21) ama yine de bulunur.
    expect(share('storage_chest')).toBeGreaterThan(0.3);
    expect(share('workbench')).toBeGreaterThan(0.3);
    const hut = share('wooden_hut');
    expect(hut).toBeGreaterThan(0.15);
    expect(hut).toBeLessThanOrEqual(shelter);
  });

  it('ateş eğim sınırı oyuncunun tırmanma sınırının altındadır (yürünebilir yerde kurulur)', () => {
    for (const spec of Object.values(PLACEMENT.kinds)) {
      expect(spec.maxSlopeDeg).toBeLessThan(REGION_PLAYER.maxSlopeDeg);
    }
  });
});
