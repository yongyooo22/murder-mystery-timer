/**
 * 화면 점검용 스크린샷 + 자동 검사(가로 넘침, 44px 미만 터치 영역).
 * 사용: 서버를 띄운 뒤(npm run build && npm start) `npm run qa:screens`
 * 결과: e2e/screenshots/*.png, e2e/screenshots/report.json
 *
 * 주의: 서버 데이터를 지우고 점검용 시나리오로 채운다. 점검 전용 DATA_DIR로 띄운 서버에만 실행하세요.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const OUT = process.env.OUT_DIR ?? 'e2e/screenshots';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const VIEWPORTS = {
  m360: { width: 360, height: 740 },
  m390: { width: 390, height: 844 },
  tabP: { width: 768, height: 1024 },
  tabL: { width: 1024, height: 768 },
  mLand: { width: 844, height: 390 },
};

const LONG_NAME = '비 오는 밤 외딴 산장에서 벌어진 의문의 연쇄 사건과 사라진 유언장의 비밀';
const LONG_STAGE = '최종 추리와 범인 지목 — 각자 근거를 들어 발표하고 한 명씩 투표하기';

const m = (min) => min * 60;
const STANDARD = [
  { name: '오프닝 · 캐릭터 소개', durationSec: m(10) },
  { name: '1차 조사', durationSec: m(20) },
  { name: '1차 토론', durationSec: m(15) },
  { name: '2차 조사', durationSec: m(20) },
  { name: '2차 토론', durationSec: m(15) },
  { name: '최종 추리 · 범인 지목', durationSec: m(10) },
  { name: '엔딩 · 해설', durationSec: m(10) },
];
const LONG_STAGES = [
  { name: '사건 소개', durationSec: m(5) },
  { name: '등장인물 각자의 비밀 확인과 알리바이 정리 시간', durationSec: m(15) },
  { name: LONG_STAGE, durationSec: m(12) + 30 },
  { name: '해설', durationSec: m(90) },
];
const MANY = Array.from({ length: 30 }, (_, i) => ({ name: `조사 ${i + 1}`, durationSec: m(3) }));

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.status === 204 ? null : res.json();
}

async function resetData() {
  for (const it of (await api('GET', '/scenarios')).items) await api('DELETE', `/scenarios/${it.id}`);
  for (const it of (await api('GET', '/trash')).items) await api('DELETE', `/trash/${it.id}`);
}

async function seed() {
  await resetData();
  const many = (await api('POST', '/scenarios', { name: '단계가 많은 시나리오', stages: MANY })).item;
  const long = (await api('POST', '/scenarios', { name: LONG_NAME, stages: LONG_STAGES })).item;
  const std = (await api('POST', '/scenarios', { name: '저택의 밤', stages: STANDARD })).item;
  const old = (await api('POST', '/scenarios', { name: '지난 시즌 시나리오', stages: STANDARD.slice(0, 3) })).item;
  await api('DELETE', `/scenarios/${old.id}`);
  return { many, long, std };
}

function gameState({ name, stages, current = 0, elapsedSec = 0, paused = false }) {
  const now = Date.now();
  const planned = stages[current].durationSec * 1000;
  const remaining = planned - elapsedSec * 1000;
  return {
    v: 1,
    id: 'qa-game',
    scenarioId: null,
    scenarioName: name,
    stages: stages.map((s, i) => ({ id: `s${i}`, name: s.name, plannedSec: s.durationSec })),
    startedAt: now - 3_600_000,
    current,
    allottedMs: planned,
    segmentBaseMs: paused ? elapsedSec * 1000 : 0,
    runningSince: paused ? null : now - elapsedSec * 1000,
    actualMs: stages.map((s, i) => (i < current ? s.durationSec * 1000 + 37_000 : 0)),
    visited: stages.map((_, i) => i <= current),
    warned: remaining <= 60_000,
    timeUp: remaining <= 0,
  };
}

function resultState() {
  const stages = STANDARD.map((s, i) => ({
    id: `s${i}`,
    name: s.name,
    plannedSec: s.durationSec,
    actualSec: i < 5 ? s.durationSec + [83, -37, 120, 0, 215][i] : 0,
    visited: i < 5,
  }));
  const now = Date.now();
  return {
    v: 1,
    id: 'qa-result',
    scenarioId: null,
    scenarioName: LONG_NAME,
    startedAt: now - 5_400_000,
    endedAt: now,
    stages,
    plannedTotalSec: stages.reduce((a, s) => a + s.plannedSec, 0),
    actualTotalSec: stages.reduce((a, s) => a + s.actualSec, 0),
  };
}

const report = [];

async function inspect(page, name) {
  await page.waitForTimeout(250);
  const data = await page.evaluate(() => {
    const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const small = [];
    for (const el of document.querySelectorAll('button, input, textarea, a[href], [role="switch"]')) {
      if (el.closest('.visually-hidden')) continue;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width <= 1 || r.height <= 1 || style.visibility === 'hidden' || style.display === 'none') continue;
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      // 터치 영역을 ::before로 넓힌 스위치는 실제 영역으로 계산
      const extra = el.classList.contains('switch') ? 10 : 0;
      if (r.width < 44 || r.height + extra < 44) {
        small.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    const overlaps = [];
    const timer = document.querySelector('.play-timer__digits');
    if (timer) {
      const t = timer.getBoundingClientRect();
      for (const el of document.querySelectorAll('.play-stage__name, .play-status, .play-info, .play-top')) {
        const r = el.getBoundingClientRect();
        if (r.bottom > t.top + 2 && r.top < t.bottom - 2 && r.right > t.left && r.left < t.right) overlaps.push(el.className);
      }
    }
    const clipped = [];
    for (const el of document.querySelectorAll('.btn__label, .play-info__label, .topbar__title')) {
      if (el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 24));
    }
    return {
      overflowX,
      small,
      overlaps,
      clipped,
      timerFontPx: timer ? parseFloat(getComputedStyle(timer).fontSize) : null,
      timerRect: timer ? timer.getBoundingClientRect().toJSON() : null,
    };
  });
  report.push({ name, ...data });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const flags = [
    data.overflowX > 0 && `가로넘침 ${data.overflowX}px`,
    data.small.length && `작은터치 ${data.small.length}`,
    data.overlaps.length && `겹침 ${data.overlaps.join(',')}`,
    data.clipped.length && `잘림 ${data.clipped.join(',')}`,
  ].filter(Boolean);
  console.log(`${name.padEnd(28)} ${data.timerFontPx ? `timer ${data.timerFontPx}px ` : ''}${flags.join(' | ') || 'OK'}`);
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const ids = await seed();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    if (ONLY && !ONLY.test(vpName)) continue;
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: vpName !== 'tabL', locale: 'ko-KR', serviceWorkers: 'block' });
    const page = await context.newPage();
    const shot = (n) => inspect(page, `${vpName}-${n}`);
    const setStorage = (key, value) =>
      page.evaluate(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v))), [key, value]);

    // 목록(기본) + 진행 중인 게임
    await page.goto(`${BASE}/#/`);
    await setStorage('mt:game:v1', gameState({ name: '저택의 밤', stages: STANDARD, current: 2, elapsedSec: 300, paused: true }));
    await page.reload();
    await page.waitForSelector('.scenario-row');
    await shot('list');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot('list-bottom');
    await page.evaluate(() => window.scrollTo(0, 0));

    // 더보기 메뉴
    await page.locator('.scenario-row').first().getByRole('button', { name: /더보기/ }).click();
    await shot('list-menu');
    await page.keyboard.press('Escape');

    // 상세(열기)
    await page.locator('.scenario-row', { hasText: '저택의 밤' }).getByRole('button', { name: /열기/ }).click();
    await page.waitForSelector('.stage-preview');
    await shot('detail');
    await page.goto(`${BASE}/#/scenario/${ids.many.id}`);
    await page.waitForSelector('.stage-preview');
    await shot('detail-many');

    // 설정
    await page.goto(`${BASE}/#/`);
    await page.getByRole('button', { name: '설정' }).click();
    await shot('settings');
    await page.keyboard.press('Escape');

    // 오프라인(캐시 표시)
    await page.route('**/api/**', (route) => route.abort());
    await page.reload();
    await page.waitForSelector('.alert--offline');
    await shot('list-offline-cache');

    // 오프라인(캐시 없음)
    await setStorage('mt:scenarios:v1', null);
    await setStorage('mt:game:v1', null);
    await page.reload();
    await page.waitForSelector('.empty--error');
    await shot('list-offline-nocache');
    await page.unroute('**/api/**');

    // 불러오는 중(캐시 없음)
    await page.route('**/api/scenarios', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue().catch(() => {});
    });
    await page.reload();
    await page.waitForSelector('.list-loading');
    await shot('list-loading');
    await page.unroute('**/api/scenarios');

    // 첫 사용(빈 목록)
    await page.route('**/api/scenarios', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], retentionDays: 30 }) }),
    );
    await page.reload();
    await page.waitForSelector('.empty');
    await shot('list-empty');
    await page.unroute('**/api/scenarios');

    // 편집: 긴 이름 + 단계
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await page.waitForSelector('.scenario-row');
    await page.goto(`${BASE}/#/edit/${ids.long.id}`);
    await page.waitForSelector('.stage-row');
    await shot('edit-long');
    // 입력 오류
    await page.locator('.stage-row__name').first().fill('');
    await page.locator('.time-input__field').nth(1).fill('75');
    await page.getByRole('button', { name: /^저장/ }).click();
    await page.waitForTimeout(400);
    await shot('edit-errors');
    // 빠른 입력 펼침
    await page.getByRole('button', { name: /빠른 입력/ }).click();
    await page.locator('.quick__textarea').fill('오프닝 5\n조사\n토론 15:75');
    await page.getByRole('button', { name: '단계로 변환' }).click();
    await page.locator('.quick__toggle').scrollIntoViewIfNeeded();
    await shot('edit-quick-errors');
    await page.locator('.quick__textarea').fill('오프닝 5\n조사 20');
    await page.getByRole('button', { name: '단계로 변환' }).click();
    await shot('edit-quick-choice');
    await page.getByRole('button', { name: '뒤에 추가' }).click();
    // 저장 실패
    await page.locator('.stage-row__name').first().fill('사건 소개');
    await page.locator('.time-input__field').nth(1).fill('30');
    await page.route('**/api/scenarios/**', (route) => route.abort());
    await page.getByRole('button', { name: /^저장/ }).click();
    await page.waitForSelector('.edit-bar__alert');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot('edit-save-failed');
    await page.unroute('**/api/scenarios/**');
    // 나가기 확인
    await page.getByRole('button', { name: '뒤로' }).click();
    await shot('edit-leave-confirm');
    await page.getByRole('button', { name: '저장하지 않고 나가기' }).click();

    // 새 시나리오(빈)
    await page.goto(`${BASE}/#/new`);
    await page.waitForSelector('.stage-empty');
    await shot('edit-new');
    // 단계가 많은 시나리오 편집
    await page.goto(`${BASE}/#/`);
    await page.waitForSelector('.scenario-row');
    await page.goto(`${BASE}/#/edit/${ids.many.id}`);
    await page.waitForSelector('.stage-row');
    await page.evaluate(() => window.scrollTo(0, 1200));
    await shot('edit-many');

    // 진행 화면 상태들
    const play = async (n, state) => {
      await setStorage('mt:game:v1', state);
      await page.goto(`${BASE}/#/play`);
      await page.reload();
      await page.waitForSelector('.play-timer__digits');
      await shot(n);
    };
    await play('play-running', gameState({ name: '저택의 밤', stages: STANDARD, current: 2, elapsedSec: 28 }));
    await play('play-paused', gameState({ name: '저택의 밤', stages: STANDARD, current: 2, elapsedSec: 400, paused: true }));
    await play('play-warning', gameState({ name: '저택의 밤', stages: STANDARD, current: 3, elapsedSec: m(20) - 42 }));
    await play('play-overtime', gameState({ name: '저택의 밤', stages: STANDARD, current: 3, elapsedSec: m(20) + 83 }));
    await play('play-last-overtime', gameState({ name: LONG_NAME, stages: LONG_STAGES, current: 3, elapsedSec: m(90) + 125 }));
    await play('play-long-name', gameState({ name: LONG_NAME, stages: LONG_STAGES, current: 2, elapsedSec: 10 }));
    await play('play-hour', gameState({ name: LONG_NAME, stages: LONG_STAGES, current: 3, elapsedSec: 30 }));
    await page.getByRole('button', { name: '단계 목록 보기' }).click();
    await shot('play-stage-list');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '게임 종료' }).click();
    await shot('play-end-confirm');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '이전 단계' }).click();
    await shot('play-prev-confirm');
    await page.keyboard.press('Escape');

    // 결과
    await setStorage('mt:result:v1', resultState());
    await page.goto(`${BASE}/#/result`);
    await page.reload();
    await page.waitForSelector('.result-summary');
    await shot('result');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot('result-bottom');

    // 휴지통(항목 있음 / 비어 있음)
    await page.goto(`${BASE}/#/trash`);
    await page.waitForSelector('.trash-row');
    await shot('trash');
    await page.route('**/api/trash', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], retentionDays: 30 }) }),
    );
    await page.reload();
    await page.waitForSelector('.empty');
    await shot('trash-empty');
    await page.unroute('**/api/trash');

    await context.close();
  }

  await browser.close();
  await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  const problems = report.filter((r) => r.overflowX > 0 || r.small.length || r.overlaps.length || r.clipped.length);
  console.log(`\n${report.length}개 화면 점검, 문제 ${problems.length}개`);
  if (problems.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
