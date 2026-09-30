import type { ItemId } from '../items/itemDefs';
import type { PropKind } from '../world/propKinds';

/** Bir toplama eyleminin verdiği eşya: `min`–`max` (dahil) adet; miktar nesne kimliğinden deterministik türetilir. */
export interface YieldItem {
  id: ItemId;
  min: number;
  max: number;
}

export interface GatherYield {
  items: readonly YieldItem[];
  /** `E` basılı tutma süresi (gerçek saniye). */
  seconds: number;
  /** Eylem sonunda nesne dünyadan kalkar mı (kesilen ağaç, yerden alınan dal/taş/mantar)? */
  removes: boolean;
  /** HUD ipucu: "E (basılı tut): <label>". */
  label: string;
}

export interface GatherRule {
  /** Elle toplama: nesne başına bir kez. */
  hand: GatherYield;
  /** Taş baltayla (`stone_axe`, envanterde) toplama: elle toplamadan sonra bir kez. */
  axe?: GatherYield;
}

/**
 * Nesne türü → verim tablosu (docs/faz-4-paralel-plan.md §2.3; veri). Süreler ve miktarlar elle denge
 * ayarına açıktır. Yeniden büyüme yoktur: toplanan verim o oturum boyunca bir daha alınmaz.
 */
export const GATHER_RULES: Readonly<Record<PropKind, GatherRule>> = {
  tree_broadleaf: {
    hand: {
      items: [{ id: 'stick', min: 1, max: 2 }],
      seconds: 1.5,
      removes: false,
      label: 'Dal topla',
    },
    axe: {
      items: [
        { id: 'log', min: 1, max: 1 },
        { id: 'bark', min: 1, max: 2 },
      ],
      seconds: 4,
      removes: true,
      label: 'Ağacı kes',
    },
  },
  tree_conifer: {
    hand: {
      items: [{ id: 'stick', min: 1, max: 2 }],
      seconds: 1.5,
      removes: false,
      label: 'Dal topla',
    },
    axe: {
      items: [
        { id: 'log', min: 1, max: 1 },
        { id: 'bark', min: 1, max: 2 },
      ],
      seconds: 4,
      removes: true,
      label: 'Ağacı kes',
    },
  },
  bush: {
    hand: {
      items: [
        { id: 'stick', min: 1, max: 3 },
        { id: 'tinder', min: 1, max: 2 },
      ],
      seconds: 1,
      removes: false,
      label: 'Dal ve kav topla',
    },
  },
  rock: {
    hand: {
      items: [{ id: 'stone', min: 1, max: 1 }],
      seconds: 1.2,
      removes: false,
      label: 'Taş al',
    },
  },
  berry_bush: {
    hand: {
      items: [{ id: 'blackberry', min: 2, max: 5 }],
      seconds: 1.2,
      removes: false,
      label: 'Böğürtlen topla',
    },
  },
  hazel: {
    hand: {
      items: [{ id: 'hazelnut', min: 3, max: 6 }],
      seconds: 1.2,
      removes: false,
      label: 'Fındık topla',
    },
  },
  chestnut: {
    hand: {
      items: [{ id: 'chestnut', min: 2, max: 5 }],
      seconds: 1.2,
      removes: false,
      label: 'Kestane topla',
    },
    axe: {
      items: [{ id: 'log', min: 1, max: 1 }],
      seconds: 4,
      removes: true,
      label: 'Kestane ağacını kes',
    },
  },
  mushroom: {
    hand: {
      items: [{ id: 'mushroom_edible', min: 1, max: 2 }],
      seconds: 0.5,
      removes: true,
      label: 'Mantar topla',
    },
  },
  stick: {
    hand: {
      items: [{ id: 'stick', min: 1, max: 1 }],
      seconds: 0.5,
      removes: true,
      label: 'Dalı al',
    },
  },
  stone: {
    hand: {
      items: [{ id: 'stone', min: 1, max: 1 }],
      seconds: 0.5,
      removes: true,
      label: 'Taşı al',
    },
  },
};
