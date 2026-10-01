import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Split heavy vendor libraries into separate cached chunks so a
      // change in app code does not invalidate the whole bundle.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
            if (/[\\/]node_modules[\\/](recharts|d3-[a-z-]+|internmap|delaunator|robust-predicates|victory-vendor|@visx)[\\/]/.test(id)) return 'vendor-charts';
            if (/[\\/]node_modules[\\/](lucide-react)[\\/]/.test(id)) return 'vendor-icons';
            if (/[\\/]node_modules[\\/](motion|framer-motion)[\\/]/.test(id)) return 'vendor-motion';
            if (/[\\/]node_modules[\\/]@google[\\/]genai[\\/]/.test(id)) return 'vendor-ai';
            return 'vendor';
          },
        },
      },
      chunkSizeWarningLimit: 400,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
