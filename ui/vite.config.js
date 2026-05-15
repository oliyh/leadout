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
        },
        // Allow client-side routes like /join/:id and /register on hard refresh
        historyApiFallback: true,
        host: true,
        headers: {
            // 'same-origin' (Vite 6 default with host:true) blocks Google Sign-In's
            // popup postMessage back to the opener. 'same-origin-allow-popups' permits it.
            'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        },
    },
});
