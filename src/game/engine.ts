/**
 * 게임 진행 상태를 다루는 순수 함수 모음.
 *
 * 규칙
 * - 시간은 모두 epoch ms 기준으로 계산해 새로고침·백그라운드 후에도 이어진다.
 * - 실제 진행 시간 = 일시정지를 뺀 실행 시간(초과 시간 포함).
 * - ±1분은 현재 단계의 배정 시간만 바꾸고 실제 진행 시간은 바꾸지 않는다.
 * - 다른 단계로 이동하면 그 단계는 원래 계획 시간으로 새로 시작하고, 실행 시간은 단계별로 누적한다.
 * - 게임 시작 시 시나리오 구성(이름·순서·시간)을 복사해 두므로 서버의 시나리오가 바뀌어도 영향이 없다.
 */

export const WARNING_MS = 60_000;
export const ADJUST_STEP_MS = 60_000;
/** 알림 시점을 이만큼 넘겨서 확인했다면(앱을 닫아 두었던 경우 등) 소리 없이 지나간 것으로 처리한다. */
export const STALE_ALERT_MS = 10_000;

export interface PlanStage {
  id: string;
  name: string;
  plannedSec: number;
}

export interface GameState {
  v: 1;
  id: string;
  scenarioId: string | null;
  scenarioName: string;
  /** 게임 시작 시점의 원래 계획 */
  stages: PlanStage[];
  startedAt: number;
  current: number;
  /** 현재 단계에 배정된 시간(계획 + ±조정) */
  allottedMs: number;
  /** 현재 단계에서 지금 실행 구간 전까지 누적된 실행 시간 */
  segmentBaseMs: number;
  /** 실행 중이면 현재 실행 구간 시작 시각, 일시정지면 null */
  runningSince: number | null;
  /** 단계별로 끝난 구간의 실행 시간 합계 */
  actualMs: number[];
  visited: boolean[];
  /** 현재 구간에서 1분 전 알림을 이미 처리했는지 */
  warned: boolean;
  /** 현재 구간에서 시간 종료 알림을 이미 처리했는지 */
  timeUp: boolean;
}

export interface StageResult {
  id: string;
  name: string;
  plannedSec: number;
  actualSec: number;
  visited: boolean;
}

export interface GameResult {
  v: 1;
  id: string;
  scenarioId: string | null;
  scenarioName: string;
  startedAt: number;
  endedAt: number;
  stages: StageResult[];
  plannedTotalSec: number;
  actualTotalSec: number;
}

export type AlertKind = 'warning' | 'timeUp';

interface ScenarioLike {
  id: string | null;
  name: string;
  stages: ReadonlyArray<{ id: string; name: string; durationSec: number }>;
}

export function startGame(scenario: ScenarioLike, gameId: string, now: number): GameState {
  if (scenario.stages.length === 0) throw new Error('단계가 없는 시나리오는 시작할 수 없어요.');
  const stages = scenario.stages.map((s) => ({ id: s.id, name: s.name, plannedSec: s.durationSec }));
  return {
    v: 1,
    id: gameId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    stages,
    startedAt: now,
    current: 0,
    allottedMs: stages[0].plannedSec * 1000,
    segmentBaseMs: 0,
    runningSince: now,
    actualMs: stages.map(() => 0),
    visited: stages.map((_, i) => i === 0),
    warned: stages[0].plannedSec * 1000 <= WARNING_MS,
    timeUp: false,
  };
}

export const isRunning = (g: GameState) => g.runningSince !== null;

export function segmentElapsedMs(g: GameState, now: number): number {
  const running = g.runningSince === null ? 0 : Math.max(0, now - g.runningSince);
  return Math.max(0, g.segmentBaseMs + running);
}

/** 현재 단계의 남은 시간. 음수면 초과한 시간이다. */
export function remainingMs(g: GameState, now: number): number {
  return g.allottedMs - segmentElapsedMs(g, now);
}

export const isOvertime = (g: GameState, now: number) => remainingMs(g, now) <= 0;
export const isLastStage = (g: GameState) => g.current === g.stages.length - 1;
export const currentStage = (g: GameState) => g.stages[g.current];
export const nextStage = (g: GameState): PlanStage | null => g.stages[g.current + 1] ?? null;
export const previousStage = (g: GameState): PlanStage | null => g.stages[g.current - 1] ?? null;

export function pause(g: GameState, now: number): GameState {
  if (g.runningSince === null) return g;
  return { ...g, segmentBaseMs: segmentElapsedMs(g, now), runningSince: null };
}

export function resume(g: GameState, now: number): GameState {
  if (g.runningSince !== null) return g;
  return { ...g, runningSince: now };
}

/** 남은 시간이 없을 때는 줄일 수 없다. */
export const canDecrease = (g: GameState, now: number) => remainingMs(g, now) > 0;

/**
 * 현재 단계의 배정 시간을 바꾼다. 줄일 때는 남은 시간이 0 아래로 내려가지 않는다.
 * 남은 시간이 다시 알림 기준보다 커지면 해당 알림을 다시 울릴 수 있게 한다.
 */
export function adjustTime(g: GameState, deltaMs: number, now: number): GameState {
  const elapsed = segmentElapsedMs(g, now);
  let allottedMs = g.allottedMs + deltaMs;
  if (deltaMs < 0) {
    if (!canDecrease(g, now)) return g;
    allottedMs = Math.max(allottedMs, elapsed);
  }
  const remaining = allottedMs - elapsed;
  return {
    ...g,
    allottedMs,
    warned: remaining > WARNING_MS ? false : g.warned,
    timeUp: remaining > 0 ? false : g.timeUp,
  };
}

/** 현재 구간의 실행 시간을 기록하고 index 단계를 원래 계획 시간으로 새로 시작한다(바로 실행). */
export function goToStage(g: GameState, index: number, now: number): GameState {
  if (index < 0 || index >= g.stages.length) return g;
  const actualMs = [...g.actualMs];
  actualMs[g.current] += segmentElapsedMs(g, now);
  const visited = [...g.visited];
  visited[index] = true;
  const plannedMs = g.stages[index].plannedSec * 1000;
  return {
    ...g,
    current: index,
    allottedMs: plannedMs,
    segmentBaseMs: 0,
    runningSince: now,
    actualMs,
    visited,
    warned: plannedMs <= WARNING_MS,
    timeUp: false,
  };
}

/** 전체 남은 시간 = 현재 단계 남은 시간(초과 시 0) + 이후 단계들의 계획 시간 */
export function totalRemainingMs(g: GameState, now: number): number {
  const later = g.stages.slice(g.current + 1).reduce((sum, s) => sum + s.plannedSec * 1000, 0);
  return Math.max(0, remainingMs(g, now)) + later;
}

/** 현재 단계의 진행률(0~1). 초과하면 1. */
export function stageProgress(g: GameState, now: number): number {
  if (g.allottedMs <= 0) return 1;
  return Math.min(1, segmentElapsedMs(g, now) / g.allottedMs);
}

/**
 * 1분 전·시간 종료 알림이 필요한지 확인한다. 상태에 처리 여부를 기록해 한 번만 울리게 한다.
 * 알림 시점이 오래 지나서 확인된 경우에는 기록만 하고 알림 목록에는 넣지 않는다.
 */
export function checkAlerts(g: GameState, now: number): { state: GameState; alerts: AlertKind[] } {
  const remaining = remainingMs(g, now);
  const alerts: AlertKind[] = [];
  let state = g;
  if (!state.timeUp && remaining <= 0) {
    state = { ...state, timeUp: true, warned: true };
    if (-remaining <= STALE_ALERT_MS) alerts.push('timeUp');
  } else if (!state.warned && remaining <= WARNING_MS) {
    state = { ...state, warned: true };
    if (WARNING_MS - remaining <= STALE_ALERT_MS) alerts.push('warning');
  }
  return { state, alerts };
}

export function finishGame(g: GameState, now: number): GameResult {
  const actualMs = [...g.actualMs];
  actualMs[g.current] += segmentElapsedMs(g, now);
  const stages = g.stages.map((s, i) => ({
    id: s.id,
    name: s.name,
    plannedSec: s.plannedSec,
    actualSec: g.visited[i] ? Math.round(actualMs[i] / 1000) : 0,
    visited: g.visited[i],
  }));
  return {
    v: 1,
    id: g.id,
    scenarioId: g.scenarioId,
    scenarioName: g.scenarioName,
    startedAt: g.startedAt,
    endedAt: now,
    stages,
    plannedTotalSec: stages.reduce((sum, s) => sum + s.plannedSec, 0),
    actualTotalSec: stages.reduce((sum, s) => sum + s.actualSec, 0),
  };
}
