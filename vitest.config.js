import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom provides a DOM environment for DOM/canvas-adjacent tests
    // (document, window, HTMLCanvasElement, localStorage, etc.).
    environment: 'jsdom',
    include: ['test/**/*.test.js', 'src/**/*.test.js'],
  },
});
