/**
 * Faz 11 ortak sözleşmesi (docs/faz-11-paralel-plan.md §3.4): menzilli atışın vurabileceği hedefler. Saf mantık;
 * her sistem (canlılar 11.0, eşkıyalar E, drone F, oyuncu 11.0) kendi hedeflerini bir `TargetProvider` ile verir,
 * atış (`combat/ranged.ts` `fireShot`) hedefleri buradan sorgular. İmza değişmez; değişmesi gerekirse önce kullanıcıya
 * sorulur.
 */

/** Hedef türü. `player`: eşkıyaların ateş ettiği oyuncu (11.0 sağlayıcısı `playerTargetProvider`). */
export type HitTargetKind = 'creature' | 'bandit' | 'drone' | 'player';

/** Vurulabilir hedef: dikey silindir (ayak y'den `height` yukarı, yatay `radius`). */
export interface HitTarget {
  /** Sağlayıcılar arasında tekil kimlik (ör. `creature:123`, `bandit:7`, `player`). */
  id: string;
  kind: HitTargetKind;
  /** Ayak/zemin konumu (oyun m). */
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

/** İsabetin kaynağı: geri tepme/kaçış yönü ve olay yükleri için. */
export interface HitSource {
  x: number;
  y: number;
  z: number;
  /** Atan: oyuncu, eşkıya (kimliğiyle) ya da başka. */
  by: 'player' | 'bandit' | 'other';
  /** Silah kimliği (eşya kimliği ya da `fist`); bilinmiyorsa boş. */
  weapon?: string;
  /** Atan eşkıyanın kimliği (`by: 'bandit'`; Battle Royale'de öldüreni bulmak için). */
  attacker?: number;
}

/** Hedef sağlayıcısı: yakındaki hedefleri verir, isabeti uygular. */
export interface TargetProvider {
  /** (x, z)'ye yatay `r` içindeki hedefler (sıra önemsiz). */
  targetsNear(x: number, z: number, r: number): HitTarget[];
  /** Hedefe `damage` hasar uygular (hedef bu sağlayıcının değilse ya da yoksa hiçbir şey yapmaz). */
  applyHit(id: string, damage: number, from: HitSource): void;
}

/**
 * Birden çok sağlayıcıyı tek sağlayıcı gibi sunar (`Game` canlıları, oyuncuyu, eşkıyaları ve drone'u buraya kaydeder).
 * İsabet, hedefi veren sağlayıcıya yönlenir (kimlik ön ekiyle değil, son sorgudan bağımsız: her sağlayıcıya sorulur).
 */
export class TargetRegistry implements TargetProvider {
  private readonly providers: TargetProvider[] = [];

  /** Sağlayıcı ekler; kaldırmak için dönen işlevi çağır. */
  register(provider: TargetProvider): () => void {
    this.providers.push(provider);
    return () => {
      const index = this.providers.indexOf(provider);
      if (index >= 0) this.providers.splice(index, 1);
    };
  }

  targetsNear(x: number, z: number, r: number): HitTarget[] {
    const out: HitTarget[] = [];
    for (const provider of this.providers) out.push(...provider.targetsNear(x, z, r));
    return out;
  }

  applyHit(id: string, damage: number, from: HitSource): void {
    for (const provider of this.providers) provider.applyHit(id, damage, from);
  }
}

/** Kimlik ön ekleri (sağlayıcılar kendi hedeflerini tanır). */
export const CREATURE_TARGET_PREFIX = 'creature:';
export const PLAYER_TARGET_ID = 'player';

/** Canlı simülasyonunun hedef olarak gördüğü kısmı (`CreatureSystem`; test sahtesi de olabilir). */
export interface CreatureTargetSource {
  near(
    x: number,
    z: number,
    radius: number,
  ): ReadonlyArray<{
    id: number;
    x: number;
    y: number;
    z: number;
    radius: number;
    height: number;
    dead: boolean;
  }>;
  damage(id: number, amount: number, from: { x: number; z: number }): unknown;
}

/** Canlıların hedef sağlayıcısı (11.0): yaşayan canlılar vurulur; leşler hedef değildir. */
export function creatureTargetProvider(creatures: CreatureTargetSource): TargetProvider {
  return {
    targetsNear(x, z, r) {
      const out: HitTarget[] = [];
      // Canlının yarıçapı da sayılsın diye arama biraz geniş tutulur.
      for (const view of creatures.near(x, z, r + 2)) {
        if (view.dead) continue;
        out.push({
          id: `${CREATURE_TARGET_PREFIX}${view.id}`,
          kind: 'creature',
          x: view.x,
          y: view.y,
          z: view.z,
          radius: view.radius,
          height: view.height,
        });
      }
      return out;
    },
    applyHit(id, damage, from) {
      if (!id.startsWith(CREATURE_TARGET_PREFIX)) return;
      const creatureId = Number(id.slice(CREATURE_TARGET_PREFIX.length));
      if (Number.isInteger(creatureId)) creatures.damage(creatureId, damage, from);
    },
  };
}

/** Oyuncu hedefi için gereken bilgiler (Game sağlar). */
export interface PlayerTargetSource {
  /** Ayak konumu; ölüyse null (hedef değildir). */
  position(): { x: number; y: number; z: number } | null;
  /** Gövde yarıçapı ve boyu (oyun m). */
  radius: number;
  height: number;
  /** Hasarı uygular (savunma, dokunulmazlık hasar sisteminde). */
  damage(amount: number, from: HitSource): void;
}

/** Oyuncunun hedef sağlayıcısı (11.0): eşkıyalar oyuncuya bu hedefle ateş eder. */
export function playerTargetProvider(player: PlayerTargetSource): TargetProvider {
  return {
    targetsNear(x, z, r) {
      const p = player.position();
      if (!p || Math.hypot(p.x - x, p.z - z) > r + player.radius) return [];
      return [
        {
          id: PLAYER_TARGET_ID,
          kind: 'player',
          x: p.x,
          y: p.y,
          z: p.z,
          radius: player.radius,
          height: player.height,
        },
      ];
    },
    applyHit(id, damage, from) {
      if (id === PLAYER_TARGET_ID && player.position() !== null) player.damage(damage, from);
    },
  };
}
