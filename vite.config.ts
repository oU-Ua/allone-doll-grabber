import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  server: {
    fs: {
      allow: [path.resolve(__dirname)],
    },
  },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
});
