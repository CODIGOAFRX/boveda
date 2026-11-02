import { defineConfig } from 'vite';

// En producción vive bajo pedrogomez.dev/proyecto/boveda, como Catábasis y el Herbario.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/proyecto/boveda/' : '/',
  // Se anida en dist/proyecto/boveda para que el Worker sirva la misma ruta que la URL pública.
  build: { target: 'es2022', outDir: 'dist/proyecto/boveda', emptyOutDir: true },
  test: { include: ['src/**/*.test.ts'] },
}));
