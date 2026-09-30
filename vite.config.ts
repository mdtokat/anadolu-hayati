import { defineConfig } from 'vite';

// GitHub Pages proje sitesi olarak yayınlanır: https://<kullanıcı>.github.io/anadolu-hayati/
// Dev sunucusu kökten ('/') çalışır; sadece üretim derlemesi alt yol kullanır.
const REPO_NAME = 'anadolu-hayati';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO_NAME}/` : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
}));
