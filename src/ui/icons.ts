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
  bulgur:
    '<path d="M6 8c-1.5 3-2 7-1 11 2 1.5 12 1.5 14 0 1-4 .5-8-1-11z" fill="#c9a46a"/><path d="M6 8c2-1 10-1 12 0-1-2-2.5-3-2.5-4h-7C8.5 5 7 6 6 8z" fill="#b08a52"/><path d="M8.5 5.5c2 1.2 5 1.2 7 0" stroke="#7a5a30" stroke-width="1.4" fill="none"/><g fill="#f0d68a"><circle cx="9" cy="13" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="15" cy="13.5" r=".9"/><circle cx="10.5" cy="16" r=".9"/><circle cx="13.5" cy="16.5" r=".9"/></g>',
  tarhana:
    '<path d="M3 18c3-2 15-2 18 0-2 2.5-16 2.5-18 0z" fill="#efe6d2"/><g fill="#d9682e"><path d="M7 15.5l2-2.5 2.5 1.5-1 2.2z"/><path d="M11.5 14l2.5-2 2 2-1.6 2z"/><path d="M14.5 16l2.4-1.4 1.4 1.8-2.6.8z"/><path d="M8.5 11.5l2.2-1.8 1.6 1.6-2.1 1.3z"/></g><path d="M12.6 10.4l1.8-1.2 1.2 1.4-1.6 1z" fill="#c4551f"/>',
  dry_beans:
    '<g fill="#efe7d6" stroke="#b9ab90" stroke-width=".7"><ellipse cx="8" cy="15" rx="2.6" ry="1.7" transform="rotate(-20 8 15)"/><ellipse cx="12.5" cy="16.5" rx="2.6" ry="1.7" transform="rotate(10 12.5 16.5)"/><ellipse cx="16.5" cy="14.5" rx="2.6" ry="1.7" transform="rotate(-35 16.5 14.5)"/><ellipse cx="10.5" cy="12" rx="2.6" ry="1.7" transform="rotate(25 10.5 12)"/><ellipse cx="14.5" cy="11" rx="2.6" ry="1.7" transform="rotate(-10 14.5 11)"/></g>',
  black_tea:
    '<rect x="6" y="4" width="12" height="16" rx="1.5" fill="#2f7a3e"/><rect x="6" y="4" width="12" height="4" rx="1.5" fill="#c8312a"/><path d="M9 15c0-3.5 3-5.5 6-6-.5 3.5-2.5 6-6 6z" fill="#8fd17a"/><path d="M9 15c1.5-1.5 3-3 5-4.5" stroke="#2f7a3e" stroke-width=".9" fill="none"/>',
  pekmez:
    '<path d="M8 7h8v2c2 1 3 3 3 5.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4.5C5 12 6 10 8 9z" fill="#4a2414"/><rect x="7.2" y="3.5" width="9.6" height="3.5" rx="1" fill="#c9a46a"/><path d="M7.5 12.5c.5-1.2 1.4-2 2.6-2.4" stroke="#9a5a36" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  leblebi:
    '<g fill="#e8c36a"><circle cx="8" cy="14" r="2.3"/><circle cx="12" cy="12.5" r="2.3"/><circle cx="16" cy="14" r="2.3"/><circle cx="10" cy="17.5" r="2.3"/><circle cx="14" cy="17.5" r="2.3"/><circle cx="12" cy="9" r="2.3"/></g><g fill="#c99a3e"><circle cx="8.6" cy="14.6" r=".6"/><circle cx="12.6" cy="13.1" r=".6"/><circle cx="16.6" cy="14.6" r=".6"/><circle cx="12.6" cy="9.6" r=".6"/></g>',
  dried_apricot:
    '<g fill="#e88a2a"><ellipse cx="9" cy="10" rx="4" ry="3.2" transform="rotate(-15 9 10)"/><ellipse cx="15" cy="13" rx="4" ry="3.2" transform="rotate(20 15 13)"/><ellipse cx="10" cy="17" rx="4" ry="3.2"/></g><g stroke="#b85e14" stroke-width="1" fill="none"><path d="M7 10c1.5-.8 3-.8 4 0"/><path d="M13 13c1.5-.6 3-.4 4 .5"/><path d="M8 17c1.5-.7 3-.7 4 0"/></g>',
  peksimet:
    '<g><rect x="3.5" y="8" width="11" height="6" rx="2" fill="#d9a352" transform="rotate(-12 9 11)"/><rect x="9" y="12" width="11" height="6" rx="2" fill="#e6b465" transform="rotate(8 14.5 15)"/></g><g fill="#a8742e"><circle cx="7" cy="11" r=".6"/><circle cx="10" cy="10.3" r=".6"/><circle cx="12.5" cy="15" r=".6"/><circle cx="15.5" cy="15.5" r=".6"/><circle cx="18" cy="16" r=".6"/></g>',
  bulgur_pilaf:
    '<path d="M3 13h18c-.5 4-4.5 7-9 7s-8.5-3-9-7z" fill="#e9e3d6"/><path d="M4.5 13c1-4 4.5-6 7.5-6s6.5 2 7.5 6z" fill="#e3b94f"/><g fill="#f5d77d"><circle cx="9" cy="11" r=".8"/><circle cx="12" cy="9.5" r=".8"/><circle cx="15" cy="11" r=".8"/></g><path d="M10 11.8h1.6M13 12.2h1.4" stroke="#c84a2a" stroke-width="1.1" stroke-linecap="round"/><path d="M3 13h18" stroke="#b9b1a2" stroke-width="1"/>',
  tarhana_soup:
    '<path d="M3 12h18c-.5 4.5-4.5 8-9 8s-8.5-3.5-9-8z" fill="#e9e3d6"/><ellipse cx="12" cy="12" rx="9" ry="2" fill="#d4572a"/><path d="M8 5c-1 1.2 1 2 0 3.3M12 4c-1 1.2 1 2 0 3.3M16 5c-1 1.2 1 2 0 3.3" stroke="#c9c2b6" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="10" cy="12" r=".7" fill="#7aa64a"/>',
  bean_stew:
    '<path d="M3 12h18c-.5 4.5-4.5 8-9 8s-8.5-3.5-9-8z" fill="#7a3a22"/><ellipse cx="12" cy="12" rx="9" ry="2" fill="#b8402a"/><g fill="#f2e8d4"><ellipse cx="9" cy="12" rx="1.2" ry=".7"/><ellipse cx="12.5" cy="11.6" rx="1.2" ry=".7"/><ellipse cx="15" cy="12.5" rx="1.2" ry=".7"/><ellipse cx="11" cy="13" rx="1.2" ry=".7"/></g>',
  brewed_tea:
    '<path d="M8.5 4h7c.4 2-.6 3.6-1.2 5.2-.8 2 .9 3.5.9 6 0 2.5-1.6 4-3.2 4s-3.2-1.5-3.2-4c0-2.5 1.7-4 .9-6C9.1 7.6 8.1 6 8.5 4z" fill="#f4efe8" fill-opacity=".55" stroke="#d8d2c8" stroke-width=".8"/><path d="M9.6 9.5c.6 1.6-.9 3.2-.9 5.6 0 2 1.4 3.3 3.3 3.3s3.3-1.3 3.3-3.3c0-2.4-1.5-4-.9-5.6z" fill="#b5381c"/><ellipse cx="12" cy="20.5" rx="6.5" ry="1.5" fill="#e9e3d6" stroke="#b9b1a2" stroke-width=".8"/>',
  copper_pot:
    '<path d="M5 10h14v6.5c0 2.5-2 4-4.5 4h-5C7 20.5 5 19 5 16.5z" fill="#c26b3a"/><path d="M4 10h16" stroke="#9a4f26" stroke-width="2" stroke-linecap="round"/><path d="M5 12H3M19 12h2" stroke="#9a4f26" stroke-width="2" stroke-linecap="round"/><path d="M7 9c1-2.5 3-3.5 5-3.5s4 1 5 3.5z" fill="#d98252"/><circle cx="12" cy="5" r="1.2" fill="#9a4f26"/><path d="M7.5 13.5c.3 1.6 1.2 3 2.6 3.6" stroke="#ea9a66" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
  wool_blanket:
    '<rect x="3" y="7" width="18" height="11" rx="1.5" fill="#a83a2e"/><path d="M3 10h18M3 15h18" stroke="#e9c46a" stroke-width="1.6"/><path d="M6 12.5l2-1.5 2 1.5-2 1.5zM11 12.5l1-1 1 1-1 1zM14 12.5l2-1.5 2 1.5-2 1.5z" fill="#f2e6cf"/><path d="M4 18v2M7 18v2M10 18v2M13 18v2M16 18v2M19 18v2" stroke="#e9c46a" stroke-width="1" stroke-linecap="round"/>',
  miner_lamp:
    '<path d="M12 2.5c-1.5 0-2.5 1-2.5 2.2" stroke="#7a6a50" stroke-width="1.4" fill="none" stroke-linecap="round"/><rect x="8.5" y="5" width="7" height="2" rx=".6" fill="#b89a4a"/><rect x="8.8" y="7" width="6.4" height="7" rx="1" fill="#fff2b8" fill-opacity=".85" stroke="#b89a4a" stroke-width="1"/><path d="M12 9c.8 1 1 2 0 3-1-1-.8-2 0-3z" fill="#f08a2c"/><path d="M8 14h8l1 6.5H7z" fill="#b89a4a"/><path d="M9 16.5h6" stroke="#8a7232" stroke-width="1"/>',
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
