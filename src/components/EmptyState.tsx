import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './EmptyState.css';

interface EmptyStateProps {
  icon: IconName;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: 'default' | 'error';
}

export function EmptyState({ icon, title, children, actions, tone = 'default' }: EmptyStateProps) {
  return (
    <div className={`empty empty--${tone}`}>
      <span className="empty__icon">
        <Icon name={icon} size={28} />
      </span>
      <p className="empty__title">{title}</p>
      {children && <div className="empty__body">{children}</div>}
      {actions && <div className="empty__actions">{actions}</div>}
    </div>
  );
}
