# Faz 7 — Hesap B ölçümleri (7.8 performans ve bellek)

Bu belge [faz-7-paralel-plan.md](faz-7-paralel-plan.md) §5 7.8'in ölçüm kaydıdır. Gerçek Düzce–Bolu verisi (A, 7.4 → **S2**) gelmeden önce **sentetik büyük dünya** ile alındı; S2 sonrası aynı yöntemle gerçek dünyada yinelenip bu belgeye ikinci sütun olarak eklenecek, 7.10'da birleşik tabloya taşınacak.

## Yöntem

- **Sentetik büyük dünya** (`tests/helpers/syntheticWorld.ts`): Faz 7 hedef kapsamı (kafes sütun −640…1587, satır 0…1961 → 2228 × 1962 örnek, **18 × 16 = 288 chunk**). Eski bölge kafesteki yerinde bit-eşdeğer durur; kalan alan eski bölgenin `mod W/H` kopyalarıyla (2 × 2 çoğaltma) dolar. Tatlı su özellikleri de kopyalara kaydırılarak çoğaltılır (gerçek veride su ×2,2 bekleniyor). Kopya dikişlerinde yükseklik süreksizdir (ölçüm içindir).
- **CPU / bellek:** `SCALE_REPORT=1 npx vitest run tests/scalePerf.test.ts` (Node, WebGL'siz; test yapısal sayıları ve gevşek süre tavanını her CI'da denetler).
- **Draw call / üçgen:** başsız Chromium (yazılımsal WebGL, SwiftShader), dev sunucusunda `?world=wide` (yalnızca dev; üretim derlemesine girmez). Her konumda chunk ve nesneler senkron kurulur, kamera 8 yöne çevrilir, en kötü `renderer.info.render` alınır. **FPS ölçülmez** (gerçek GPU yok). Betik aşağıda (Ek).

## Sonuçlar (sentetik dünya, 2026-10-01)

### Kare başı draw call ve üçgen (en kötü yön)

Bütçe: draw call **< 300** (hedef ≤ 250).

| Konum | eski bölge: konum · çağrı · üçgen · chunk · nesne | geniş dünya: konum · çağrı · üçgen · chunk · nesne |
|---|---|---|
| merkez | (0, 0) · 59 · 473 bin · 130 · 14279 | (-624, 806) · 112 · 514 bin · 288 · 12194 |
| KB köşe | (-1547, -1135) · 7 · 74 bin · 130 · 0 | (-2707, -995) · 21 · 295 bin · 226 · 5688 |
| KD köşe | (1547, -1135) · 20 · 164 bin · 130 · 4583 | (1547, -1135) · 20 · 230 bin · 222 · 4583 |
| GB köşe | (-1547, 1135) · 83 · 272 bin · 130 · 4272 | (-2819, 2715) · 149 · 353 bin · 219 · 3923 |
| GD köşe | (1547, 1135) · 86 · 247 bin · 130 · 2263 | (1547, 2707) · 160 · 412 bin · 231 · 4114 |
| zirve | (-863, 1025) · 98 · 357 bin · 130 · 9339 | (-863, 1025) · 124 · 438 bin · 288 · 9300 |
| Yenice (eski orman) | (160, 290) · 74 · 455 bin · 130 · 14131 | (160, 290) · 75 · 521 bin · 288 · 14131 |
| Zonguldak kıyı | (-692, -281) · 44 · 296 bin · 130 · 7584 | (-692, -281) · 45 · 361 bin · 288 · 7584 |

- En kötü: **160 draw call** (güneydoğu köşesi; kuzeye bakarken tüm dünya görüşte), en çok **~521 bin üçgen** (Yenice ormanı). Eski bölgede en kötü 98 çağrı / ~473 bin üçgen.
- Tatlı su (tek mesh, kırpılmıyor): nehir üçgenleri 37,7 bin → 101,5 bin, göl 1,9 bin → 3,5 bin (draw call değişmez, 2).
- `CHUNK.viewDistance = 4000` m artık dünyanın tamamını kapsamıyor: köşelerde 219–231 chunk yüklü (288'in hepsi değil); merkezde 288.
- **Karar:** bütçe aşılmadığı için azaltma adımları (su meshini chunk'lara bölme, görüş/LOD eşikleri, süper-chunk) **uygulanmadı**; `QUALITY_PRESETS` "Yüksek" Faz 5 davranışı olarak kaldı. S2 sonrası gerçek veriyle yeniden değerlendirilecek.

### Açılış hazırlığı (CPU, Node; ağ ve karo birleştirme hariç)

Bütçe: başsızda **≤ 3 sn**.

Sentetik dünyanın birleştirilmesi (yalnızca ölçüm için; gerçek dünyada yerine `loadWorld` karo birleştirmesi gelir): 38 ms.

| Aşama | eski bölge (ms) | geniş dünya (ms) |
|---|---|---|
| RegionHeightSource (nicem çözme + deniz tabanı) | 67 | 143 |
| arazi örtüsü ağırlıkları (2 doku) | 13 | 39 |
| LandCoverMap | 0 | 0 |
| tatlı su indeksi | 11 | 8 |
| tatlı su mesh | 64 | 63 |
| ilk chunk'lar (görüş 4000 m, hepsi) | 48 | 31 |
| başlangıç nesneleri (PropLayer.prepare) | 157 | 128 |
| canlı arazisi + doğma ızgarası | 0 | 0 |
| deniz uzaklığı (tembel, ilk ses sorgusunda) | 34 | 92 |
| **toplam** | 394 | 503 |

| Bellek | eski (MB) | geniş (MB) |
|---|---|---|
| heightsUint16 | 3.6 | 8.3 |
| gameHeightsFloat32 | 7.1 | 16.7 |
| seaDistanceFloat32 | 7.1 | 16.7 |
| landcoverUint8 | 1.8 | 4.2 |
| coverTexturesRgba | 14.2 | 33.4 |

- Toplam **~0,5 sn** (eski bölge ~0,4 sn; ilk ölçülen sütun JIT ısınmasını da içerir). En pahalı aşamalar: yükseklik çözme + deniz tabanı mesafe dönüşümü (~×2,4), tembel deniz uzaklığı (ilk ortam sesi sorgusunda), başlangıç nesneleri.
- Başsız tarayıcıda sayfa açılışından oyun nesnesine (`window.__game`) süre: eski bölge ~1,0 sn, geniş dünya ~1,3 sn (yerel dev sunucusu; ağ ihmal edilebilir).

### Bellek

- Yukarıdaki tablo dizilerin bayt boyutudur. Toplam ≈ 79 MB (eski ≈ 34 MB); GPU tarafında arazi örtüsü dokuları mipmap'le ≈ 45 MB.
- Başsız Chromium JS yığını (`performance.memory.usedJSHeapSize`, tüm konumlar dolaşıldıktan sonra): eski bölge ~102 MB, geniş dünya ~199 MB. Masaüstü için kabul edilebilir; karo akışı (Faz 8 adayı) gerekirse bu kalemleri bölge bazında sınırlar.

## Ek — başsız ölçüm betiği

Dev sunucusu: `npx vite --port 5173` (arka planda). Çalıştırma: `node perfWorld.cjs [url]` (varsayılan `http://localhost:5173/?world=wide`; eski bölge için `http://localhost:5173/`). Playwright ve Chromium yolları bu ortamınkidir (bkz. [faz-4-paralel-plan.md](faz-4-paralel-plan.md) Ek).

```js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const url = process.argv[2] || 'http://localhost:5173/?world=wide';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => !!window.__game, null, { timeout: 180000 });
  const loadMs = Date.now() - t0;
  await page.addStyleTag({ content: '.pause-menu, .game-menu { display: none !important }' });
  const setup = await page.evaluate(async () => {
    const g = window.__game;
    const spawnMod = await import('/src/world/spawn.ts');
    window.__findSafe = spawnMod.findSafeSpawn;
    const s = g.world.source;
    // en yüksek nokta
    let best = -Infinity, bi = 0;
    for (let r = 0; r < s.height; r += 4) for (let c = 0; c < s.width; c += 4) { const h = s.sample(c, r); if (h > best) { best = h; bi = r * s.width + c; } }
    const summit = { x: s.xAt(bi % s.width), z: s.zAt(Math.floor(bi / s.width)) };
    const mem = (performance.memory ? performance.memory.usedJSHeapSize : null);
    return { bounds: s.bounds, width: s.width, height: s.height, summit, heapMB: mem && mem / 1e6, chunks: g.world.stats };
  });
  const b = setup.bounds;
  const m = 40;
  const spots = {
    'merkez': { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 },
    'KB köşe': { x: b.minX + m, z: b.minZ + m },
    'KD köşe': { x: b.maxX - m, z: b.minZ + m },
    'GB köşe': { x: b.minX + m, z: b.maxZ - m },
    'GD köşe': { x: b.maxX - m, z: b.maxZ - m },
    'zirve': setup.summit,
    'Yenice (eski orman)': { x: 160, z: 290 },
    'Zonguldak kıyı': { x: -688, z: -277 },
  };
  const rows = [];
  for (const [name, p] of Object.entries(spots)) {
    const placed = await page.evaluate(({ p }) => {
      const g = window.__game;
      const t = window.__findSafe(g.world.source, p.x, p.z, g.world.maxSlopeDeg) || { x: p.x, y: g.world.source.heightAt(p.x, p.z), z: p.z };
      g.world.prepare(t.x, t.z);
      g.player.teleport(t);
      g.world.chunks.update(t.x, t.z, Infinity);
      return t;
    }, { p });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const g = window.__game; const p = g.player.position; g.world.chunks.update(p.x, p.z, Infinity); g.world.props && g.world.props.prepare(p.x, p.z); });
    let worst = { calls: 0, tris: 0 };
    for (let k = 0; k < 8; k++) {
      await page.evaluate((k) => { const g = window.__game; g.playerCamera.yaw = (k / 8) * Math.PI * 2; g.playerCamera.pitch = -0.05; }, k);
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => { const r = window.__game.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
      if (info.calls > worst.calls) worst.calls = info.calls;
      if (info.tris > worst.tris) worst.tris = info.tris;
    }
    const st = await page.evaluate(() => { const g = window.__game; return { chunks: g.world.stats.chunks, colliders: g.world.stats.colliders, props: g.world.propStats && g.world.propStats.instances }; });
    rows.push({ name, x: Math.round(placed.x), z: Math.round(placed.z), ...worst, ...st });
  }
  const heap = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
  console.log(JSON.stringify({ url, loadMs, setup: { width: setup.width, height: setup.height, chunks: setup.chunks }, heapMB: heap, rows, errors }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
```
