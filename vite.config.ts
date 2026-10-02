/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { APP_CONFIG } from './src/config';

const API_PORT = Number(process.env.PORT ?? 8787);

function webManifest(): string {
  return JSON.stringify(
    {
      name: APP_CONFIG.name,
      short_name: APP_CONFIG.shortName,
      description: APP_CONFIG.description,
      lang: 'ko',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'any',
      background_color: APP_CONFIG.themeColor,
      theme_color: APP_CONFIG.themeColor,
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  );
}

/** 앱 이름·설명·테마 색을 src/config.ts 한 곳에서 index.html과 manifest에 주입한다. */
function appMeta(): Plugin {
  return {
    name: 'app-meta',
    transformIndexHtml(html) {
      return html
        .replaceAll('%APP_NAME%', APP_CONFIG.name)
        .replaceAll('%APP_SHORT_NAME%', APP_CONFIG.shortName)
        .replaceAll('%APP_DESCRIPTION%', APP_CONFIG.description)
        .replaceAll('%THEME_COLOR%', APP_CONFIG.themeColor);
    },
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        res.end(webManifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: webManifest() });
    },
  };
}

export default defineConfig({
  // 상대 경로로 빌드해 하위 경로(예: GitHub Pages)에도 그대로 올릴 수 있게 한다.
  base: './',
  plugins: [react(), appMeta()],
  server: {
    proxy: { '/api': `http://localhost:${API_PORT}` },
  },
  build: {
    target: 'es2020',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
