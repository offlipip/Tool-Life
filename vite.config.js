import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' makes the build use relative asset paths, so it works
// whether it's hosted at the domain root or in a sub-path like
// https://usuario.github.io/nome-do-repo/ (GitHub Pages project sites)
// without needing to edit anything here.
export default defineConfig({
  plugins: [react()],
  base: './',
});
