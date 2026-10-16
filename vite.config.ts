import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { visualizer } from 'rollup-plugin-visualizer';
import manifest from './public/manifest.json';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    crx({ manifest }),
    mode === 'analyze' && visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        sidepanel: 'src/sidepanel/index.html',
        popup: 'src/popup/index.html',
      },
      output: {
        manualChunks: {
          // Split vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'db-vendor': ['dexie'],
          'utils-vendor': ['jszip', 'react-window'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: mode === 'analyze',
  },
}));
