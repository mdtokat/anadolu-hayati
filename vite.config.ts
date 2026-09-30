import { defineConfig } from 'vite';

// GitHub Pages proje sitesi olarak yayınlanır: https://<kullanıcı>.github.io/anadolu-hayati/
// Dev sunucusu kökten ('/') çalışır; üretim derlemesi ve onu önizleyen `vite preview`
// alt yolu kullanır (preview, derlenen dosyaların yollarıyla aynı base'e ihtiyaç duyar).
const REPO_NAME = 'anadolu-hayati';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? `/${REPO_NAME}/` : '/',
  build: {
    target: 'es2022',
    // rapier3d-compat WASM'ı base64 gömülü getirir (~4 MB); uyarı eşiği bunu hesaba katar.
    chunkSizeWarningLimit: 4500,
    rolldownOptions: {
      output: {
        // Bağımlılıklar ayrı chunk'larda: oyun kodu değişince tarayıcı önbelleği bozulmaz.
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]rapier3d-compat/ },
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
          ],
        },
      },
    },
  },
}));
