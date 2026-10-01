import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ko-KR',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
  webServer: {
    // 빌드된 dist를 서버가 그대로 제공한다(npm run test:e2e가 먼저 빌드한다).
    command: `node e2e/start-server.mjs`,
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
  },
});
