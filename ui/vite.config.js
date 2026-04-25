import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
    plugins: [preact()],
    build: {
        outDir: 'dist',
    },
    server: {
        proxy: {
            '/api': 'http://localhost:3000',
            '/programme': 'http://localhost:3000',
        },
    },
});
