import { useCallback, useEffect, useState } from 'react';

/* ---------- 진동 ---------- */

export const vibrationSupported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function vibrate(pattern: number | number[]) {
  if (!vibrationSupported()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 일부 브라우저는 사용자 동작 없이 호출하면 예외를 낸다.
  }
}

/* ---------- 화면 꺼짐 방지 ---------- */

export const wakeLockSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/** enabled인 동안 화면이 꺼지지 않게 한다. 다른 앱에 다녀오면 다시 요청한다. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !wakeLockSupported()) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== 'visible' || sentinel) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // 배터리 절약 모드 등으로 거절될 수 있다. 화면은 평소처럼 동작한다.
      }
    };

    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}

/* ---------- 전체화면 ---------- */

type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = () => document as FullscreenDocument;

export const fullscreenSupported = () =>
  typeof document !== 'undefined' && Boolean(doc().fullscreenEnabled ?? doc().webkitFullscreenEnabled);

const fullscreenElement = () => doc().fullscreenElement ?? doc().webkitFullscreenElement ?? null;

/** 전체화면을 쓸 수 없는 브라우저(예: iPhone Safari)에서는 supported가 false다. */
export function useFullscreen() {
  const [active, setActive] = useState(() => Boolean(fullscreenElement()));
  const supported = fullscreenSupported();

  useEffect(() => {
    const onChange = () => setActive(Boolean(fullscreenElement()));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (fullscreenElement()) {
        await (document.exitFullscreen?.() ?? doc().webkitExitFullscreen?.());
      } else {
        const el = document.documentElement as FullscreenElement;
        await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      // 거절되면 일반 화면 그대로 쓴다.
    }
  }, []);

  return { supported, active, toggle };
}

/* ---------- 키보드 열림 감지 ---------- */

/** 모바일 화면 키보드가 열려 있는지(입력칸에 초점이 있고 보이는 영역이 줄었는지) */
export function useSoftKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const coarse = window.matchMedia('(pointer: coarse)');
    const update = () => {
      const el = document.activeElement as HTMLElement | null;
      const editing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && coarse.matches;
      const shrunk = viewport ? window.innerHeight - viewport.height > 120 : false;
      setOpen(editing && (shrunk || !viewport));
    };
    // 초점 이동 직후에는 키보드가 아직 올라오는 중이므로 조금 뒤에 다시 확인한다.
    const updateSoon = () => {
      update();
      window.setTimeout(update, 300);
    };
    document.addEventListener('focusin', updateSoon);
    document.addEventListener('focusout', updateSoon);
    viewport?.addEventListener('resize', update);
    return () => {
      document.removeEventListener('focusin', updateSoon);
      document.removeEventListener('focusout', updateSoon);
      viewport?.removeEventListener('resize', update);
    };
  }, []);
  return open;
}

/* ---------- 화면 방향 ---------- */

/** 가로 배치를 쓰는 조건. CSS의 @media (orientation: landscape) and (min-width: 560px)와 같아야 한다. */
export const LANDSCAPE_QUERY = '(orientation: landscape) and (min-width: 560px)';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}
