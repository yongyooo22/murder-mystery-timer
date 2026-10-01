import { describe, expect, test } from 'vitest';
import {
  draftToInput,
  draftTotalSec,
  isDraftChanged,
  scenarioToDraft,
  validateDraft,
  validateStage,
  type StageDraft,
} from './draft';

const stage = (over: Partial<StageDraft> = {}): StageDraft => ({
  key: 'k',
  id: 'id',
  name: '조사',
  minutes: '15',
  seconds: '00',
  ...over,
});

describe('validateStage', () => {
  test('accepts minutes and seconds', () => {
    expect(validateStage(stage())).toEqual({});
    expect(validateStage(stage({ minutes: '', seconds: '30' }))).toEqual({});
    expect(validateStage(stage({ minutes: '999', seconds: '59' }))).toEqual({});
  });

  test('reports specific problems', () => {
    expect(validateStage(stage({ name: '  ' })).name).toMatch('단계 이름을 입력');
    expect(validateStage(stage({ minutes: '', seconds: '' })).time).toMatch('시간을 입력');
    expect(validateStage(stage({ seconds: '75' })).time).toMatch('0~59');
    expect(validateStage(stage({ minutes: '1000' })).time).toMatch('999 이하');
    expect(validateStage(stage({ minutes: '0', seconds: '0' })).time).toMatch('1초 이상');
    expect(validateStage(stage({ minutes: '1.5' })).time).toMatch('숫자로');
  });
});

describe('validateDraft', () => {
  test('requires a name and at least one stage', () => {
    const { errors, count } = validateDraft({ name: '', stages: [] });
    expect(errors.name).toBeDefined();
    expect(errors.stages).toBeDefined();
    expect(count).toBe(2);
  });

  test('collects stage errors by key', () => {
    const { errors, count } = validateDraft({
      name: '시나리오',
      stages: [stage({ key: 'a' }), stage({ key: 'b', name: '', seconds: '99' })],
    });
    expect(Object.keys(errors.stage)).toEqual(['b']);
    expect(count).toBe(2);
  });
});

test('converts drafts to save input and totals', () => {
  const draft = { name: ' 저택 ', stages: [stage({ name: ' 조사 ', minutes: '15', seconds: '30' }), stage({ minutes: '', seconds: '45' })] };
  expect(draftTotalSec(draft)).toBe(975);
  expect(draftToInput(draft)).toEqual({
    name: '저택',
    stages: [
      { id: 'id', name: '조사', durationSec: 930 },
      { id: 'id', name: '조사', durationSec: 45 },
    ],
  });
});

test('isDraftChanged ignores formatting-only differences', () => {
  const saved = scenarioToDraft({ name: '저택', stages: [{ id: 'a', name: '조사', durationSec: 900 }] });
  const same = { ...saved, name: '저택 ', stages: saved.stages.map((s) => ({ ...s, key: 'other', seconds: '0' })) };
  expect(isDraftChanged(same, saved)).toBe(false);
  expect(isDraftChanged({ ...saved, name: '다른 이름' }, saved)).toBe(true);
  expect(isDraftChanged({ ...saved, stages: [...saved.stages].reverse().concat(saved.stages) }, saved)).toBe(true);
});
