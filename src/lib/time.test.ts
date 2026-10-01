import { describe, expect, test } from 'vitest';
import {
  clockText,
  diffSentence,
  durationText,
  relativeTimeText,
  remainingSummaryText,
  signedClockText,
  timerText,
} from './time';

describe('clockText', () => {
  test.each([
    [0, '00:00'],
    [5, '00:05'],
    [300, '05:00'],
    [872, '14:32'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3723, '1:02:03'],
  ])('%i초 → %s', (sec, text) => expect(clockText(sec)).toBe(text));
});

describe('timerText', () => {
  test('rounds remaining time up so the timer reaches 00:01 before overtime', () => {
    expect(timerText(872_000)).toEqual({ text: '14:32', overtime: false });
    expect(timerText(871_001)).toEqual({ text: '14:32', overtime: false });
    expect(timerText(1)).toEqual({ text: '00:01', overtime: false });
  });

  test('shows overtime with a plus sign, rounding down', () => {
    expect(timerText(0)).toEqual({ text: '+00:00', overtime: true });
    expect(timerText(-999)).toEqual({ text: '+00:00', overtime: true });
    expect(timerText(-83_000)).toEqual({ text: '+01:23', overtime: true });
  });
});

describe('durationText', () => {
  test.each([
    [0, '0분'],
    [45, '45초'],
    [900, '15분'],
    [930, '15분 30초'],
    [3600, '1시간'],
    [6000, '1시간 40분'],
    [6030, '1시간 40분 30초'],
  ])('%i초 → %s', (sec, text) => expect(durationText(sec)).toBe(text));
});

describe('remainingSummaryText', () => {
  test.each([
    [0, '0분'],
    [-5000, '0분'],
    [45_000, '45초'],
    [59_001, '1분'],
    [119_000, '1분'],
    [3_120_000, '52분'],
    [3_600_000, '1시간'],
    [4_320_000, '1시간 12분'],
  ])('%ims → %s', (ms, text) => expect(remainingSummaryText(ms)).toBe(text));
});

describe('differences', () => {
  test('signedClockText', () => {
    expect(signedClockText(83)).toBe('+1:23');
    expect(signedClockText(-37)).toBe('−0:37');
    expect(signedClockText(0)).toBe('±0:00');
    expect(signedClockText(3723)).toBe('+1:02:03');
  });

  test('diffSentence', () => {
    expect(diffSentence(430)).toBe('계획보다 7분 10초 더 걸렸어요');
    expect(diffSentence(-184)).toBe('계획보다 3분 4초 빨리 끝났어요');
    expect(diffSentence(0)).toBe('계획과 같아요');
  });
});

test('relativeTimeText', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  expect(relativeTimeText('2026-10-01T11:59:30Z', now)).toBe('방금 전');
  expect(relativeTimeText('2026-10-01T11:55:00Z', now)).toBe('5분 전');
  expect(relativeTimeText('2026-10-01T09:00:00Z', now)).toBe('3시간 전');
  expect(relativeTimeText('2026-09-29T12:00:00Z', now)).toBe('2일 전');
  expect(relativeTimeText('not a date', now)).toBe('');
});
