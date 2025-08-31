import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact()],
  server: { // for vite dev server
    port: 8995,
    allowedHosts: ['securepollingsystem.org','securepollingsystem.com','stemgrid.org']
  },
  build: {
    // generate .vite/manifest.json in outDir
    // see https://vite.dev/guide/backend-integration.html
    manifest: true
  },
});
