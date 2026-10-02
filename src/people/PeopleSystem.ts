import { PEOPLE } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRandom, seedFrom, type Random } from '../utils/random';
import { GREETINGS, personName, pickIdentity, type PersonRole } from './roles';

/** İnsanların arazi/yerleşim sorguları (`RegionWorld` + `SettlementMap` karşılar). */
export interface PeopleWorld {
  heightAt(x: number, z: number): number;
  /** Gerçek rakım (m; deniz ≤ 0). */
  elevationAt(x: number, z: number): number;
  slopeDegAt(x: number, z: number): number;
  /** En yakın yol (yoksa null): kenar uzaklığı ve yönü. */
  roadNear(x: number, z: number, radius: number): { edgeDistance: number; angle: number } | null;
  /** (x, z)'nin içinde bulunduğu yerleşimin rütbesi (yoksa null). */
  settlementRankAt(x: number, z: number): 'il' | 'ilce' | 'koy' | null;
  /** (x, z) bir yapının içinde mi (yürünemez)? */
  blocked(x: number, z: number): boolean;
}

export type PersonState = 'wander' | 'approach' | 'attend';

export interface Person {
  id: number;
  role: PersonRole;
  /** Görünen ad ("Çoban Hasan"). */
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: PersonState;
  /** Oyuncuya selam verdi mi (bir kez)? */
  greeted: boolean;
  /** Konuşma paneli açık: kişi durur ve oyuncuya bakar. */
  talking: boolean;
  /** Hediye (derviş) verildi mi? */
  gifted: boolean;
  /** Yürürken artan adım evresi (çizim: bacak salınımı). */
  stride: number;
  moving: boolean;
  age: number;
  target: { x: number; z: number } | null;
}

/** Oyuncu durumu (her adım). */
export interface PeoplePlayer {
  x: number;
  z: number;
  alive: boolean;
}

/**
 * Diğer insanlar (Faz 10; saf mantık, kinematik — Rapier'siz): çok nadir doğarlar (yol/yerleşim yakınında daha
 * sık), yürürler, oyuncuyu görünce yaklaşıp selam verirler (`person:greeted`), oyuncu yanındayken dururlar, uzaklaşınca
 * yollarına devam eder, uzakta ya da ömrü dolunca kaybolurlar. Kayda girmezler (canlılar gibi).
 */
export class PeopleSystem {
  private readonly people = new Map<number, Person>();
  private nextId = 1;
  private sinceCheck = 0;
  private readonly random: Random;

  constructor(
    private readonly events: EventBus<GameEvents>,
    seed: number = PEOPLE.seed,
  ) {
    this.random = createRandom(seed);
  }

  /** Şu an dünyadaki kişiler. */
  list(): readonly Person[] {
    return [...this.people.values()];
  }

  get(id: number): Person | null {
    return this.people.get(id) ?? null;
  }

  /** Tümünü kaldırır (yükleme/yeni oyun/ölüm). */
  clear(): void {
    this.people.clear();
    this.sinceCheck = 0;
  }

  /** Test/denge kancası: (x, z)'de belirli rolde kişi doğurur. */
  spawnAt(role: PersonRole, x: number, z: number, world: PeopleWorld): Person {
    const random = createRandom(seedFrom(PEOPLE.seed, this.nextId));
    const person: Person = {
      id: this.nextId++,
      role,
      name: personName(role, pickIdentity(random, role)),
      x,
      y: world.heightAt(x, z),
      z,
      yaw: random.next() * Math.PI * 2,
      state: 'wander',
      greeted: false,
      talking: false,
      gifted: false,
      stride: 0,
      moving: false,
      age: 0,
      target: null,
    };
    this.people.set(person.id, person);
    return person;
  }

  update(dt: number, player: PeoplePlayer, world: PeopleWorld): void {
    if (!player.alive) return;
    this.sinceCheck += dt;
    if (this.sinceCheck >= PEOPLE.spawnCheckSeconds) {
      this.sinceCheck = 0;
      this.trySpawn(player, world);
    }
    for (const person of [...this.people.values()]) {
      person.age += dt;
      const dx = player.x - person.x;
      const dz = player.z - person.z;
      const dist = Math.hypot(dx, dz);
      if (
        !person.talking &&
        (dist > PEOPLE.despawnDistance || person.age > PEOPLE.lifetimeSeconds)
      ) {
        // Ömrü dolan kişi ancak oyuncu yakınında değilken kaybolur.
        if (dist > PEOPLE.noticeDistance * 2) {
          this.people.delete(person.id);
          continue;
        }
      }
      this.think(person, dist, player);
      this.move(person, dt, player, world);
    }
  }

  private think(person: Person, dist: number, player: PeoplePlayer): void {
    if (person.talking) {
      person.state = 'attend';
      return;
    }
    if (person.state === 'wander' && !person.greeted && dist <= PEOPLE.noticeDistance) {
      person.state = 'approach';
    }
    if (person.state === 'approach' && dist <= PEOPLE.greetDistance) {
      person.state = 'attend';
      if (!person.greeted) {
        person.greeted = true;
        this.events.emit('person:greeted', {
          id: person.id,
          name: person.name,
          text: GREETINGS.salam,
        });
      }
    }
    if (person.state === 'attend' && dist > PEOPLE.partDistance) {
      person.state = 'wander';
      person.target = null;
    }
    if (person.state !== 'wander') person.target = { x: player.x, z: player.z };
  }

  private move(person: Person, dt: number, player: PeoplePlayer, world: PeopleWorld): void {
    if (person.state === 'attend') {
      person.moving = false;
      person.yaw = Math.atan2(-(player.x - person.x), -(player.z - person.z));
      return;
    }
    if (
      person.state === 'wander' &&
      (!person.target || Math.hypot(person.target.x - person.x, person.target.z - person.z) < 1.5)
    ) {
      person.target = this.wanderTarget(person, world);
    }
    const target = person.target;
    if (!target) {
      person.moving = false;
      return;
    }
    const dx = target.x - person.x;
    const dz = target.z - person.z;
    const len = Math.hypot(dx, dz);
    const stopAt = person.state === 'approach' ? PEOPLE.greetDistance * 0.8 : 0;
    if (len <= stopAt + 1e-3) {
      person.moving = false;
      return;
    }
    const step = Math.min(PEOPLE.walkSpeed * dt, len - stopAt);
    const nx = person.x + (dx / len) * step;
    const nz = person.z + (dz / len) * step;
    if (!walkable(world, nx, nz)) {
      // Önü kapalı (yapı, deniz, uçurum): yeni hedef seç (yaklaşırken durur).
      person.target = person.state === 'wander' ? this.wanderTarget(person, world) : null;
      person.moving = false;
      return;
    }
    person.x = nx;
    person.z = nz;
    person.y = world.heightAt(nx, nz);
    person.yaw = Math.atan2(-dx, -dz);
    person.stride += step;
    person.moving = true;
  }

  /** Yol yakınındaysa yol boyunca ileri, değilse çevrede rastgele yürünebilir nokta. */
  private wanderTarget(person: Person, world: PeopleWorld): { x: number; z: number } | null {
    const road = world.roadNear(person.x, person.z, PEOPLE.nearRoadDistance);
    for (let k = 0; k < 8; k++) {
      let angle: number;
      if (road && k < 4) {
        // Yol yönünde (iki yönden biri; mevcut bakışa yakın olanı tercih edilir).
        const forward = { x: -Math.sin(person.yaw), z: -Math.cos(person.yaw) };
        const along = { x: Math.cos(road.angle), z: Math.sin(road.angle) };
        const sign = along.x * forward.x + along.z * forward.z >= 0 ? 1 : -1;
        angle = Math.atan2(along.z * sign, along.x * sign) + (this.random.next() - 0.5) * 0.4;
      } else {
        angle = this.random.next() * Math.PI * 2;
      }
      const r = PEOPLE.wanderRadius * (0.5 + this.random.next() * 0.5);
      const x = person.x + Math.cos(angle) * r;
      const z = person.z + Math.sin(angle) * r;
      if (walkable(world, x, z)) return { x, z };
    }
    return null;
  }

  private trySpawn(player: PeoplePlayer, world: PeopleWorld): void {
    if (this.people.size >= PEOPLE.maxActive) return;
    const nearRoad = world.roadNear(player.x, player.z, PEOPLE.nearRoadDistance) !== null;
    const rank = world.settlementRankAt(player.x, player.z);
    const chance = nearRoad || rank !== null ? PEOPLE.spawnChanceNearRoads : PEOPLE.spawnChanceWild;
    if (this.random.next() >= chance) return;
    for (let k = 0; k < 10; k++) {
      const angle = this.random.next() * Math.PI * 2;
      const r =
        PEOPLE.spawnMinDistance +
        this.random.next() * (PEOPLE.spawnMaxDistance - PEOPLE.spawnMinDistance);
      const x = player.x + Math.cos(angle) * r;
      const z = player.z + Math.sin(angle) * r;
      if (!walkable(world, x, z)) continue;
      this.spawnAt(this.pickRole(world, x, z), x, z, world);
      return;
    }
  }

  /** Bağlama göre rol: köyde teyze/çoban, yolda yolcu/derviş/çoban, ormanda oduncu/çoban. */
  private pickRole(world: PeopleWorld, x: number, z: number): PersonRole {
    const roll = this.random.next();
    const rank = world.settlementRankAt(x, z);
    if (rank === 'koy') return roll < 0.55 ? 'yasli' : 'coban';
    if (rank !== null || world.roadNear(x, z, PEOPLE.nearRoadDistance)) {
      return roll < 0.6 ? 'yolcu' : roll < 0.75 ? 'dervis' : 'coban';
    }
    return roll < 0.6 ? 'oduncu' : 'coban';
  }
}

function walkable(world: PeopleWorld, x: number, z: number): boolean {
  return (
    world.elevationAt(x, z) > 1 &&
    world.slopeDegAt(x, z) <= PEOPLE.maxSlopeDeg &&
    !world.blocked(x, z)
  );
}

/** Oyuncunun konuşabileceği kişi: `talkReach` içinde ve bakış konisinde, en yakın. */
export function personInView(
  people: readonly Person[],
  pose: { x: number; z: number; yaw: number },
): Person | null {
  const fx = -Math.sin(pose.yaw);
  const fz = -Math.cos(pose.yaw);
  const cone = Math.cos((PEOPLE.talkConeDeg * Math.PI) / 180);
  let best: Person | null = null;
  let bestD = Infinity;
  for (const p of people) {
    const dx = p.x - pose.x;
    const dz = p.z - pose.z;
    const d = Math.hypot(dx, dz);
    if (d > PEOPLE.talkReach || d < 1e-6) continue;
    if ((dx * fx + dz * fz) / d < cone) continue;
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
