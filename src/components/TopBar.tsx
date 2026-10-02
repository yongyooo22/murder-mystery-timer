import type { ReactNode } from 'react';
import './TopBar.css';

interface TopBarProps {
  left?: ReactNode;
  title: ReactNode;
  right?: ReactNode;
  /** 앱 이름처럼 화면의 대표 제목이면 h1 */
  as?: 'h1' | 'h2';
  /** brand: 앱 이름을 작은 영문 대문자로 보여 준다(목록 화면). */
  variant?: 'page' | 'brand';
}

export function TopBar({ left, title, right, as: Heading = 'h1', variant = 'page' }: TopBarProps) {
  return (
    <header className={`topbar topbar--${variant}`}>
      <div className="topbar__inner">
        {left && <div className="topbar__left">{left}</div>}
        <Heading className="topbar__title">{title}</Heading>
        {right && <div className="topbar__right">{right}</div>}
      </div>
    </header>
  );
}
