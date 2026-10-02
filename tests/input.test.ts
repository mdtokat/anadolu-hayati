import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { Input, type InputDocument, type InputTarget } from '../src/core/Input';

/** DOM'suz ortamda Input'u sınamak için minimal sahte belge/öğe. */
function setup() {
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as Element | null,
  }) as InputDocument & { pointerLockElement: Element | null };
  const target = Object.assign(new EventTarget(), {
    requestPointerLock: vi.fn(),
  }) as InputTarget & { requestPointerLock: ReturnType<typeof vi.fn> };
  const win = new EventTarget();
  const events = new EventBus<GameEvents>();
  const input = new Input(target, doc, events, win);

  const key = (type: 'keydown' | 'keyup', code: string, repeat = false) =>
    doc.dispatchEvent(Object.assign(new Event(type), { code, repeat }));
  const move = (dx: number, dy: number) =>
    doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: dx, movementY: dy }));
  const setLock = (locked: boolean) => {
    doc.pointerLockElement = locked ? (target as unknown as Element) : null;
    doc.dispatchEvent(new Event('pointerlockchange'));
  };
  return { input, events, doc, target, win, key, move, setLock };
}

describe('Input', () => {
  it('basılı tuşlardan hareket niyeti üretir ve bırakılınca sıfırlar', () => {
    const { input, key } = setup();
    key('keydown', 'KeyW');
    key('keydown', 'ShiftLeft');
    expect(input.intent()).toMatchObject({ forward: 1, run: true });
    key('keyup', 'KeyW');
    expect(input.intent().forward).toBe(0);
  });

  it('fare hareketi yalnızca pointer lock varken birikir ve consumeLook sıfırlar', () => {
    const { input, move, setLock } = setup();
    move(10, 5); // kilit yok: yok sayılır
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });

    setLock(true);
    move(10, 5);
    move(-3, 2);
    expect(input.consumeLook()).toEqual({ dx: 7, dy: 7 });
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });

  it("test modu uçuşu: Space'e çift basış `toggleFlight` üretir (kilit varken, kısa aralıkta)", () => {
    const { events, doc, setLock } = setup();
    const actions: string[] = [];
    events.on('input:action', ({ action }) => actions.push(action));
    const press = (timeStamp: number, repeat = false) =>
      doc.dispatchEvent(
        Object.defineProperty(
          Object.assign(new Event('keydown'), { code: 'Space', repeat }),
          'timeStamp',
          { value: timeStamp },
        ),
      );
    press(0); // kilit yok: sayılmaz
    press(100);
    expect(actions).toEqual([]);

    setLock(true);
    press(1000);
    press(1100, true); // tuş tekrarı çift basış değildir
    expect(actions).toEqual([]);
    press(1200);
    expect(actions).toEqual(['toggleFlight']);
    press(1300); // üçüncü basış yeni bir çiftin ilkidir
    expect(actions).toEqual(['toggleFlight']);
    press(2000); // aralık uzun: yeni çift başlamaz
    expect(actions).toEqual(['toggleFlight']);
    press(2150);
    expect(actions).toEqual(['toggleFlight', 'toggleFlight']);
  });

  it('pointer lock değişimini olay olarak yayınlar', () => {
    const { events, setLock } = setup();
    const handler = vi.fn();
    events.on('input:pointerLockChanged', handler);
    setLock(true);
    setLock(false);
    expect(handler).toHaveBeenNthCalledWith(1, { locked: true });
    expect(handler).toHaveBeenNthCalledWith(2, { locked: false });
  });

  it('kilit kalkınca basılı tuşlar ve bekleyen bakış sıfırlanır', () => {
    const { input, key, move, setLock } = setup();
    setLock(true);
    key('keydown', 'KeyW');
    move(4, 4);
    setLock(false);
    expect(input.intent().forward).toBe(0);
    expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });

  it('V eylemi yalnızca kilitliyken ve tekrar etmeden tetiklenir', () => {
    const { events, key, setLock } = setup();
    const handler = vi.fn();
    events.on('input:action', handler);

    key('keydown', 'KeyV'); // kilit yok
    expect(handler).not.toHaveBeenCalled();

    setLock(true);
    key('keydown', 'KeyV');
    key('keydown', 'KeyV', true); // tuş tekrarı
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ action: 'toggleCamera' });
  });

  it('sol tık yalnızca kilitliyken primaryAction eylemidir; diğer tuşlar ve kilitsiz tık değil', () => {
    const { events, doc, setLock } = setup();
    const actions: string[] = [];
    events.on('input:action', ({ action }) => actions.push(action));
    const click = (button: number) =>
      doc.dispatchEvent(Object.assign(new Event('mousedown'), { button }));
    click(0); // kilit yok (kilidi alan tıklama)
    setLock(true);
    click(2);
    click(1);
    expect(actions).toEqual([]);
    click(0);
    expect(actions).toEqual(['primaryAction']);
  });

  it('C ve G yerleştirme eylemleridir; yalnızca kilitliyken ve tekrar etmeden', () => {
    const { events, key, setLock } = setup();
    const actions: string[] = [];
    events.on('input:action', ({ action }) => actions.push(action));
    key('keydown', 'KeyC');
    expect(actions).toEqual([]);
    setLock(true);
    key('keydown', 'KeyC');
    key('keydown', 'KeyC', true);
    key('keydown', 'KeyG');
    expect(actions).toEqual(['placeCampfire', 'placeShelter']);
  });

  it('mantık adımından önce bırakılan kısa zıplama dokunuşu bir kez iletilir', () => {
    const { input, key } = setup();
    key('keydown', 'Space');
    key('keyup', 'Space'); // sonraki adımdan önce bırakıldı
    expect(input.intent().jump).toBe(false); // anlık durumda görünmez
    expect(input.pollIntent().jump).toBe(true); // ama adım için iletilir
    expect(input.pollIntent().jump).toBe(false); // ve yalnızca bir kez
  });

  it('zıplama tuşu basılı tutulurken her adımda iletilir', () => {
    const { input, key } = setup();
    key('keydown', 'Space');
    expect(input.pollIntent().jump).toBe(true);
    expect(input.pollIntent().jump).toBe(true);
    key('keyup', 'Space');
    expect(input.pollIntent().jump).toBe(false);
  });

  it('kilit kalkınca bekleyen zıplama iptal olur', () => {
    const { input, key, setLock } = setup();
    setLock(true);
    key('keydown', 'Space');
    setLock(false);
    expect(input.pollIntent().jump).toBe(false);
  });

  it('tek fare olayındaki aşırı delta sınırlanır (kilit anı sıçraması)', () => {
    const { input, move, setLock } = setup();
    setLock(true);
    move(5000, -5000);
    const look = input.consumeLook();
    expect(look.dx).toBe(250);
    expect(look.dy).toBe(-250);
  });

  it('pencere odağı kaybolunca basılı tuşları bırakır', () => {
    const { input, key, win } = setup();
    key('keydown', 'KeyD');
    win.dispatchEvent(new Event('blur'));
    expect(input.intent().strafe).toBe(0);
  });

  it('pointerlockerror olayını yayınlar', () => {
    const { events, doc } = setup();
    const handler = vi.fn();
    events.on('input:pointerLockFailed', handler);
    doc.dispatchEvent(new Event('pointerlockerror'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('requestLock hedefin requestPointerLock metodunu çağırır ve hatayı yutar', () => {
    const { input, target } = setup();
    input.requestLock();
    expect(target.requestPointerLock).toHaveBeenCalledTimes(1);

    target.requestPointerLock.mockImplementation(() => {
      throw new Error('reddedildi');
    });
    expect(() => input.requestLock()).not.toThrow();
  });

  it('dispose sonrası olayları dinlemez', () => {
    const { input, key } = setup();
    input.dispose();
    key('keydown', 'KeyW');
    expect(input.intent().forward).toBe(0);
  });
});
