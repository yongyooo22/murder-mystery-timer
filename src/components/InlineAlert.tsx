import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { Icon, type IconName } from './Icon';
import './InlineAlert.css';

type Tone = 'info' | 'warning' | 'error' | 'success' | 'offline';

const TONE_ICON: Record<Tone, IconName> = {
  info: 'info',
  warning: 'alert',
  error: 'alert',
  success: 'check',
  offline: 'offline',
};

interface InlineAlertProps {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/** 사용자가 확인해야 하는 메시지. 저절로 사라지지 않는다. */
export function InlineAlert({ tone = 'info', title, children, actions, onDismiss, className }: InlineAlertProps) {
  return (
    <div
      className={['alert', `alert--${tone}`, className].filter(Boolean).join(' ')}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon name={TONE_ICON[tone]} size={20} className="alert__icon" />
      <div className="alert__content">
        {title && <p className="alert__title">{title}</p>}
        {children && <div className="alert__body">{children}</div>}
        {actions && <div className="alert__actions">{actions}</div>}
      </div>
      {onDismiss && <IconButton icon="close" label="알림 닫기" size={18} className="alert__close" onClick={onDismiss} />}
    </div>
  );
}
