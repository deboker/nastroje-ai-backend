import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(rootDir, 'admin/build'),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(rootDir, 'admin/src/main.tsx'),
      formats: ['iife'],
      name: 'NastrojeAIAdminApp',
      fileName: () => 'admin.js',
      cssFileName: 'admin',
    },
  },
});
