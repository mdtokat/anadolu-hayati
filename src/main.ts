import { Game } from './core/Game';

const container = document.getElementById('app');
if (!container) throw new Error('#app öğesi bulunamadı');

new Game(container).start();
