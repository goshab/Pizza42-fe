import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/pizza42': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
