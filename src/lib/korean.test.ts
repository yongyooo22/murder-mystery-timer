import { expect, test } from 'vitest';
import { objectParticle, quotedObject } from './korean';

test('chooses 을/를 from the last syllable', () => {
  expect(objectParticle('저택의 밤')).toBe('을');
  expect(objectParticle('1차 조사')).toBe('를');
  expect(objectParticle('저택 (복사본)')).toBe('을');
  expect(objectParticle('시즌 2')).toBe('를');
  expect(objectParticle('Room 3')).toBe('을');
  expect(objectParticle('Mystery')).toBe('을(를)');
  expect(quotedObject('해설')).toBe('‘해설’을');
});
