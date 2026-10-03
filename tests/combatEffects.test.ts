import { describe, expect, it } from 'vitest';
import { CombatEffects, ParticleLayer, muzzleProfile } from '../src/world/CombatEffects';

const origin = { x: 0, y: 1.5, z: 0 };
const forward = { x: 0, y: 0, z: -1 };

describe('ParticleLayer', () => {
  it('parçacık doğar, yaşar ve süresi dolunca kaybolur', () => {
    const layer = new ParticleLayer(8, true, 'test');
    layer.spawn({ x: 0, y: 0, z: 0, life: 0.2, size0: 1, size1: 0.5, color: 0xffffff, alpha: 1 });
    layer.update(0.1, 600);
    expect(layer.count).toBe(1);
    expect(layer.points.visible).toBe(true);
    layer.update(0.2, 600);
    expect(layer.count).toBe(0);
    expect(layer.points.visible).toBe(false);
    layer.dispose();
  });

  it('kapasite dolunca en eskinin üstüne yazar (taşma yok)', () => {
    const layer = new ParticleLayer(2, false, 'test');
    for (let i = 0; i < 5; i++) {
      layer.spawn({ x: i, y: 0, z: 0, life: 1, size0: 1, size1: 1, color: 0xffffff, alpha: 1 });
    }
    layer.update(0.01, 600);
    expect(layer.count).toBe(2);
    layer.dispose();
  });
});

describe('CombatEffects', () => {
  it('ateşli silah ağız alevi + kıvılcım + duman üretir ve kısa sürede söner', () => {
    const fx = new CombatEffects();
    fx.muzzle('rifle', origin, forward);
    expect(fx.activeCount).toBeGreaterThan(6);
    fx.update(0.1, 600); // alev/kıvılcımlar söndü, duman kaldı
    const afterFlash = fx.activeCount;
    expect(afterFlash).toBeGreaterThan(0);
    fx.update(3, 600);
    expect(fx.activeCount).toBe(0);
    fx.dispose();
  });

  it('susturuculu atışta alev ve kıvılcım yok, duman çok az', () => {
    const loud = new CombatEffects();
    const quiet = new CombatEffects();
    loud.muzzle('pistol', origin, forward, false);
    quiet.muzzle('pistol', origin, forward, true);
    expect(quiet.activeCount).toBeLessThan(loud.activeCount);
    expect(quiet.activeCount).toBe(1);
    loud.dispose();
    quiet.dispose();
  });

  it('pompalı tabancadan daha büyük alev ve daha çok duman verir', () => {
    expect(muzzleProfile('shotgun').flashSize).toBeGreaterThan(muzzleProfile('pistol').flashSize);
    expect(muzzleProfile('shotgun').smoke).toBeGreaterThan(muzzleProfile('pistol').smoke);
    expect(muzzleProfile('bilinmeyen')).toBe(muzzleProfile('pistol'));
  });

  it('yakın dövüş savurması yay/çizgi çizer, ateşli silah efektinden farklı olarak parçacık üretmez', () => {
    const fx = new CombatEffects();
    fx.swing('slash', origin, 0);
    expect(fx.activeCount).toBe(1); // yalnızca yay (parçacık yok)
    fx.swing('thrust', origin, 0);
    expect(fx.activeCount).toBe(2);
    fx.update(0.05, 600);
    expect(fx.activeCount).toBe(2);
    fx.update(1, 600);
    expect(fx.activeCount).toBe(0);
    fx.dispose();
  });

  it('isabet kıvılcımı üretir', () => {
    const fx = new CombatEffects();
    fx.impact(origin, 'smash');
    expect(fx.activeCount).toBeGreaterThan(2);
    fx.dispose();
  });
});
