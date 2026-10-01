import { createId } from '../lib/id';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from '../lib/storage';
import { createStore, useStore } from '../lib/store';
import { finishGame, startGame, type GameResult, type GameState } from './engine';

interface GameStoreState {
  /** 진행 중인 게임(이 기기에만 저장) */
  game: GameState | null;
  /** 마지막으로 끝난 게임의 결과 */
  result: GameResult | null;
  /** 기기에 진행 상황을 저장하지 못하고 있는지 */
  persistFailed: boolean;
}

function isGameState(value: unknown): value is GameState {
  const g = value as GameState | null;
  return !!g && g.v === 1 && Array.isArray(g.stages) && g.stages.length > 0 && Number.isInteger(g.current);
}

function isGameResult(value: unknown): value is GameResult {
  const r = value as GameResult | null;
  return !!r && r.v === 1 && Array.isArray(r.stages);
}

function load(): GameStoreState {
  const game = readJson<unknown>(STORAGE_KEYS.game);
  const result = readJson<unknown>(STORAGE_KEYS.result);
  return {
    game: isGameState(game) ? game : null,
    result: isGameResult(result) ? result : null,
    persistFailed: false,
  };
}

export const gameStore = createStore<GameStoreState>(load());

export const useGameStore = () => useStore(gameStore);

function persistGame(game: GameState | null): boolean {
  return game ? writeJson(STORAGE_KEYS.game, game) : removeKey(STORAGE_KEYS.game);
}

export function startNewGame(scenario: Parameters<typeof startGame>[0]): GameState {
  const game = startGame(scenario, createId(), Date.now());
  const ok = persistGame(game);
  gameStore.set((s) => ({ ...s, game, persistFailed: !ok }));
  return game;
}

/** 진행 중인 게임 상태를 바꾸고 기기에 저장한다. */
export function updateGame(change: (game: GameState, now: number) => GameState) {
  const { game } = gameStore.get();
  if (!game) return;
  const next = change(game, Date.now());
  if (next === game) return;
  const ok = persistGame(next);
  gameStore.set((s) => ({ ...s, game: next, persistFailed: !ok }));
}

/** 게임을 끝내고 결과를 저장한다. */
export function endGame(): GameResult | null {
  const { game } = gameStore.get();
  if (!game) return null;
  const result = finishGame(game, Date.now());
  writeJson(STORAGE_KEYS.result, result);
  persistGame(null);
  gameStore.set({ game: null, result, persistFailed: false });
  return result;
}

/** 진행 기록을 결과 없이 지운다. */
export function discardGame() {
  persistGame(null);
  gameStore.set((s) => ({ ...s, game: null, persistFailed: false }));
}

// 같은 기기의 다른 탭에서 바뀐 진행 상황을 따라간다.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.game || event.key === STORAGE_KEYS.result || event.key === null) {
      const loaded = load();
      gameStore.set((s) => ({ ...s, game: loaded.game, result: loaded.result }));
    }
  });
}
