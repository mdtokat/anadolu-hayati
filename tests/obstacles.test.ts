import { describe, expect, it } from 'vitest';
import { NO_OBSTACLES, StructureObstacles } from '../src/placement/obstacles';
import { fenceYawForAxis } from '../src/placement/fences';
import { StructureSet } from '../src/placement/structures';

const R = 0.4;

/** X boyunca uzanan çit (−1…+1 m) kuzey z = 0'da. */
function fenceSet(kind: 'wood_fence' | 'stone_fence' | 'fence_gate' = 'wood_fence') {
  const set = new StructureSet();
  const fence = set.add(kind, 0, 0, 0, fenceYawForAxis('x'));
  return { set, fence, obstacles: new StructureObstacles(set) };
}

describe('NO_OBSTACLES', () => {
  it('hiçbir şeyi engellemez', () => {
    expect(NO_OBSTACLES.blocked(0, 0, 100, 100, 5)).toBe(false);
  });
});

describe('StructureObstacles: çit ve duvar', () => {
  it('çiti dik kesen yürüyüşü engeller; yandan ve uzaktan geçeni engellemez', () => {
    const { obstacles } = fenceSet();
    expect(obstacles.blocked(0, 2, 0, -2, R)).toBe(true); // karşıya geçiş
    expect(obstacles.blocked(0, 1, 0, 0.9, R)).toBe(false); // kenarı kesmeyen kısa adım (uzaktan)
    expect(obstacles.blocked(3, 2, 3, -2, R)).toBe(false); // çitin ucundan 2 m öteden geçiş
    expect(obstacles.blocked(0, 2, 5, 2, R)).toBe(false); // çite paralel
  });

  it('çit kalınlığı + gövde yarıçapı içine girmek engeldir; çıkış serbest', () => {
    const { obstacles } = fenceSet('stone_fence');
    // Taş duvar kalınlığı 0,5: yarım 0,25 + 0,4. Dışarıdan içeri girmek engel.
    expect(obstacles.blocked(0, 1.2, 0, 0.5, R)).toBe(true);
    // İçeride (çite bitişik) başlayan gövde uzaklaşabilir (daha derine gitmedikçe).
    expect(obstacles.blocked(0, 0.5, 0, 0.9, R)).toBe(false);
    expect(obstacles.blocked(0, 0.5, 0, 0.3, R)).toBe(true);
  });

  it('çit kaldırılınca engel kalkar (yapı sürümüyle yenilenir)', () => {
    const { set, fence, obstacles } = fenceSet();
    expect(obstacles.blocked(0, 2, 0, -2, R)).toBe(true);
    set.remove(fence.id);
    expect(obstacles.blocked(0, 2, 0, -2, R)).toBe(false);
    expect(obstacles.rectCount).toBe(0);
  });

  it('kapalı çit kapısı keser; açılınca orta açıklıktan geçilir (kanat menteşe ucunda)', () => {
    const { set, fence, obstacles } = fenceSet('fence_gate');
    expect(obstacles.blocked(0, 2, 0, -2, R)).toBe(true);
    set.toggleDoor(fence.id);
    expect(obstacles.blocked(0, 2, 0, -2, R)).toBe(false);
    // Kanat menteşeden dik açıyla uzanır: yerel x ∈ [0, 1,8] (yaw π/2: yerel +X dünyada −Z), menteşe ucundadır.
    // Uç direkler hâlâ engeldir.
    expect(obstacles.blocked(0.95, 2, 0.95, -2, R)).toBe(true);
  });

  it('modüler duvar keser; kapılı duvarın boşluğundan geçilir, kapalı kapı keser, açık kapı geçirir', () => {
    const set = new StructureSet();
    set.add('doorway', 0, 0, 0, 0); // X boyunca, boşluk x ∈ [−0,5, 0,5]
    const door = set.add('door', 0, 0, 0, 0);
    const obstacles = new StructureObstacles(set);
    expect(obstacles.blocked(0.8, 2, 0.8, -2, R)).toBe(true); // duvar gövdesi
    expect(obstacles.blocked(0, 2, 0, -2, R)).toBe(true); // kapalı kapı
    set.toggleDoor(door.id);
    // Açık kapı kanadı menteşe yanında öne uzanır; orta boşluktan yan yana geçmek mümkün değil ama kanat dışındaki
    // geçiş (x = 0, kanat x = −0,5'te) serbesttir.
    expect(obstacles.blocked(0, 2, 0, -2, 0.05)).toBe(false);
  });

  it('taban/çatı plakaları ve basamaklar yürünür sayılır (engel değil)', () => {
    const set = new StructureSet();
    set.add('foundation', 0, 0, 0, 0);
    set.add('roof', 4, 2.6, 0, 0);
    set.add('entry_step', 0, 0, 3, 0);
    const obstacles = new StructureObstacles(set);
    expect(obstacles.rectCount).toBe(0);
    expect(obstacles.blocked(0, 5, 0, -5, R)).toBe(false);
  });

  it('sandık, tezgâh, ocak, fırın katıdır; döşek yürünür', () => {
    const set = new StructureSet();
    set.add('storage_chest', 0, 0, 0, 0);
    set.add('workbench', 6, 0, 0, 0);
    set.add('forge', 12, 0, 0, 0);
    set.add('stone_oven', 18, 0, 0, 0);
    set.add('bedroll', 24, 0, 0, 0);
    const obstacles = new StructureObstacles(set);
    for (const x of [0, 6, 12, 18]) expect(obstacles.blocked(x, 3, x, -3, R), `x=${x}`).toBe(true);
    expect(obstacles.blocked(24, 3, 24, -3, R)).toBe(false);
  });

  it('üst kat duvarı yerdeki yürüyüşü kesmez (zemin yüksekliği verilirse)', () => {
    const set = new StructureSet();
    set.add('wall', 0, 2.6, 0, 0); // zeminden 2,6 m yukarıda
    const ground = new StructureObstacles(set, { heightAt: () => 0 });
    expect(ground.blocked(0, 2, 0, -2, R)).toBe(false);
    const naive = new StructureObstacles(set);
    expect(naive.blocked(0, 2, 0, -2, R)).toBe(true);
  });

  it('yerleşim ayak izine dışarıdan girmek engeldir; içeride olan çıkabilir', () => {
    const set = new StructureSet();
    const inside = (x: number, z: number, r: number) => Math.abs(x) < 3 + r && Math.abs(z) < 3 + r;
    const obstacles = new StructureObstacles(set, { solidAt: inside });
    expect(obstacles.blocked(0, 8, 0, 2, R)).toBe(true);
    expect(obstacles.blocked(0, 2, 0, 8, R)).toBe(false);
    expect(obstacles.blocked(8, 8, 9, 9, R)).toBe(false);
  });

  it('contains: nokta engelin (yarıçapla) içindeyse true', () => {
    const { obstacles } = fenceSet();
    expect(obstacles.contains(0, 0.05, 0.2)).toBe(true);
    expect(obstacles.contains(0, 2, 0.2)).toBe(false);
  });

  it('uzak çok sayıda yapı sorguyu yavaşlatmaz (ızgara): 2 000 çit, 10 000 sorgu < 1 sn', () => {
    const set = new StructureSet();
    for (let i = 0; i < 2000; i++) {
      set.add('wood_fence', (i % 50) * 2, 0, Math.floor(i / 50) * 2, fenceYawForAxis('x'));
    }
    const obstacles = new StructureObstacles(set);
    const t0 = performance.now();
    let hits = 0;
    for (let i = 0; i < 10_000; i++) {
      if (obstacles.blocked(i % 100, -50, (i % 100) + 0.1, -49.9, R)) hits++;
    }
    expect(hits).toBe(0);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
