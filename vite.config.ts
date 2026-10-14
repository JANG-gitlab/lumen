import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';

export default defineConfig({
  // Chemins relatifs : le site fonctionne aussi bien à la racine d'un
  // domaine que sous https://<compte>.github.io/lumen/.
  base: './',
  plugins: [react(), wgslVitePlugin()],
});