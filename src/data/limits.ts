import LIMITS from '../../shared/limits.json';

export { LIMITS };

/** 한 단계에 넣을 수 있는 최대 시간(초). 999분 59초 */
export const STAGE_MAX_SEC = LIMITS.stageMaxMinutes * 60 + 59;

/** 코드 포인트 기준 글자 수(서버와 같은 기준) */
export function charLength(text: string): number {
  return [...text].length;
}
