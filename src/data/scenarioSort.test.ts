import { describe, expect, test } from 'vitest';
import { DEFAULT_SORT, SCENARIO_SORTS, resolveSort, sortLabel, sortScenarios } from './scenarioSort';
import type { Scenario } from './types';

function scenario(name: string, minutes: number[], createdAt: string, updatedAt: string): Scenario {
  return {
    id: name,
    name,
    stages: minutes.map((min, i) => ({ id: `${name}-${i}`, name: `단계 ${i + 1}`, durationSec: min * 60 })),
    createdAt,
    updatedAt,
    rev: 1,
    deletedAt: null,
  };
}

const ITEMS = [
  scenario('저택의 밤', [30, 30], '2026-10-01T10:00:00.000Z', '2026-10-03T10:00:00.000Z'), // 60분
  scenario('Room 3', [45], '2026-10-04T10:00:00.000Z', '2026-10-04T10:00:00.000Z'), // 45분
  scenario('시나리오 10', [20, 20, 20, 20], '2026-10-02T10:00:00.000Z', '2026-10-02T10:00:00.000Z'), // 80분
  scenario('시나리오 2', [90], '2026-10-03T10:00:00.000Z', '2026-10-05T10:00:00.000Z'), // 90분
  scenario('가면 무도회', [15, 15], '2026-09-30T10:00:00.000Z', '2026-09-30T10:00:00.000Z'), // 30분
];

const names = (items: Scenario[]) => items.map((it) => it.name);

describe('sortScenarios', () => {
  test('최근 수정순: updatedAt 내림차순', () => {
    expect(names(sortScenarios(ITEMS, 'updated'))).toEqual(['시나리오 2', 'Room 3', '저택의 밤', '시나리오 10', '가면 무도회']);
  });

  test('최근 만든순: createdAt 내림차순', () => {
    expect(names(sortScenarios(ITEMS, 'created'))).toEqual(['Room 3', '시나리오 2', '시나리오 10', '저택의 밤', '가면 무도회']);
  });

  test('가나다순: 한글 ㄱㄴㄷ 다음 영문, 이름 속 숫자는 크기대로', () => {
    expect(names(sortScenarios(ITEMS, 'name'))).toEqual(['가면 무도회', '시나리오 2', '시나리오 10', '저택의 밤', 'Room 3']);
  });

  test('짧은 시간순·긴 시간순: 단계 시간 합계로', () => {
    expect(names(sortScenarios(ITEMS, 'shortest'))).toEqual(['가면 무도회', 'Room 3', '저택의 밤', '시나리오 10', '시나리오 2']);
    expect(names(sortScenarios(ITEMS, 'longest'))).toEqual(['시나리오 2', '시나리오 10', '저택의 밤', 'Room 3', '가면 무도회']);
  });

  test('기준이 같으면 이름순으로 늘 같은 순서', () => {
    const same = [
      scenario('나', [10], '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
      scenario('다', [10], '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
      scenario('가', [10], '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
    ];
    for (const { value } of SCENARIO_SORTS) expect(names(sortScenarios(same, value))).toEqual(['가', '나', '다']);
  });

  test('원래 배열은 바꾸지 않는다', () => {
    const before = names(ITEMS);
    sortScenarios(ITEMS, 'name');
    expect(names(ITEMS)).toEqual(before);
  });
});

test('resolveSort falls back to the default for unknown values', () => {
  expect(resolveSort('name')).toBe('name');
  expect(resolveSort('alphabet')).toBe(DEFAULT_SORT);
  expect(resolveSort(undefined)).toBe(DEFAULT_SORT);
  expect(sortLabel('name')).toBe('가나다순');
});
