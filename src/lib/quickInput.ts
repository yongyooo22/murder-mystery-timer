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

/**
 * 여러 줄 텍스트를 단계 목록으로 바꾼다. 한 줄에 한 단계, 줄 끝에 시간을 적는다.
 * 빈 줄과 `#`으로 시작하는 줄은 건너뛴다.
 */
export function parseQuickInput(text: string): { stages: ParsedStage[]; errors: ParseError[] } {
  const stages: ParsedStage[] = [];
  const errors: ParseError[] = [];

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.normalize('NFKC').trim();
    const lineNo = i + 1;
    if (!line || line.startsWith('#')) return;
    const fail = (message: string) => errors.push({ line: lineNo, text: rawLine.trim(), message });

    const body = line.replace(LIST_MARKER, '');
    const time = findTime(body);
    if (!time) return fail('줄 끝에서 시간을 찾지 못했어요. (예: 조사 20, 토론 15:30)');
    if (typeof time.sec === 'string') return fail(time.sec);

    const name = body
      .slice(0, time.index)
      .replace(new RegExp(`[${SEPARATORS}]+$`), '')
      .trim();
    if (!name) return fail('단계 이름이 없어요. 시간 앞에 이름을 적어주세요.');
    if (charLength(name) > LIMITS.stageNameMax) return fail(`단계 이름은 ${LIMITS.stageNameMax}자 이내로 적어주세요.`);
    if (time.sec < 1) return fail('시간은 1초 이상이어야 해요.');
    if (time.sec > STAGE_MAX_SEC) return fail(`한 단계는 최대 ${LIMITS.stageMaxMinutes}분 59초까지 정할 수 있어요.`);

    stages.push({ name, durationSec: time.sec, line: lineNo });
  });

  return { stages, errors };
}
