import { describe, expect, it } from 'vitest';
import { banditWarning, campAnswer } from '../src/bandits/dialog';
import { banditInView, inView } from '../src/bandits/interact';
import type { BanditView } from '../src/bandits/kinds';

const view = (patch: Partial<BanditView>): BanditView => ({
  id: 1,
  camp: 2,
  name: 'Kara Ali',
  role: 'member',
  weapon: 'pala',
  x: 0,
  y: 0,
  z: -2,
  yaw: 0,
  speed: 0,
  state: 'surrender',
  health: 5,
  maxHealth: 80,
  stride: 0,
  hitFlash: 0,
  searched: false,
  ...patch,
});

describe('eşkıya etkileşimi ve konuşma metinleri', () => {
  const pose = { x: 0, z: 0, yaw: 0 }; // ileri −z

  it('önündeki teslim olmuş eşkıya ya da aranmamış ceset seçilir; arkadaki, uzaktaki, aranmış seçilmez', () => {
    expect(banditInView([view({})], pose)?.kind).toBe('surrender');
    expect(banditInView([view({ state: 'dead' })], pose)?.kind).toBe('corpse');
    expect(banditInView([view({ state: 'dead', searched: true })], pose)).toBeNull();
    expect(banditInView([view({ state: 'shoot' })], pose)).toBeNull();
    expect(banditInView([view({ z: 2 })], pose)).toBeNull();
    expect(banditInView([view({ z: -10 })], pose)).toBeNull();
    expect(inView(pose, 0, -0.2, 2)).not.toBeNull(); // çok yakında her yön
  });

  it('uyarı ve kamp tarifi yön/uzaklık söyler; kamp yoksa kaçamak cevap', () => {
    expect(banditWarning('kardeşim', { x: 0, z: 0 }, { x: 0, z: -40 })).toMatch(
      /kuzey tarafında, 2 kilometre kadar/,
    );
    expect(banditWarning('kardeşim', { x: 0, z: 0 }, null)).toMatch(/yankesici/);
    expect(campAnswer({ x: 0, z: 0 }, { x: 30, z: 0 })).toMatch(/doğu/);
    expect(campAnswer({ x: 0, z: 0 }, null)).toMatch(/dağıldık/);
  });
});
