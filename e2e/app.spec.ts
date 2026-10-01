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

test.beforeEach(async ({ request }) => {
  await resetData(request);
});

test('첫 사용: 빈 목록 안내와 새로 만들기·템플릿 사용', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('저장된 시나리오가 없어요')).toBeVisible();
  await expect(page.getByRole('button', { name: '새로 만들기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '템플릿 사용' })).toBeVisible();
  await expect(page.getByText('모든 사용자에게 공유되는 목록이에요.')).toBeVisible();

  await page.getByRole('button', { name: '‘기본 구성’ 템플릿으로 만들기' }).click();
  await expect(page.getByRole('heading', { name: '새 시나리오' })).toBeVisible();
  await expect(page.getByLabel('1번 단계 이름')).toHaveValue('오프닝 · 캐릭터 소개');
  await expect(page.locator('.stage-row')).toHaveCount(7);
});

test('빠른 입력으로 만들고 저장한 뒤 열기에서 게임을 시작한다', async ({ page }) => {
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
  // 저장 후 ‘열기’ 화면: 단계 구성 확인 → 게임 시작
  const sheet = page.getByRole('dialog', { name: '빠른 입력 테스트' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.stage-preview__row')).toHaveCount(4);
  await sheet.getByRole('button', { name: '게임 시작' }).click();
  await expect(page.getByRole('heading', { name: '사건 소개' })).toBeVisible();
  await expect(page.locator('.play-top__step')).toContainText('1 / 4');
});

test('목록을 눌러도 바로 게임이 시작되지 않는다', async ({ page, request }) => {
  await createScenario(request, '저택의 밤', [['소개', 300]]);
  await page.goto('/');
  await page.locator('.scenario-row__name', { hasText: '저택의 밤' }).click();
  await expect(page.getByRole('dialog', { name: '저택의 밤' })).toBeVisible();
  await expect(page).toHaveURL(/#\/scenario\//);
  await expect(page.locator('.play')).toHaveCount(0);
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
  await page.getByRole('button', { name: '‘흐름 테스트’ 열기' }).click();
  await page.getByRole('button', { name: '게임 시작' }).click();

  await expect(page.getByRole('heading', { name: '소개' })).toBeVisible();
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
  await page.getByRole('button', { name: '‘되돌리기’ 열기' }).click();
  await page.getByRole('button', { name: '게임 시작' }).click();

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

test('저장하지 않은 변경 사항이 있으면 나가기 전에 확인한다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새로 만들기' }).click();
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
  await expect(page.getByRole('dialog', { name: '실패 테스트' })).toBeVisible();
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
  await expect(page.getByRole('dialog', { name: '충돌 테스트' })).toBeVisible();
  const saved = await (await request.get(`/api/scenarios/${item.id}`)).json();
  expect(saved.item.stages[0].name).toBe('내 수정');
});

test('휴지통으로 옮기고 복원한다', async ({ page, request }) => {
  await createScenario(request, '지울 시나리오', [['소개', 300]]);
  await page.goto('/');
  await page.getByRole('button', { name: '‘지울 시나리오’ 더보기' }).click();
  await page.getByRole('menuitem', { name: '휴지통으로 이동' }).click();
  await page.getByRole('alertdialog', { name: '휴지통으로 옮길까요?' }).getByRole('button', { name: '휴지통으로 이동' }).click();
  await expect(page.getByText('저장된 시나리오가 없어요')).toBeVisible();

  await page.getByRole('button', { name: '휴지통 보기' }).click();
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
  await page.getByRole('button', { name: '‘캐시 테스트’ 열기' }).click();
  await page.getByRole('button', { name: '게임 시작' }).click();
  await expect(page.getByRole('heading', { name: '소개' })).toBeVisible();
});

test('진행 중인 게임은 목록 위에 보이고 이어갈 수 있다', async ({ page, request }) => {
  await createScenario(request, '이어가기 테스트', [
    ['소개', 300],
    ['조사', 600],
  ]);
  await page.goto('/');
  await page.getByRole('button', { name: '‘이어가기 테스트’ 열기' }).click();
  await page.getByRole('button', { name: '게임 시작' }).click();
  await expect(page.getByRole('heading', { name: '소개' })).toBeVisible();
  await page.goto('/');
  const resume = page.locator('.resume');
  await expect(resume).toContainText('진행 중인 게임');
  await expect(resume).toContainText('이어가기 테스트');
  await expect(resume).toContainText('1 / 2');
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

  await page.getByRole('button', { name: '1번 단계 아래로 이동' }).click();
  await expect(page.getByLabel('2번 단계 이름')).toHaveValue('둘');
});
