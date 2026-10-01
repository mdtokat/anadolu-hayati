import { describe, expect, it } from 'vitest';
import { resolveBuildInfo, type GitRunner } from '../scripts/buildInfo';
import { BUILD_INFO, UNKNOWN_BUILD, formatBuildInfo, shortCommit } from '../src/buildInfo';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const NOW = new Date('2026-10-01T19:20:30.000Z');

/** Sahte git: `rev-parse` ve `status` yanıtları. */
function git(head: string | null, status: string | null = ''): GitRunner {
  return (args) => (args[0] === 'rev-parse' ? head : status);
}

describe('resolveBuildInfo', () => {
  it('BUILD_COMMIT › git HEAD › GITHUB_SHA önceliği', () => {
    const env = { BUILD_COMMIT: SHA_A, GITHUB_SHA: SHA_C };
    expect(resolveBuildInfo('1.0.0', env, git(SHA_B), NOW).commit).toBe(SHA_A);
    expect(resolveBuildInfo('1.0.0', { GITHUB_SHA: SHA_C }, git(SHA_B), NOW).commit).toBe(SHA_B);
    expect(resolveBuildInfo('1.0.0', { GITHUB_SHA: SHA_C }, git(null), NOW).commit).toBe(SHA_C);
    expect(resolveBuildInfo('1.0.0', {}, git(null), NOW).commit).toBe('bilinmiyor');
  });

  it('SHA olmayan değerler yok sayılır', () => {
    expect(resolveBuildInfo('1.0.0', { BUILD_COMMIT: 'main' }, git(SHA_B), NOW).commit).toBe(SHA_B);
  });

  it('dirty: izlenen dosyada değişiklik varsa', () => {
    expect(resolveBuildInfo('1.0.0', {}, git(SHA_A, ''), NOW).dirty).toBe(false);
    expect(resolveBuildInfo('1.0.0', {}, git(SHA_A, ' M src/main.ts'), NOW).dirty).toBe(true);
    expect(resolveBuildInfo('1.0.0', {}, git(null, ' M x'), NOW).dirty).toBe(false);
  });

  it('sürüm ve ISO zaman damgası', () => {
    expect(resolveBuildInfo('1.2.3', {}, git(SHA_A), NOW)).toEqual({
      version: '1.2.3',
      commit: SHA_A,
      dirty: false,
      builtAt: '2026-10-01T19:20:30.000Z',
    });
  });
});

describe('formatBuildInfo', () => {
  it('kısa commit, değişiklik işareti ve UTC zaman', () => {
    expect(
      formatBuildInfo({
        version: '0.0.0',
        commit: SHA_A,
        dirty: false,
        builtAt: NOW.toISOString(),
      }),
    ).toBe('Sürüm 0.0.0 · aaaaaaa · 2026-10-01 19:20 UTC');
    expect(
      formatBuildInfo({ version: '0.0.0', commit: SHA_A, dirty: true, builtAt: NOW.toISOString() }),
    ).toBe('Sürüm 0.0.0 · aaaaaaa+ · 2026-10-01 19:20 UTC');
  });

  it('bilinmeyen derleme (Vitest: define yok)', () => {
    expect(BUILD_INFO).toEqual(UNKNOWN_BUILD);
    expect(formatBuildInfo(UNKNOWN_BUILD)).toBe('Sürüm 0.0.0 · bilinmiyor');
    expect(shortCommit('bilinmiyor')).toBe('bilinmiyor');
  });
});
