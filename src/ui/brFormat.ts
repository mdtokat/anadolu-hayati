import type { Adjacency } from '../battleRoyale/area';
import { addableProvinces, canRemoveProvince } from '../battleRoyale/area';
import type { BrDifficulty, BrDuration, BrSetup } from '../battleRoyale/kinds';
import type { BrResult } from '../battleRoyale/match';
import type { ZoneState } from '../battleRoyale/zone';
import type { GameEvents } from '../core/events';
import type { ProvinceShape } from '../data/region';
import { ITEMS, isItemId } from '../items/itemDefs';
import { formatSurvivedTime } from './survivalFormat';

/**
 * Battle Royale arayüz metinleri ve görünüm modelleri (saf; BR.6): HUD satırı, bölge durumu, öldürme listesi
 * cümleleri, sonuç başlığı, kurulum ekranının il düğmeleri ve harita yolları.
 */

/** Saniyeyi "1:05" biçiminde yazar (negatif 0). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Bölge satırı: aşama sayacı ve (dışarıdaysa) güvenli bölgeye uzaklık. */
export function zoneStatusText(zone: ZoneState, now: number, outsideBy: number): string {
  let text: string;
  if (zone.stage === 'closed') text = 'Bölge kapandı';
  else if (zone.stage === 'wait')
    text = `Bölge ${formatClock(zone.stageEnds - now)} sonra daralıyor`;
  else text = `Bölge daralıyor ${formatClock(zone.stageEnds - now)}`;
  if (outsideBy > 0.5) text += ` · Güvenli bölgeye ${Math.round(outsideBy)} m`;
  return text;
}

/** HUD özet satırı: kalan ve öldürme. */
export function aliveText(alive: number, kills: number): string {
  return `Kalan ${alive} · Öldürme ${kills}`;
}

const VOWELS = 'aeıioöuü';
const BACK = 'aıou';
const ROUND = 'ouöü';

/** Türkçe belirtme (-i) hâli eki: "Yılmaz" → "Yılmaz'ı", "Kaya" → "Kaya'yı", "Öztürk" → "Öztürk'ü". */
export function turkishAccusative(name: string): string {
  const chars = [...name.toLocaleLowerCase('tr')];
  const last = [...chars].reverse().find((c) => VOWELS.includes(c)) ?? 'e';
  const back = BACK.includes(last);
  const round = ROUND.includes(last);
  const suffix = back ? (round ? 'u' : 'ı') : round ? 'ü' : 'i';
  const buffer = VOWELS.includes(chars.at(-1) ?? '') ? 'y' : '';
  return `${name}'${buffer}${suffix}`;
}

function weaponName(weapon: string | null): string | null {
  return weapon && isItemId(weapon) ? ITEMS[weapon].name : null;
}

/** Öldürme listesi satırı (oyuncu "sen" diye anılır). */
export function killFeedText(e: GameEvents['br:eliminated']): string {
  const weapon = weaponName(e.weapon);
  const tail = weapon ? ` (${weapon})` : '';
  if (e.cause === 'kill' && e.killer) {
    if (e.byPlayer) return `${turkishAccusative(e.victim)} alt ettin${tail}`;
    if (e.player) return `${e.killer} seni alt etti${tail}`;
    return `${e.killer}, ${turkishAccusative(e.victim)} alt etti${tail}`;
  }
  if (e.cause === 'zone') return e.player ? 'Bölgede kaldın' : `${e.victim} bölgede kaldı`;
  if (e.cause === 'animal')
    return e.player ? 'Vahşi hayvan seni öldürdü' : `${e.victim} hayvana yem oldu`;
  return e.player ? 'Elendin' : `${e.victim} elendi`;
}

/** Aşama bildirimi. */
export function phaseNoticeText(e: GameEvents['br:phase']): string {
  return e.shrinking
    ? 'Güvenli bölge daralıyor!'
    : `Yeni güvenli bölge belirlendi (${e.phase + 1}. aşama)`;
}

/** Sonuç ekranının başlığı ve alt satırları. */
export function resultLines(r: BrResult): { title: string; lines: Array<[string, string]> } {
  const title = r.placement === 1 ? 'Son Kalan Sensin!' : `#${r.placement} / ${r.total}`;
  const lines: Array<[string, string]> = [
    ['Sıra', `${r.placement} / ${r.total}`],
    ['Öldürme', String(r.kills)],
    ['Hayatta kalınan süre', formatSurvivedTime(r.survived)],
  ];
  if (r.placement !== 1) lines.push(['Kazanan', r.winner?.name ?? '—']);
  if (r.topNpc) lines.push(['En çok öldüren', `${r.topNpc.name} (${r.topNpc.kills})`]);
  return { title, lines };
}

export const DURATION_LABELS: Readonly<Record<BrDuration, string>> = {
  short: 'Kısa',
  medium: 'Orta',
  long: 'Uzun',
};

export const DIFFICULTY_LABELS: Readonly<Record<BrDifficulty, string>> = {
  easy: 'Kolay',
  normal: 'Normal',
  hard: 'Zor',
};

/** Kurulum özeti (ör. "Zonguldak, Bartın · 24 kişi · Orta · Normal"). */
export function setupSummary(setup: BrSetup): string {
  const area = setup.area.kind === 'world' ? 'Tüm harita' : setup.area.names.join(', ');
  return `${area} · ${setup.players} kişi · ${DURATION_LABELS[setup.duration]} · ${DIFFICULTY_LABELS[setup.difficulty]}`;
}

/**
 * İl düğmesinin durumu: `selected` seçili (çıkarılabilir), `locked` seçili ama çıkarılırsa seçim ikiye bölünür,
 * `addable` eklenebilir (seçime komşu ya da seçim boş), `blocked` eklenemez (komşu değil).
 */
export type ProvinceButtonState = 'selected' | 'locked' | 'addable' | 'blocked';

export function provinceButtonStates(
  names: readonly string[],
  selection: readonly string[],
  adjacency: Adjacency,
): Array<{ name: string; state: ProvinceButtonState }> {
  const addable = new Set(addableProvinces(selection, adjacency));
  return names.map((name) => {
    if (selection.includes(name)) {
      return {
        name,
        state: canRemoveProvince(selection, name, adjacency) ? 'selected' : 'locked',
      };
    }
    return { name, state: addable.has(name) ? 'addable' : 'blocked' };
  });
}

/** SVG çizimi için il yolları ve görünüm kutusu (oyun X/Z doğrudan SVG x/y; kuzey yukarı = −Z yukarı). */
export interface MapPaths {
  viewBox: { x: number; y: number; w: number; h: number };
  /** Görünüm kutusunun en uzun kenarı (yazı/çizgi ölçeği için). */
  span: number;
  provinces: Array<{ name: string; d: string; cx: number; cz: number }>;
}

export function provinceMapPaths(provinces: readonly ProvinceShape[], pad = 60): MapPaths {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const out: MapPaths['provinces'] = [];
  for (const p of provinces) {
    minX = Math.min(minX, p.bounds.minX);
    minZ = Math.min(minZ, p.bounds.minZ);
    maxX = Math.max(maxX, p.bounds.maxX);
    maxZ = Math.max(maxZ, p.bounds.maxZ);
    const parts: string[] = [];
    let biggest = 0;
    let cx = (p.bounds.minX + p.bounds.maxX) / 2;
    let cz = (p.bounds.minZ + p.bounds.maxZ) / 2;
    for (const polygon of p.polygons) {
      const outer = polygon[0];
      // Etiket: en büyük parçanın köşe ortalaması (adalar etiketi çekmesin).
      if (outer && outer.length > biggest) {
        biggest = outer.length;
        let sx = 0;
        let sz = 0;
        for (let i = 0; i < outer.length; i += 2) {
          sx += outer[i]!;
          sz += outer[i + 1]!;
        }
        cx = sx / (outer.length / 2);
        cz = sz / (outer.length / 2);
      }
      for (const ring of polygon) {
        let d = '';
        for (let i = 0; i < ring.length; i += 2) {
          d += `${i === 0 ? 'M' : 'L'}${Math.round(ring[i]!)} ${Math.round(ring[i + 1]!)}`;
        }
        parts.push(`${d}Z`);
      }
    }
    out.push({ name: p.name, d: parts.join(''), cx, cz });
  }
  const w = maxX - minX + 2 * pad;
  const h = maxZ - minZ + 2 * pad;
  return { viewBox: { x: minX - pad, y: minZ - pad, w, h }, span: Math.max(w, h), provinces: out };
}

/** Kurulumun tarayıcıda saklanan anahtarı (değiştirilmemeli; kayıtla ilgisi yok). */
export const BR_SETUP_STORAGE_KEY = 'anadolu-hayati.br-setup';
