/** 이 기기에만 저장되는 값(설정, 목록 캐시, 진행 중인 게임, 마지막 결과) */
export const STORAGE_KEYS = {
  scenarios: 'mt:scenarios:v1',
  settings: 'mt:settings:v1',
  game: 'mt:game:v1',
  result: 'mt:result:v1',
} as const;

export function readJson<T>(key: string): T | null {
  try {
    const text = window.localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/** 저장에 실패하면(사생활 보호 모드, 용량 초과 등) false를 돌려준다. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): boolean {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
