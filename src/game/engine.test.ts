import { describe, expect, test } from 'vitest';
import {
  adjustTime,
  canDecrease,
  checkAlerts,
  finishGame,
  goToStage,
  isOvertime,
  pause,
  remainingMs,
  resume,
  segmentElapsedMs,
  stageProgress,
  startGame,
  totalRemainingMs,
} from './engine';

const MIN = 60_000;
const T0 = 1_000_000;

const scenario = {
  id: 's1',
  name: '저택의 밤',
  stages: [
    { id: 'a', name: '사건 소개', durationSec: 300 },
    { id: 'b', name: '1차 조사', durationSec: 1200 },
    { id: 'c', name: '토론', durationSec: 900 },
  ],
};

const newGame = () => startGame(scenario, 'g1', T0);

describe('running and pausing', () => {
  test('starts running on the first stage with its planned time', () => {
    const g = newGame();
    expect(g.current).toBe(0);
    expect(remainingMs(g, T0)).toBe(5 * MIN);
    expect(remainingMs(g, T0 + 61_000)).toBe(5 * MIN - 61_000);
  });

  test('copies the scenario so later edits do not affect the game', () => {
    const source = structuredClone(scenario);
    const g = startGame(source, 'g', T0);
    source.name = '바뀐 이름';
    source.stages[0].durationSec = 1;
    expect(g.scenarioName).toBe('저택의 밤');
    expect(g.stages[0].plannedSec).toBe(300);
  });

  test('paused time is not counted', () => {
    let g = newGame();
    g = pause(g, T0 + MIN);
    expect(remainingMs(g, T0 + 10 * MIN)).toBe(4 * MIN);
    g = resume(g, T0 + 10 * MIN);
    expect(remainingMs(g, T0 + 11 * MIN)).toBe(3 * MIN);
    expect(segmentElapsedMs(g, T0 + 11 * MIN)).toBe(2 * MIN);
  });

  test('pause and resume are idempotent', () => {
    const g = pause(newGame(), T0 + 1000);
    expect(pause(g, T0 + 5000)).toBe(g);
    const r = resume(g, T0 + 6000);
    expect(resume(r, T0 + 7000)).toBe(r);
  });

  test('a clock that moves backwards never produces negative elapsed time', () => {
    expect(segmentElapsedMs(newGame(), T0 - 5000)).toBe(0);
  });
});

describe('±1 minute', () => {
  test('changes the allotted time but not the actual time', () => {
    let g = newGame();
    g = adjustTime(g, MIN, T0 + MIN);
    expect(remainingMs(g, T0 + MIN)).toBe(5 * MIN);
    g = adjustTime(g, -MIN, T0 + 2 * MIN);
    expect(remainingMs(g, T0 + 2 * MIN)).toBe(3 * MIN);
    const result = finishGame(g, T0 + 3 * MIN);
    expect(result.stages[0].actualSec).toBe(180);
    expect(result.stages[0].plannedSec).toBe(300);
  });

  test('decreasing stops at zero and is not possible in overtime', () => {
    let g = newGame();
    g = adjustTime(g, -MIN, T0 + 4.5 * MIN);
    expect(remainingMs(g, T0 + 4.5 * MIN)).toBe(0);
    expect(canDecrease(g, T0 + 4.5 * MIN)).toBe(false);
    expect(adjustTime(g, -MIN, T0 + 5 * MIN)).toBe(g);
  });

  test('adding time during overtime returns to the countdown and re-arms alerts', () => {
    let g = newGame();
    ({ state: g } = checkAlerts(g, T0 + 4 * MIN)); // 1분 전
    ({ state: g } = checkAlerts(g, T0 + 5 * MIN + 20_000)); // 시간 초과
    expect(g.timeUp).toBe(true);
    g = adjustTime(g, MIN, T0 + 5 * MIN + 20_000);
    expect(remainingMs(g, T0 + 5 * MIN + 20_000)).toBe(40_000);
    expect(g.timeUp).toBe(false);
    expect(g.warned).toBe(true);
    g = adjustTime(g, 2 * MIN, T0 + 5 * MIN + 20_000);
    expect(g.warned).toBe(false);
  });
});

describe('moving between stages', () => {
  test('next stage starts with its planned time and keeps running', () => {
    let g = pause(newGame(), T0 + 2 * MIN);
    g = goToStage(g, 1, T0 + 3 * MIN);
    expect(g.current).toBe(1);
    expect(g.runningSince).toBe(T0 + 3 * MIN);
    expect(remainingMs(g, T0 + 3 * MIN)).toBe(20 * MIN);
  });

  test('going back restarts the stage from its original plan and accumulates actual time', () => {
    let g = newGame();
    g = adjustTime(g, MIN, T0); // 사건 소개 6분으로
    g = goToStage(g, 1, T0 + 4 * MIN); // 사건 소개 4분 진행
    g = goToStage(g, 0, T0 + 6 * MIN); // 1차 조사 2분 진행 후 되돌아감
    expect(remainingMs(g, T0 + 6 * MIN)).toBe(5 * MIN); // 조정 전 원래 계획
    g = goToStage(g, 1, T0 + 7 * MIN); // 사건 소개 1분 더
    const result = finishGame(g, T0 + 10 * MIN); // 1차 조사 3분 더
    expect(result.stages.map((s) => s.actualSec)).toEqual([300, 300, 0]);
    expect(result.stages.map((s) => s.visited)).toEqual([true, true, false]);
  });

  test('ignores out-of-range targets', () => {
    const g = newGame();
    expect(goToStage(g, -1, T0)).toBe(g);
    expect(goToStage(g, 3, T0)).toBe(g);
  });
});

describe('overtime and totals', () => {
  test('overtime continues on the last stage and is counted as actual time', () => {
    let g = newGame();
    g = goToStage(g, 1, T0 + 5 * MIN);
    g = goToStage(g, 2, T0 + 25 * MIN);
    expect(isOvertime(g, T0 + 41 * MIN)).toBe(true);
    expect(remainingMs(g, T0 + 41 * MIN)).toBe(-MIN);
    const result = finishGame(g, T0 + 41 * MIN);
    expect(result.stages[2].actualSec).toBe(16 * 60);
    expect(result.actualTotalSec).toBe(41 * 60);
    expect(result.plannedTotalSec).toBe(40 * 60);
  });

  test('total remaining time = current remaining (0 in overtime) + later planned times', () => {
    let g = newGame();
    expect(totalRemainingMs(g, T0 + MIN)).toBe(4 * MIN + 20 * MIN + 15 * MIN);
    g = goToStage(g, 1, T0);
    expect(totalRemainingMs(g, T0 + 25 * MIN)).toBe(15 * MIN);
  });

  test('stage progress is capped at 1', () => {
    const g = newGame();
    expect(stageProgress(g, T0 + 150_000)).toBe(0.5);
    expect(stageProgress(g, T0 + 10 * MIN)).toBe(1);
  });

  test('a stage that was never reached is marked as not visited with zero time', () => {
    const result = finishGame(newGame(), T0 + MIN);
    expect(result.stages.map((s) => [s.visited, s.actualSec])).toEqual([
      [true, 60],
      [false, 0],
      [false, 0],
    ]);
  });
});

describe('alerts', () => {
  test('fires the one-minute warning and the time-up alert once each', () => {
    let g = newGame();
    let r = checkAlerts(g, T0 + 3 * MIN);
    expect(r.alerts).toEqual([]);
    r = checkAlerts(r.state, T0 + 4 * MIN + 500);
    expect(r.alerts).toEqual(['warning']);
    r = checkAlerts(r.state, T0 + 4 * MIN + 1500);
    expect(r.alerts).toEqual([]);
    r = checkAlerts(r.state, T0 + 5 * MIN + 200);
    expect(r.alerts).toEqual(['timeUp']);
    g = r.state;
    expect(checkAlerts(g, T0 + 6 * MIN).alerts).toEqual([]);
  });

  test('alerts noticed long after the moment are recorded silently', () => {
    const r = checkAlerts(newGame(), T0 + 30 * MIN);
    expect(r.alerts).toEqual([]);
    expect(r.state.timeUp).toBe(true);
    expect(r.state.warned).toBe(true);
  });

  test('stages of one minute or less skip the warning', () => {
    const g = startGame({ id: null, name: '짧은', stages: [{ id: 'x', name: '짧음', durationSec: 45 }] }, 'g', T0);
    expect(checkAlerts(g, T0 + 1000).alerts).toEqual([]);
    expect(checkAlerts(g, T0 + 45_000).alerts).toEqual(['timeUp']);
  });
});
