import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import './Modal.css';

/** 열린 모달 순서. Esc·포커스 가두기는 맨 위 모달만 처리한다. */
const stack: string[] = [];
let scrollLockCount = 0;
let savedOverflow = '';

function lockScroll() {
  if (scrollLockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount++;
}

function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) document.body.style.overflow = savedOverflow;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** 제목 아래 짧은 설명 */
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** dialog: 가운데 대화상자, sheet: 모바일에서는 아래에서 올라오는 시트 */
  variant?: 'dialog' | 'sheet';
  /** 배경을 누르거나 Esc로 닫을 수 있는지. 작업 중에는 false로 둔다. */
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 닫기(X) 버튼 표시 */
  showClose?: boolean;
  className?: string;
  role?: 'dialog' | 'alertdialog';
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  variant = 'dialog',
  dismissible = true,
  initialFocusRef,
  showClose = variant === 'sheet',
  className,
  role = 'dialog',
}: ModalProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    stack.push(id);
    lockScroll();

    const focusTarget =
      initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current;
    focusTarget?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab' && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement,
        );
        if (items.length === 0) {
          event.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = stack.lastIndexOf(id);
      if (index !== -1) stack.splice(index, 1);
      unlockScroll();
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
    // initialFocusRef는 열릴 때 한 번만 쓴다.
  }, [open, id]);

  if (!open) return null;

  return createPortal(
    <div
      className={`modal-root modal-root--${variant}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && dismissibleRef.current) onCloseRef.current();
      }}
    >
      <div
        ref={panelRef}
        className={['modal', `modal--${variant}`, className].filter(Boolean).join(' ')}
        role={role}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
      >
        <div className="modal__head">
          <div className="modal__titles">
            <h2 id={`${id}-title`} className="modal__title">
              {title}
            </h2>
            {subtitle && <div className="modal__subtitle">{subtitle}</div>}
          </div>
          {showClose && (
            <IconButton icon="close" label="닫기" onClick={() => onCloseRef.current()} disabled={!dismissible} />
          )}
        </div>
        {children !== undefined && <div className="modal__body">{children}</div>}
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
