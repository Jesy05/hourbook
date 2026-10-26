import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { devApi } from './dev-api';

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  // exceljs is large but only loaded on demand when a report is downloaded.
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
});
