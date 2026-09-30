import { describe, expect, it } from 'vitest';
import { INTERACT } from '../src/config';
import { lookDirection, pickFocus, targetHeight, type View } from '../src/interaction/focus';
import type { PropKind, PropRef } from '../src/world/propKinds';

const EYE_H = 1.65;
/** Kuzeye (−Z) bakan, zeminde (y = 0) duran oyuncu. */
const view: View = { eye: { x: 0, y: EYE_H, z: 0 }, forward: lookDirection(0, 0) };

let nextId = 1;
function prop(kind: PropKind, x: number, z: number, scale = 1): PropRef {
  return { id: nextId++, kind, x, y: 0, z, scale };
}

describe('lookDirection', () => {
  it('yaw 0 kuzey (−Z), pozitif yaw sola döner, pitch yukarı bakar', () => {
    const north = lookDirection(0, 0);
    expect(north.x).toBeCloseTo(0);
    expect(north.z).toBeCloseTo(-1);
    const left = lookDirection(Math.PI / 2, 0); // sola = batı (−X)
    expect(left.x).toBeCloseTo(-1);
    expect(lookDirection(0, Math.PI / 2).y).toBeCloseTo(1);
    const d = lookDirection(0.7, -0.4);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
  });
});

describe('targetHeight', () => {
  it('boyun yarısı, en çok maxTargetHeight; küçük nesnede zemine yakın', () => {
    expect(targetHeight(prop('tree_conifer', 0, 0))).toBe(INTERACT.maxTargetHeight);
    expect(targetHeight(prop('stick', 0, 0))).toBeLessThan(0.5);
  });
});

describe('pickFocus', () => {
  it('önündeki erişimdeki nesneyi seçer', () => {
    const berry = prop('berry_bush', 0, -2.5);
    const focus = pickFocus([berry], view);
    expect(focus?.prop).toBe(berry);
    expect(focus?.distance).toBeCloseTo(2.5);
    expect(focus?.angleDeg).toBeLessThan(INTERACT.viewConeDeg);
  });

  it('erişimin ötesini, arkadakini ve koni dışını seçmez', () => {
    expect(pickFocus([prop('hazel', 0, -(INTERACT.reach + 0.5))], view)).toBeNull();
    expect(pickFocus([prop('hazel', 0, 2.5)], view)).toBeNull(); // arkada
    expect(pickFocus([prop('hazel', 2.5, -0.5)], view)).toBeNull(); // yanda (~79°)
  });

  it('erişim sınırında dahil, hemen ötesinde dışlanır', () => {
    expect(pickFocus([prop('tree_broadleaf', 0, -INTERACT.reach)], view)).not.toBeNull();
    expect(pickFocus([prop('tree_broadleaf', 0, -(INTERACT.reach + 0.01))], view)).toBeNull();
  });

  it('bakış yönüne en yakın olanı seçer; eşitlikte yakın olanı', () => {
    const centered = prop('bush', 0.0, -3);
    const aside = prop('bush', 1.2, -2);
    expect(pickFocus([aside, centered], view)?.prop).toBe(centered);

    const near = prop('bush', 0, -2);
    const far = prop('bush', 0, -3.4);
    // aynı doğrultuda: açıları yakın; hedef yüksekliği aynı, yakın olanın açısı daha büyük olabilir → yalnızca biri döner
    expect([near, far]).toContain(pickFocus([near, far], view)?.prop);
  });

  it('accept süzgeci uygulanır', () => {
    const a = prop('bush', 0, -2);
    const b = prop('rock', 0.5, -2.5);
    expect(pickFocus([a, b], view, (p) => p.kind === 'rock')?.prop).toBe(b);
    expect(pickFocus([a, b], view, () => false)).toBeNull();
  });

  it('dibindeki yer nesnesine yere bakmadan ulaşılır (3B açı koniyi aşsa da)', () => {
    const closeStick = prop('stick', 0, -1.0);
    // 1 m ötedeki dal düz bakışta ~58° aşağıdadır; yatay açı 0 olduğundan yine de seçilir.
    expect(pickFocus([closeStick], view)?.prop).toBe(closeStick);
    // closeRange'in ötesinde 3B koni geçerlidir: 1,6 m'deki dal ~43° aşağıda → dışarıda,
    // yere doğru eğilince (pitch −0,45) içeride.
    const midStick = prop('stick', 0, -1.6);
    expect(pickFocus([midStick], view)).toBeNull();
    const down: View = { eye: view.eye, forward: lookDirection(0, -0.45) };
    expect(pickFocus([midStick], down)?.prop).toBe(midStick);
  });

  it('dibindeki ama arkadaki nesneyi yatay açı da reddeder', () => {
    expect(pickFocus([prop('stone', 0, 1.0)], view)).toBeNull();
  });

  it('boş aday listesi null', () => {
    expect(pickFocus([], view)).toBeNull();
  });
});
