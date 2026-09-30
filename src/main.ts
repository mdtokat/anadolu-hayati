import { Game } from './core/Game';

const container = document.getElementById('app');
if (!container) throw new Error('#app öğesi bulunamadı');
const loading = document.getElementById('loading');

// Fizik motoru (WASM) yüklenirken "Yükleniyor…" gösterilir; sahne siyah kalmaz.
// ?world=test → Faz 1 test arenası (karakter kontrolü regresyonu); varsayılan gerçek bölge.
const world =
  new URLSearchParams(window.location.search).get('world') === 'test' ? 'test' : 'region';

Game.create(container, { world })
  .then((game) => {
    loading?.remove();
    game.start();
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  })
  .catch((error: unknown) => {
    if (loading) loading.textContent = 'Oyun başlatılamadı. Ayrıntılar tarayıcı konsolunda.';
    console.error(error);
  });
