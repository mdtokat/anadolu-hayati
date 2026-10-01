import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmbientAudio } from '../src/audio/AmbientAudio';
import type { AmbientGraph } from '../src/audio/ambientGraph';
import { SILENT, type AmbientLevels } from '../src/audio/ambientMix';
import { AMBIENT } from '../src/config';
import { SettingsStore } from '../src/settings/SettingsStore';

/** Yalnızca denetleyicinin kullandığı yüzeyi taklit eden sahte ses bağlamı. */
function fakeContext() {
  const master = { gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn() };
  const ctx = {
    state: 'suspended' as 'suspended' | 'running' | 'closed',
    currentTime: 0,
    destination: {},
    createGain: vi.fn(() => master),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    suspend: vi.fn(async () => {
      ctx.state = 'suspended';
    }),
    close: vi.fn(async () => {
      ctx.state = 'closed';
    }),
  };
  return { ctx, master };
}

function fakeGraph() {
  const graph: AmbientGraph & { levels: AmbientLevels[] } = {
    levels: [],
    setLevels: vi.fn((l: Readonly<AmbientLevels>) => void graph.levels.push({ ...l })),
    chirp: vi.fn(),
    hoot: vi.fn(),
    dispose: vi.fn(),
  };
  return graph;
}

function setup(volume = 0.7) {
  const settings = new SettingsStore(null);
  settings.update({ volume });
  const { ctx, master } = fakeContext();
  const graph = fakeGraph();
  const factory = vi.fn(() => ctx as unknown as AudioContext);
  const build = vi.fn(() => graph);
  const rand = { value: 0.5 };
  const audio = new AmbientAudio(settings, factory, () => rand.value, build);
  return { settings, ctx, master, graph, factory, build, audio, rand };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('AmbientAudio: yaşam döngüsü', () => {
  it('oyuna girilmeden ses bağlamı kurulmaz (otomatik ses politikası)', () => {
    const { factory } = setup();
    expect(factory).not.toHaveBeenCalled();
  });

  it('start bağlamı kurur, grafiği bağlar ve sürdürür; ana kazanç karesel eğridir', () => {
    const { audio, factory, build, ctx, master } = setup(0.5);
    audio.start();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalled();
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(
      AMBIENT.headroom * 0.5 * 0.5,
      0,
      expect.any(Number),
    );
  });

  it('stop bağlamı askıya alır; yeniden start aynı bağlamı sürdürür (yeniden kurmaz)', async () => {
    const { audio, factory, ctx } = setup();
    audio.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.state).toBe('running');
    audio.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.suspend).toHaveBeenCalled();
    audio.start();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it('ses seviyesi 0 iken bağlam hiç kurulmaz; sonradan açılınca (oyun akıyorsa) kurulur', () => {
    const { audio, settings, factory } = setup(0);
    audio.start();
    expect(factory).not.toHaveBeenCalled();
    settings.update({ volume: 0.4 });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('oyun akarken sesi kapatmak bağlamı askıya alır, açmak sürdürür', async () => {
    const { audio, settings, ctx } = setup();
    audio.start();
    await vi.advanceTimersByTimeAsync(0);
    settings.update({ volume: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.suspend).toHaveBeenCalled();
    settings.update({ volume: 0.6 });
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it('duraklatılmışken ses ayarı değişse de bağlam sürdürülmez', async () => {
    const { audio, settings, ctx, factory } = setup();
    audio.start();
    audio.stop();
    await vi.advanceTimersByTimeAsync(0);
    ctx.resume.mockClear();
    settings.update({ volume: 0.9 });
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('dispose grafiği ve bağlamı kapatır, aboneliği bırakır', async () => {
    const { audio, settings, ctx, graph, factory } = setup();
    audio.start();
    audio.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(graph.dispose).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
    settings.update({ volume: 0.2 });
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('AmbientAudio: dayanıklılık', () => {
  it('ses desteği yoksa (factory null) sessizce devre dışı kalır', () => {
    const settings = new SettingsStore(null);
    const audio = new AmbientAudio(settings, null);
    expect(() => {
      audio.start();
      audio.setLevels({ ...SILENT, wind: 1 });
      audio.stop();
      audio.dispose();
    }).not.toThrow();
  });

  it('bağlam kurulurken hata olursa oyun etkilenmez ve yeniden denenmez', () => {
    const settings = new SettingsStore(null);
    const factory = vi.fn(() => {
      throw new Error('ses aygıtı yok');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const audio = new AmbientAudio(settings, factory);
    expect(() => audio.start()).not.toThrow();
    audio.stop();
    audio.start();
    expect(factory).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('AmbientAudio: seviyeler ve olaylar', () => {
  it('setLevels çalışırken grafiğe iletilir; başlamadan önce saklanır ve start ile uygulanır', () => {
    const { audio, graph } = setup();
    const levels = { ...SILENT, wind: 0.8, sea: 0.4 };
    audio.setLevels(levels);
    expect(graph.setLevels).not.toHaveBeenCalled();
    expect(audio.currentLevels).toEqual(levels);
    audio.start();
    expect(graph.levels.at(-1)).toEqual(levels);
    audio.setLevels({ ...SILENT, wind: 0.1 });
    expect(graph.levels.at(-1)).toEqual({ ...SILENT, wind: 0.1 });
  });

  it('kuş seviyesi yüksek ve zar uygunsa kuş öter; sessiz ortamda olay çıkmaz', () => {
    const { audio, graph, rand } = setup();
    audio.start();
    rand.value = 0; // her zar "tuttu"
    audio.setLevels(SILENT);
    vi.advanceTimersByTime(AMBIENT.eventTickMs * 5);
    expect(graph.chirp).not.toHaveBeenCalled();
    expect(graph.hoot).not.toHaveBeenCalled();

    audio.setLevels({ ...SILENT, birds: 1, night: 1, leaves: 1 });
    vi.advanceTimersByTime(AMBIENT.eventTickMs * 5);
    expect(graph.chirp).toHaveBeenCalledTimes(5);
    expect(graph.hoot).toHaveBeenCalledTimes(5);
  });

  it('zar tutmazsa olay çıkmaz; duraklatınca zamanlayıcı durur', () => {
    const { audio, graph, rand } = setup();
    audio.start();
    audio.setLevels({ ...SILENT, birds: 1 });
    rand.value = 0.999;
    vi.advanceTimersByTime(AMBIENT.eventTickMs * 10);
    expect(graph.chirp).not.toHaveBeenCalled();
    rand.value = 0;
    audio.stop();
    vi.advanceTimersByTime(AMBIENT.eventTickMs * 10);
    expect(graph.chirp).not.toHaveBeenCalled();
  });
});
