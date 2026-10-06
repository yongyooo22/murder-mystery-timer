/*
 * 시나리오 이름 검색. 대소문자와 띄어쓰기는 가리지 않는다(‘저택의밤’ → ‘저택의 밤’).
 * 한글은 자모로 풀어서 비교해 글자를 조합하는 도중에도 결과가 끊기지 않는다(‘태’ → ‘택’, ‘반’ → ‘바나’).
 * 자음만 입력하면 초성으로 찾는다(‘ㅈㅌ’ → ‘저택’). 띄어 쓴 검색어는 낱말마다 모두 들어 있어야 한다.
 */

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNGSEONG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONGSEONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

// 겹받침·겹모음은 입력 순서대로 나눈다(‘달’ + ㄱ → ‘닭’ → ‘달고’처럼 다음 글자로 넘어가는 중간 상태를 맞히려고).
const SPLIT: Record<string, string> = {
  ㄳ: 'ㄱㅅ',
  ㄵ: 'ㄴㅈ',
  ㄶ: 'ㄴㅎ',
  ㄺ: 'ㄹㄱ',
  ㄻ: 'ㄹㅁ',
  ㄼ: 'ㄹㅂ',
  ㄽ: 'ㄹㅅ',
  ㄾ: 'ㄹㅌ',
  ㄿ: 'ㄹㅍ',
  ㅀ: 'ㄹㅎ',
  ㅄ: 'ㅂㅅ',
  ㅘ: 'ㅗㅏ',
  ㅙ: 'ㅗㅐ',
  ㅚ: 'ㅗㅣ',
  ㅝ: 'ㅜㅓ',
  ㅞ: 'ㅜㅔ',
  ㅟ: 'ㅜㅣ',
  ㅢ: 'ㅡㅣ',
};

const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_COUNT = 11172;
const CONSONANTS_ONLY = /^[ㄱ-ㅎ]+$/;

const split = (jamo: string) => SPLIT[jamo] ?? jamo;

function syllableIndex(ch: string): number {
  const index = ch.charCodeAt(0) - SYLLABLE_FIRST;
  return index >= 0 && index < SYLLABLE_COUNT ? index : -1;
}

/** 한글 음절을 자모로 풀어 쓴다. 다른 글자는 그대로 둔다. 예: ‘닭 2’ → ‘ㄷㅏㄹㄱ 2’ */
function toJamo(text: string): string {
  let out = '';
  for (const ch of text) {
    const index = syllableIndex(ch);
    out +=
      index < 0
        ? split(ch)
        : CHOSEONG[Math.floor(index / 588)] + split(JUNGSEONG[Math.floor((index % 588) / 28)]) + split(JONGSEONG[index % 28]);
  }
  return out;
}

/** 한글 음절은 초성만 남기고 다른 글자는 그대로 둔다. 예: ‘1차 조사’ → ‘1ㅊ ㅈㅅ’ */
function toChoseong(text: string): string {
  let out = '';
  for (const ch of text) {
    const index = syllableIndex(ch);
    out += index < 0 ? ch : CHOSEONG[Math.floor(index / 588)];
  }
  return out;
}

/** 검색어를 낱말로 나눈다. 비어 있으면 빈 배열(모두 보여 줌). */
export function searchTerms(query: string): string[] {
  return query.normalize('NFC').toLowerCase().split(/\s+/).filter(Boolean);
}

/** 이름이 검색어의 모든 낱말을 포함하면 true. 검색어가 비어 있으면 늘 true. */
export function matchesSearch(name: string, query: string): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const target = name.normalize('NFC').toLowerCase().replace(/\s+/g, '');
  let jamo: string | undefined;
  let choseong: string | undefined;
  return terms.every((term) => {
    if (CONSONANTS_ONLY.test(term)) return (choseong ??= toChoseong(target)).includes(toJamo(term));
    return (jamo ??= toJamo(target)).includes(toJamo(term));
  });
}
