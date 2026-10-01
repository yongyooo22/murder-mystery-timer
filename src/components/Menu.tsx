import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { Icon, type IconName } from './Icon';
import './Menu.css';

export type MenuItem =
  | { type?: 'item'; label: string; icon?: IconName; tone?: 'danger'; onSelect: () => void; disabled?: boolean }
  | { type: 'separator' };

interface MenuProps {
  /** 더보기 버튼의 접근 가능한 이름. 예: ‘저택의 밤’ 더보기 */
  label: string;
  items: MenuItem[];
}

const MENU_WIDTH = 220;
const VIEWPORT_MARGIN = 8;

/** 더보기(⋯) 버튼과 펼침 메뉴 */
export function Menu({ label, items }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH),
      viewportWidth - MENU_WIDTH - VIEWPORT_MARGIN,
    );
    const spaceBelow = viewportHeight - rect.bottom;
    if (spaceBelow < menuHeight + VIEWPORT_MARGIN && rect.top > spaceBelow) {
      setPosition({ bottom: viewportHeight - rect.top + 4, left });
    } else {
      setPosition({ top: rect.bottom + 4, left });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        close(false);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }
    };
    // 스크롤하거나 화면 크기가 바뀌면 위치가 어긋나므로 닫는다.
    const onViewportChange = () => close(false);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open]);

  return (
    <>
      <IconButton
        ref={triggerRef}
        icon="more"
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      />
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="menu"
            role="menu"
            aria-label={label}
            style={{
              width: MENU_WIDTH,
              left: position?.left ?? -9999,
              top: position?.top,
              bottom: position?.bottom,
              visibility: position ? 'visible' : 'hidden',
            }}
          >
            {items.map((item, i) =>
              item.type === 'separator' ? (
                <div key={`sep-${i}`} className="menu__separator" role="separator" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={['menu__item', item.tone === 'danger' && 'menu__item--danger'].filter(Boolean).join(' ')}
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                >
                  {item.icon && <Icon name={item.icon} size={20} />}
                  <span>{item.label}</span>
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
