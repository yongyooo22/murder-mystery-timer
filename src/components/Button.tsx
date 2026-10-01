import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconEnd?: IconName;
  block?: boolean;
  /** 진행 중 표시. 버튼을 비활성화하고 스피너를 보여 준다. */
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconEnd,
    block,
    loading,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const iconSize = size === 'xl' ? 24 : size === 'sm' ? 18 : 20;
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', className].filter(Boolean).join(' ');
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : icon && <Icon name={icon} size={iconSize} />}
      {children !== undefined && <span className="btn__label">{children}</span>}
      {iconEnd && !loading && <Icon name={iconEnd} size={iconSize} />}
    </button>
  );
});

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** 화면 낭독기와 툴팁에 쓰는 이름(필수) */
  label: string;
  variant?: 'ghost' | 'secondary';
  size?: number;
}

/** 라벨 없이 아이콘만 보이는 44×44 버튼. 보조 동작에만 쓴다. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 22, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={['icon-btn', `icon-btn--${variant}`, className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
});
