import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Every request the React app makes to /api/... is forwarded to the
    // Express server on port 5000. This keeps the frontend code free of
    // hard-coded hostnames and avoids CORS issues during development.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
