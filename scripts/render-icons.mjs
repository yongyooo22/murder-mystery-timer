// public/icons/*.svg를 PNG로 변환한다(홈 화면 아이콘용). 사용: npm run icons
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
const targets = [
  { src: 'icon.svg', out: 'icon-192.png', size: 192 },
  { src: 'icon.svg', out: 'icon-512.png', size: 512 },
  { src: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 },
  // iOS는 투명한 둥근 모서리를 검게 채우므로 꽉 찬 배경 버전을 쓴다.
  { src: 'icon-maskable.svg', out: 'apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const { src, out, size } of targets) {
  const svg = await readFile(path.join(dir, src), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.locator('svg').screenshot({ path: path.join(dir, out), omitBackground: true });
  console.log('wrote', out);
}
await browser.close();
