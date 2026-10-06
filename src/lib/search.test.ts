import { describe, expect, test } from 'vitest';
import { matchesSearch, searchTerms } from './search';

describe('matchesSearch', () => {
  test('empty query matches everything', () => {
    expect(matchesSearch('저택의 밤', '')).toBe(true);
    expect(matchesSearch('저택의 밤', '   ')).toBe(true);
  });

  test('finds part of the name, ignoring case and spaces', () => {
    expect(matchesSearch('저택의 밤', '저택')).toBe(true);
    expect(matchesSearch('저택의 밤', '의 밤')).toBe(true);
    expect(matchesSearch('저택의 밤', '저택의밤')).toBe(true);
    expect(matchesSearch('저택의 밤', '택의밤')).toBe(true);
    expect(matchesSearch('Room 3 Mystery', 'room3')).toBe(true);
    expect(matchesSearch('Room 3 Mystery', 'MYST')).toBe(true);
    expect(matchesSearch('저택의 밤', '성')).toBe(false);
    expect(matchesSearch('저택의 밤', '밤의')).toBe(false);
  });

  test('every space-separated word must appear, in any order', () => {
    expect(matchesSearch('저택의 밤 (복사본)', '밤 저택')).toBe(true);
    expect(matchesSearch('저택의 밤 (복사본)', '복사본 저택')).toBe(true);
    expect(matchesSearch('저택의 밤', '저택 성')).toBe(false);
  });

  test('keeps matching while a syllable is still being typed', () => {
    // ㅌ → 태 → 택
    expect(matchesSearch('저택의 밤', '저ㅌ')).toBe(true);
    expect(matchesSearch('저택의 밤', '저태')).toBe(true);
    // 받침이 다음 글자의 첫소리가 되기 전: ‘바나’를 치는 중의 ‘반’
    expect(matchesSearch('바나나 살인 사건', '반')).toBe(true);
    // 겹받침·겹모음도 입력 순서대로: ‘달고’ 중의 ‘닭’, ‘의’ 중의 ‘으’
    expect(matchesSearch('달고나 게임', '닭')).toBe(true);
    expect(matchesSearch('저택의 밤', '저택으')).toBe(true);
    expect(matchesSearch('화가의 방', '호')).toBe(true);
    // 다른 모음이면 맞지 않는다.
    expect(matchesSearch('저택의 밤', '저타')).toBe(false);
  });

  test('consonant-only words match initial sounds', () => {
    expect(matchesSearch('저택의 밤', 'ㅈㅌ')).toBe(true);
    expect(matchesSearch('저택의 밤', 'ㅈㅌㅇㅂ')).toBe(true);
    expect(matchesSearch('1차 조사', 'ㅊㅈㅅ')).toBe(true);
    expect(matchesSearch('저택의 밤', 'ㅂ ㅈㅌ')).toBe(true);
    expect(matchesSearch('각성', 'ㄳ')).toBe(true);
    // 받침은 초성으로 치지 않는다.
    expect(matchesSearch('저택의 밤', 'ㄱ')).toBe(false);
    expect(matchesSearch('저택의 밤', 'ㅌㅈ')).toBe(false);
  });

  test('normalizes decomposed Hangul', () => {
    expect(matchesSearch('저택의 밤'.normalize('NFD'), '저택')).toBe(true);
    expect(matchesSearch('저택의 밤', '저택'.normalize('NFD'))).toBe(true);
  });
});

test('searchTerms splits on any whitespace and drops empty words', () => {
  expect(searchTerms('  저택\t밤  ')).toEqual(['저택', '밤']);
  expect(searchTerms('')).toEqual([]);
});
