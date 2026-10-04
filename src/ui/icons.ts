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
  /** Para (lira simgeli sikke). */
  coin: '<circle cx="12" cy="12" r="9.5" fill="currentColor"/><path d="M10 6.5v11c2.9 0 5.4-1.9 5.6-4.8M7.6 11.2l5.8-2.4M7.6 14.2l5.8-2.4" fill="none" stroke="#1b2a20" stroke-width="1.7" stroke-linecap="round"/>',
  /** Tapu / dükkân (çatılı tezgâh). */
  shop: '<path fill="currentColor" d="M3 4h18l1.5 5.5a2.6 2.6 0 0 1-5 1 2.6 2.6 0 0 1-5 0 2.6 2.6 0 0 1-5 0 2.6 2.6 0 0 1-5-1zm1.5 8.6c1 .5 2.2.6 3.3.2v5.7h8.4v-5.7c1.1.4 2.3.3 3.3-.2V21h-15z"/>',
} as const;

export type UiIcon = keyof typeof UI_ICONS;

/**
 * Faz 11 (11.0) yer tutucu eşya simgesi: kategori renginde basit şekil (malzeme altıgen, yiyecek daire, alet
 * çapraz sap, yapı ev). Sahibi akış kendi eşyasının gerçek çizimini `ITEM_ICONS`'taki satırına yazar.
 */
const PLACEHOLDER_ICON: Readonly<Record<ItemCategory, string>> = {
  material:
    '<path d="M12 3.5 19.4 7.8v8.4L12 20.5l-7.4-4.3V7.8z" fill="#b8a07a"/><path d="M12 7.5l3.9 2.2v4.6L12 16.5l-3.9-2.2V9.7z" fill="#8e7a58"/>',
  food: '<circle cx="12" cy="12.5" r="7.5" fill="#8fcf6b"/><path d="M12 5V2.5" stroke="#4f7d3f" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.5" cy="10.5" r="1.6" fill="#c4eaa8"/>',
  tool: '<path d="M5 19 17.5 6.5" stroke="#7fb4e8" stroke-width="3" stroke-linecap="round"/><path d="M14.5 4.5l5 5-2 2-5-5z" fill="#4d7fae"/>',
  placeable:
    '<path d="M12 3.5 3 11h2.5v9h13v-9H21z" fill="#e8b04a"/><rect x="10" y="14" width="4" height="6" fill="#a87a24"/>',
};

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
  foundation:
    '<path d="M3 11.5 12 7l9 4.5L12 16z" fill="#b38a5c"/><path d="M3 11.5V15l9 4.5V16zM21 11.5V15l-9 4.5V16z" fill="#7a5a3a"/><path d="M7.5 9.3 16.5 13.8M16.5 9.3 7.5 13.8" stroke="#8f6c47" stroke-width="1"/>',
  wall: '<rect x="3" y="4" width="18" height="16" rx="1" fill="#a8723c"/><path d="M3 9.3h18M3 14.7h18" stroke="#7a4f2a" stroke-width="1.3"/><path d="M9 4v5.3M15 9.3v5.4M9 14.7V20" stroke="#7a4f2a" stroke-width="1.3"/>',
  doorway:
    '<path d="M3 4h18v16H3z" fill="#a8723c"/><path d="M9 20V11a3 3 0 0 1 6 0v9z" fill="#2c2118"/><path d="M3 9.3h4M17 9.3h4M3 14.7h4M17 14.7h4" stroke="#7a4f2a" stroke-width="1.3"/>',
  window_wall:
    '<rect x="3" y="4" width="18" height="16" rx="1" fill="#a8723c"/><rect x="8" y="8" width="8" height="6.5" rx=".6" fill="#2c2118"/><path d="M12 8v6.5M8 11.2h8" stroke="#8a5a2e" stroke-width="1.3"/><rect x="7.2" y="14.5" width="9.6" height="1.5" fill="#6e4522"/>',
  door: '<rect x="6" y="2.5" width="12" height="19" rx="1" fill="#8a5a2e"/><path d="M6 8.5h12M6 15h12M12 2.5v19" stroke="#6e4522" stroke-width="1.1"/><circle cx="15.2" cy="12.3" r="1" fill="#e0b84c"/>',
  roof: '<path d="M2 12 12 5l10 7z" fill="#6b5744"/><path d="M2 12h20v3H2z" fill="#4f4235"/><path d="M5.5 9.7 8 12M10 6.7 12.5 12M14.5 8 17 12" stroke="#8a7560" stroke-width="1"/>',
  // ── Faz 11 (11.0) ortak malzeme: yer tutucu ──
  scrap_metal: PLACEHOLDER_ICON.material,
  iron_ingot: PLACEHOLDER_ICON.material,
  charcoal: PLACEHOLDER_ICON.material,
  sulfur: PLACEHOLDER_ICON.material,
  gunpowder:
    '<path d="M5 20c0-5 3-9 7-9s7 4 7 9z" fill="#3a3a3c"/><path d="M9 11.5 10 5h4l1 6.5" fill="#b98a55"/><path d="M9.5 5h5" stroke="#7a5530" stroke-width="1.6" stroke-linecap="round"/><g fill="#6b6b70"><circle cx="9" cy="17" r=".8"/><circle cx="13" cy="15.5" r=".7"/><circle cx="15.5" cy="18" r=".8"/></g>',
  electronic_parts: PLACEHOLDER_ICON.material,
  battery: PLACEHOLDER_ICON.material,
  propeller: PLACEHOLDER_ICON.material,
  scope:
    '<rect x="3" y="9" width="18" height="6" rx="3" fill="#2a2e32"/><rect x="2" y="8" width="4" height="8" rx="1.4" fill="#3c4146"/><rect x="18" y="8.5" width="4" height="7" rx="1.4" fill="#3c4146"/><circle cx="21.2" cy="12" r="2" fill="#6fb3d9"/><path d="M10 9V6.5h4V9" fill="#3c4146"/>',
  // ── Faz 11: A ──
  stairs:
    '<path d="M3 21h18V3h-4v4.5h-4.3V12H8.3v4.5H3z" fill="#a8723c"/><path d="M3 16.5h5.3M8.3 12h4.4M12.7 7.5H17M17 3h4" stroke="#6e4522" stroke-width="1.4"/><path d="M5 21 19 4" stroke="#7a4f2a" stroke-width="1.2" opacity=".6"/>',
  entry_step:
    '<path d="M2 21h20v-4.5h-5.5V12h-5V7.5H2z" fill="#9a958c"/><path d="M2 7.5h9.5v1.2H2zM11.5 12h5v1.2h-5zM16.5 16.5H22v1.2h-5.5z" fill="#5f5a52"/><path d="M5 11v3M14 15v3" stroke="#7d786f" stroke-width="1"/>',
  pillar:
    '<rect x="9" y="5" width="6" height="14" fill="#8a5a2e"/><rect x="7" y="2.5" width="10" height="2.8" rx=".5" fill="#6e4522"/><rect x="6.5" y="18.8" width="11" height="2.7" rx=".5" fill="#8f8a80"/><path d="M11 6v12M13 6v12" stroke="#6e4522" stroke-width=".9"/>',
  railing:
    '<rect x="2" y="6" width="20" height="2.4" rx=".6" fill="#6e4522"/><rect x="2" y="16" width="20" height="1.8" fill="#a8723c"/><path d="M3.5 6v15M20.5 6v15" stroke="#6e4522" stroke-width="2"/><path d="M7 8.4v7.6M10.5 8.4v7.6M14 8.4v7.6M17.5 8.4v7.6" stroke="#a8723c" stroke-width="1.4"/>',
  half_wall:
    '<rect x="3" y="11" width="18" height="10" rx="1" fill="#a8723c"/><rect x="2" y="9.5" width="20" height="2.2" rx=".6" fill="#6e4522"/><path d="M3 16h18M9 11.7V16M15 16v5" stroke="#7a4f2a" stroke-width="1.3"/>',
  gable_roof:
    '<path d="M1.5 16 12 5l10.5 11h-3L12 8.2 4.5 16z" fill="#6b5744"/><path d="M4.5 16 12 8.2 19.5 16z" fill="#4f4235" opacity=".55"/><path d="M5 12.6 7.3 15M8.2 9.3l3.2 3.4M15.8 9.3l-3.2 3.4M19 12.6 16.7 15" stroke="#8a7560" stroke-width="1"/><path d="M10.5 5.3h3" stroke="#3a3027" stroke-width="1.6" stroke-linecap="round"/>',
  gable_wall:
    '<path d="M2 19 12 6l10 13z" fill="#a8723c"/><path d="M6.6 13h10.8M4.3 16h15.4" stroke="#7a4f2a" stroke-width="1.2"/><rect x="1.5" y="18.5" width="21" height="2.2" rx=".5" fill="#6e4522"/><path d="M12 6v12.5" stroke="#7a4f2a" stroke-width=".8" opacity=".6"/>',
  // ── Faz 11: B ──
  forge:
    '<rect x="3" y="12" width="18" height="9" rx="1" fill="#7b7870"/><path d="M3 16.5h18M9 12v4.5M15 16.5V21" stroke="#5f5a52" stroke-width="1.2"/><rect x="9" y="3" width="5" height="9" fill="#6e6b64"/><rect x="8" y="2.5" width="7" height="1.8" fill="#4a4741"/><rect x="5" y="9.5" width="5" height="2.5" rx=".6" fill="#3d3b38"/><path d="M5 9.5h5.5" stroke="#1f1e1c" stroke-width="1.2"/><rect x="5.5" y="13.5" width="4.5" height="2.2" rx=".5" fill="#d2541a"/>',
  stone_oven:
    '<path d="M3 21v-6c0-5 4-10 9-10s9 5 9 10v6z" fill="#86837a"/><path d="M3 15h18M8 8.2 9 15M16 8.2 15 15" stroke="#5f5a52" stroke-width="1.1" fill="none"/><path d="M8.5 21v-5.2c0-1.8 1.5-3.2 3.5-3.2s3.5 1.4 3.5 3.2V21z" fill="#2a2725"/><path d="M10 21v-4M14 21v-4" stroke="#d2541a" stroke-width="1.2" opacity=".8"/><rect x="14.8" y="2.5" width="2.4" height="5" fill="#3d3b38"/>',
  hand_mill:
    '<rect x="4" y="16" width="16" height="4.5" rx="1" fill="#6a4a2e"/><ellipse cx="12" cy="14.5" rx="7.5" ry="2.8" fill="#9a958c"/><path d="M4.5 14.5v-2.2c0-1.6 3.4-2.8 7.5-2.8s7.5 1.2 7.5 2.8v2.2" fill="#86837a"/><ellipse cx="12" cy="12.3" rx="7.5" ry="2.7" fill="#a8a39a"/><circle cx="12" cy="12.3" r="1.1" fill="#4a4741"/><path d="M16.5 12.2 17.5 4.5" stroke="#8a5a2e" stroke-width="2" stroke-linecap="round"/><circle cx="17.7" cy="4.2" r="1.4" fill="#6e4522"/>',
  drying_rack:
    '<path d="M3.5 22 6 4M20.5 22 18 4" stroke="#6b4b2d" stroke-width="2.2" stroke-linecap="round"/><path d="M5.2 6.5h13.6M4.6 12.5h14.8" stroke="#8a5a2e" stroke-width="2" stroke-linecap="round"/><g fill="#7a3b2a"><rect x="7" y="7.5" width="2.4" height="6.5" rx=".8"/><rect x="11" y="7.5" width="2.4" height="7.5" rx=".8"/><rect x="15" y="7.5" width="2.2" height="5.5" rx=".8"/></g>',
  bedroll:
    '<rect x="2.5" y="12" width="19" height="7.5" rx="2.4" fill="#9a7b4f"/><rect x="2.5" y="12" width="6.5" height="7.5" rx="2.4" fill="#cdbf9f"/><path d="M9.5 12.4v7M13 12.4v7M16.5 12.4v7" stroke="#7a5f3a" stroke-width="1" opacity=".7"/><path d="M3.5 12.2c0-2 1-3.2 2.8-3.2h12.4c1.8 0 2.8 1.2 2.8 3.2" fill="none" stroke="#6b5744" stroke-width="1.3"/>',
  solar_panel:
    '<path d="M5.5 8.5 22 8.5 18.5 17.5H2z" fill="#3d3b38" transform="translate(-1 0)"/><path d="M5 9.7h14.6l-2.8 6.6H3z" fill="#1f3b66"/><path d="M8.4 9.7 6.7 16.3M12.7 9.7l-1.6 6.6M16.6 9.7l-1.5 6.6M4.4 12.9h14.4" stroke="#6fb3d9" stroke-width=".8" opacity=".8"/><path d="M9 17.5 8 22M14.5 17.5 16 22M7 22h11" stroke="#3d3b38" stroke-width="2" stroke-linecap="round"/><circle cx="19.5" cy="4.5" r="2" fill="#f4c542"/>',
  wood_fence:
    '<path d="M2.5 9h19M2.5 15.5h19" stroke="#6a4a2e" stroke-width="2.2" stroke-linecap="round"/><g fill="#a8723c"><rect x="3" y="5.5" width="3.4" height="15" rx=".5"/><rect x="8" y="6.5" width="3.4" height="14" rx=".5"/><rect x="13" y="5.5" width="3.4" height="15" rx=".5"/><rect x="18" y="6.5" width="3.2" height="14" rx=".5"/></g><path d="M3 5.5 4.7 3.5 6.4 5.5M13 5.5l1.7-2 1.7 2" stroke="#a8723c" stroke-width="1" fill="#a8723c"/>',
  stone_fence:
    '<g><rect x="2" y="15" width="8" height="5.5" rx="1.2" fill="#7b7870"/><rect x="10.4" y="15" width="6" height="5.5" rx="1.2" fill="#6e6b64"/><rect x="16.8" y="15" width="5.2" height="5.5" rx="1.2" fill="#86837a"/><rect x="3.5" y="9.5" width="5.5" height="5" rx="1.2" fill="#86837a"/><rect x="9.4" y="9.5" width="8" height="5" rx="1.2" fill="#777068"/><rect x="17.8" y="9.5" width="3.5" height="5" rx="1.2" fill="#6e6b64"/><rect x="2" y="4.5" width="7.5" height="4.5" rx="1.2" fill="#6e6b64"/><rect x="10" y="4.5" width="6" height="4.5" rx="1.2" fill="#86837a"/><rect x="16.5" y="4.5" width="5.5" height="4.5" rx="1.2" fill="#7b7870"/></g>',
  fence_gate:
    '<path d="M3 3.5v18M21 3.5v18" stroke="#6b4b2d" stroke-width="2.6" stroke-linecap="round"/><path d="M5 8h14M5 17h14" stroke="#6a4a2e" stroke-width="2.2"/><path d="M5.5 16.5 18.5 8.5" stroke="#6a4a2e" stroke-width="1.8"/><g fill="#a8723c"><rect x="7" y="8" width="2" height="9"/><rect x="11" y="8" width="2" height="9"/><rect x="15" y="8" width="2" height="9"/></g>',
  dried_meat:
    '<path d="M5 6.5c3.5-2 9.2-2 13 .5 1.6 3.2 1 8.6-1.8 11-3.4 1.4-8.7.4-11-2.4C4 13 3.6 9 5 6.5z" fill="#7a3b2a"/><path d="M7 8.5c2.4-1.2 6-1.2 8.6.2M6.6 12c3-.9 7.6-.8 10 .6" stroke="#4e2418" stroke-width="1.1" fill="none"/><path d="M8.5 7.2c1-1.2 2.4-1.4 3.6-.9" stroke="#a65d46" stroke-width=".9" fill="none"/>',
  // ── Faz 11: C ──
  hoe: PLACEHOLDER_ICON.tool,
  sickle: PLACEHOLDER_ICON.tool,
  wheat_seed: PLACEHOLDER_ICON.material,
  corn_seed: PLACEHOLDER_ICON.material,
  potato: PLACEHOLDER_ICON.food,
  wheat: PLACEHOLDER_ICON.material,
  corn: PLACEHOLDER_ICON.material,
  flour: PLACEHOLDER_ICON.material,
  corn_flour: PLACEHOLDER_ICON.material,
  bread: PLACEHOLDER_ICON.food,
  corn_bread: PLACEHOLDER_ICON.food,
  baked_potato: PLACEHOLDER_ICON.food,
  farm_plot: PLACEHOLDER_ICON.placeable,
  // ── Faz 11: D ──
  club: '<path d="M5 20.5 13.5 9" stroke="#8a5a2e" stroke-width="2.6" stroke-linecap="round"/><path d="M12 4.5c2.6-1.8 6.2-.9 7.4 1.7 1 2.4-.4 4.9-3.2 5.9l-4.4-2.8z" fill="#6e4522"/><circle cx="15.6" cy="6.6" r=".9" fill="#a8723c"/><circle cx="17.6" cy="9" r=".8" fill="#a8723c"/>',
  iron_dagger:
    '<path d="M12.5 3.5 18 4.2 9.8 14.2l-2-2z" fill="#c4cad0"/><path d="M13.6 5.2 9 11" stroke="#8f979e" stroke-width=".9"/><path d="M6.3 11.3l4.4 4.4" stroke="#5a5f64" stroke-width="2.2" stroke-linecap="round"/><path d="M4 20.5 8.6 15.9" stroke="#6e4522" stroke-width="2.6" stroke-linecap="round"/>',
  pala: '<path d="M7.5 14.5c4-1 9-5 12-11 1 4-1.5 9.5-9.5 13.5z" fill="#c4cad0"/><path d="M9 15c3.6-1.4 7.6-4.8 10-9" stroke="#e6eaee" stroke-width=".9" fill="none"/><path d="M6.2 13.6l3.4 3.4" stroke="#b08a2e" stroke-width="2" stroke-linecap="round"/><path d="M3.5 20.5 7.2 16.8" stroke="#6b3a1f" stroke-width="2.6" stroke-linecap="round"/>',
  slingshot:
    '<path d="M12 21v-8M12 13 7 5M12 13l5-8" stroke="#8a5a2e" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M7 5c1.5 4 8.5 4 10 0" stroke="#b98a55" stroke-width="1.3" fill="none"/><circle cx="12" cy="8.2" r="1.6" fill="#8f979e"/>',
  bow: '<path d="M7 3c7 3 7 15 0 18" stroke="#8a5a2e" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M7 3v18" stroke="#e8dcc0" stroke-width="1"/><path d="M5 12h14" stroke="#a8723c" stroke-width="1.4"/><path d="M19 12l-2.6-1.6v3.2z" fill="#8f979e"/>',
  arrow:
    '<path d="M4 20 18 6" stroke="#a8723c" stroke-width="1.8" stroke-linecap="round"/><path d="M20.5 3.5 15.4 5l3.6 3.6z" fill="#8f979e"/><path d="M4 20l-.5-3.5 2 1.2M4 20l3.5.5-1.2-2" stroke="#e05a4a" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  shotgun:
    '<path d="M2 11h15v2.4H2z" fill="#3c4146"/><path d="M2 13.4h13v1.4H2z" fill="#2a2e32"/><path d="M14 11h2.6l5 5.5-2.6 2-4.6-4.5z" fill="#8a5a2e"/><path d="M12.6 14.6l1 3h1.6l-.6-3" stroke="#3c4146" stroke-width="1" fill="none"/>',
  pistol:
    '<path d="M4 7.5h15v4H4z" fill="#3c4146"/><path d="M5.5 11.5h6l-1.3 8.5H6.4z" fill="#5a4230"/><path d="M11.5 11.5c0 2 .8 3 2.2 3" stroke="#3c4146" stroke-width="1.2" fill="none"/><path d="M5 8.6h12" stroke="#6b7278" stroke-width=".8"/>',
  rifle:
    '<path d="M1.5 10.5h13v1.8h-13z" fill="#3c4146"/><path d="M12 10h5.5l4.5 4.8-1.8 2.4-3.6-3.4H12z" fill="#8a5a2e"/><path d="M10.5 12.3v3" stroke="#3c4146" stroke-width="1.4"/><path d="M12.5 9.2h2.6" stroke="#6b7278" stroke-width="1.4" stroke-linecap="round"/>',
  sniper_rifle:
    '<path d="M1 12h13.5v1.6H1z" fill="#2f3438"/><path d="M12 11.6h5.5l4.5 4.4-1.8 2.4-3.6-3.2H12z" fill="#4a5a3a"/><rect x="7" y="7.6" width="7.5" height="2.6" rx="1.2" fill="#22262a"/><path d="M6.2 7.6v2.6M15.3 7.6v2.6" stroke="#7a8288" stroke-width="1.2"/><path d="M9.5 10.2v1.4M12 10.2v1.4" stroke="#22262a" stroke-width="1"/><path d="M11 13.6l-1 4.2M12 13.6l1 4.2" stroke="#2f3438" stroke-width=".9"/>',
  shotgun_shell:
    '<rect x="7.5" y="4" width="9" height="12.5" rx="1" fill="#c8402e"/><rect x="7" y="15.5" width="10" height="4.5" rx=".8" fill="#d9a83a"/><path d="M9 6v9" stroke="#e57a66" stroke-width="1.2"/><circle cx="12" cy="17.8" r="1.1" fill="#9a7420"/>',
  pistol_ammo:
    '<g fill="#d9a83a"><rect x="5" y="10" width="4" height="9" rx=".5"/><rect x="10" y="10" width="4" height="9" rx=".5"/><rect x="15" y="10" width="4" height="9" rx=".5"/></g><g fill="#b07a46"><path d="M5 10a2 3 0 0 1 4 0z"/><path d="M10 10a2 3 0 0 1 4 0z"/><path d="M15 10a2 3 0 0 1 4 0z"/></g>',
  rifle_ammo:
    '<g fill="#d9a83a"><rect x="6" y="9" width="3.4" height="11" rx=".5"/><rect x="10.3" y="9" width="3.4" height="11" rx=".5"/><rect x="14.6" y="9" width="3.4" height="11" rx=".5"/></g><g fill="#b07a46"><path d="M6 9l1.7-5L9.4 9z"/><path d="M10.3 9 12 4l1.7 5z"/><path d="M14.6 9l1.7-5L18 9z"/></g>',
  // ── Faz 11: F ──
  drone: PLACEHOLDER_ICON.tool,
  suppressor:
    '<rect x="3" y="9" width="15" height="6" rx="1.6" fill="#33383d"/><rect x="18" y="10" width="3.5" height="4" rx=".8" fill="#4b5157"/><path d="M6 9v6M9.5 9v6M13 9v6" stroke="#55606a" stroke-width="1"/><circle cx="21.5" cy="12" r=".9" fill="#111"/>',
  backpack_small:
    '<rect x="6" y="7" width="12" height="13" rx="3" fill="#8a5a32"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7" fill="none" stroke="#5e3c20" stroke-width="1.5"/><rect x="8.5" y="13" width="7" height="4.5" rx="1.2" fill="#6e4524"/>',
  backpack_medium:
    '<rect x="5" y="5.5" width="14" height="15.5" rx="3.2" fill="#6c7a3a"/><path d="M9 5.5V4a3 3 0 0 1 6 0v1.5" fill="none" stroke="#3f4a1e" stroke-width="1.5"/><rect x="7.5" y="12.5" width="9" height="6" rx="1.4" fill="#556226"/><path d="M5 10h14" stroke="#3f4a1e" stroke-width="1.2"/>',
  backpack_large:
    '<rect x="4" y="3.5" width="16" height="18" rx="3.4" fill="#3f5a6e"/><path d="M8.5 3.5V2.4h7v1.1" stroke="#25384a" stroke-width="1.5" fill="none"/><rect x="6.5" y="12" width="11" height="7.5" rx="1.5" fill="#304759"/><path d="M4 9h16M12 3.5v5.5" stroke="#25384a" stroke-width="1.2"/><rect x="2.5" y="8" width="2" height="9" rx="1" fill="#7a5a3a"/>',
  bandage:
    '<rect x="3" y="8.5" width="18" height="7" rx="3.5" fill="#efe9dc" transform="rotate(-30 12 12)"/><path d="M7.5 15.5 16.5 8.5" stroke="#d6cdb8" stroke-width="1" stroke-dasharray="1.6 1.6"/><circle cx="17.6" cy="7.5" r="3" fill="#e4dccb"/><circle cx="17.6" cy="7.5" r="1.1" fill="#c9bfa8"/>',
  first_aid_kit:
    '<rect x="3" y="6.5" width="18" height="13.5" rx="2.2" fill="#c8323c"/><path d="M9 6.5V4.5h6v2" stroke="#8f1f27" stroke-width="1.6" fill="none"/><path d="M12 9.5v7M8.5 13h7" stroke="#fbf5ea" stroke-width="2.6" stroke-linecap="round"/>',
  steel_vest:
    '<path d="M8 3h2.2c.4 1.4 1 2 1.8 2s1.4-.6 1.8-2H16l4 3-1.6 4-1.4-.8V21H7V9.2l-1.4.8L4 6z" fill="#5b646c"/><path d="M8.5 10.5h7v4h-7zM8.5 16h7v3.5h-7z" fill="#76808a"/><path d="M12 6v15" stroke="#3e454b" stroke-width="1.1"/><path d="M9.5 12.5h5M9.5 17.8h5" stroke="#9aa4ad" stroke-width="1" stroke-linecap="round"/>',
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
