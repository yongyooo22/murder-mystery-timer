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
  // 주로 가로 화면으로 쓰므로 가로 휴대폰·가로 태블릿을 먼저, 세로 휴대폰도 함께 확인한다.
  projects: [
    { name: 'phone-landscape', use: { ...devices['Pixel 7 landscape'], browserName: 'chromium' } },
    { name: 'tablet-landscape', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' } },
    { name: 'phone-portrait', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
  webServer: {
    // 빌드된 dist를 서버가 그대로 제공한다(npm run test:e2e가 먼저 빌드한다).
    command: `node e2e/start-server.mjs`,
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
  },
});
