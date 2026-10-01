const pad2 = (n: number) => String(n).padStart(2, '0');

/** 초 → `05:00`, `14:32`, `1:02:03` (타이머·단계 시간 표시용) */
export function clockText(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

/**
 * 남은 시간(ms)을 큰 타이머 문자열로 바꾼다.
 * 남은 시간이 있으면 올림한 초로 `14:32`, 시간이 지났으면 내림한 초과 시간으로 `+01:23`.
 */
export function timerText(remainingMs: number): { text: string; overtime: boolean } {
  if (remainingMs > 0) return { text: clockText(Math.ceil(remainingMs / 1000)), overtime: false };
  return { text: `+${clockText(Math.floor(-remainingMs / 1000))}`, overtime: true };
}

/** 초 → `1시간 40분`, `15분 30초`, `45초`, `0분` */
export function durationText(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s === 0) return '0분';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}시간`);
  if (m) parts.push(`${m}분`);
  if (sec) parts.push(`${sec}초`);
  return parts.join(' ');
}

/** 전체 남은 시간 요약: 1분 이상이면 분 단위(내림), 1분 미만이면 초 단위. */
export function remainingSummaryText(ms: number): string {
  if (ms <= 0) return '0분';
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec}초`;
  const minutes = Math.floor(totalSec / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 차이(초)를 `+1:23`, `−0:37`, `±0:00`로 표시 */
export function signedClockText(diffSec: number): string {
  const rounded = Math.round(diffSec);
  if (rounded === 0) return '±0:00';
  const abs = Math.abs(rounded);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const h = Math.floor(m / 60);
  const body = h > 0 ? `${h}:${pad2(m % 60)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  return `${rounded > 0 ? '+' : '−'}${body}`;
}

/** 차이(초)를 문장으로: `계획보다 7분 10초 더 걸렸어요` */
export function diffSentence(diffSec: number): string {
  const rounded = Math.round(diffSec);
  if (rounded === 0) return '계획과 같아요';
  return rounded > 0
    ? `계획보다 ${durationText(rounded)} 더 걸렸어요`
    : `계획보다 ${durationText(-rounded)} 빨리 끝났어요`;
}

/** ISO 시각 → `방금 전`, `5분 전`, `3시간 전`, `2일 전`, 그보다 오래되면 날짜 */
export function relativeTimeText(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, now - then);
  const minute = 60_000;
  if (diff < minute) return '방금 전';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)}분 전`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))}시간 전`;
  if (diff < 7 * 24 * 60 * minute) return `${Math.floor(diff / (24 * 60 * minute))}일 전`;
  const d = new Date(then);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** epoch ms → `14:02` (오늘 기준 시각 표기) */
export function timeOfDayText(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function sumDurationSec(stages: ReadonlyArray<{ durationSec: number }>): number {
  return stages.reduce((sum, stage) => sum + stage.durationSec, 0);
}
