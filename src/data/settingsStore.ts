import { STORAGE_KEYS, readJson, writeJson } from '../lib/storage';
import { createStore, useStore } from '../lib/store';
import { DEFAULT_SORT, resolveSort, type ScenarioSort } from './scenarioSort';

/** 이 기기에만 저장되는 설정 */
export interface Settings {
  /** 단계 시간이 끝났을 때 알림음 */
  timeUpSound: boolean;
  /** 1분 남았을 때 알림음 */
  warningSound: boolean;
  vibration: boolean;
  /** 진행 화면에서 화면 꺼짐 방지 */
  keepAwake: boolean;
  /** 첫 화면 목록의 정렬 기준 */
  listSort: ScenarioSort;
}

const DEFAULTS: Settings = {
  timeUpSound: true,
  warningSound: true,
  vibration: true,
  keepAwake: true,
  listSort: DEFAULT_SORT,
};

function initialSettings(): Settings {
  const merged = { ...DEFAULTS, ...readJson<Partial<Settings>>(STORAGE_KEYS.settings) };
  return { ...merged, listSort: resolveSort(merged.listSort) };
}

export const settingsStore = createStore<Settings>(initialSettings());

export const useSettings = () => useStore(settingsStore);

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set((prev) => {
    const next = { ...prev, ...patch };
    writeJson(STORAGE_KEYS.settings, next);
    return next;
  });
}
