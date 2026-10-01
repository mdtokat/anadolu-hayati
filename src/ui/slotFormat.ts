import { formatClock } from '../survival/clock';
import type { SaveSummary } from '../save/saveGame';
import type { SlotState } from '../save/SaveStore';

/** Kayıt zamanı: "1 Eki 2026 09:30" (yerel saat; `timeZone` yalnızca testte verilir). */
export function formatSavedAt(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(date);
}

/** Oyun içi özet: "Gün 4 · 14:15 · Can %80". */
export function formatSummary(summary: SaveSummary): string {
  return `Gün ${summary.day} · ${formatClock(summary.hour)} · Can %${Math.round(summary.health)}`;
}

/** Yuva satırının açıklaması (boş, dolu ya da okunamayan). */
export function formatSlotInfo(state: SlotState, timeZone?: string): string {
  switch (state.status) {
    case 'empty':
      return 'Boş';
    case 'ok':
      return `${formatSummary(state.summary)} · ${formatSavedAt(state.summary.savedAt, timeZone)}`;
    case 'corrupt':
      return `Okunamıyor: ${state.message}`;
  }
}
