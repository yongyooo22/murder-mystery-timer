/**
 * 화면 점검용 스크린샷 + 자동 검사(가로 넘침, 44px 미만 터치 영역, 진행 화면 겹침·잘림·화면 밖 조작).
 * 사용: 서버를 띄운 뒤(npm run build && npm start) `npm run qa:screens`
 * 결과: e2e/screenshots/*.png, e2e/screenshots/report.json
 *
 * 주의: 서버 데이터를 지우고 점검용 시나리오로 채운다. 점검 전용 DATA_DIR로 띄운 서버에만 실행하세요.
 * (Redis 저장소로 띄운 서버에서는 실행을 거부한다.)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const OUT = process.env.OUT_DIR ?? 'e2e/screenshots';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

// 가로 화면을 주로 쓰므로 가로 크기를 넉넉히 점검한다(세로도 깨지지 않는지 함께 본다).
const VIEWPORTS = {
  mLand: { width: 844, height: 390 }, // iPhone 14 가로
  maxLand: { width: 932, height: 430 }, // iPhone Pro Max 가로
  aLand: { width: 915, height: 412 }, // Android 가로
  seLand: { width: 667, height: 375 }, // iPhone SE 가로
  smallLand: { width: 640, height: 360 }, // 작은 Android 가로
  tabL: { width: 1024, height: 768 }, // iPad 가로
  tabAirL: { width: 1180, height: 820 }, // iPad Air 가로
  tabProL: { width: 1366, height: 1024 }, // iPad Pro 12.9 가로
  m360: { width: 360, height: 740 },
  m390: { width: 390, height: 844 },
  seP: { width: 375, height: 667 },
  tabP: { width: 768, height: 1024 },
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
  // 점검은 데이터를 모두 지우므로 Redis(운영 데이터)에 연결된 서버에서는 실행하지 않는다.
  const health = await api('GET', '/health');
  if (health?.storage !== 'file') {
    throw new Error(`이 서버의 저장소가 '${health?.storage}'예요. 점검은 파일 저장소로 띄운 점검 전용 서버에서만 실행하세요.`);
  }
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
    const inView = (r) => r.bottom > 0 && r.top < window.innerHeight;
    const small = [];
    for (const el of document.querySelectorAll('button, input, textarea, a[href], [role="switch"]')) {
      if (el.closest('.visually-hidden')) continue;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width <= 1 || r.height <= 1 || style.visibility === 'hidden' || style.display === 'none') continue;
      if (!inView(r)) continue;
      // 터치 영역을 ::before로 넓힌 스위치는 실제 영역으로 계산
      const extra = el.classList.contains('switch') ? 12 : 0;
      if (r.width < 44 || r.height + extra < 44) {
        small.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    const problems = [];
    const play = document.querySelector('.play');
    if (play) {
      // 진행 화면에서는 시나리오 이름이 늘 보여야 한다(세로에서 진행 순서를 펼쳐 아래로 내린 경우 제외).
      const scenarioName = document.querySelector('.play-brand__name');
      const r = scenarioName?.getBoundingClientRect();
      const visible = r && r.width > 20 && r.height > 10 && r.top >= 0 && r.bottom <= window.innerHeight && getComputedStyle(scenarioName).visibility !== 'hidden';
      if (window.scrollY === 0 && (!visible || !scenarioName.textContent.trim())) problems.push('시나리오 이름 안 보임');
      // 핵심 조작(−1분·일시정지·+1분·이전·다음)이 첫 화면 안에 있어야 한다(세로에서 목록을 펼친 경우 제외).
      if (window.scrollY === 0) {
        for (const btn of document.querySelectorAll('.play-controls .btn')) {
          const b = btn.getBoundingClientRect();
          if (b.bottom > window.innerHeight + 1 || b.top < 0) problems.push(`조작 버튼 화면 밖: ${btn.textContent.trim()}`);
        }
      }
      // 단계 이름·시나리오 이름·진행 순서 이름이 잘리지 않아야 한다.
      for (const el of document.querySelectorAll('.play-stage__name, .play-brand__name, .route-row__name')) {
        if (getComputedStyle(el).display === 'none' || el.closest('[data-open="false"] .play-route__panel')) continue;
        // 낮은 가로 화면에서 시나리오 이름을 두 줄로 줄인 것은 의도한 것(전체 이름은 title로 제공)
        if (el.title === el.textContent.trim() && getComputedStyle(el).webkitLineClamp !== 'none') continue;
        if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) problems.push(`이름 잘림: ${el.textContent.trim().slice(0, 16)}`);
      }
      // 진행 순서 목록이 보이면 현재 단계가 목록의 보이는 영역 안에 있어야 한다.
      const list = document.querySelector('.route-list');
      const current = list?.querySelector('[aria-current="step"]');
      if (list && current && list.getClientRects().length > 0) {
        const lr = list.getBoundingClientRect();
        const cr = current.getBoundingClientRect();
        if (cr.top < lr.top - 1 || cr.bottom > lr.bottom + 1) problems.push('현재 단계가 목록에서 안 보임');
      }
      // 큰 숫자는 화면에서 가장 큰 글자여야 한다.
      const digits = document.querySelector('.play-timer__digits');
      const stageName = document.querySelector('.play-stage__name');
      if (digits && stageName && parseFloat(getComputedStyle(digits).fontSize) <= parseFloat(getComputedStyle(stageName).fontSize) * 1.5) {
        problems.push('숫자가 충분히 크지 않음');
      }
    }
    const overlaps = [];
    const timer = document.querySelector('.play-timer__digits');
    if (timer) {
      const t = timer.getBoundingClientRect();
      for (const el of document.querySelectorAll('.play-stage__name, .play-meta, .play-info, .play-progress, .play-controls, .play-tools, .play-brand, .play-route')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.bottom > t.top + 2 && r.top < t.bottom - 2 && r.right > t.left && r.left < t.right) overlaps.push(el.className);
      }
      // 오른쪽 위 아이콘과 단계 번호·상태가 겹치지 않아야 한다.
      const tools = document.querySelector('.play-tools')?.getBoundingClientRect();
      const meta = document.querySelector('.play-meta')?.getBoundingClientRect();
      if (tools && meta && tools.width > 0 && tools.bottom > meta.top && tools.top < meta.bottom && tools.left < meta.right && tools.right > meta.left) {
        overlaps.push('play-tools×play-meta');
      }
    }
    const clipped = [];
    for (const el of document.querySelectorAll('.btn__label, .play-info__label, .topbar__title, .play-step, .play-status__label, .play-route__total')) {
      if (el.getClientRects().length === 0) continue;
      if (el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 24));
    }
    const primary = document.querySelector('.play-primary');
    return {
      overflowX,
      small,
      problems,
      overlaps,
      clipped,
      timerFontPx: timer ? parseFloat(getComputedStyle(timer).fontSize) : null,
      timerRect: timer ? timer.getBoundingClientRect().toJSON() : null,
      primaryRect: primary ? primary.getBoundingClientRect().toJSON() : null,
    };
  });
  report.push({ name, ...data });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const flags = [
    data.overflowX > 0 && `가로넘침 ${data.overflowX}px`,
    data.small.length && `작은터치 ${data.small.join(', ')}`,
    data.problems.length && data.problems.join(', '),
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
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: !vpName.startsWith('tab'), locale: 'ko-KR', serviceWorkers: 'block' });
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

    // 새 시나리오 창(템플릿 2개 + 직접 구성)
    await page.getByRole('button', { name: '새 시나리오', exact: true }).click();
    await page.waitForSelector('.new-scenario');
    await shot('new-scenario');
    await page.keyboard.press('Escape');

    // 시나리오가 많은 목록
    await page.route('**/api/scenarios', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: Array.from({ length: 16 }, (_, i) => ({
            id: `many-${i}`,
            name: i === 3 ? LONG_NAME : `시나리오 ${i + 1}`,
            stages: STANDARD.slice(0, 3 + (i % 5)).map((st, j) => ({ id: `m${i}-${j}`, ...st })),
            createdAt: new Date(Date.now() - i * 60_000).toISOString(),
            updatedAt: new Date(Date.now() - i * 60_000).toISOString(),
            rev: 1,
            deletedAt: null,
          })),
          retentionDays: 30,
        }),
      }),
    );
    await page.reload();
    await page.waitForSelector('.scenario-row');
    await shot('list-many');

    // 정렬 메뉴 → 가나다순(이 기기에 저장되므로 점검 뒤 기본 정렬로 되돌린다)
    const sortButton = page.getByRole('button', { name: /^정렬 기준/ });
    await sortButton.click();
    await page.waitForSelector('.menu');
    await shot('list-sort-menu');
    await page.getByRole('menuitemradio', { name: '가나다순' }).click();
    await shot('list-sorted');
    await sortButton.click();
    await page.getByRole('menuitemradio', { name: '최근 수정순' }).click();

    // 검색: 많은 목록에서 거르기, 결과 없음
    const search = page.getByRole('searchbox', { name: '시나리오 이름 검색' });
    await search.fill('시나리오 1');
    await shot('list-search');
    await search.fill('없는 이름');
    await page.waitForSelector('.list-empty');
    await shot('list-search-empty');
    await page.unroute('**/api/scenarios');

    // 설정
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await page.waitForSelector('.scenario-row');
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
    await page.waitForSelector('.list-empty');
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
    // 해시만 바꾸면 같은 문서에서 이동하므로(진행 중인 게임이 없으면 목록으로 돌아감) 쿼리를 바꿔 새로 연다.
    const openFresh = (hash) => page.goto(`${BASE}/?fresh=${Date.now()}${hash}`);
    const play = async (n, state) => {
      await setStorage('mt:game:v1', state);
      await openFresh('#/play');
      await page.waitForSelector('.play-timer__digits');
      await shot(n);
    };
    await play('play-waiting', gameState({ name: '저택의 밤', stages: STANDARD, current: 0, elapsedSec: 0, paused: true }));
    await play('play-running', gameState({ name: '저택의 밤', stages: STANDARD, current: 2, elapsedSec: 28 }));
    await play('play-paused', gameState({ name: '저택의 밤', stages: STANDARD, current: 2, elapsedSec: 400, paused: true }));
    await play('play-warning', gameState({ name: '저택의 밤', stages: STANDARD, current: 3, elapsedSec: m(20) - 42 }));
    await play('play-overtime', gameState({ name: '저택의 밤', stages: STANDARD, current: 3, elapsedSec: m(20) + 83 }));
    await play('play-overtime-paused', gameState({ name: '저택의 밤', stages: STANDARD, current: 3, elapsedSec: m(20) + 83, paused: true }));
    await play('play-last-overtime', gameState({ name: LONG_NAME, stages: LONG_STAGES, current: 3, elapsedSec: m(90) + 125 }));
    await play('play-long-name', gameState({ name: LONG_NAME, stages: LONG_STAGES, current: 2, elapsedSec: 10 }));
    await play('play-many', gameState({ name: '단계가 많은 시나리오', stages: MANY, current: 21, elapsedSec: 30 }));
    await play('play-hour', gameState({ name: LONG_NAME, stages: LONG_STAGES, current: 3, elapsedSec: 30 }));
    // 세로 화면: ‘진행 순서 보기’를 펼친 모습
    const routeToggle = page.getByRole('button', { name: '진행 순서 보기' });
    if (await routeToggle.isVisible()) {
      await routeToggle.click();
      await page.waitForTimeout(500);
      await shot('play-route-open');
      await routeToggle.click();
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.getByRole('button', { name: '게임 종료' }).click();
    await shot('play-end-confirm');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '이전 단계' }).click();
    await shot('play-prev-confirm');
    await page.keyboard.press('Escape');

    // 결과
    await setStorage('mt:result:v1', resultState());
    await openFresh('#/result');
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
  const problems = report.filter((r) => r.overflowX > 0 || r.small.length || r.problems.length || r.overlaps.length || r.clipped.length);
  console.log(`\n${report.length}개 화면 점검, 문제 ${problems.length}개`);
  if (problems.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
