/**
 * Derleme kimliği: hangi sürümün/commit'in oynandığı (elle doğrulama sonuçlarını derlemeyle
 * eşleştirmek için). Değer derlemede `vite.config.ts` → `define` ile gömülür (`scripts/buildInfo.ts`
 * üretir); Vitest gibi `define` uygulanmayan ortamlarda `UNKNOWN_BUILD` kullanılır.
 */
export interface BuildInfo {
  /** `package.json` sürümü. */
  version: string;
  /** Commit SHA'sı (40 hane) ya da bilinmiyorsa `'bilinmiyor'`. */
  commit: string;
  /** Derleme anında çalışma ağacında commit edilmemiş değişiklik vardı. */
  dirty: boolean;
  /** Derleme zamanı (ISO 8601, UTC); bilinmiyorsa boş. */
  builtAt: string;
}

declare const __BUILD_INFO__: BuildInfo | undefined;

export const UNKNOWN_BUILD: BuildInfo = {
  version: '0.0.0',
  commit: 'bilinmiyor',
  dirty: false,
  builtAt: '',
};

export const BUILD_INFO: BuildInfo =
  typeof __BUILD_INFO__ === 'undefined' ? UNKNOWN_BUILD : __BUILD_INFO__;

/** Kısa commit (7 hane); SHA değilse olduğu gibi. */
export function shortCommit(commit: string): string {
  return /^[0-9a-f]{40}$/.test(commit) ? commit.slice(0, 7) : commit;
}

/** "Sürüm 0.0.0 · a1b2c3d · 2026-10-01 19:20 UTC" (yerel değişiklik varsa commit'e "+" eklenir). */
export function formatBuildInfo(info: BuildInfo): string {
  const parts = [`Sürüm ${info.version}`, `${shortCommit(info.commit)}${info.dirty ? '+' : ''}`];
  const at = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(info.builtAt);
  if (at) parts.push(`${at[1]} ${at[2]} UTC`);
  return parts.join(' · ');
}
