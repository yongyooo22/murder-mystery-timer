import { randomUUID } from 'node:crypto';
import LIMITS from '../shared/limits.json' with { type: 'json' };

export { LIMITS };

/** 한 단계에 넣을 수 있는 최대 시간(초). 999분 59초 */
export const STAGE_MAX_SEC = LIMITS.stageMaxMinutes * 60 + 59;

const STAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// 제어 문자는 공백으로 바꾼다. 이름은 한 줄 텍스트다.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export class ValidationError extends Error {
  /**
   * @param {string} message
   * @param {Record<string, string>} [fields]
   */
  constructor(message, fields = {}) {
    super(message);
    this.fields = fields;
  }
}

/** @param {unknown} value */
function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, ' ').trim();
}

/** 글자 수는 코드 포인트 기준으로 센다(이모지 등이 2글자로 세어지지 않게). */
function charLength(text) {
  return [...text].length;
}

/**
 * @param {unknown} value
 * @returns {string} 정리된 시나리오 이름
 */
export function validateName(value) {
  const name = cleanText(value);
  if (!name) throw new ValidationError('시나리오 이름을 입력해주세요.', { name: '시나리오 이름을 입력해주세요.' });
  if (charLength(name) > LIMITS.scenarioNameMax) {
    const message = `시나리오 이름은 ${LIMITS.scenarioNameMax}자 이내로 입력해주세요.`;
    throw new ValidationError(message, { name: message });
  }
  return name;
}

/**
 * 시나리오 저장 요청 본문을 검사하고 저장할 형태로 정리한다.
 * @param {any} body
 * @returns {{ name: string, stages: { id: string, name: string, durationSec: number }[] }}
 */
export function validateScenarioInput(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('요청 형식이 올바르지 않아요.');

  /** @type {Record<string, string>} */
  const fields = {};
  let name = '';
  try {
    name = validateName(body.name);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    Object.assign(fields, error.fields);
  }

  const stages = [];
  if (!Array.isArray(body.stages) || body.stages.length === 0) {
    fields.stages = '단계를 하나 이상 추가해주세요.';
  } else if (body.stages.length > LIMITS.stagesMax) {
    fields.stages = `단계는 최대 ${LIMITS.stagesMax}개까지 만들 수 있어요.`;
  } else {
    const usedIds = new Set();
    body.stages.forEach((raw, index) => {
      const stage = raw && typeof raw === 'object' ? raw : {};
      const stageName = cleanText(stage.name);
      if (!stageName) fields[`stages.${index}.name`] = '단계 이름을 입력해주세요.';
      else if (charLength(stageName) > LIMITS.stageNameMax) {
        fields[`stages.${index}.name`] = `단계 이름은 ${LIMITS.stageNameMax}자 이내로 입력해주세요.`;
      }

      const durationSec = stage.durationSec;
      if (!Number.isInteger(durationSec) || durationSec < 1 || durationSec > STAGE_MAX_SEC) {
        fields[`stages.${index}.durationSec`] = `시간은 1초 이상 ${LIMITS.stageMaxMinutes}분 59초 이하로 입력해주세요.`;
      }

      let id = typeof stage.id === 'string' && STAGE_ID_PATTERN.test(stage.id) ? stage.id : randomUUID();
      if (usedIds.has(id)) id = randomUUID();
      usedIds.add(id);
      stages.push({ id, name: stageName, durationSec });
    });
  }

  if (Object.keys(fields).length > 0) {
    throw new ValidationError('입력 내용을 확인해주세요.', fields);
  }
  return { name, stages };
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function validateRev(value) {
  if (!Number.isInteger(value) || /** @type {number} */ (value) < 1) {
    throw new ValidationError('수정 기준 버전(rev)이 올바르지 않아요.', { rev: 'rev는 1 이상의 정수여야 해요.' });
  }
  return /** @type {number} */ (value);
}
