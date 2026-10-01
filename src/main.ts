import { BUILD_INFO, formatBuildInfo } from './buildInfo';
import { Game } from './core/Game';

// Hata bildirimlerinde hangi derlemenin çalıştığı konsoldan okunabilsin.
console.info(`Anadolu Hayatı — ${formatBuildInfo(BUILD_INFO)}`);

const container = document.getElementById('app');
if (!container) throw new Error('#app öğesi bulunamadı');
const loading = document.getElementById('loading');

// Fizik motoru (WASM) yüklenirken "Yükleniyor…" gösterilir; sahne siyah kalmaz.
// ?world=test → Faz 1 test arenası (karakter kontrolü regresyonu); varsayılan gerçek bölge.
const query = new URLSearchParams(window.location.search);
const world = query.get('world') === 'test' ? 'test' : 'region';
// ?creatures=demo (yalnızca dev) → canlı simülasyonu yerine sahte canlı demosu (görsel doğrulama).
const creatureDemo = import.meta.env.DEV && query.get('creatures') === 'demo';

Game.create(container, { world, creatureDemo })
  .then((game) => {
    loading?.remove();
    game.start();
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  })
  .catch((error: unknown) => {
    const status = loading?.querySelector('.loading-status') ?? loading;
    if (status) status.textContent = 'Oyun başlatılamadı. Ayrıntılar tarayıcı konsolunda.';
    loading?.querySelector('.loading-bar')?.remove();
    console.error(error);
  });
