import { RANGED } from '../config';
import type { WeaponId } from '../items/weaponState';
import {
  pitchUp,
  spreadDirection,
  traceProjectile,
  zeroElevation,
  type PaneQuery,
  type SolidQuery,
  type Vec3Like,
} from './ballistics';
import type { HitTarget, TargetProvider } from './targets';

export { rayCylinder, rayTerrain, type Vec3Like } from './ballistics';

/**
 * Menzilli atış (Faz 11 ortak sözleşmesi, docs/faz-11-paralel-plan.md §3.4; gerçek uygulama 11.5). Mermi silahın
 * çıkış hızıyla `dir` yönünde fırlar, yerçekimiyle düşer (`combat/ballistics.ts` `traceProjectile`), ilk engelde
 * (hedef silindiri, katı kutu, arazi) ya da silahın menzilinde durur: arazinin ya da duvarın arkasındaki hedef
 * vurulmaz. **İmza 11.0'dakiyle aynıdır**; `ShotContext`/`ShotResult`'a yalnızca isteğe bağlı alanlar eklendi.
 * Hasarı uygulamaz: çağıran, dönen hedefe `TargetProvider.applyHit` ile hasar verir (eşkıya oyuncuya da hayvana da
 * böyle ateş eder). Saçma (birden çok tane) için `fireVolley`.
 */

/** Atışın dünyadan istediği. */
export interface ShotContext {
  /** Arazi yüksekliği (oyun m). */
  heightAt(x: number, z: number): number;
  /** Vurulabilir hedefler. */
  targets: Pick<TargetProvider, 'targetsNear'>;
  /** Vurulmayacak hedef kimliği (atanın kendisi; ör. `bandit:7`, `player`). */
  ignore?: string;
  /** Menzil üst sınırı (oyun m); verilmezse silahın `RANGED.weapons[...].range`'i. */
  range?: number;
  /** 11.5: mermiyi durduran katılar (oyuncu yapıları, binalar; `combat/shotSolids.ts`). Yoksa yalnız arazi durdurur. */
  solids?: SolidQuery;
  /** Kırılabilir pencere camları (`combat/shotSolids.ts` `shotPanes`): mermi geçer, cam kırılır. */
  panes?: PaneQuery;
  /**
   * 11.5: saçılma için [0, 1) rastgele üreteci. Verilmezse atış saçılmasızdır (deterministik; yön tam `dir`).
   * Eşkıyalar kendi isabetsizliklerini `spreadScale` ile verebilir.
   */
  random?: () => number;
  /** 11.5: silahın `spreadDeg`'inin çarpanı (nişan, hareket; varsayılan 1). `random` yoksa etkisizdir. */
  spreadScale?: number;
  /**
   * 11.5: `dir` nişangâh çizgisi mi? true ise namlu silahın `zeroMeters` uzaklığına sıfırlanır (mermi o uzaklıkta
   * nişangâha düşer). Varsayılan false: mermi tam `dir` yönünde fırlar (eşkıya, test).
   */
  sighted?: boolean;
}

export interface ShotResult {
  /** İsabet edilen hedef (yoksa null). */
  hit: HitTarget | null;
  /** Merminin durduğu nokta (isabet, arazi, katı ya da menzil sonu). */
  point: Vec3Like;
  /** Mermi yolunun uzunluğu (oyun m; `origin`'den `point`'e). */
  distance: number;
  /** Mermi araziye mi gömüldü? */
  terrain: boolean;
  /** 11.5: mermi bir katıya (duvar, yapı) mı çarptı? */
  solid?: boolean;
  /** 11.5: uçuş süresi (sn). */
  time?: number;
  /** 11.5: yolun köşe noktaları (iz çizimi). */
  path?: Vec3Like[];
  /** Merminin kırdığı camlar (kimlikler). */
  panes?: number[];
}

/** `origin`'den `dir` yönünde (normalize edilir) `weapon` ile tek atış (saçmada tek tane). */
export function fireShot(
  origin: Vec3Like,
  dir: Vec3Like,
  weapon: WeaponId,
  ctx: ShotContext,
): ShotResult {
  const stats = RANGED.weapons[weapon];
  const length = Math.hypot(dir.x, dir.y, dir.z);
  const range = ctx.range ?? stats.range;
  if (!(length > 0) || !(range > 0)) {
    return { hit: null, point: { ...origin }, distance: 0, terrain: false, solid: false, time: 0 };
  }
  const gravity = RANGED.gravity * stats.gravity;
  let d: Vec3Like = { x: dir.x / length, y: dir.y / length, z: dir.z / length };
  if (ctx.sighted) d = pitchUp(d, zeroElevation(stats.speed, gravity, stats.zeroMeters));
  if (ctx.random) d = spreadDirection(d, stats.spreadDeg * (ctx.spreadScale ?? 1), ctx.random);
  const flight = traceProjectile(
    {
      origin,
      velocity: { x: d.x * stats.speed, y: d.y * stats.speed, z: d.z * stats.speed },
      gravity,
      maxDistance: range,
    },
    {
      heightAt: ctx.heightAt,
      targets: ctx.targets,
      ignore: ctx.ignore,
      solids: ctx.solids,
      panes: ctx.panes,
    },
  );
  return {
    hit: flight.hit,
    point: flight.point,
    distance: flight.distance,
    terrain: flight.terrain,
    solid: flight.solid,
    time: flight.time,
    path: flight.path,
    panes: flight.panes,
  };
}

/** Silahın bütün taneleri (`RANGED.weapons[weapon].pellets`; tüfekte 1, saçmada 8): her tane ayrı saçılır. */
export function fireVolley(
  origin: Vec3Like,
  dir: Vec3Like,
  weapon: WeaponId,
  ctx: ShotContext,
): ShotResult[] {
  const out: ShotResult[] = [];
  for (let i = 0; i < RANGED.weapons[weapon].pellets; i++) {
    out.push(fireShot(origin, dir, weapon, ctx));
  }
  return out;
}
