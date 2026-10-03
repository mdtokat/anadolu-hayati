import { el } from './widgets';

/**
 * Envanter slotları için sürükle-bırak (işaretçi tabanlı: Firefox `<button>` öğelerinin HTML5 sürüklemesini
 * desteklemez). Saf kısım (`dragOutcome`, `dragStarted`) testlidir; DOM kısmı (`attachSlotDrag`) yalnızca eşleştirir.
 * Başka slota bırakmak taşır/birleştirir/yer değiştirir, panelin dışına (arka plana) bırakmak yığını atar.
 */

/** Sürüklemenin başlaması için işaretçinin kat etmesi gereken en az uzaklık (piksel); tıklama sürükleme sanılmasın. */
export const DRAG_THRESHOLD = 6;

/** İşaretçi bırakıldığında altındaki bölge. */
export type DragZone = { kind: 'slot'; index: number } | { kind: 'panel' } | { kind: 'outside' };

export type DragOutcome =
  | { action: 'move'; from: number; to: number }
  | { action: 'drop'; from: number }
  | { action: 'none' };

/** Bırakılan yerden yapılacak eylem: slot → taşı, panel içi boşluk → hiçbir şey, panel dışı → at. */
export function dragOutcome(from: number, zone: DragZone): DragOutcome {
  if (zone.kind === 'slot') {
    return zone.index === from ? { action: 'none' } : { action: 'move', from, to: zone.index };
  }
  if (zone.kind === 'outside') return { action: 'drop', from };
  return { action: 'none' };
}

/** Basış noktasından `threshold`'dan fazla uzaklaşıldı mı? */
export function dragStarted(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return Math.hypot(dx, dy) > threshold;
}

export interface SlotDragHandlers {
  /** `from` slotundaki yığın `to` slotuna taşınır (birleştirir ya da yer değiştirir). */
  onMove(from: number, to: number): void;
  /** `from` slotundaki yığın panel dışına bırakıldı (atılır). */
  onDrop(from: number): void;
}

/** Slot düğmelerinin taşıdığı veri anahtarı (bırakma hedefini bulmak için). */
export const SLOT_ATTR = 'data-drag-slot';

/**
 * `slot`'u (envanter `index`'inin düğmesi) sürüklenebilir yapar. `body`: paneli çevreleyen gövde (içi "panel",
 * dışı "arka plan" sayılır). Hedef slotlar `SLOT_ATTR` özniteliğiyle işaretlenmelidir.
 */
export function attachSlotDrag(
  slot: HTMLElement,
  index: number,
  body: HTMLElement,
  handlers: SlotDragHandlers,
): void {
  slot.setAttribute(SLOT_ATTR, String(index));
  slot.addEventListener('pointerdown', (down) => {
    if (down.button !== 0 || slot.dataset.empty === 'true') return;
    const startX = down.clientX;
    const startY = down.clientY;
    let ghost: HTMLElement | null = null;

    const zoneAt = (x: number, y: number): DragZone => {
      const hit = document.elementFromPoint(x, y);
      const target = hit?.closest<HTMLElement>(`[${SLOT_ATTR}]`);
      if (target && body.contains(target))
        return { kind: 'slot', index: Number(target.getAttribute(SLOT_ATTR)) };
      return hit && body.contains(hit) ? { kind: 'panel' } : { kind: 'outside' };
    };

    const move = (event: PointerEvent): void => {
      if (!ghost) {
        if (!dragStarted(event.clientX - startX, event.clientY - startY)) return;
        ghost = el('div', 'inv-drag-ghost');
        const icon = slot.querySelector('.inv-slot-icon');
        if (icon) ghost.append(icon.cloneNode(true));
        const count = slot.querySelector('.inv-slot-count');
        if (count) ghost.append(count.cloneNode(true));
        document.body.append(ghost);
        slot.dataset.dragging = 'true';
      }
      ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      const zone = zoneAt(event.clientX, event.clientY);
      ghost.dataset.drop = String(zone.kind === 'outside');
    };

    const finish = (event: PointerEvent): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
      if (!ghost) return;
      ghost.remove();
      delete slot.dataset.dragging;
      // Sürükleme bittikten hemen sonraki click (bırakılan düğmede) seçimi bozmasın.
      const swallow = (click: Event): void => click.stopPropagation();
      document.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0);
      const outcome = dragOutcome(index, zoneAt(event.clientX, event.clientY));
      if (outcome.action === 'move') handlers.onMove(outcome.from, outcome.to);
      else if (outcome.action === 'drop') handlers.onDrop(outcome.from);
    };

    const cancel = (): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
      ghost?.remove();
      delete slot.dataset.dragging;
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', cancel);
  });
}
