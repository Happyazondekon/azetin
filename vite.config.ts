import { defineConfig } from 'vite';

// base './' : chemins relatifs, pour qu'OpenGame serve le build depuis n'importe quel dossier.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173, open: true },
});
