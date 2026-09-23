import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: path.resolve(rootDir, 'public/build'),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(rootDir, 'public/src/widget.tsx'),
      formats: ['iife'],
      name: 'NastrojeAIWidgetApp',
      fileName: () => 'widget.js',
      cssFileName: 'widget',
    },
  },
});
