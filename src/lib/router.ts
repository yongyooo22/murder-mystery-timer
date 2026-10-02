import { useSyncExternalStore } from 'react';

/**
 * 해시 기반 라우터(#/...). 정적 호스팅에서도 새로고침·뒤로 가기가 그대로 동작한다.
 * 편집 화면처럼 나가기 전에 확인이 필요한 화면은 setLeaveGuard로 막을 수 있다.
 */
export type Route =
  | { name: 'list' }
  | { name: 'new'; template?: string }
  | { name: 'edit'; id: string }
  | { name: 'play' }
  | { name: 'result' }
  | { name: 'trash' };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  let parts: string[];
  try {
    parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { name: 'list' };
  }
  switch (parts[0]) {
    case 'new':
      return { name: 'new', template: params.get('template') ?? undefined };
    case 'edit':
      if (parts[1]) return { name: 'edit', id: parts[1] };
      break;
    case 'play':
      return { name: 'play' };
    case 'result':
      return { name: 'result' };
    case 'trash':
      return { name: 'trash' };
  }
  return { name: 'list' };
}

export function routeToHash(route: Route): string {
  const enc = encodeURIComponent;
  switch (route.name) {
    case 'list':
      return '#/';
    case 'new':
      return route.template ? `#/new?template=${enc(route.template)}` : '#/new';
    case 'edit':
      return `#/edit/${enc(route.id)}`;
    case 'play':
      return '#/play';
    case 'result':
      return '#/result';
    case 'trash':
      return '#/trash';
  }
}

interface HistoryState {
  mtIdx: number;
}

let current: Route = parseHash(window.location.hash);
let currentHash = routeToHash(current);
let index = (window.history.state as HistoryState | null)?.mtIdx ?? 0;
const listeners = new Set<() => void>();

/** 다른 화면으로 가려 할 때 호출된다. false를 돌려주면 이동을 막는다. */
type LeaveGuard = (next: Route) => boolean;
let leaveGuard: LeaveGuard | null = null;

window.history.replaceState({ mtIdx: index } satisfies HistoryState, '', currentHash);

function emit(route: Route) {
  current = route;
  currentHash = routeToHash(route);
  listeners.forEach((listener) => listener());
}

window.addEventListener('hashchange', () => {
  const next = parseHash(window.location.hash);
  if (leaveGuard && routeToHash(next) !== currentHash && !leaveGuard(next)) {
    // 뒤로 가기 등으로 바뀐 주소를 되돌린다. 기록을 다시 쌓아 두어야 한 번 더 뒤로 갈 때도 확인할 수 있다.
    const landed = (window.history.state as HistoryState | null)?.mtIdx ?? 0;
    index = landed + 1;
    window.history.pushState({ mtIdx: index } satisfies HistoryState, '', currentHash);
    return;
  }
  index = (window.history.state as HistoryState | null)?.mtIdx ?? 0;
  emit(next);
});

export function navigate(route: Route, options: { replace?: boolean } = {}) {
  const hash = routeToHash(route);
  if (hash === currentHash) return;
  if (options.replace) {
    window.history.replaceState({ mtIdx: index } satisfies HistoryState, '', hash);
  } else {
    index += 1;
    window.history.pushState({ mtIdx: index } satisfies HistoryState, '', hash);
  }
  emit(route);
}

/** 앱 안에서 들어온 화면이면 브라우저 기록을 한 칸 되돌리고, 아니면 fallback으로 이동한다. */
export function goBack(fallback: Route) {
  if (index > 0) window.history.back();
  else navigate(fallback, { replace: true });
}

export function setLeaveGuard(guard: LeaveGuard | null) {
  leaveGuard = guard;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => current);
}
