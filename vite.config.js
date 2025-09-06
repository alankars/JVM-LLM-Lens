import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/ui',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
