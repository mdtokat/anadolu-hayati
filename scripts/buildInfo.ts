import { execFileSync } from 'node:child_process';
import type { BuildInfo } from '../src/buildInfo.ts';

/** Git komutu çalıştırır; git yoksa ya da depo değilse null. */
export type GitRunner = (args: string[]) => string | null;

const runGit: GitRunner = (args) => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

/**
 * Derleme kimliğini toplar. Commit önceliği: `BUILD_COMMIT` ortam değişkeni (Pages yayını,
 * `workflow_run` olayında `GITHUB_SHA` dal ucunu gösterdiği için açıkça verir) › `git rev-parse HEAD`
 * › `GITHUB_SHA` › "bilinmiyor".
 */
export function resolveBuildInfo(
  version: string,
  env: Record<string, string | undefined> = process.env,
  git: GitRunner = runGit,
  now: Date = new Date(),
): BuildInfo {
  const sha = (value: string | null | undefined): string | null =>
    value && /^[0-9a-f]{40}$/.test(value) ? value : null;
  const head = sha(env.BUILD_COMMIT) ?? sha(git(['rev-parse', 'HEAD'])) ?? sha(env.GITHUB_SHA);
  // Yalnızca izlenen dosyalar: derleme çıktısı/yerel önbellekler "değişiklik" sayılmasın.
  const status = head ? git(['status', '--porcelain', '--untracked-files=no']) : null;
  return {
    version,
    commit: head ?? 'bilinmiyor',
    dirty: status !== null && status.length > 0,
    builtAt: now.toISOString(),
  };
}
