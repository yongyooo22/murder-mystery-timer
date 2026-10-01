import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

interface DragState {
  key: string;
  from: number;
  to: number;
  dy: number;
  /** 끌고 있는 행의 높이: 다른 행이 비켜 주는 거리 */
  size: number;
}

interface DragInfo {
  pointerId: number;
  startY: number;
  startScroll: number;
  lastY: number;
  /** 문서 기준 각 행의 세로 중심 */
  centers: number[];
  from: number;
}

const EDGE = 80;
const MAX_SCROLL_STEP = 14;

/**
 * 손잡이를 잡았을 때만 동작하는 세로 목록 끌어서 순서 바꾸기.
 * 손잡이에만 touch-action: none을 주므로 나머지 영역의 스크롤과 겹치지 않는다.
 */
export function useDragReorder(keys: string[], onMove: (from: number, to: number) => void, bottomInset = 0) {
  const [drag, setDragState] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const info = useRef<DragInfo | null>(null);
  const frame = useRef<number | undefined>(undefined);
  const keysRef = useRef(keys);

  useLayoutEffect(() => {
    keysRef.current = keys;
  });

  const setDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDragState(next);
  }, []);

  const registerRow = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) rows.current.set(key, el);
      else rows.current.delete(key);
    },
    [],
  );

  const update = useCallback(() => {
    const i = info.current;
    if (!i) return;
    const dy = i.lastY - i.startY + (window.scrollY - i.startScroll);
    const center = i.centers[i.from] + dy;
    let to = i.from;
    while (to < i.centers.length - 1 && center > i.centers[to + 1]) to++;
    while (to > 0 && center < i.centers[to - 1]) to--;
    if (dragRef.current) setDrag({ ...dragRef.current, dy, to });
  }, [setDrag]);

  const stopAutoScroll = () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  };

  const autoScroll = useCallback(() => {
    const i = info.current;
    if (!i) return;
    const bottomEdge = window.innerHeight - bottomInset - EDGE;
    let step = 0;
    if (i.lastY < EDGE) step = -Math.ceil(((EDGE - i.lastY) / EDGE) * MAX_SCROLL_STEP);
    else if (i.lastY > bottomEdge) step = Math.ceil(((i.lastY - bottomEdge) / EDGE) * MAX_SCROLL_STEP);
    if (step !== 0) {
      window.scrollBy(0, step);
      update();
    }
    frame.current = requestAnimationFrame(autoScroll);
  }, [bottomInset, update]);

  const finish = useCallback(
    (commit: boolean) => {
      stopAutoScroll();
      document.body.classList.remove('is-dragging');
      const d = dragRef.current;
      info.current = null;
      setDrag(null);
      if (d && commit && d.to !== d.from) onMove(d.from, d.to);
    },
    [onMove, setDrag],
  );

  useEffect(
    () => () => {
      stopAutoScroll();
      document.body.classList.remove('is-dragging');
    },
    [],
  );

  const handleProps = (key: string) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const from = keysRef.current.indexOf(key);
      const elements = keysRef.current.map((k) => rows.current.get(k));
      if (from === -1 || elements.some((el) => !el)) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // 포인터 캡처를 못 해도 손잡이 위에서 움직이는 동안은 동작한다.
      }
      const rects = elements.map((el) => el!.getBoundingClientRect());
      info.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScroll: window.scrollY,
        lastY: event.clientY,
        centers: rects.map((r) => r.top + window.scrollY + r.height / 2),
        from,
      };
      document.body.classList.add('is-dragging');
      setDrag({ key, from, to: from, dy: 0, size: rects[from].height });
      frame.current = requestAnimationFrame(autoScroll);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (!info.current || event.pointerId !== info.current.pointerId) return;
      info.current.lastY = event.clientY;
      update();
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (info.current?.pointerId === event.pointerId) finish(true);
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (info.current?.pointerId === event.pointerId) finish(false);
    },
  });

  const rowStyle = (key: string, index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (key === drag.key) return { transform: `translateY(${drag.dy}px)` };
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return { transform: `translateY(${-drag.size}px)` };
    if (drag.from > drag.to && index >= drag.to && index < drag.from) return { transform: `translateY(${drag.size}px)` };
    return undefined;
  };

  return { drag, registerRow, handleProps, rowStyle };
}
