import { PICKPOCKETS } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { HitSource, HitTarget, TargetProvider } from '../combat/targets';
import type { Inventory, ItemStack } from '../items/Inventory';
import type { ItemId } from '../items/itemDefs';
import { createRandom, seedFrom, type Random } from '../utils/random';
import { yawTo } from './ai';

/**
 * Yankesiciler (Faz 11, 11.7; saf mantık, kinematik): il/ilçe merkezlerinde nadir doğar, oyuncuya selam verip yanaşır,
 * yanında bir an kalınca envanterden bir eşya (elde tutulan hariç; yığının yarısı) çalıp kaçar. Oyuncu yetişirse ya da
 * vurursa eşya geri gelir; kaçarsa eşya en yakın eşkıya kampının sandığına düşer. Camide yanaşmaz. Hedef sağlayıcısıdır
 * (`pickpocket:<id>`); vurulunca ölmez, eşyayı bırakıp kaçar.
 */

export interface PickpocketWorld {
  heightAt(x: number, z: number): number;
  /** Yürünebilir mi (deniz, uçurum, yapı içi değil)? */
  walkable(x: number, z: number): boolean;
  /** (x, z)'nin içinde bulunduğu yerleşimin rütbesi (yoksa null). */
  townRankAt(x: number, z: number): 'il' | 'ilce' | 'koy' | null;
}

export interface PickpocketContext {
  player: { x: number; z: number; alive: boolean; sanctuary: boolean };
  inventory: Inventory;
  /** Elde tutulan eşya (çalınmaz). */
  held: ItemId | null;
  /** Kaçan yankesicinin ganimetini en yakın kamp sandığına koyar; kamp kimliği (yoksa null). */
  deposit(items: readonly ItemStack[], x: number, z: number): number | null;
}

export type PickpocketState = 'approach' | 'flee' | 'leave';

export interface Pickpocket {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: PickpocketState;
  stateTime: number;
  /** Oyuncunun yanında geçen süre (çalma). */
  closeTime: number;
  carried: ItemStack | null;
  warned: boolean;
  speed: number;
  stride: number;
}

export const PICKPOCKET_TARGET_PREFIX = 'pickpocket:';
const NAMES = ['Sinsi Cemil', 'Hırsız Nuri', 'Çakal Sabri', 'Tilki Necmi'] as const;
/** Kaçışın ilk anı (sn): bu sürede yakalanmış sayılmaz. */
const FLEE_HEAD_START = 0.6;
/** Ayrılan yankesici bu uzaklıkta kaybolur (oyun m). */
const LEAVE_DISTANCE = 60;

export class PickpocketSystem implements TargetProvider {
  private readonly people = new Map<number, Pickpocket>();
  private readonly random: Random;
  private nextId = 1;
  private sinceCheck = 0;
  private enabledFlag = true;
  /** Kayıttan gelen, henüz sandığa konmamış çalıntı. */
  private pending: ItemStack[] = [];

  constructor(
    private readonly events: EventBus<GameEvents>,
    seed: number = PICKPOCKETS.seed,
  ) {
    this.random = createRandom(seed);
  }

  list(): readonly Pickpocket[] {
    return [...this.people.values()];
  }

  setEnabled(on: boolean): void {
    this.enabledFlag = on;
    if (!on) this.people.clear();
  }

  clear(): void {
    this.people.clear();
    this.sinceCheck = 0;
  }

  /** Test/dev: (x, z)'de bir yankesici doğurur. */
  spawnAt(x: number, z: number, world: PickpocketWorld): Pickpocket {
    const random = createRandom(seedFrom(PICKPOCKETS.seed, this.nextId));
    const p: Pickpocket = {
      id: this.nextId++,
      name: NAMES[Math.floor(random.next() * NAMES.length)]!,
      x,
      y: world.heightAt(x, z),
      z,
      yaw: 0,
      state: 'approach',
      stateTime: 0,
      closeTime: 0,
      carried: null,
      warned: false,
      speed: 0,
      stride: 0,
    };
    this.people.set(p.id, p);
    return p;
  }

  update(dt: number, ctx: PickpocketContext, world: PickpocketWorld): void {
    if (this.pending.length > 0) {
      ctx.deposit(this.pending, ctx.player.x, ctx.player.z);
      this.pending = [];
    }
    if (!this.enabledFlag) return;
    if (!ctx.player.alive) {
      this.people.clear();
      return;
    }
    this.sinceCheck += dt;
    if (this.sinceCheck >= PICKPOCKETS.spawnCheckSeconds) {
      this.sinceCheck = 0;
      this.trySpawn(ctx, world);
    }
    for (const p of [...this.people.values()]) this.step(p, dt, ctx, world);
  }

  private trySpawn(ctx: PickpocketContext, world: PickpocketWorld): void {
    if (this.people.size >= PICKPOCKETS.maxActive || ctx.player.sanctuary) return;
    const rank = world.townRankAt(ctx.player.x, ctx.player.z);
    if (rank !== 'il' && rank !== 'ilce') return;
    if (this.random.next() >= PICKPOCKETS.spawnChance) return;
    const [lo, hi] = PICKPOCKETS.spawnDistance;
    for (let k = 0; k < 10; k++) {
      const a = this.random.next() * Math.PI * 2;
      const r = lo + this.random.next() * (hi - lo);
      const x = ctx.player.x + Math.cos(a) * r;
      const z = ctx.player.z + Math.sin(a) * r;
      if (!world.walkable(x, z)) continue;
      this.spawnAt(x, z, world);
      return;
    }
  }

  private step(p: Pickpocket, dt: number, ctx: PickpocketContext, world: PickpocketWorld): void {
    p.stateTime += dt;
    const player = ctx.player;
    const dist = Math.hypot(player.x - p.x, player.z - p.z);
    const toPlayer = yawTo(p.x, p.z, player.x, player.z);
    switch (p.state) {
      case 'approach': {
        if (player.sanctuary || p.stateTime >= PICKPOCKETS.giveUpSeconds) {
          this.enter(p, 'leave');
          break;
        }
        if (!p.warned && dist <= PICKPOCKETS.greetDistance) {
          p.warned = true;
          this.events.emit('pickpocket:near', { id: p.id });
        }
        if (dist <= PICKPOCKETS.stealDistance) {
          p.closeTime += dt;
          p.yaw = toPlayer;
          p.speed = 0;
          if (p.closeTime >= PICKPOCKETS.stealSeconds) this.steal(p, ctx);
          break;
        }
        p.closeTime = 0;
        this.walk(p, toPlayer, PICKPOCKETS.walkSpeed, dt, world);
        break;
      }
      case 'flee': {
        // Çaldığı anda dibindedir: yakalanma ancak kaçış başladıktan sonra (oyuncu peşine düşünce) sayılır.
        if (p.stateTime >= FLEE_HEAD_START && dist <= PICKPOCKETS.catchDistance) {
          this.recover(p, ctx);
          break;
        }
        if (dist >= PICKPOCKETS.escapeDistance || p.stateTime >= PICKPOCKETS.escapeSeconds) {
          this.escape(p, ctx);
          break;
        }
        this.walk(p, toPlayer + Math.PI, PICKPOCKETS.runSpeed, dt, world);
        break;
      }
      case 'leave':
        if (dist >= LEAVE_DISTANCE) {
          this.people.delete(p.id);
          break;
        }
        this.walk(p, toPlayer + Math.PI, PICKPOCKETS.walkSpeed * 1.5, dt, world);
        break;
    }
  }

  /** Elde tutulan dışındaki bir yığının yarısını (en az 1) çalar; çalacak bir şey yoksa ayrılır. */
  private steal(p: Pickpocket, ctx: PickpocketContext): void {
    const choices = ctx.inventory.slots.filter(
      (s): s is ItemStack => s !== null && s.id !== ctx.held,
    );
    if (choices.length === 0) {
      this.enter(p, 'leave');
      return;
    }
    const pick = choices[Math.floor(this.random.next() * choices.length)]!;
    const count = Math.max(1, Math.ceil(pick.count / 2));
    if (!ctx.inventory.remove(pick.id, count)) {
      this.enter(p, 'leave');
      return;
    }
    p.carried = { id: pick.id, count };
    this.events.emit('pickpocket:stole', { id: p.id, item: pick.id, count });
    this.enter(p, 'flee');
  }

  /** Eşyayı geri verir (sığmayan kaybolur) ve ayrılır. */
  private recover(p: Pickpocket, ctx: PickpocketContext): void {
    const carried = p.carried;
    p.carried = null;
    if (carried) {
      const lost = ctx.inventory.add(carried.id, carried.count);
      this.events.emit('pickpocket:recovered', {
        id: p.id,
        item: carried.id,
        count: carried.count - lost,
        lost,
      });
    }
    this.enter(p, 'leave');
  }

  private escape(p: Pickpocket, ctx: PickpocketContext): void {
    if (p.carried) {
      const camp = ctx.deposit([p.carried], p.x, p.z);
      this.events.emit('pickpocket:escaped', {
        id: p.id,
        item: p.carried.id,
        count: p.carried.count,
        camp,
      });
    }
    this.people.delete(p.id);
  }

  private enter(p: Pickpocket, state: PickpocketState): void {
    p.state = state;
    p.stateTime = 0;
    p.closeTime = 0;
  }

  private walk(
    p: Pickpocket,
    heading: number,
    speed: number,
    dt: number,
    world: PickpocketWorld,
  ): void {
    const step = speed * dt;
    p.speed = 0;
    for (const offset of [0, 0.7, -0.7, 1.4, -1.4]) {
      const h = heading + offset;
      const nx = p.x - Math.sin(h) * step;
      const nz = p.z - Math.cos(h) * step;
      if (!world.walkable(nx, nz)) continue;
      p.x = nx;
      p.z = nz;
      p.y = world.heightAt(nx, nz);
      p.yaw = h;
      p.speed = speed;
      p.stride += step;
      return;
    }
  }

  // ── Hedef sağlayıcısı: vurulan yankesici eşyayı bırakıp kaçar ──

  private lastCtx: PickpocketContext | null = null;

  /** Vuruş için envanter bağlamı (Game her adımda verir). */
  bind(ctx: PickpocketContext): void {
    this.lastCtx = ctx;
  }

  targetsNear(x: number, z: number, r: number): HitTarget[] {
    return this.list()
      .filter((p) => Math.hypot(p.x - x, p.z - z) <= r + PICKPOCKETS.radius)
      .map((p) => ({
        id: `${PICKPOCKET_TARGET_PREFIX}${p.id}`,
        kind: 'bandit',
        x: p.x,
        y: p.y,
        z: p.z,
        radius: PICKPOCKETS.radius,
        height: PICKPOCKETS.height,
      }));
  }

  applyHit(id: string, _damage: number, _from: HitSource): void {
    if (!id.startsWith(PICKPOCKET_TARGET_PREFIX)) return;
    const p = this.people.get(Number(id.slice(PICKPOCKET_TARGET_PREFIX.length)));
    if (!p) return;
    if (p.carried && this.lastCtx) this.recover(p, this.lastCtx);
    else this.enter(p, 'leave');
  }

  // ── Kayıt: kaçan yankesicinin taşıdığı ──

  toSave(): ItemStack[] {
    const out: ItemStack[] = [];
    for (const p of this.people.values()) if (p.carried) out.push({ ...p.carried });
    return [...out, ...this.pending.map((s) => ({ ...s }))];
  }

  /** Kayıttaki çalıntı ilk adımda en yakın kamp sandığına konur (yankesiciler kayda girmez). */
  loadSave(stolen: readonly ItemStack[]): void {
    this.clear();
    this.pending = stolen.map((s) => ({ ...s }));
  }
}
