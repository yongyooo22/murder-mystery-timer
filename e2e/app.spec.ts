import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const T0 = new Date('2026-10-01T19:00:00+09:00').getTime();

async function resetData(request: APIRequestContext) {
  const list = await (await request.get('/api/scenarios')).json();
  for (const it of list.items) await request.delete(`/api/scenarios/${it.id}`);
  const trash = await (await request.get('/api/trash')).json();
  for (const it of trash.items) await request.delete(`/api/trash/${it.id}`);
}

async function createScenario(request: APIRequestContext, name: string, stages: Array<[string, number]>) {
  const res = await request.post('/api/scenarios', {
    data: { name, stages: stages.map(([stageName, durationSec]) => ({ name: stageName, durationSec })) },
  });
  return (await res.json()).item as { id: string; rev: number };
}

async function startClock(page: Page) {
  await page.clock.install({ time: T0 });
}

const digits = (page: Page) => page.locator('.play-timer__digits');

/** 목록에서 ‘실행’으로 진행 화면에 들어간 뒤 ‘시작’을 눌러 카운트다운을 시작한다. */
async function runScenario(page: Page, name: string) {
  await page.getByRole('button', { name: `‘${name}’ 실행` }).click();
  await expect(page.locator('.play-status__label')).toHaveText('시작 전');
  await page.getByRole('button', { name: '시작', exact: true }).click();
}

/** 첫 화면의 ‘새 시나리오’ 창에서 시작 방식을 고른다. */
async function chooseNew(page: Page, choice: RegExp) {
  await page.getByRole('button', { name: '새 시나리오', exact: true }).click();
  await page.getByRole('dialog', { name: '새 시나리오' }).getByRole('button', { name: choice }).click();
}

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test('첫 사용: 빈 목록 안내, 새 시나리오 창에서 템플릿 선택', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /내 시나리오/ })).toBeVisible();
  await expect(page.getByText('저장된 시나리오가 없어요')).toBeVisible();
  await expect(page.getByText('© 2026 제작: 김연경(earthssaem@gmail.com)')).toBeVisible();

  await page.getByRole('button', { name: '새 시나리오', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '새 시나리오' });
  await expect(dialog.getByRole('button', { name: /조사 2회\s*9단계 · 1시간 25분/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /조사 3회\s*11단계 · 1시간 40분/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /직접 구성/ })).toBeVisible();
  await dialog.getByRole('button', { name: /조사 2회/ }).click();

  await expect(page.getByRole('heading', { name: '새 시나리오' })).toBeVisible();
  await expect(page.getByLabel('1번 단계 이름')).toHaveValue('오프닝 · 캐릭터 소개');
  await expect(page.locator('.stage-row')).toHaveCount(9);
  // 저장하기 전에는 목록에 추가되지 않는다.
  expect((await (await page.request.get('/api/scenarios')).json()).items).toHaveLength(0);
});

test('새 시나리오 창은 키보드로 고르고 닫을 수 있고, 직접 구성은 빈 편집 화면을 연다', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('button', { name: '새 시나리오', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: '새 시나리오' });
  await expect(dialog.getByRole('button', { name: /조사 2회/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('button', { name: /조사 3회/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(dialog.getByRole('button', { name: /직접 구성/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();

  await open.press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '새 시나리오' })).toBeVisible();
  await expect(page.locator('.stage-row')).toHaveCount(0);
  await expect(page.getByLabel('시나리오 이름')).toHaveValue('');
});

test('빠른 입력으로 만들고 저장하면 목록에 보이고 실행할 수 있다', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByLabel('시나리오 이름').fill('빠른 입력 테스트');
  await page.getByRole('button', { name: /빠른 입력/ }).click();
  await page.getByLabel('빠른 입력 내용').fill('사건 소개 5\n1차 조사 20분\n토론 15:30');
  await page.getByRole('button', { name: '단계로 변환' }).click();
  await expect(page.locator('.stage-row')).toHaveCount(3);
  await expect(page.getByLabel('3번 단계 분')).toHaveValue('15');
  await expect(page.getByLabel('3번 단계 초')).toHaveValue('30');

  // 기존 단계가 있으면 추가/교체를 고르게 한다.
  await page.getByLabel('빠른 입력 내용').fill('해설 10');
  await page.getByRole('button', { name: '단계로 변환' }).click();
  await expect(page.getByRole('alertdialog', { name: '기존 단계가 있어요' })).toBeVisible();
  await page.getByRole('button', { name: '뒤에 추가' }).click();
  await expect(page.locator('.stage-row')).toHaveCount(4);
  await expect(page.locator('.edit-bar__value')).toContainText('50분 30초');

  await page.getByRole('button', { name: '저장', exact: true }).click();
  // 저장하면 목록으로 돌아가고 새 시나리오가 보인다 → 실행 → 시작
  const row = page.locator('.scenario-row', { hasText: '빠른 입력 테스트' });
  await expect(row).toContainText('4단계 · 총 50분 30초');
  await runScenario(page, '빠른 입력 테스트');
  await expect(page.getByRole('heading', { name: '사건 소개' })).toBeVisible();
  await expect(page.locator('.play-step')).toHaveText('01 / 04');
  await expect(page.locator('.play-brand__name')).toHaveText('빠른 입력 테스트');
});

test('실행은 진행 화면으로만 이동하고, 시작을 눌러야 카운트다운이 시작된다', async ({ page, request }) => {
  await createScenario(request, '저택의 밤', [['소개', 300]]);
  await startClock(page);
  await page.goto('/');
  await page.clock.pauseAt(T0 + 5_000);
  const row = page.locator('.scenario-row', { hasText: '저택의 밤' });
  await expect(row).toContainText('1단계 · 총 5분');
  await row.getByRole('button', { name: '‘저택의 밤’ 실행' }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await expect(page.locator('.play-status__label')).toHaveText('시작 전');
  await page.clock.runFor(30_000);
  await expect(digits(page)).toHaveText('05:00');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.locator('.play-status__label')).toHaveText('진행 중');
  await page.clock.runFor(61_000);
  await expect(digits(page)).toHaveText('03:59');
  // 뒤로 가면 목록으로 돌아오고, 진행 중인 게임으로 보인다.
  await page.goBack();
  await expect(page.locator('.resume')).toContainText('저택의 밤');
});

test('더보기 메뉴: 편집·복제·삭제', async ({ page, request }) => {
  await createScenario(request, '메뉴 테스트', [['소개', 300]]);
  await page.goto('/');
  const more = page.getByRole('button', { name: '‘메뉴 테스트’ 더보기' });
  await more.click();
  const menu = page.getByRole('menu', { name: '‘메뉴 테스트’ 더보기' });
  await expect(menu.getByRole('menuitem')).toHaveText(['편집', '복제', '삭제']);
  // 키보드로 옮겨 다니고 Esc로 닫으면 버튼으로 돌아온다.
  await expect(menu.getByRole('menuitem', { name: '편집' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: '복제' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  await more.click();
  await page.getByRole('menuitem', { name: '복제' }).click();
  await expect(page.locator('.scenario-row')).toHaveCount(2);
  await expect(page.locator('.list-head__count')).toContainText('2');

  await page.getByRole('button', { name: '‘메뉴 테스트’ 더보기' }).click();
  await page.getByRole('menuitem', { name: '편집' }).click();
  await expect(page.getByRole('heading', { name: '시나리오 편집' })).toBeVisible();
  await page.getByLabel('시나리오 이름').fill('메뉴 테스트 수정');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('.scenario-row', { hasText: '메뉴 테스트 수정' })).toBeVisible();

  await page.getByRole('button', { name: '‘메뉴 테스트 수정’ 더보기' }).click();
  await page.getByRole('menuitem', { name: '삭제' }).click();
  await page.getByRole('alertdialog', { name: '휴지통으로 옮길까요?' }).getByRole('button', { name: '휴지통으로 이동' }).click();
  await expect(page.locator('.scenario-row')).toHaveCount(1);
  await expect(page.locator('.scenario-row', { hasText: '메뉴 테스트 수정' })).toHaveCount(0);
});

test('타이머: 일시정지, ±1분, 다음 단계 확인, 시간 초과, 마지막 단계 마치기, 결과', async ({ page, request }) => {
  await createScenario(request, '흐름 테스트', [
    ['소개', 300],
    ['조사', 120],
    ['해설', 60],
  ]);
  await startClock(page);
  await page.goto('/');
  await page.clock.pauseAt(T0 + 5_000);
  await runScenario(page, '흐름 테스트');

  await expect(page.getByRole('heading', { name: '소개' })).toBeVisible();
  // 진행 화면에는 시나리오 이름이 항상 보인다.
  await expect(page.locator('.play-brand__name')).toHaveText('흐름 테스트');
  await expect(page.locator('.play-brand__name')).toBeInViewport();
  await expect(page).toHaveTitle(/흐름 테스트/);
  await expect(digits(page)).toHaveText('05:00');
  await expect(page.getByText('진행 중', { exact: true })).toBeVisible();

  await page.clock.runFor(61_000);
  await expect(digits(page)).toHaveText('03:59');

  await page.getByRole('button', { name: '일시정지' }).click();
  await expect(page.getByRole('button', { name: '계속하기' })).toBeVisible();
  await expect(page.locator('.play-status__label')).toHaveText('일시정지');
  await page.clock.runFor(60_000);
  await expect(digits(page)).toHaveText('03:59');
  await page.getByRole('button', { name: '계속하기' }).click();

  await page.getByRole('button', { name: '1분 늘리기' }).click();
  await expect(digits(page)).toHaveText('04:59');
  await page.getByRole('button', { name: '1분 줄이기' }).click();
  await expect(digits(page)).toHaveText('03:59');

  // 진행 중인 단계를 떠날 때는 확인한다.
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: '다음 단계로 넘어갈까요?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '취소' }).click();
  await expect(page.getByRole('heading', { name: '소개' })).toBeVisible();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계로' }).click();

  await expect(page.getByRole('heading', { name: '조사' })).toBeVisible();
  await expect(digits(page)).toHaveText('02:00');

  // 1분 이하: 글자로도 알린다.
  await page.clock.runFor(70_000);
  await expect(page.locator('.play-status__label')).toHaveText('진행 중 · 1분 이하');

  // 시간 초과: +mm:ss, 주요 버튼이 ‘다음 단계 시작’으로 바뀐다.
  await page.clock.runFor(55_000);
  await expect(digits(page)).toHaveText('+00:05');
  await expect(page.locator('.play-status__label')).toHaveText('시간 초과');
  await expect(page.getByRole('button', { name: '1분 줄이기' })).toBeDisabled();
  await page.clock.runFor(1_000);
  await page.getByRole('button', { name: '다음 단계 시작' }).click();

  // 마지막 단계: 0이 된 뒤에도 초과 시간을 세고 ‘게임 마치기’로 결과 화면에 간다.
  await expect(page.getByRole('heading', { name: '해설' })).toBeVisible();
  await expect(page.getByText('마지막 단계예요')).toBeVisible();
  await page.clock.runFor(70_000);
  await expect(digits(page)).toHaveText('+00:10');
  await page.clock.runFor(1_000);
  await page.locator('.play-primary').click();

  await expect(page.getByText('게임 종료', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '흐름 테스트' })).toBeVisible();
  // 계획 8분, 실제 = 61초 + 126초 + 71초 (일시정지 60초 제외, 초과 포함)
  const summary = page.locator('.result-summary');
  await expect(summary).toContainText('8분');
  await expect(summary).toContainText('4분 18초');
  await expect(summary).toContainText('계획보다 3분 42초 빨리 끝났어요');
  await expect(page.locator('.result-row')).toHaveCount(3);
  await expect(page.locator('.result-row--unplayed')).toHaveCount(0);
});

test('이전 단계로 돌아가면 원래 계획 시간으로 다시 시작하고 실제 시간은 누적된다', async ({ page, request }) => {
  await createScenario(request, '되돌리기', [
    ['하나', 120],
    ['둘', 120],
    ['셋', 120],
  ]);
  await startClock(page);
  await page.goto('/');
  await page.clock.pauseAt(T0 + 5_000);
  await runScenario(page, '되돌리기');

  await page.getByRole('button', { name: '1분 늘리기' }).click();
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계로' }).click();
  await page.clock.runFor(20_000);

  await page.getByRole('button', { name: '이전 단계' }).click();
  const dialog = page.getByRole('alertdialog', { name: '이전 단계로 돌아갈까요?' });
  await expect(dialog).toContainText('원래 계획 시간 02:00부터 새로');
  await dialog.getByRole('button', { name: '이전 단계로' }).click();
  await expect(page.getByRole('heading', { name: '하나' })).toBeVisible();
  await expect(digits(page)).toHaveText('02:00');
  await page.clock.runFor(10_000);

  // 게임 종료 → 진행하지 않은 단계는 ‘미진행’
  await page.getByRole('button', { name: '게임 종료' }).click();
  await page.getByRole('alertdialog', { name: '게임을 종료할까요?' }).getByRole('button', { name: '게임 종료' }).click();
  const rows = page.locator('.result-row');
  await expect(rows.nth(0)).toContainText('00:40');
  await expect(rows.nth(1)).toContainText('00:20');
  await expect(rows.nth(2)).toContainText('미진행');
});

test('규칙서를 그대로 붙여 넣으면 괄호 시간을 읽고, 시간 없는 줄은 빼고 변환할 수 있다', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByRole('button', { name: /빠른 입력/ }).click();
  await page.getByLabel('빠른 입력 내용').fill(
    [
      '## 게임 진행 방법',
      '게임을 진행하기 전, Map을 꺼내어 [앞]면으로 배치한 후 내용을 숙지해주세요.',
      '### 첫 번째 종 [20분]',
      '[아일랜드06, 07] 카드 진행',
      '예배 시간 [5분]',
      '조사 시간 [5분]',
      '밀담 및 토의 [10분]',
      '생각 정리 [1분] + 최후 발언 [5분] + 투표',
    ].join('\n'),
  );
  await page.getByRole('button', { name: '단계로 변환' }).click();
  await expect(page.locator('.quick__errors li')).toHaveCount(3);
  await page.getByRole('button', { name: '시간 없는 3곳 빼고 변환 (5단계)' }).click();
  await expect(page.locator('.stage-row')).toHaveCount(5);
  await expect(page.getByLabel('1번 단계 이름')).toHaveValue('첫 번째 종 · 예배 시간');
  await expect(page.getByLabel('5번 단계 이름')).toHaveValue('첫 번째 종 · 최후 발언');
  await expect(page.getByText('단계 5개로 바꿨어요. 시간이 없는 3곳은 뺐어요.')).toBeVisible();
});

test('저장하지 않은 변경 사항이 있으면 나가기 전에 확인한다', async ({ page }) => {
  await page.goto('/');
  await chooseNew(page, /직접 구성/);
  await page.getByLabel('시나리오 이름').fill('작성 중');
  await page.getByRole('button', { name: '뒤로' }).click();
  const dialog = page.getByRole('alertdialog', { name: '저장하지 않은 변경 사항이 있어요' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '계속 편집' }).click();
  await expect(page.getByLabel('시나리오 이름')).toHaveValue('작성 중');

  // 브라우저 뒤로 가기도 막는다.
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '저장하지 않고 나가기' }).click();
  await expect(page.getByText('저장된 시나리오가 없어요')).toBeVisible();
});

test('입력 오류는 해당 항목 옆에 표시하고, 저장 실패 시 입력을 유지한다', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByRole('button', { name: '단계 추가' }).click();
  await page.getByLabel('1번 단계 초').fill('75');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('시나리오 이름을 입력해주세요.')).toBeVisible();
  await expect(page.getByText('단계 이름을 입력해주세요.')).toBeVisible();
  await expect(page.getByText('초는 0~59 사이로 입력해주세요.')).toBeVisible();

  await page.getByLabel('시나리오 이름').fill('실패 테스트');
  await page.getByLabel('1번 단계 이름').fill('조사');
  await page.getByLabel('1번 단계 초').fill('30');
  await page.route('**/api/scenarios', (route) => route.abort());
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('저장하지 못했어요. 입력한 내용은 그대로 있어요.')).toBeVisible();
  await expect(page.getByLabel('시나리오 이름')).toHaveValue('실패 테스트');
  await page.unroute('**/api/scenarios');
  await page.getByRole('button', { name: '다시 저장' }).click();
  await expect(page.locator('.scenario-row', { hasText: '실패 테스트' })).toBeVisible();
});

test('다른 기기에서 먼저 수정했으면 덮어쓸지 묻는다', async ({ page, request }) => {
  const item = await createScenario(request, '충돌 테스트', [['소개', 300]]);
  await page.goto(`/#/edit/${item.id}`);
  await expect(page.getByLabel('1번 단계 이름')).toHaveValue('소개');
  await request.put(`/api/scenarios/${item.id}`, {
    data: { name: '다른 기기 수정', stages: [{ name: '소개', durationSec: 600 }], rev: item.rev },
  });
  await page.getByLabel('1번 단계 이름').fill('내 수정');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: '다른 기기에서 먼저 수정했어요' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '내 내용으로 덮어쓰기' }).click();
  await expect(page.locator('.scenario-row', { hasText: '충돌 테스트' })).toBeVisible();
  const saved = await (await request.get(`/api/scenarios/${item.id}`)).json();
  expect(saved.item.stages[0].name).toBe('내 수정');
});

test('휴지통으로 옮기고 복원한다', async ({ page, request }) => {
  await createScenario(request, '지울 시나리오', [['소개', 300]]);
  await page.goto('/');
  await page.getByRole('button', { name: '‘지울 시나리오’ 더보기' }).click();
  await page.getByRole('menuitem', { name: '삭제' }).click();
  await page.getByRole('alertdialog', { name: '휴지통으로 옮길까요?' }).getByRole('button', { name: '휴지통으로 이동' }).click();
  await expect(page.getByText('저장된 시나리오가 없어요')).toBeVisible();

  await page.getByRole('button', { name: '휴지통', exact: true }).click();
  await expect(page.locator('.trash-row')).toHaveCount(1);
  await page.getByRole('button', { name: '‘지울 시나리오’를 복원' }).click();
  await expect(page.getByText('휴지통이 비어 있어요')).toBeVisible();
  await page.getByRole('button', { name: '뒤로' }).click();
  await expect(page.locator('.scenario-row', { hasText: '지울 시나리오' })).toBeVisible();
});

test('연결이 끊기면 저장된 목록을 오프라인 표시와 함께 보여 준다', async ({ page, request }) => {
  await createScenario(request, '캐시 테스트', [['소개', 300]]);
  await page.goto('/');
  await expect(page.locator('.scenario-row', { hasText: '캐시 테스트' })).toBeVisible();
  await page.route('**/api/**', (route) => route.abort());
  await page.reload();
  await expect(page.getByText('오프라인 · 저장된 목록 표시 중')).toBeVisible();
  await expect(page.locator('.scenario-row', { hasText: '캐시 테스트' })).toBeVisible();

  // 오프라인이어도 저장된 구성으로 게임을 시작할 수 있다.
  await runScenario(page, '캐시 테스트');
  await expect(page.getByRole('heading', { name: '소개' })).toBeVisible();
});

test('진행 중인 게임은 목록 위에 보이고 이어갈 수 있다', async ({ page, request }) => {
  await createScenario(request, '이어가기 테스트', [
    ['소개', 300],
    ['조사', 600],
  ]);
  await page.goto('/');
  await runScenario(page, '이어가기 테스트');
  await expect(page.getByRole('heading', { name: '소개' })).toBeVisible();
  await page.goto('/');
  const resume = page.locator('.resume');
  await expect(resume).toContainText('진행 중인 게임');
  await expect(resume).toContainText('이어가기 테스트');
  await expect(resume).toContainText('01 / 02');
  await resume.getByRole('button', { name: '이어가기' }).click();
  await expect(page.getByRole('heading', { name: '소개' })).toBeVisible();
});

test('손잡이를 끌거나 화살표 키로 단계 순서를 바꾼다', async ({ page, request }) => {
  const item = await createScenario(request, '순서 테스트', [
    ['하나', 60],
    ['둘', 60],
    ['셋', 60],
  ]);
  await page.goto(`/#/edit/${item.id}`);
  const handle = page.getByRole('button', { name: /^1번 단계 순서 바꾸기/ });
  const box = (await handle.boundingBox())!;
  const target = (await page.locator('.stage-row').nth(2).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, target.y + target.height * 0.8, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByLabel('1번 단계 이름')).toHaveValue('둘');
  await expect(page.getByLabel('2번 단계 이름')).toHaveValue('셋');
  await expect(page.getByLabel('3번 단계 이름')).toHaveValue('하나');

  await page.getByRole('button', { name: /^3번 단계 순서 바꾸기/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByLabel('2번 단계 이름')).toHaveValue('하나');
  // 손잡이에 초점이 남아 화살표 키로 계속 옮길 수 있다.
  await page.keyboard.press('ArrowUp');
  await expect(page.getByLabel('1번 단계 이름')).toHaveValue('하나');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('3번 단계 이름')).toHaveValue('하나');
  await page.keyboard.press('ArrowUp');

  await page.getByRole('button', { name: '1번 단계 아래로 이동' }).click();
  await expect(page.getByLabel('2번 단계 이름')).toHaveValue('둘');
});

test('시간 초과 중 일시정지 → +1분 → 바로 다음 단계로 가도 주요 버튼이 잠긴 채 남지 않는다', async ({ page, request }) => {
  await createScenario(request, '잠금 테스트', [
    ['하나', 60],
    ['둘', 120],
  ]);
  await startClock(page);
  await page.goto('/');
  await page.clock.pauseAt(T0 + 5_000);
  await runScenario(page, '잠금 테스트');
  await page.clock.runFor(61_000);
  await page.clock.runFor(1_000);
  await expect(page.locator('.play-status__label')).toHaveText('시간 초과');

  await page.locator('.play-nav', { hasText: '일시정지' }).click();
  await page.getByRole('button', { name: '1분 늘리기' }).click();
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계로' }).click();
  await expect(page.getByRole('heading', { name: '둘' })).toBeVisible();

  await page.clock.runFor(1_000);
  await page.locator('.play-primary').click();
  await expect(page.locator('.play-status__label')).toHaveText('일시정지');
  await expect(page.locator('.play-primary')).not.toHaveAttribute('aria-disabled', 'true');
});

test('저장 중에 뒤로 가면 저장이 끝난 뒤 한 번만 이동한다', async ({ page, request }) => {
  const item = await createScenario(request, '저장 중 이동', [['소개', 300]]);
  await page.goto('/');
  await page.getByRole('button', { name: '‘저장 중 이동’ 더보기' }).click();
  await page.getByRole('menuitem', { name: '편집' }).click();
  await page.getByLabel('시나리오 이름').fill('저장 중 이동 2');
  await page.route(`**/api/scenarios/${item.id}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: '뒤로' }).click();
  // 저장 중에는 ‘저장하지 않고 나가기’를 묻지 않는다(이미 보낸 저장은 취소할 수 없으므로).
  expect(await page.getByRole('alertdialog').count()).toBe(0);
  await expect(page.locator('.scenario-row', { hasText: '저장 중 이동 2' })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/#\/$/);
});

test('목록을 처음부터 못 불러온 상태에서 저장에 성공하면 전체 목록을 다시 불러온다', async ({ page, request }) => {
  await createScenario(request, '기존 하나', [['소개', 300]]);
  await createScenario(request, '기존 둘', [['소개', 300]]);
  await page.route('**/api/scenarios', (route) =>
    route.request().method() === 'GET' ? route.abort() : route.continue(),
  );
  await page.goto('/');
  await expect(page.getByText('목록을 불러오지 못했어요')).toBeVisible();
  await page.unroute('**/api/scenarios');

  await chooseNew(page, /직접 구성/);
  await page.getByLabel('시나리오 이름').fill('새로 만든 것');
  await page.getByRole('button', { name: '단계 추가' }).click();
  await page.getByLabel('1번 단계 이름').fill('조사');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.locator('.scenario-row')).toHaveCount(3);
  await expect(page.getByText('오프라인 · 저장된 목록 표시 중')).toHaveCount(0);
});

test('단계가 최대 개수일 때 삭제 되돌리기로 한도를 넘지 않는다', async ({ page, request }) => {
  const stages = Array.from({ length: 100 }, (_, i) => [`단계 ${i + 1}`, 60] as [string, number]);
  const item = await createScenario(request, '꽉 찬 시나리오', stages);
  await page.goto(`/#/edit/${item.id}`);
  await expect(page.locator('.stage-row')).toHaveCount(100);
  await page.getByRole('button', { name: '1번 단계 삭제', exact: true }).click();
  await page.getByRole('button', { name: '단계 추가' }).click();
  await page.locator('.toast__action').click();
  await expect(page.locator('.stage-row')).toHaveCount(100);
});

test('앱 제목은 Murder Mystery Timer로 목록·진행 화면과 탭 제목에 보인다', async ({ page, request }) => {
  await createScenario(request, '제목 테스트', [['소개', 300]]);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Murder Mystery Timer' })).toBeVisible();
  await expect(page).toHaveTitle('Murder Mystery Timer');
  await runScenario(page, '제목 테스트');
  await expect(page.locator('.play-brand__app')).toHaveText('Murder Mystery Timer');
  await expect(page.locator('.play-brand__app')).toBeInViewport();
  await expect(page).toHaveTitle('제목 테스트 · Murder Mystery Timer');
});

test('진행 순서: 완료·현재·예정 표시, 가로는 왼쪽 약 25%에 늘 보이고 세로는 접어 둔다', async ({ page, request }) => {
  await createScenario(request, '순서 표시', [
    ['하나', 120],
    ['둘', 120],
    ['셋', 120],
  ]);
  await startClock(page);
  await page.goto('/');
  await page.clock.pauseAt(T0 + 5_000);
  await runScenario(page, '순서 표시');
  await page.getByRole('button', { name: '다음 단계', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계로' }).click();
  await expect(page.getByRole('heading', { name: '둘' })).toBeVisible();

  const viewport = page.viewportSize()!;
  const landscape = viewport.width > viewport.height;
  const toggle = page.getByRole('button', { name: '진행 순서 보기' });
  const list = page.locator('.route-list');
  if (landscape) {
    // 가로: 진행 순서는 왼쪽, 타이머는 오른쪽. 왼쪽은 화면 너비의 약 25%
    await expect(toggle).toBeHidden();
    await expect(list).toBeVisible();
    const side = (await page.locator('.play-route').boundingBox())!;
    const main = (await page.locator('.play-main').boundingBox())!;
    expect(side.x + side.width).toBeLessThanOrEqual(main.x + 1);
    expect(side.width / viewport.width).toBeGreaterThan(0.2);
    expect(side.width / viewport.width).toBeLessThan(0.33);
  } else {
    // 세로: 타이머가 먼저 보이고 진행 순서는 ‘진행 순서 보기’로 펼친다.
    await expect(list).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(list).toBeVisible();
  }

  const rows = list.locator('.route-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveClass(/route-row--done/);
  await expect(rows.nth(1)).toHaveClass(/route-row--current/);
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(rows.nth(2)).toHaveClass(/route-row--todo/);
  await expect(rows.nth(1).locator('.route-row__index')).toHaveText('02');

  // 목록의 행을 눌러도 단계가 바뀌지 않는다(즉시 이동 기능 없음).
  await rows.nth(2).click();
  await rows.nth(0).click();
  await expect(page.getByRole('heading', { name: '둘' })).toBeVisible();
  await expect(page.locator('.play-step')).toHaveText('02 / 03');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('알림음 버튼으로 진행 중에 알림음을 끄고 다시 켠다', async ({ page, request }) => {
  await createScenario(request, '소리 테스트', [['소개', 300]]);
  await page.goto('/');
  await runScenario(page, '소리 테스트');
  const readSettings = () => page.evaluate(() => JSON.parse(localStorage.getItem('mt:settings:v1') ?? '{}'));

  await page.getByRole('button', { name: '알림음 끄기' }).click();
  await expect(page.getByRole('button', { name: '알림음 켜기' })).toBeVisible();
  expect(await readSettings()).toMatchObject({ timeUpSound: false, warningSound: false });

  await page.getByRole('button', { name: '알림음 켜기' }).click();
  await expect(page.getByRole('button', { name: '알림음 끄기' })).toBeVisible();
  expect(await readSettings()).toMatchObject({ timeUpSound: true, warningSound: true });
});

test('시간 초과에서도 숫자·단계 이름·버튼 위치가 그대로다', async ({ page, request }) => {
  await createScenario(request, '위치 고정', [
    ['하나', 70],
    ['둘', 60],
  ]);
  await startClock(page);
  await page.goto('/');
  await page.clock.pauseAt(T0 + 5_000);
  await runScenario(page, '위치 고정');
  await expect(page.getByRole('heading', { name: '하나' })).toBeVisible();

  const boxes = async () => ({
    stage: (await page.locator('.play-stage__name').boundingBox())!,
    timer: (await page.locator('.play-timer').boundingBox())!,
    primary: (await page.locator('.play-primary').boundingBox())!,
    nav: (await page.locator('.play-nav').first().boundingBox())!,
  });
  const before = await boxes();
  // 1분 이하 → 일시정지 → 계속 → 시간 초과
  await page.clock.runFor(20_000);
  await expect(page.locator('.play-status__label')).toHaveText('진행 중 · 1분 이하');
  await page.getByRole('button', { name: '일시정지' }).click();
  await expect(page.locator('.play-status__label')).toHaveText('일시정지');
  const paused = await boxes();
  await page.getByRole('button', { name: '계속하기' }).click();
  await page.clock.runFor(52_000);
  await expect(page.locator('.play-status__label')).toHaveText('시간 초과');
  await expect(page.locator('.play-primary')).toHaveText('다음 단계 시작');
  const over = await boxes();
  for (const state of [paused, over]) {
    for (const key of ['stage', 'timer', 'primary', 'nav'] as const) {
      expect(Math.abs(state[key].y - before[key].y)).toBeLessThanOrEqual(1);
      expect(Math.abs(state[key].height - before[key].height)).toBeLessThanOrEqual(1);
    }
  }
});
