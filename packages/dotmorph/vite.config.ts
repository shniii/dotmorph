import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Library build: ESM only, three and react stay external (peer dependencies).
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: { index: 'src/index.ts', react: 'src/react.tsx' },
      formats: ['es'],
    },
    rolldownOptions: {
      external: ['three', 'react', 'react-dom', 'react/jsx-runtime'],
    },
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
  },
});
