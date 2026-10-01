import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

interface AutoTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  /** Enter를 눌렀을 때(줄바꿈 대신) 실행 */
  onEnter?: () => void;
}

/**
 * 한 줄 입력처럼 쓰되 긴 글은 줄을 바꿔 모두 보여 주는 입력칸.
 * 줄바꿈은 넣지 않는다(붙여 넣은 줄바꿈은 공백으로 바꾼다).
 */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, AutoTextareaProps>(function AutoTextarea(
  { value, onChange, onEnter, onKeyDown, ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );

  const fit = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, []);

  useLayoutEffect(fit, [value, fit]);

  // 화면 폭이 바뀌면(회전 등) 높이를 다시 맞춘다.
  useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <textarea
      ref={setRefs}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\r?\n/g, ' '))}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.defaultPrevented) {
          event.preventDefault();
          onEnter?.();
        }
      }}
      {...rest}
    />
  );
});
