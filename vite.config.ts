import { defineConfig } from 'vite';

// GitHub Pages proje sitesi olarak yayınlanır: https://<kullanıcı>.github.io/anadolu-hayati/
// Dev sunucusu kökten ('/') çalışır; üretim derlemesi ve onu önizleyen `vite preview`
// alt yolu kullanır (preview, derlenen dosyaların yollarıyla aynı base'e ihtiyaç duyar).
const REPO_NAME = 'anadolu-hayati';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? `/${REPO_NAME}/` : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
}));
