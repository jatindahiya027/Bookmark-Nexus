import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src/renderer') },
  },
  server: {
    port: 5173,
    strictPort: true,   // fail fast if port is taken, don't silently pick another
    host: 'localhost',
  },
  clearScreen: false,   // keep Electron logs visible in same terminal
});
