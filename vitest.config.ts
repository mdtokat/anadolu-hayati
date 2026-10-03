import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Gerçek dünya testlerinin kurulumu (RegionWorld, yerleşim haritası) Faz 12 dünyasında (98 karo, 16 il) CI'da 10–15 sn
    // sürer; varsayılan 5 sn zaman aşımı yük altında rastgele kırılıyordu (CI #60). Tek tek testler daha uzun süreyi kendi
    // seçeneğiyle belirtir.
    testTimeout: 30_000,
  },
});
