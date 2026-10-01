import { useId, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './Switch.css';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  disabled?: boolean;
}

/** 설정 항목 한 줄. 줄 전체를 눌러도 켜고 끌 수 있다. */
export function Switch({ checked, onChange, label, description, icon, disabled }: SwitchProps) {
  const id = useId();
  return (
    <div className={['switch-row', disabled && 'switch-row--disabled'].filter(Boolean).join(' ')}>
      {icon && <Icon name={icon} size={22} className="switch-row__icon" />}
      <label className="switch-row__text" htmlFor={id}>
        <span className="switch-row__label">{label}</span>
        {description && <span className="switch-row__desc">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className="switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" />
        <span className="switch__state" aria-hidden="true">
          {checked ? '켬' : '끔'}
        </span>
      </button>
    </div>
  );
}
