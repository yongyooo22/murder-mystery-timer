import { sumDurationSec } from '../lib/time';
import type { Scenario } from './types';

/** 첫 화면 목록의 정렬 기준. 이 기기의 설정에 저장한다. */
export type ScenarioSort = 'updated' | 'created' | 'name' | 'shortest' | 'longest';

export const SCENARIO_SORTS: ReadonlyArray<{ value: ScenarioSort; label: string }> = [
  { value: 'updated', label: '최근 수정순' },
  { value: 'created', label: '최근 만든순' },
  { value: 'name', label: '가나다순' },
  { value: 'shortest', label: '짧은 시간순' },
  { value: 'longest', label: '긴 시간순' },
];

export const DEFAULT_SORT: ScenarioSort = 'updated';

/** 저장된 값이 알 수 없는 기준이면(예전 버전, 손상) 기본 정렬로 되돌린다. */
export function resolveSort(value: unknown): ScenarioSort {
  return SCENARIO_SORTS.some((option) => option.value === value) ? (value as ScenarioSort) : DEFAULT_SORT;
}

export function sortLabel(sort: ScenarioSort): string {
  return SCENARIO_SORTS.find((option) => option.value === sort)?.label ?? '';
}

// 가나다순: 기호 → 숫자 → 한글(ㄱㄴㄷ) → 영문. 이름 속 숫자는 크기대로(‘시나리오 2’ → ‘시나리오 10’).
const collator = new Intl.Collator('ko', { numeric: true });

const byName = (a: Scenario, b: Scenario) => collator.compare(a.name, b.name);
export const byUpdatedDesc = (a: Scenario, b: Scenario) => b.updatedAt.localeCompare(a.updatedAt);
const byCreatedDesc = (a: Scenario, b: Scenario) => b.createdAt.localeCompare(a.createdAt);

/** 정렬한 새 배열을 돌려준다. 기준이 같으면 이름순, 이름도 같으면 최근 수정순으로 늘 같은 순서를 낸다. */
export function sortScenarios(items: readonly Scenario[], sort: ScenarioSort): Scenario[] {
  const totals = new Map(items.map((it) => [it.id, sumDurationSec(it.stages)]));
  const total = (it: Scenario) => totals.get(it.id) ?? 0;
  const primary: (a: Scenario, b: Scenario) => number = {
    updated: byUpdatedDesc,
    created: byCreatedDesc,
    name: byName,
    shortest: (a: Scenario, b: Scenario) => total(a) - total(b),
    longest: (a: Scenario, b: Scenario) => total(b) - total(a),
  }[sort];
  return [...items].sort((a, b) => primary(a, b) || byName(a, b) || byUpdatedDesc(a, b));
}
