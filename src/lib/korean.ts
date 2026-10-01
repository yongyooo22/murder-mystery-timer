// 숫자로 끝나는 이름의 받침 여부(영, 일, 이, 삼, 사, 오, 육, 칠, 팔, 구)
const DIGIT_HAS_FINAL = [true, true, false, true, false, false, true, true, true, false];

function hasFinalConsonant(word: string): boolean | null {
  // 끝에 붙은 괄호·문장부호는 건너뛴다. 예: ‘저택 (복사본)’ → 본
  const last = word.replace(/[\s\p{P}\p{S}]+$/u, '').slice(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (last >= '0' && last <= '9') return DIGIT_HAS_FINAL[Number(last)];
  return null;
}

/** ‘이름’ 뒤에 붙는 목적격 조사: 을/를 */
export function objectParticle(word: string): string {
  const final = hasFinalConsonant(word);
  return final === null ? '을(를)' : final ? '을' : '를';
}

/** 따옴표로 감싼 이름 + 목적격 조사. 예: ‘저택의 밤’을 */
export function quotedObject(word: string): string {
  return `‘${word}’${objectParticle(word)}`;
}
