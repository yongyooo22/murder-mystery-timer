import { useSyncExternalStore } from 'react';

export interface Store<S> {
  get: () => S;
  set: (next: S | ((prev: S) => S)) => void;
  subscribe: (listener: () => void) => () => void;
}

/** 화면 여러 곳에서 함께 쓰는 작은 상태 저장소 */
export function createStore<S>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      const value = typeof next === 'function' ? (next as (prev: S) => S)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<S>(store: Store<S>): S {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
