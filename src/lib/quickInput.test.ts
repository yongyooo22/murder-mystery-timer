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
});
