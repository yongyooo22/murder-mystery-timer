import { describe, expect, test } from 'vitest';
import { QUICK_INPUT_EXAMPLE, parseQuickInput } from './quickInput';

const parsed = (text: string) => parseQuickInput(text).stages.map(({ name, durationSec }) => [name, durationSec]);

describe('parseQuickInput', () => {
  test('parses the example shown in the editor', () => {
    expect(parseQuickInput(QUICK_INPUT_EXAMPLE).errors).toEqual([]);
    expect(parsed(QUICK_INPUT_EXAMPLE)).toEqual([
      ['사건 소개', 300],
      ['1차 조사', 1200],
      ['1차 토론', 930],
      ['범인 지목', 600],
      ['해설', 450],
    ]);
  });

  test('accepts several time formats', () => {
    expect(
      parsed(
        [
          '오프닝 5',
          '조사 20분',
          '토론 15:30',
          '긴 조사 1:30:00',
          '쉬는 시간 30초',
          '최종 토론 1시간 10분',
          'Ending 7m30s',
          '해설: 10',
          '정리 - 3',
          '마무리, 2',
          '휴식\t4',
          '추리시간15분',
        ].join('\n'),
      ),
    ).toEqual([
      ['오프닝', 300],
      ['조사', 1200],
      ['토론', 930],
      ['긴 조사', 5400],
      ['쉬는 시간', 30],
      ['최종 토론', 4200],
      ['Ending', 450],
      ['해설', 600],
      ['정리', 180],
      ['마무리', 120],
      ['휴식', 240],
      ['추리시간', 900],
    ]);
  });

  test('keeps numbers that belong to the stage name', () => {
    expect(parsed('1차 조사 20\n2차 토론 15분 30초')).toEqual([
      ['1차 조사', 1200],
      ['2차 토론', 930],
    ]);
  });

  test('strips list markers and normalizes full-width characters', () => {
    expect(parsed('1. 오프닝 5\n2) 조사 10\n- 토론 15\n• 해설 3\n범인 지목 １０：３０')).toEqual([
      ['오프닝', 300],
      ['조사', 600],
      ['토론', 900],
      ['해설', 180],
      ['범인 지목', 630],
    ]);
  });

  test('skips blank lines and comments but keeps real line numbers', () => {
    const result = parseQuickInput('\n# 메모\n오프닝 5\n\n조사');
    expect(result.stages).toEqual([{ name: '오프닝', durationSec: 300, line: 3 }]);
    expect(result.errors).toEqual([expect.objectContaining({ line: 5, text: '조사' })]);
  });

  test('reports specific errors', () => {
    const { errors } = parseQuickInput(['조사', '15', '토론 15:75', '휴식 0', 'Room101', '긴 단계 1000'].join('\n'));
    expect(errors.map((e) => [e.line, e.message])).toEqual([
      [1, expect.stringContaining('시간을 찾지 못했어요')],
      [2, expect.stringContaining('단계 이름이 없어요')],
      [3, expect.stringContaining('0~59')],
      [4, expect.stringContaining('1초 이상')],
      [5, expect.stringContaining('시간을 찾지 못했어요')],
      [6, expect.stringContaining('최대 999분 59초')],
    ]);
  });

  test('rejects names that are too long and durations over the limit', () => {
    const { errors } = parseQuickInput(`${'가'.repeat(61)} 5\n마라톤 999:59\n더 긴 단계 1000분`);
    expect(errors.map((e) => e.line)).toEqual([1, 3]);
  });

  test('reads times written in brackets, keeping non-time brackets in the name', () => {
    expect(
      parsed(
        [
          '예배 시간 [5분]',
          '룰북 숙지 (10분)',
          '조사 【15:30】',
          '[아일랜드06, 07] 카드 공개 [3분]',
          '전체 토의 [20분] *전체 토의 시 카드 교환 불가',
          '특수 이벤트 (아일랜드10·11) 10',
        ].join('\n'),
      ),
    ).toEqual([
      ['예배 시간', 300],
      ['룰북 숙지', 600],
      ['조사', 930],
      ['[아일랜드06, 07] 카드 공개', 180],
      ['전체 토의 (전체 토의 시 카드 교환 불가)', 1200],
      ['특수 이벤트 (아일랜드10·11)', 600],
    ]);
  });

  test('splits bracketed times joined with + into separate stages', () => {
    const { stages, errors } = parseQuickInput('특수 이벤트 [10분] + 예배 시간 [5분]\n생각 정리 [1분] + 최후 발언 [5분] + 투표');
    expect(stages.map(({ name, durationSec, line }) => [name, durationSec, line])).toEqual([
      ['특수 이벤트', 600, 1],
      ['예배 시간', 300, 1],
    ]);
    // 시간이 없는 부분이 있으면 그 줄 전체를 오류로 알려 준다.
    expect(errors).toEqual([
      expect.objectContaining({ line: 2, message: expect.stringContaining('‘투표’의 시간을 찾지 못했어요') }),
    ]);
  });

  test('parses a rulebook-style guide, skipping headings and reporting lines without times', () => {
    const guide = [
      '## 게임 진행 방법',
      '### 사전 준비 [10분]',
      '테이블 세팅 & 규칙서 숙지',
      '### 도입 [15분]',
      '나비 카드 및 룰북 분배 [5분]',
      '룰북 숙지 [10분]',
      '### 첫 번째 종 [20분]',
      '[아일랜드06, 07] 카드 진행',
      '예배 시간 [5분]',
      '조사 시간 [5분]',
      '밀담 및 토의 [10분]',
    ].join('\n');
    const { stages, errors } = parseQuickInput(guide);
    // 세부 시간이 없는 ‘사전 준비’는 제목을 단계로 쓰고, 세부 시간이 있는 ‘도입’·‘첫 번째 종’은 제목을 이름 앞에 붙인다.
    expect(stages.map((st) => [st.name, st.durationSec / 60])).toEqual([
      ['사전 준비', 10],
      ['도입 · 나비 카드 및 룰북 분배', 5],
      ['도입 · 룰북 숙지', 10],
      ['첫 번째 종 · 예배 시간', 5],
      ['첫 번째 종 · 조사 시간', 5],
      ['첫 번째 종 · 밀담 및 토의', 10],
    ]);
    expect(errors.map((e) => e.line)).toEqual([3, 8]);
  });

  test('skipUntimed drops lines and + parts without any time', () => {
    const text = '게임 설명 문장\n예배 시간 [5분]\n생각 정리 [1분] + 최후 발언 [5분] + 투표\n잘못된 시간 15:75';
    const strict = parseQuickInput(text);
    expect(strict.errors.map((e) => [e.line, e.untimed ?? false])).toEqual([
      [1, true],
      [3, true],
      [4, false],
    ]);
    // 시간 형식이 틀린 줄은 건너뛰지 않는다.
    expect(parseQuickInput(text, { skipUntimed: true }).errors.map((e) => e.line)).toEqual([4]);
    const lenient = parseQuickInput(text.split('\n').slice(0, 3).join('\n'), { skipUntimed: true });
    expect(lenient.errors).toEqual([]);
    expect(lenient.skipped).toBe(2);
    expect(lenient.stages.map((st) => st.name)).toEqual(['예배 시간', '생각 정리', '최후 발언']);
  });
});
