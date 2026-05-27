import { defineConfig } from 'vite';

export default defineConfig({
  base: '/wildbus/',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
});
