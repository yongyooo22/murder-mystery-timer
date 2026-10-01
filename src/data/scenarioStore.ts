import { STORAGE_KEYS, readJson, writeJson } from '../lib/storage';
import { createStore, useStore } from '../lib/store';
import { api, errorMessage } from './api';
import type { Scenario, ScenarioInput } from './types';

export type LoadStatus = 'loading' | 'ready' | 'offline';

export interface ScenarioListState {
  items: Scenario[];
  /** 지금 보여 주는 목록의 출처. none이면 아직 보여 줄 목록이 없다. */
  source: 'none' | 'cache' | 'server';
  status: LoadStatus;
  /** 서버에서 마지막으로 목록을 받은 시각(epoch ms) */
  syncedAt: number | null;
  retentionDays: number | null;
  error: string | null;
}

interface CachedList {
  items: Scenario[];
  syncedAt: number;
}

const byUpdatedDesc = (a: Scenario, b: Scenario) => b.updatedAt.localeCompare(a.updatedAt);

function initialState(): ScenarioListState {
  const cached = readJson<CachedList>(STORAGE_KEYS.scenarios);
  if (cached && Array.isArray(cached.items)) {
    return { items: cached.items, source: 'cache', status: 'loading', syncedAt: cached.syncedAt, retentionDays: null, error: null };
  }
  return { items: [], source: 'none', status: 'loading', syncedAt: null, retentionDays: null, error: null };
}

export const scenarioStore = createStore<ScenarioListState>(initialState());

export const useScenarioList = () => useStore(scenarioStore);

function saveCache(items: Scenario[], syncedAt: number | null) {
  writeJson(STORAGE_KEYS.scenarios, { items, syncedAt: syncedAt ?? Date.now() } satisfies CachedList);
}

/** 서버에서 받은 최신 항목을 목록에 반영한다(휴지통으로 간 항목은 뺀다). */
function upsert(item: Scenario) {
  scenarioStore.set((state) => {
    const rest = state.items.filter((it) => it.id !== item.id);
    const items = item.deletedAt ? rest : [item, ...rest].sort(byUpdatedDesc);
    saveCache(items, state.syncedAt);
    return { ...state, items, source: state.source === 'none' ? 'server' : state.source };
  });
}

function remove(id: string) {
  scenarioStore.set((state) => {
    const items = state.items.filter((it) => it.id !== id);
    saveCache(items, state.syncedAt);
    return { ...state, items };
  });
}

let inflight: Promise<void> | null = null;

/** 목록을 서버에서 다시 불러온다. 자동으로 반복 호출하지 않는다(처음 실행·새로고침 버튼에서만). */
export function refreshScenarios(): Promise<void> {
  if (inflight) return inflight;
  scenarioStore.set((state) => ({ ...state, status: 'loading', error: null }));
  inflight = api
    .listScenarios()
    .then(({ items, retentionDays }) => {
      const syncedAt = Date.now();
      const sorted = [...items].sort(byUpdatedDesc);
      saveCache(sorted, syncedAt);
      scenarioStore.set({ items: sorted, source: 'server', status: 'ready', syncedAt, retentionDays, error: null });
    })
    .catch((error) => {
      scenarioStore.set((state) => ({ ...state, status: 'offline', error: errorMessage(error) }));
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function findScenario(id: string): Scenario | undefined {
  return scenarioStore.get().items.find((it) => it.id === id);
}

export async function createScenario(input: ScenarioInput): Promise<Scenario> {
  const { item } = await api.createScenario(input);
  upsert(item);
  return item;
}

export async function updateScenario(id: string, input: ScenarioInput, rev: number): Promise<Scenario> {
  const { item } = await api.updateScenario(id, input, rev);
  upsert(item);
  return item;
}

export async function renameScenario(id: string, name: string): Promise<Scenario> {
  const { item } = await api.renameScenario(id, name);
  upsert(item);
  return item;
}

export async function duplicateScenario(id: string): Promise<Scenario> {
  const { item } = await api.duplicateScenario(id);
  upsert(item);
  return item;
}

export async function trashScenario(id: string): Promise<Scenario> {
  const { item } = await api.trashScenario(id);
  remove(id);
  return item;
}

export async function restoreScenario(id: string): Promise<Scenario> {
  const { item } = await api.restoreScenario(id);
  upsert(item);
  return item;
}

/** 다른 기기에서 지워진 사실을 알게 됐을 때 목록에서 뺀다. */
export function forgetScenario(id: string) {
  remove(id);
}

/** 서버가 알려 준 최신 상태(충돌 응답 등)를 목록에 반영한다. */
export function applyServerCopy(item: Scenario) {
  upsert(item);
}
