import type { ItemCategory, ItemId } from '../items/itemDefs';

/**
 * Arayüz simgeleri: kodla çizilmiş küçük SVG'ler (24×24 görünüm kutusu; dosya ve bağımlılık yok). İçerik sabittir
 * (kullanıcı verisi içermez); `icon()` bunları `innerHTML` ile yerleştirir. Tek renkli arayüz simgeleri
 * `currentColor` kullanır (CSS rengi belirler), eşya simgeleri kendi renkleriyle çizilir.
 */

/** Tek renkli arayüz simgeleri (gösterge, saat, durum çipleri). */
export const UI_ICONS = {
  health:
    '<path fill="currentColor" d="M12 20.6l-1.3-1.2C5.6 14.8 2.3 11.8 2.3 8 2.3 5 4.7 2.6 7.7 2.6c1.7 0 3.3.8 4.3 2.1 1-1.3 2.6-2.1 4.3-2.1 3 0 5.4 2.4 5.4 5.4 0 3.8-3.3 6.8-8.4 11.4z"/>',
  satiety:
    '<path fill="currentColor" d="M15.2 2.8a6.1 6.1 0 0 0-5.6 8.5l-3.9 3.9a2.3 2.3 0 1 0-1.4 4.2 2.3 2.3 0 1 0 4.2-1.4l3.9-3.9a6.1 6.1 0 1 0 2.8-11.3z"/>',
  hydration:
    '<path fill="currentColor" d="M12 2.3s-6.6 7.3-6.6 12a6.6 6.6 0 0 0 13.2 0c0-4.7-6.6-12-6.6-12z"/>',
  energy: '<path fill="currentColor" d="M13.4 1.8 4.2 13.6h6.4l-1.3 8.6 9.5-12.3h-6.6z"/>',
  thermometer:
    '<path fill="none" stroke="currentColor" stroke-width="2" d="M9.6 14.1V4.8a2.4 2.4 0 0 1 4.8 0v9.3a4.2 4.2 0 1 1-4.8 0z"/><circle cx="12" cy="17.5" r="2" fill="currentColor"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 15.5V8"/>',
  sun: '<circle cx="12" cy="12" r="4.6" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7"/></g>',
  moon: '<path fill="currentColor" d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8z"/>',
  fire: '<path fill="currentColor" d="M12.3 2c.6 3.2-1.3 4.8-2.9 6.6-1.4 1.6-2.6 3.3-2.6 5.8a5.2 5.2 0 0 0 10.4 0c0-2.2-1-3.8-1.9-4.9.1 1.4-.4 2.6-1.4 3.1.6-3.6-.3-7.6-1.6-10.6z"/>',
  shelter:
    '<path fill="currentColor" d="M12 3 2 11.2l1.3 1.6L5 11.4V21h5.2v-5.6h3.6V21H19v-9.6l1.7 1.4 1.3-1.6z"/>',
  shield:
    '<path fill="currentColor" d="M12 2 4 5v6.2c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5z"/>',
  mountain:
    '<path fill="currentColor" d="M8.6 6 1.5 20h21L15.8 9.4l-2.6 4-1.6-2.4z"/><path fill="currentColor" opacity=".55" d="M15.8 9.4 13.2 13.4 11.6 11 13 8.9z"/>',
  pin: '<path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z"/>',
  weight:
    '<path fill="currentColor" d="M12 3a2.6 2.6 0 0 0-2.3 3.8H6.4L3 20.5c-.1.6.3 1 .9 1h16.2c.6 0 1-.4.9-1L17.6 6.8h-3.3A2.6 2.6 0 0 0 12 3zm0 1.6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>',
  warning:
    '<path fill="currentColor" d="M12 2.5 1.5 21h21zm-1.1 6.8h2.2l-.3 6h-1.6zm1.1 7.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z"/>',
  hammer:
    '<path fill="currentColor" d="M13.6 3.2 9.3 4.6l1.2 1.6-7.8 7.8a1.7 1.7 0 0 0 0 2.4l1.1 1.1a1.7 1.7 0 0 0 2.4 0l7.8-7.8 1.5 1.3 4.4-4.4z"/>',
  chest:
    '<path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v4H2V6a2 2 0 0 1 2-2zm-2 7.5h8.5v2h3v-2H22V20H2z"/>',
} as const;

export type UiIcon = keyof typeof UI_ICONS;

/** Eşya simgeleri: her eşyanın kendi renkleriyle küçük çizimi (`Record` tüm eşyaları zorunlu kılar). */
export const ITEM_ICONS: Readonly<Record<ItemId, string>> = {
  stick:
    '<g stroke-linecap="round"><path d="M4.5 19.5 19.5 4.5" stroke="#a8723c" stroke-width="2.8"/><path d="M12 12l5 1.4M9 15l-1.6-4.2" stroke="#a8723c" stroke-width="1.8"/><path d="M17 13.4l2 .2" stroke="#6fae5c" stroke-width="2.4"/></g>',
  stone:
    '<path d="M4 16.5c0-5 3.6-9.5 8.4-9.5 4.3 0 7.6 3.3 7.6 7.4 0 3.8-3.2 5.6-8 5.6-4.6 0-8-.9-8-3.5z" fill="#8f979e"/><path d="M8 11.5c1.2-2 3-3 5-2.8" stroke="#c4cad0" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M6 18.4c2.5 1 9.5 1.2 12.6-.8" stroke="#6b7278" stroke-width="1.2" fill="none"/>',
  log: '<rect x="3" y="8" width="15" height="9" rx="1.5" fill="#8a5a2e"/><path d="M5 10.5h9M6 14.5h8" stroke="#6e4522" stroke-width="1.2"/><ellipse cx="18" cy="12.5" rx="3.5" ry="4.5" fill="#d9b17a"/><ellipse cx="18" cy="12.5" rx="1.8" ry="2.4" fill="none" stroke="#a87c48" stroke-width="1"/>',
  bark: '<path d="M6 4c3 3 3 13 0 16h4c3-3 3-13 0-16z" fill="#7a4f2a"/><path d="M13 5c3 3 3 11 0 14h4c3-3 3-11 0-14z" fill="#94653a"/><path d="M8 7v10M15 8v8" stroke="#5a3a1e" stroke-width="1"/>',
  tinder:
    '<path d="M4 17c2-5 6-8 12-9-3 2-4 4-4 6 2-2 5-3 8-2-4 1-6 4-7 7z" fill="#d8c48a"/><path d="M6 19c1-4 3-6 7-8M10 19c1-2 3-4 6-5" stroke="#a9935a" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
  hazelnut:
    '<path d="M12 7.5c4 0 6.5 3.5 6.5 7S15.8 21 12 21s-6.5-3-6.5-6.5S8 7.5 12 7.5z" fill="#a8723c"/><path d="M5 9c2-4 12-4 14 0-3-1-4 1-7 1S8 8 5 9z" fill="#6fae5c"/><path d="M12 3.5v4" stroke="#4f7d3f" stroke-width="1.6" stroke-linecap="round"/><path d="M9 13c.5-1.5 1.5-2.3 2.6-2.5" stroke="#d29a5e" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  chestnut:
    '<path d="M12 3c2 2.5 7.5 6 7.5 10.5 0 4-3.3 7-7.5 7s-7.5-3-7.5-7C4.5 9 10 5.5 12 3z" fill="#6b3a1f"/><path d="M5 15.5c2 1.4 4.5 2 7 2s5-.6 7-2c-.4 3-3.4 5-7 5s-6.6-2-7-5z" fill="#d6b48a"/><path d="M9 9c1-1.5 2-2.4 3-3" stroke="#a5653d" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  blackberry:
    '<g fill="#3d1e4a"><circle cx="9.5" cy="11.5" r="2.6"/><circle cx="14.5" cy="11.5" r="2.6"/><circle cx="12" cy="15" r="2.6"/><circle cx="8.5" cy="15.8" r="2.4"/><circle cx="15.5" cy="15.8" r="2.4"/><circle cx="12" cy="19" r="2.3"/></g><g fill="#7a4a8c"><circle cx="9" cy="11" r=".9"/><circle cx="14" cy="11" r=".9"/><circle cx="11.5" cy="14.5" r=".9"/></g><path d="M12 9c-2-4-6-5-8-4 2 2 5 3 8 4zm0 0c2-3 5-4 7-3-2 2-4 3-7 3z" fill="#5d9c4c"/>',
  mushroom_edible:
    '<path d="M3 12.5C3 7.5 7 4 12 4s9 3.5 9 8.5c0 .8-.6 1.3-1.4 1.3H4.4c-.8 0-1.4-.5-1.4-1.3z" fill="#b4743f"/><circle cx="9" cy="8.5" r="1.2" fill="#e9c99c"/><circle cx="14.5" cy="7.5" r="1" fill="#e9c99c"/><path d="M9.5 13.8h5l.8 6.2c.1.6-.4 1-1 1h-4.6c-.6 0-1.1-.4-1-1z" fill="#f1e6cf"/>',
  stone_axe:
    '<path d="M6 21 15.5 6.5" stroke="#b07a46" stroke-width="2.6" stroke-linecap="round"/><path d="M12.5 3.5c3.5-.8 7 .8 8 3.8l-5.6 3.6-4.3-2.6z" fill="#8f979e"/><path d="M13.4 5c2.4-.4 4.6.6 5.6 2.3" stroke="#c4cad0" stroke-width="1.2" fill="none"/><path d="M12.8 7.6l3 1.8" stroke="#d9c28a" stroke-width="1.6"/>',
  water_container_empty:
    '<path d="M9.5 3h5v3.2c3 1.2 5 4 5 7.3 0 4.2-3.4 7.5-7.5 7.5S4.5 17.7 4.5 13.5c0-3.3 2-6.1 5-7.3z" fill="#b98a55"/><path d="M9.5 3h5" stroke="#7a5530" stroke-width="2" stroke-linecap="round"/><path d="M7.5 12c.3-2 1.6-3.6 3.4-4.3" stroke="#d9b17a" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  water_container_full:
    '<path d="M9.5 3h5v3.2c3 1.2 5 4 5 7.3 0 4.2-3.4 7.5-7.5 7.5S4.5 17.7 4.5 13.5c0-3.3 2-6.1 5-7.3z" fill="#b98a55"/><path d="M5.2 14c2.2-1 4.5 1 6.8 0s4.6-1 6.8 0c-.3 3.7-3.3 6.5-6.8 6.5S5.5 17.7 5.2 14z" fill="#4fa3e0"/><path d="M9.5 3h5" stroke="#7a5530" stroke-width="2" stroke-linecap="round"/><path d="M8 16.5c.6 1.2 1.6 2 3 2.3" stroke="#a9dafc" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
  campfire:
    '<path d="M12 2.5c.5 2.8-1.2 4.2-2.6 5.8C8.2 9.7 7.2 11 7.2 13a4.8 4.8 0 0 0 9.6 0c0-1.9-.9-3.3-1.7-4.3.1 1.2-.3 2.3-1.2 2.7.5-3.2-.3-6-1.9-8.9z" fill="#f08a2c"/><path d="M12 9.5c1.6 1.6 2.4 3 2.4 4.4a2.4 2.4 0 0 1-4.8 0c0-1.4.9-2.8 2.4-4.4z" fill="#ffd24a"/><path d="M3.5 20.5 20.5 16M3.5 16l17 4.5" stroke="#7a4f2a" stroke-width="2.6" stroke-linecap="round"/>',
  lean_to:
    '<path d="M3 20 15 5l1.6 1.2L5.6 20z" fill="#6e8f4a"/><path d="M5 18.5 15.5 5.7M8 18.8l9-11.2" stroke="#4d6b33" stroke-width="1"/><path d="M15.8 5.5V20M3 20h18" stroke="#8a5a2e" stroke-width="2" stroke-linecap="round"/>',
  raw_meat:
    '<path d="M5.5 9.5C7 5.5 13 4 17 6.5s3.5 8.5 0 11-9.5 2-11.5-1.5S4.6 12 5.5 9.5z" fill="#d9475a"/><path d="M8 10c2-2.5 6.5-3 8.5-.5" stroke="#f3a3ad" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="13" cy="13.5" r="2.2" fill="#f6e7d8"/><circle cx="13" cy="13.5" r="1" fill="#e6c9b0"/>',
  cooked_meat:
    '<path d="M5.5 9.5C7 5.5 13 4 17 6.5s3.5 8.5 0 11-9.5 2-11.5-1.5S4.6 12 5.5 9.5z" fill="#8a4a25"/><path d="M8 10c2-2.5 6.5-3 8.5-.5M7.5 14c2 1.5 6 1.8 9 0" stroke="#5e2f15" stroke-width="1.4" fill="none" stroke-linecap="round"/><circle cx="13" cy="12.5" r="2.2" fill="#f2e3cf"/><path d="M14 7.5c1-.6 2.2-.5 3 .3" stroke="#c98a55" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
  hide: '<path d="M7 3.5c1.5 1 3 1.5 5 1.5s3.5-.5 5-1.5c.5 2 2 3 3.5 3.5-1 2.5-1 5 0 7.5-1.5.5-3 1.5-3.5 3.5-1.5-1-3-1.5-5-1.5s-3.5.5-5 1.5C6.5 15.5 5 14.5 3.5 14c1-2.5 1-5 0-7.5C5 6 6.5 5 7 3.5z" fill="#b07a46"/><path d="M8.5 8c2 .8 5 .8 7 0M8.5 12c2 .8 5 .8 7 0" stroke="#8a5a2e" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
  bone: '<path d="M7.8 16.2 16.2 7.8" stroke="#ece3d1" stroke-width="3.4"/><g fill="#ece3d1"><circle cx="5.6" cy="16.3" r="2.3"/><circle cx="7.7" cy="18.4" r="2.3"/><circle cx="16.3" cy="5.6" r="2.3"/><circle cx="18.4" cy="7.7" r="2.3"/></g>',
  stone_spear:
    '<path d="M3.5 20.5 16 8" stroke="#b07a46" stroke-width="2.2" stroke-linecap="round"/><path d="M14.5 6.8 21 3l-3.8 6.5-1.6.9z" fill="#8f979e"/><path d="M14.2 8.2l1.6 1.6" stroke="#d9c28a" stroke-width="1.8"/>',
  hide_vest:
    '<path d="M8 3h2.2c.4 1.4 1 2 1.8 2s1.4-.6 1.8-2H16l4 3-1.6 4-1.4-.8V21H7V9.2l-1.4.8L4 6z" fill="#a8723c"/><path d="M12 6v15" stroke="#7a4f2a" stroke-width="1.2"/><path d="M9.5 12h1.4M13.1 12h1.4M9.5 16h1.4M13.1 16h1.4" stroke="#d9b17a" stroke-width="1.2" stroke-linecap="round"/>',
  workbench:
    '<rect x="2.5" y="8" width="19" height="3.5" rx=".8" fill="#a8723c"/><path d="M4.5 11.5V20M19.5 11.5V20M4.5 16.5h15" stroke="#7a4f2a" stroke-width="2" stroke-linecap="round"/><path d="M7 8 9.5 4.5l2 1.2L10 8" fill="#8f979e"/><path d="M14 6.5h5" stroke="#d9b17a" stroke-width="1.6" stroke-linecap="round"/>',
  storage_chest:
    '<path d="M3 9.5h18V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="#94653a"/><path d="M3 9.5C3 6 5 4 8 4h8c3 0 5 2 5 5.5z" fill="#b07a46"/><path d="M3 9.5h18M7 4.5v15.5M17 4.5v15.5" stroke="#6e4522" stroke-width="1.2"/><rect x="10.3" y="8.2" width="3.4" height="4" rx=".6" fill="#e0b84c"/>',
  wooden_hut:
    '<path d="M12 3 2 11h2.5v9.5h15V11H22z" fill="#a8723c"/><path d="M12 3 2 11h20z" fill="#7a4f2a"/><path d="M4.5 14h15M4.5 17h15" stroke="#8a5a2e" stroke-width="1"/><rect x="9.8" y="13.5" width="4.4" height="7" rx=".4" fill="#5a3a1e"/>',
  bone_knife:
    '<path d="M11 13 19.5 3.5c1 1.6.8 4.4-1 6.6L13 15.2z" fill="#ece3d1"/><path d="M12.2 13.8 18.6 6" stroke="#c9bda5" stroke-width="1"/><path d="M4.5 20.8 10.2 14.6l2.3 2-5.4 6z" fill="#b07a46"/><path d="M9.5 13.4l3.6 3.2" stroke="#d9c28a" stroke-width="2" stroke-linecap="round"/>',
  torch:
    '<path d="M9.6 21.5 11 11.5h2l1.4 10z" fill="#b07a46"/><path d="M10.5 11.5h3l.4-1.6h-3.8z" fill="#d8c48a"/><path d="M12 1.5c.4 2.4-1 3.4-2 4.6-.8.9-1.3 1.8-1.3 3a3.3 3.3 0 0 0 6.6 0c0-1.3-.6-2.3-1.1-3 0 .9-.3 1.6-.9 1.9.3-2.4-.2-4.4-1.3-6.5z" fill="#f08a2c"/><path d="M12 5.8c1 1 1.5 2 1.5 2.9a1.5 1.5 0 0 1-3 0c0-.9.6-1.9 1.5-2.9z" fill="#ffd24a"/>',
  fur_cloak:
    '<path d="M8 3.5h8l1.5 3C20 12 20.5 17 21 20.5c-3 1-6 1.2-9 1.2s-6-.2-9-1.2C3.5 17 4 12 6.5 6.5z" fill="#7d6a58"/><path d="M8 3.5c1 1.5 2.3 2.3 4 2.3s3-.8 4-2.3" fill="none" stroke="#c8b49a" stroke-width="2.2" stroke-linecap="round"/><path d="M8 10c-1 3-1.5 6-1.6 9M16 10c1 3 1.5 6 1.6 9M12 8v13" stroke="#5f4f40" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
};

/** Eşya kategorisinin vurgu rengi (slot kenarı ve çip rengi için CSS değişkeni). */
export const CATEGORY_ACCENT: Readonly<Record<ItemCategory, string>> = {
  material: '#b8a07a',
  food: '#8fcf6b',
  tool: '#7fb4e8',
  placeable: '#e8b04a',
};

/** `markup`'ı (sabit SVG içeriği) taşıyan bir `<span>`; ekran okuyucudan gizlidir. */
export function icon(markup: string, className = 'ui-icon'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${markup}</svg>`;
  return span;
}

/** Tek renkli arayüz simgesi. */
export function uiIcon(name: UiIcon, className = 'ui-icon'): HTMLSpanElement {
  return icon(UI_ICONS[name], className);
}

/** Eşya simgesi. */
export function itemIcon(id: ItemId, className = 'item-icon'): HTMLSpanElement {
  return icon(ITEM_ICONS[id], className);
}
