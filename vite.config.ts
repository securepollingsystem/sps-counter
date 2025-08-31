import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [preact()],
	server: {
		port: 8995,
		allowedHosts: ['securepollingsystem.org','securepollingsystem.com','stemgrid.org']
	}
});
