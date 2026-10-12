import { copyFileSync, mkdirSync } from 'node:fs';

// dist/portal.js is the single ES module the container imports; dist/portal.css is its stylesheet.
mkdirSync('dist', { recursive: true });
copyFileSync('dist/module/browser/main.js', 'dist/portal.js');
copyFileSync('src/styles/portal.css', 'dist/portal.css');
