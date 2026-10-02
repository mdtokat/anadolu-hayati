/**
 * Yerleşim yapı türleri (Faz 10) ve ölçüleri — görsel geometri (`world/buildingGeometry.ts`), Rapier collider'ları
 * (`world/SettlementColliders.ts`), barınak/arama kuralları bu tek tablodan okur (saf; Three.js'siz).
 *
 * Yerel eksenler: yapının merkezi (0, 0), taban `y = 0` (zemin katı döşemesi), ön yüz (kapı) yerel +z'dedir;
 * dünyaya `yaw` ile döndürülür (`localToWorld`). Ölçüler oyun metresidir (oyuncu 1,8 m).
 */

export const BUILDING_KINDS = [
  // konut
  'house',
  'konak',
  'apartment',
  'lojman',
  'serender',
  // çarşı ve kamu
  'shop_row',
  'kahvehane',
  'government',
  // dinî ve kültürel
  'mosque_grand',
  'mosque',
  'mosque_wooden',
  'tomb',
  'cemetery',
  'fountain',
  // tarihî
  'han',
  'hamam',
  'clock_tower',
  'castle',
  'monument',
  // sanayi
  'mine_tower',
  'factory',
] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

/** Yapı türünün görünen adı (ipuçları, bildirimler). */
export const BUILDING_NAMES: Record<BuildingKind, string> = {
  house: 'Ev',
  konak: 'Konak',
  apartment: 'Apartman',
  lojman: 'Maden lojmanı',
  serender: 'Serender',
  shop_row: 'Dükkânlar',
  kahvehane: 'Kahvehane',
  government: 'Hükümet konağı',
  mosque_grand: 'Cami',
  mosque: 'Cami',
  mosque_wooden: 'Köy camii',
  tomb: 'Türbe',
  cemetery: 'Mezarlık',
  fountain: 'Çeşme',
  han: 'Han',
  hamam: 'Hamam',
  clock_tower: 'Saat kulesi',
  castle: 'Kale',
  monument: 'Anıt',
  mine_tower: 'Maden kuyusu',
  factory: 'Fabrika',
};

/** Yerel eksenlerde eksene hizalı kutu: merkez (cx, cy, cz), yarı boyutlar (hx, hy, hz). */
export interface LocalBox {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
}

export interface BuildingShape {
  /** Ayak izi (yerel x genişliği, yerel z derinliği); parsel ve nesne/yol eleme bunu kullanır. */
  width: number;
  depth: number;
  /** En yüksek nokta (minare, kule dahil; yaklaşık). */
  height: number;
  /** Katı kutular (collider). Boşsa yapı geçilebilir (mezarlık, çeşme dışında azdır). */
  solids: readonly LocalBox[];
  /** İçine girilebilir mi (cami, han): içerisi barınaktır. */
  enterable: boolean;
  /** İç alan (barınak dikdörtgeni, yerel): |x| ≤ halfWidth, back ≤ z ≤ front. */
  interior: { halfWidth: number; back: number; front: number } | null;
  /** Aranabilir mi (konut, dükkân…): cami, türbe, mezarlık aranmaz (saygı). */
  searchable: boolean;
  /** Kapı (arama noktası) yerel konumu: ön yüzün ortası, biraz dışarıda. */
  door: { x: number; z: number };
}

/** Duvar kalınlığı (girilebilir yapılar). */
const WALL = 0.35;

function box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): LocalBox {
  return { cx, cy, cz, hx, hy, hz };
}

/** Tek katı blok (girilemez yapı). */
function block(width: number, depth: number, height: number): LocalBox[] {
  return [box(0, height / 2, 0, width / 2, height / 2, depth / 2)];
}

/**
 * İçi boş dört duvar; ön (+z) duvarda ortada `door` genişliğinde kapı boşluğu. Kapının üstü (lento) collider
 * değildir (geçişi engellemesin; görselde vardır).
 */
export function hollowWalls(
  width: number,
  depth: number,
  height: number,
  door: number,
): LocalBox[] {
  const hw = width / 2;
  const hd = depth / 2;
  const hy = height / 2;
  const t = WALL / 2;
  const side = (hw - door / 2) / 2; // kapının iki yanındaki duvar parçasının yarı genişliği
  return [
    box(0, hy, -hd + t, hw, hy, t), // arka
    box(-hw + t, hy, 0, t, hy, hd), // sol
    box(hw - t, hy, 0, t, hy, hd), // sağ
    box(-hw + side, hy, hd - t, side, hy, t), // ön sol
    box(hw - side, hy, hd - t, side, hy, t), // ön sağ
  ];
}

/** Ölçüler — `world/buildingGeometry.ts` görselleri bunlarla çizer. */
export const SHAPE_DIMS = {
  house: { w: 6.5, d: 5.5, h: 5.2 },
  konak: { w: 8.5, d: 7.5, h: 7.6 },
  apartment: { w: 10, d: 8.5, floors: 4, floorH: 2.9 },
  lojman: { w: 10, d: 7, h: 6.4 },
  serender: { w: 3, d: 3, h: 4.2 },
  shop_row: { w: 13, d: 5.5, h: 3.6 },
  kahvehane: { w: 8, d: 6.5, h: 4 },
  government: { w: 18, d: 10, h: 7.5 },
  mosque_grand: { w: 18, d: 18, h: 9, dome: 7, portico: 5, minaret: 26 },
  mosque: { w: 11, d: 11, h: 6.5, dome: 4.6, portico: 3.5, minaret: 17 },
  mosque_wooden: { w: 8, d: 9, h: 4.2, minaret: 10 },
  tomb: { w: 5, d: 5, h: 5.5 },
  cemetery: { w: 14, d: 10, h: 1.6 },
  fountain: { w: 2.6, d: 1.1, h: 2.8 },
  han: { w: 22, d: 22, h: 7, court: 12 },
  hamam: { w: 12, d: 10, h: 5.6 },
  clock_tower: { w: 3, d: 3, h: 16 },
  castle: { w: 26, d: 18, h: 8 },
  monument: { w: 4, d: 4, h: 7 },
  mine_tower: { w: 10, d: 8, h: 22 },
  factory: { w: 28, d: 16, h: 10, chimney: 30 },
} as const;

/**
 * Camilerde harimin (iç mekân) yerel z kayması: önde revak/sundurma olduğundan ayak izinin merkezi harim
 * merkezinden öndedir; geometri ve collider'lar harimi bu kadar geride kurar.
 */
export function mosqueOffset(kind: BuildingKind): number {
  if (kind === 'mosque_grand' || kind === 'mosque') return -SHAPE_DIMS[kind].portico / 2;
  if (kind === 'mosque_wooden') return -1;
  return 0;
}

function shapeOf(kind: BuildingKind): BuildingShape {
  const d = SHAPE_DIMS;
  const front = (depth: number) => ({ x: 0, z: depth / 2 + 0.6 });
  switch (kind) {
    case 'house':
    case 'konak':
    case 'lojman':
    case 'kahvehane':
    case 'shop_row':
    case 'government':
    case 'hamam': {
      const s = d[kind];
      return {
        width: s.w,
        depth: s.d,
        height: s.h,
        solids: block(s.w, s.d, s.h * 0.75),
        enterable: false,
        interior: null,
        searchable: true,
        door: front(s.d),
      };
    }
    case 'apartment': {
      const s = d.apartment;
      const h = s.floors * s.floorH;
      return {
        width: s.w,
        depth: s.d,
        height: h + 1,
        solids: block(s.w, s.d, h),
        enterable: false,
        interior: null,
        searchable: true,
        door: front(s.d),
      };
    }
    case 'serender': {
      const s = d.serender;
      // Dört direk üstünde ambar: gövde 1,4 m yüksekte başlar; direkler ince, collider tek gövde + direk kutusu.
      return {
        width: s.w,
        depth: s.d,
        height: s.h,
        solids: [box(0, 2.6, 0, s.w / 2, 1.2, s.d / 2), box(0, 0.7, 0, 0.3, 0.7, 0.3)],
        enterable: false,
        interior: null,
        searchable: true,
        door: front(s.d),
      };
    }
    case 'mosque_grand':
    case 'mosque': {
      const s = d[kind];
      // Harim (iç mekân) dört duvar + kapı; son cemaat yeri (revak) önde, geçilebilir; minare sağ ön köşede.
      // Ayak izi (harim + revak) merkezlidir: harim `MOSQUE_OFFSET` kadar geride durur.
      const oz = mosqueOffset(kind);
      const walls = hollowWalls(s.w, s.d, s.h, 2.4).map((b) => ({ ...b, cz: b.cz + oz }));
      const minaret = box(
        s.w / 2 + 1.2,
        s.minaret / 2,
        s.d / 2 - 1.2 + oz,
        0.8,
        s.minaret / 2,
        0.8,
      );
      return {
        width: s.w + 4,
        depth: s.d + s.portico,
        height: s.minaret,
        solids: [...walls, minaret],
        enterable: true,
        interior: {
          halfWidth: s.w / 2 - WALL,
          back: -s.d / 2 + WALL + oz,
          front: s.d / 2 - WALL + oz,
        },
        searchable: false,
        door: { x: 0, z: s.d / 2 + 0.4 + oz },
      };
    }
    case 'mosque_wooden': {
      const s = d.mosque_wooden;
      const oz = mosqueOffset(kind);
      const walls = hollowWalls(s.w, s.d, s.h, 1.8).map((b) => ({ ...b, cz: b.cz + oz }));
      const minaret = box(
        s.w / 2 + 0.7,
        s.minaret / 2,
        s.d / 2 - 0.7 + oz,
        0.5,
        s.minaret / 2,
        0.5,
      );
      return {
        width: s.w + 2.6,
        depth: s.d + 2,
        height: s.minaret,
        solids: [...walls, minaret],
        enterable: true,
        interior: {
          halfWidth: s.w / 2 - WALL,
          back: -s.d / 2 + WALL + oz,
          front: s.d / 2 - WALL + oz,
        },
        searchable: false,
        door: { x: 0, z: s.d / 2 + 0.4 + oz },
      };
    }
    case 'han': {
      const s = d.han;
      // Avlulu kare yapı: dört kanat (kalın duvar halkası) + ön kanatta kapı geçidi; avlu ve revaklar barınaktır.
      const wing = (s.w - s.court) / 2;
      const hw = s.w / 2;
      const hy = s.h / 2;
      const gate = 3;
      const side = (hw - gate / 2) / 2;
      return {
        width: s.w,
        depth: s.d,
        height: s.h,
        solids: [
          box(0, hy, -hw + wing / 2, hw, hy, wing / 2),
          box(-hw + wing / 2, hy, 0, wing / 2, hy, hw - wing),
          box(hw - wing / 2, hy, 0, wing / 2, hy, hw - wing),
          box(-hw + side, hy, hw - wing / 2, side, hy, wing / 2),
          box(hw - side, hy, hw - wing / 2, side, hy, wing / 2),
        ],
        enterable: true,
        interior: { halfWidth: s.court / 2 + 0.5, back: -s.court / 2 - 0.5, front: hw },
        searchable: true,
        door: { x: 0, z: hw + 0.6 },
      };
    }
    case 'tomb':
    case 'clock_tower':
    case 'monument': {
      const s = d[kind];
      return {
        width: s.w,
        depth: s.d,
        height: s.h,
        solids: block(s.w * 0.9, s.d * 0.9, Math.min(s.h, 4)),
        enterable: false,
        interior: null,
        searchable: false,
        door: front(s.d),
      };
    }
    case 'cemetery': {
      const s = d.cemetery;
      return {
        width: s.w,
        depth: s.d,
        height: s.h,
        solids: [],
        enterable: false,
        interior: null,
        searchable: false,
        door: front(s.d),
      };
    }
    case 'fountain': {
      const s = d.fountain;
      return {
        width: s.w,
        depth: s.d,
        height: s.h,
        solids: [box(0, s.h / 2, -s.d / 4, s.w / 2, s.h / 2, s.d / 4)],
        enterable: false,
        interior: null,
        searchable: false,
        door: { x: 0, z: s.d / 2 + 0.5 },
      };
    }
    case 'castle': {
      const s = d.castle;
      const hw = s.w / 2;
      const hd = s.d / 2;
      const t = 1;
      const hy = s.h / 2;
      const gate = 4;
      const side = (hw - gate / 2) / 2;
      return {
        width: s.w,
        depth: s.d,
        height: s.h + 3,
        solids: [
          box(0, hy, -hd + t, hw, hy, t),
          box(-hw + t, hy, 0, t, hy, hd),
          box(hw - t, hy, 0, t, hy, hd),
          box(-hw + side, hy, hd - t, side, hy, t),
          box(hw - side, hy, hd - t, side, hy, t),
        ],
        enterable: false,
        interior: null,
        searchable: false,
        door: { x: 0, z: hd + 0.8 },
      };
    }
    case 'mine_tower': {
      const s = d.mine_tower;
      // Çelik kuyu kulesi (sol) + makine dairesi (sağ).
      return {
        width: s.w,
        depth: s.d,
        height: s.h,
        solids: [box(-2.5, s.h / 2, 0, 2, s.h / 2, 2), box(2.6, 3, 0, 2.4, 3, 3.2)],
        enterable: false,
        interior: null,
        searchable: true,
        door: { x: 2.6, z: 3.2 + 0.6 },
      };
    }
    case 'factory': {
      const s = d.factory;
      return {
        width: s.w,
        depth: s.d,
        height: s.chimney,
        solids: [
          ...block(s.w, s.d, s.h),
          box(s.w / 2 - 2, s.chimney / 2, -s.d / 2 + 2, 1, s.chimney / 2, 1),
        ],
        enterable: false,
        interior: null,
        searchable: true,
        door: front(s.d),
      };
    }
  }
}

/** Tür başına şekil (bir kez hesaplanır). */
export const BUILDING_SHAPES: Readonly<Record<BuildingKind, BuildingShape>> = Object.fromEntries(
  BUILDING_KINDS.map((kind) => [kind, shapeOf(kind)]),
) as Record<BuildingKind, BuildingShape>;

/** Cami türleri (barınak "cami": kutsal ve güvenli alan; aranmaz). */
export function isMosque(kind: BuildingKind): boolean {
  return kind === 'mosque_grand' || kind === 'mosque' || kind === 'mosque_wooden';
}

/**
 * Yamaca gömülme sınırı (oyun m): yapı kapısı aşağı bakacak şekilde konur, zemin katı ön kenarın zeminindedir;
 * arka kenar bu kadar toprağa gömülebilir (Karadeniz kasabalarında evler yamaca yaslanır). Fazlası olan parsel
 * kullanılmaz. Ölçek: dikey 1:15, yatay 1:50 — gerçek yamaçlar oyunda ×3,3 diktir.
 */
export const MAX_BURY: Readonly<Record<BuildingKind, number>> = {
  house: 3,
  konak: 3.2,
  apartment: 6,
  lojman: 3,
  serender: 0.8,
  shop_row: 1.8,
  kahvehane: 1.8,
  government: 2.4,
  mosque_grand: 3.2,
  mosque: 3,
  mosque_wooden: 2,
  tomb: 1,
  cemetery: 1.2,
  fountain: 1.6,
  han: 2.6,
  hamam: 2.2,
  clock_tower: 1.2,
  castle: 3.5,
  monument: 1,
  mine_tower: 2,
  factory: 1.6,
};

/**
 * Görsel taşma payı (oyun m; yerel x ve z yönünde, iki yana simetrik): saçak, revak, kule, baca gibi ayak izinin
 * (`width` × `depth`) dışına taşan geometri. Yerleşim düzeni yapıları bu payla aralar (saçaklar birbirine girmesin),
 * nesne eleme ağaçları bu paya göre gizler. Geometri değişirse güncellenmeli (`tests/buildingGeometry` denetler).
 */
export const BUILDING_OVERHANG: Readonly<Record<BuildingKind, { x: number; z: number }>> = {
  house: { x: 0.45, z: 0.45 },
  konak: { x: 1.1, z: 1.1 },
  apartment: { x: 0.1, z: 1.2 },
  lojman: { x: 0.45, z: 0.45 },
  serender: { x: 0.4, z: 0.4 },
  shop_row: { x: 0.35, z: 0.3 },
  kahvehane: { x: 0.45, z: 1.7 },
  government: { x: 0.5, z: 2.6 },
  mosque_grand: { x: 0.35, z: 0.15 },
  mosque: { x: 0.15, z: 0.1 },
  mosque_wooden: { x: 0.05, z: 0.7 },
  tomb: { x: 0.2, z: 0.2 },
  cemetery: { x: 0.2, z: 0.2 },
  fountain: { x: 0.25, z: 0.25 },
  han: { x: 0.35, z: 0.35 },
  hamam: { x: 0.35, z: 0.35 },
  clock_tower: { x: 0.55, z: 0.55 },
  castle: { x: 2.5, z: 2.5 },
  monument: { x: 0, z: 0 },
  mine_tower: { x: 0.2, z: 0 },
  factory: { x: 5.25, z: 0.15 },
};

/** Hükümet konağının bayrak direği (yerel konum, yükseklik) ve bayrak ölçüleri (2:3). */
export const GOVERNMENT_FLAG = {
  poleX: SHAPE_DIMS.government.w / 2 - 1.5,
  poleZ: SHAPE_DIMS.government.d / 2 + 2.5,
  poleHeight: 9,
  width: 1.8,
  height: 1.2,
} as const;
