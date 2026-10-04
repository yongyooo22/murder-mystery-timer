import { LIMITS, STAGE_MAX_SEC, charLength } from '../data/limits';

export interface ParsedStage {
  name: string;
  durationSec: number;
  line: number;
}

export interface ParseError {
  /** 1부터 시작하는 줄 번호 */
  line: number;
  text: string;
  message: string;
  /** 시간을 전혀 찾지 못한 줄(설명 문장 등). skipUntimed로 건너뛸 수 있다. */
  untimed?: boolean;
}

export const QUICK_INPUT_EXAMPLE = ['사건 소개 5', '1차 조사 20', '1차 토론 15:30', '범인 지목 10분', '해설 7분 30초'].join('\n');

// 단계 이름과 시간 사이에 올 수 있는 구분 기호
const SEPARATORS = String.raw`\s,|:=·\-–—`;
const LIST_MARKER = /^(?:[-*•·]\s+|\d{1,3}\s*[.)]\s+)/;

const TIME_PATTERNS: Array<{ re: RegExp; toSec: (m: RegExpMatchArray) => number | string }> = [
  {
    // 1:30:00 (시:분:초)
    re: /(\d{1,2}):(\d{2}):(\d{2})$/,
    toSec: (m) => (+m[2] > 59 || +m[3] > 59 ? '분과 초는 0~59 사이로 적어주세요.' : +m[1] * 3600 + +m[2] * 60 + +m[3]),
  },
  {
    // 15:30 (분:초)
    re: /(\d{1,3}):(\d{1,2})$/,
    toSec: (m) => (+m[2] > 59 ? '초는 0~59 사이로 적어주세요. (예: 15:30)' : +m[1] * 60 + +m[2]),
  },
  {
    // 1시간 30분, 15분 30초, 45초, 1h30m, 20m, 30s
    re: /(?:(\d+)\s*(?:시간|h|hr)\s*)?(?:(\d+)\s*(?:분|m|min)\s*)?(?:(\d+)\s*(?:초|s|sec))?$/i,
    toSec: (m) => Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0),
  },
];

// 단위 없이 숫자만 있으면 분으로 본다. 이름과 붙어 있으면(예: Room101) 시간으로 보지 않는다.
const BARE_MINUTES = new RegExp(String.raw`(?:^|[${SEPARATORS}])(\d+)$`);

function findTime(line: string): { index: number; sec: number | string } | null {
  for (const { re, toSec } of TIME_PATTERNS) {
    const m = line.match(re);
    if (m && m[0].trim() !== '' && m.index !== undefined) return { index: m.index, sec: toSec(m) };
  }
  const bare = line.match(BARE_MINUTES);
  if (bare && bare.index !== undefined) {
    return { index: bare.index + bare[0].length - bare[1].length, sec: +bare[1] * 60 };
  }
  return null;
}

// 괄호 안에 시간만 들어 있는 부분. 예: [10분], (5분), 【15:30】. (아일랜드06·07)처럼 시간이 아니면 이름으로 둔다.
const BRACKETED = /[[(（【]\s*([^[\]()（）【】]+?)\s*[\])）】]/g;

function bracketedTime(content: string): number | string | null {
  const time = findTime(content);
  return time && time.index === 0 ? time.sec : null;
}

/** 이름 앞뒤에 남은 구분 기호·메모 표시(*, ※)를 정리한다. */
const tidyName = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(new RegExp(`^[${SEPARATORS}*※]+|[${SEPARATORS}]+$`, 'g'), '')
    .trim();

/**
 * 괄호 안에 시간을 적은 줄. 예: `예배 시간 [5분]`, `전체 토의 [20분] *카드 교환 불가`.
 * `생각 정리 [1분] + 최후 발언 [5분]`처럼 +로 이으면 각각 한 단계가 된다.
 * 괄호 시간이 없으면 null(줄 끝 시간으로 읽는다).
 */
function parseBracketed(body: string): Array<{ name: string; sec: number | string | null }> | null {
  const hasTime = (text: string) => [...text.matchAll(BRACKETED)].some((m) => bracketedTime(m[1]) !== null);
  if (!hasTime(body)) return null;
  const parts = body.split(/\s+\+\s+/);
  return parts.map((part) => {
    const match = [...part.matchAll(BRACKETED)].find((m) => bracketedTime(m[1]) !== null);
    if (!match || match.index === undefined) {
      return { name: tidyName(part), sec: null };
    }
    const before = tidyName(part.slice(0, match.index));
    const after = tidyName(part.slice(match.index + match[0].length));
    // 시간 뒤에 붙은 메모(예: *카드 교환 불가)는 이름 뒤 괄호로 옮긴다.
    const name = after ? (before ? `${before} (${after})` : after) : before;
    return { name, sec: bracketedTime(match[1]) as number | string };
  });
}

/**
 * 여러 줄 텍스트를 단계 목록으로 바꾼다. 한 줄에 한 단계, 줄 끝에 시간을 적는다.
 * 시간은 `[10분]`처럼 괄호 안에 적어도 되고, 괄호 시간을 +로 이으면 한 줄에서 여러 단계가 된다.
 * 빈 줄과 `#`으로 시작하는 줄(제목·메모)은 건너뛴다. 다만 `### 사전 준비 [10분]`처럼 시간이 있는 제목 아래에
 * 시간이 적힌 줄이 하나도 없으면 그 제목을 한 단계로 쓴다. 아래 줄에 세부 시간이 있으면 겹치지 않게 제목은 빼고,
 * 세부 단계 이름 앞에 제목을 붙인다(예: 첫 번째 종 · 예배 시간).
 */
export function parseQuickInput(
  text: string,
  { skipUntimed = false }: { skipUntimed?: boolean } = {},
): { stages: ParsedStage[]; errors: ParseError[]; skipped: number } {
  const stages: ParsedStage[] = [];
  const errors: ParseError[] = [];
  let skipped = 0;
  let heading: { stage: ParsedStage; timedBelow: boolean } | null = null;
  const flushHeading = () => {
    if (heading && !heading.timedBelow) stages.push(heading.stage);
    heading = null;
  };

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.normalize('NFKC').trim();
    const lineNo = i + 1;
    if (!line) return;
    if (line.startsWith('#')) {
      flushHeading();
      const found = parseBracketed(line.replace(/^#+\s*/, ''));
      const only = found?.length === 1 ? found[0] : null;
      if (only && typeof only.sec === 'number' && only.sec >= 1 && only.sec <= STAGE_MAX_SEC && only.name) {
        if (charLength(only.name) <= LIMITS.stageNameMax) {
          heading = { stage: { name: only.name, durationSec: only.sec, line: lineNo }, timedBelow: false };
        }
      }
      return;
    }
    const fail = (message: string, untimed?: true) => errors.push({ line: lineNo, text: rawLine.trim(), message, untimed });
    const untimedMessage = '시간을 찾지 못했어요. 줄 끝이나 괄호 안에 적어주세요. (예: 조사 20, 예배 시간 [5분])';

    const body = line.replace(LIST_MARKER, '');
    let found = parseBracketed(body);
    if (!found) {
      const time = findTime(body);
      if (!time) {
        if (skipUntimed) return void skipped++;
        return fail(untimedMessage, true);
      }
      found = [{ name: tidyName(body.slice(0, time.index)), sec: time.sec }];
    }
    if (heading) heading.timedBelow = true;

    // 한 줄에서 나온 단계 중 하나라도 잘못되면 그 줄 전체를 오류로 보여 준다.
    const lineStages: ParsedStage[] = [];
    for (const { name, sec } of found) {
      if (sec === null) {
        // `생각 정리 [1분] + 투표`의 ‘투표’처럼 시간이 없는 부분
        if (skipUntimed) {
          skipped++;
          continue;
        }
        return fail(`‘${name}’의 시간을 찾지 못했어요. (예: ${name} [5분])`, true);
      }
      if (typeof sec === 'string') return fail(sec);
      if (!name) return fail('단계 이름이 없어요. 시간 앞에 이름을 적어주세요.');
      if (charLength(name) > LIMITS.stageNameMax) return fail(`단계 이름은 ${LIMITS.stageNameMax}자 이내로 적어주세요.`);
      if (sec < 1) return fail('시간은 1초 이상이어야 해요.');
      if (sec > STAGE_MAX_SEC) return fail(`한 단계는 최대 ${LIMITS.stageMaxMinutes}분 59초까지 정할 수 있어요.`);
      const sectioned = heading ? `${(heading as { stage: ParsedStage }).stage.name} · ${name}` : name;
      lineStages.push({
        name: charLength(sectioned) <= LIMITS.stageNameMax ? sectioned : name,
        durationSec: sec,
        line: lineNo,
      });
    }
    stages.push(...lineStages);
  });
  flushHeading();

  return { stages, errors, skipped };
}
