/** 단계·게임 등 클라이언트에서 만드는 식별자. 서버가 허용하는 문자([A-Za-z0-9_-])만 쓴다. */
export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // randomUUID가 없는 환경(일부 구형 브라우저, http 접속)용
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
