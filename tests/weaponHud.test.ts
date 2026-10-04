import { describe, expect, it, vi } from 'vitest';
import { GunshotAudio, shotGain } from '../src/audio/gunshot';
import { aimCamera, zoomFovDeg } from '../src/combat/RangedSystem';
import { pointAlong, tracerPath, tracerSegment } from '../src/combat/tracers';
import { CAMERA, INPUT, PLAYER, RANGED } from '../src/config';
import { EventBus } from '../src/core/EventBus';
import type { GameEvents } from '../src/core/events';
import { PlayerCamera } from '../src/player/PlayerCamera';
import { ammoLevel, ammoText, crosshairKind, spreadRadiusPx } from '../src/ui/rangedView';
import type { HeightSource } from '../src/world/HeightSource';

/** Faz 11.5: nişan kamerası, mermi izleri, silah HUD'u görünüm mantığı, atış sesi. */

describe('aimCamera', () => {
  it('nişan geçişinde görüş açısı ve hassasiyet silahın değerine iner; yarıdan sonra göz hizası', () => {
    expect(aimCamera(null, 1, CAMERA.fov)).toEqual({
      fovDeg: CAMERA.fov,
      sensitivity: 1,
      firstPerson: false,
    });
    expect(aimCamera('rifle', 0, CAMERA.fov).fovDeg).toBe(CAMERA.fov);
    const half = aimCamera('rifle', 0.5, CAMERA.fov);
    expect(half.fovDeg).toBeCloseTo((CAMERA.fov + RANGED.weapons.rifle.aimFovDeg) / 2, 9);
    expect(half.firstPerson).toBe(true);
    // Keskin nişancının kendi dürbünü 4x: tan(FOV/2) dörde bölünür.
    const scope = aimCamera('sniper_rifle', 1, CAMERA.fov);
    expect(scope.fovDeg).toBeCloseTo(zoomFovDeg(CAMERA.fov, 4), 9);
    expect(scope.sensitivity).toBeCloseTo((scope.fovDeg / CAMERA.fov) * RANGED.aimSensitivity, 9);
    expect(scope.sensitivity).toBeLessThan(0.3);
  });

  it('takılı dürbün büyütmesi görüş açısını daraltır: 2x > 4x > 8x > 16x', () => {
    const fovs = [2, 4, 8, 16].map(
      (zoom) => aimCamera('marksman_rifle', 1, CAMERA.fov, zoom).fovDeg,
    );
    for (let i = 1; i < fovs.length; i++) expect(fovs[i]).toBeLessThan(fovs[i - 1]!);
    const tan = (deg: number): number => Math.tan((deg * Math.PI) / 360);
    expect(tan(fovs[3]!) * 16).toBeCloseTo(tan(CAMERA.fov), 9);
    // Dürbünsüz (0) gez-arpacık görüş açısı.
    expect(aimCamera('marksman_rifle', 1, CAMERA.fov, 0).fovDeg).toBe(
      RANGED.weapons.marksman_rifle.aimFovDeg,
    );
  });
});

describe('PlayerCamera nişan', () => {
  const terrain = { heightAt: () => 0 } as unknown as HeightSource;

  it('görüş açısını uygular, üçüncü şahısta nişanda göz hizasına geçer, salınım yalnızca görüntüde', () => {
    const cam = new PlayerCamera(new EventBus<GameEvents>(), terrain);
    cam.toggleMode();
    cam.setAim(20, 0.3, true);
    cam.setViewOffset(0.01, -0.02);
    cam.update({ x: 1, y: 2, z: 3 });
    expect(cam.camera.fov).toBe(20);
    expect(cam.viewFirstPerson).toBe(true);
    expect(cam.camera.position.toArray()).toEqual([1, 2 + PLAYER.eyeHeight, 3]);
    expect(cam.camera.rotation.x).toBeCloseTo(-0.02, 9);
    expect(cam.yaw).toBe(0); // bakışın kendisi değişmez
    cam.setAim(CAMERA.fov, 1, false);
    cam.update({ x: 1, y: 2, z: 3 });
    expect(cam.viewFirstPerson).toBe(false);
    expect(cam.camera.fov).toBe(CAMERA.fov);
  });

  it('üçüncü şahısta nişan geçişi bakış doğrultusunda sürekli ilerler (tek adımda sıçramaz)', () => {
    const cam = new PlayerCamera(new EventBus<GameEvents>(), terrain);
    cam.toggleMode();
    const feet = { x: 0, y: 2, z: 0 };
    const dist = (blend: number) => {
      cam.setAim(CAMERA.fov, 1, blend >= 0.5, blend);
      cam.update(feet);
      return Math.hypot(
        cam.camera.position.x - feet.x,
        cam.camera.position.y - (feet.y + PLAYER.eyeHeight),
        cam.camera.position.z - feet.z,
      );
    };
    let prev = dist(0);
    expect(prev).toBeGreaterThan(CAMERA.thirdPersonDistance * 0.9);
    let maxStep = 0;
    for (let b = 0.05; b <= 1.0001; b += 0.05) {
      const d = dist(Math.min(b, 1));
      expect(d).toBeLessThanOrEqual(prev + 1e-9); // geri gitmez
      maxStep = Math.max(maxStep, prev - d);
      prev = d;
    }
    expect(prev).toBeCloseTo(0, 9);
    expect(maxStep).toBeLessThan(CAMERA.thirdPersonDistance * 0.12);
    cam.setAim(CAMERA.fov, 1, false, 0);
    cam.update(feet);
    expect(cam.viewFirstPerson).toBe(false);
  });

  it('nişanda fare hassasiyeti düşer; tepme bakışı yukarı iter', () => {
    const cam = new PlayerCamera(new EventBus<GameEvents>(), terrain);
    cam.applyMouse(100, 0);
    const normal = Math.abs(cam.yaw);
    cam.setLook(0, 0);
    cam.setAim(20, 0.25, true);
    cam.applyMouse(100, 0);
    expect(Math.abs(cam.yaw)).toBeCloseTo(normal * 0.25, 9);
    expect(normal).toBeCloseTo(100 * INPUT.mouseSensitivity, 9);
    cam.kick(0.05);
    expect(cam.pitch).toBeCloseTo(0.05, 9);
  });
});

describe('mermi izleri', () => {
  const path = tracerPath([
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: -10 },
    { x: 0, y: -1, z: -20 },
  ]);

  it('birikimli uzunluk ve yol üzerinde nokta', () => {
    expect(path.total).toBeCloseTo(10 + Math.hypot(1, 10), 9);
    expect(pointAlong(path, 5)).toEqual({ x: 0, y: 0, z: -5 });
    expect(pointAlong(path, -1)).toEqual({ x: 0, y: 0, z: 0 });
    expect(pointAlong(path, 999)).toEqual({ x: 0, y: -1, z: -20 });
  });

  it('iz uçuş süresince ilerler, kuyruk sonu geçince biter', () => {
    const flight = 1;
    const start = tracerSegment(path, flight, 0, 2);
    expect(start?.head).toEqual({ x: 0, y: 0, z: 0 });
    const mid = tracerSegment(path, flight, 0.5, 2)!;
    expect(mid.head.z).toBeLessThan(-9);
    expect(mid.tail.z - mid.head.z).toBeCloseTo(2, 1);
    const end = tracerSegment(path, flight, 1, 2)!;
    expect(end.head).toEqual({ x: 0, y: -1, z: -20 });
    expect(tracerSegment(path, flight, 1.5, 2)).toBeNull();
    expect(tracerSegment(tracerPath([]), 1, 0, 2)).toBeNull();
  });
});

describe('silah HUD görünümü', () => {
  it('nişangâh biçimi silaha göre', () => {
    expect(crosshairKind('shotgun', false)).toBe('spread');
    expect(crosshairKind('bow', false)).toBe('bow');
    expect(crosshairKind('slingshot', false)).toBe('bow');
    expect(crosshairKind('rifle', false)).toBe('cross');
    expect(crosshairKind('sniper_rifle', false)).toBe('cross');
    expect(crosshairKind('sniper_rifle', true)).toBe('scope');
  });

  it('saçılma yarıçapı görüş açısı daralınca büyür; alt sınır ve ekran sınırı', () => {
    const wide = spreadRadiusPx(2, 70, 800);
    const narrow = spreadRadiusPx(2, 35, 800);
    expect(narrow).toBeGreaterThan(wide * 1.9);
    expect(spreadRadiusPx(0, 70, 800)).toBe(4);
    expect(spreadRadiusPx(80, 10, 800)).toBe(400);
  });

  it('mermi sayacı metni ve uyarı düzeyi', () => {
    expect(ammoText(3, 12, false)).toBe('3 / 12');
    expect(ammoText(3, 12, true)).toBe('Dolduruluyor…');
    expect(ammoLevel(1, 0)).toBe('ok');
    expect(ammoLevel(0, 5)).toBe('low');
    expect(ammoLevel(0, 0)).toBe('empty');
  });
});

/** Web Audio sahtesi: düğüm oluşturmayı sayar. */
function fakeAudioContext() {
  const created: string[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = (kind: string) => {
    created.push(kind);
    const n = {
      gain: param(),
      frequency: param(),
      type: '',
      buffer: null,
      onended: null,
      connect: (to: unknown) => to,
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    return n;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'running',
    destination: {},
    createGain: () => node('gain'),
    createBiquadFilter: () => node('filter'),
    createOscillator: () => node('osc'),
    createBufferSource: () => node('source'),
    createBuffer: (_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
  return { ctx: ctx as unknown as AudioContext, created };
}

describe('atış sesi', () => {
  it('shotGain: ses², profil ve uzaklıkla sönüm; ses 0 iken sessiz', () => {
    expect(shotGain(0, 1)).toBe(0);
    expect(shotGain(1, 1)).toBeCloseTo(RANGED.sound.headroom, 9);
    expect(shotGain(0.5, 1)).toBeCloseTo(RANGED.sound.headroom * 0.25, 9);
    expect(shotGain(1, 1, RANGED.sound.distanceRolloff)).toBeCloseTo(RANGED.sound.headroom / 2, 9);
  });

  it('bağlam ilk seste kurulur; tüfek gümleme, yay tel sesi üretir; ses 0 iken hiç kurulmaz', () => {
    const silent = new GunshotAudio({ current: { volume: 0 } as never }, () => {
      throw new Error('kurulmamalı');
    });
    silent.play('rifle');
    expect(silent.ready).toBe(false);

    const { ctx, created } = fakeAudioContext();
    const audio = new GunshotAudio({ current: { volume: 1 } as never }, () => ctx);
    audio.play('rifle');
    expect(audio.ready).toBe(true);
    expect(created).toContain('source');
    expect(created).toContain('osc');
    created.length = 0;
    audio.play('bow');
    expect(created.filter((k) => k === 'osc')).toHaveLength(1);
    audio.click();
    audio.dispose();
  });

  it('ses kurulamazsa sessizce devre dışı kalır', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const audio = new GunshotAudio({ current: { volume: 1 } as never }, () => {
      throw new Error('yok');
    });
    expect(() => audio.play('pistol')).not.toThrow();
    expect(() => audio.play('pistol')).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
