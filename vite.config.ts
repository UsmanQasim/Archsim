/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // installable, and works offline after the first visit
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ArchSim: system design simulator',
        short_name: 'ArchSim',
        description: 'Practise system design by building architectures and watching traffic, latency, failures and cost react live.',
        theme_color: '#f6f7f5',
        background_color: '#f6f7f5',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  base: './',
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // only these packages go in their own chunks; shared helpers stay with the app,
        // so the 3D chunk is fetched only when the Model view is first opened
        manualChunks(id) {
          if (/node_modules\/(three|@react-three|three-stdlib|troika|camera-controls|maath|meshline|@monogrid)/.test(id)) return 'three'
          if (/node_modules\/(@xyflow|d3-)/.test(id)) return 'flow'
          if (/node_modules\/(react|react-dom|scheduler|zustand|use-sync-external-store)\//.test(id)) return 'vendor'
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vendor'
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
