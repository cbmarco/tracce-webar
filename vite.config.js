import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // The pinned detector uses legacy `this.AR`/`this.CV` CommonJS globals.
  // Adapt only its two modules to ESM; do not use eval or remote scripts.
  plugins: [{
    name: 'aruco-esm', enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0].replaceAll('\\', '/');
      if (file.endsWith('/js-aruco2/src/aruco.js')) {
        return code.replace("var CV = this.CV || require('./cv').CV;", "import { CV } from './cv.js';").replace('this.AR = AR;', 'export default { AR };');
      }
      if (file.endsWith('/js-aruco2/src/cv.js')) return code.replace('this.CV = CV;', 'export { CV };');
    },
  }, react()],
  optimizeDeps: { exclude: ['js-aruco2'] },
  base: process.env.BASE_PATH || '/tracce-webar/',
  server: { host: true, port: 5174, strictPort: true },
});
