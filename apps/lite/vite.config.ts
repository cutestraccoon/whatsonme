import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt', injectRegister: false, includeAssets: ['favicon.png', 'apple-touch-icon.png', '_headers'],
    manifest: {
      name: 'Big Brother', short_name: 'Big Brother', description: 'See what the algorithm decided you are. Your exports, parsed on your own device. Nothing uploaded.',
      start_url: './', scope: './', display: 'standalone', background_color: '#F4F1EA', theme_color: '#06080C', orientation: 'portrait',
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
      categories: ['utilities', 'productivity'],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,woff2}'], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, navigateFallback: 'index.html', cleanupOutdatedCaches: true },
  })],
  base: './', server: { port: 5173 }, build: { target: 'es2022', sourcemap: false }, worker: { format: 'es' },
});
