import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { charLength } from '../data/limits';
import { Icon } from './Icon';
import './TextField.css';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  /** 글자 수 제한을 표시한다(입력은 막지 않고 오류로 알려 준다). */
  maxChars?: number;
  hideLabel?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, value, onChange, error, hint, maxChars, hideLabel, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const count = maxChars ? charLength(value) : 0;
  const describedBy = [error && `${inputId}-error`, hint && `${inputId}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['field', error && 'field--invalid', className].filter(Boolean).join(' ')}>
      <div className={hideLabel ? 'visually-hidden' : 'field__label-row'}>
        <label className="field__label" htmlFor={inputId}>
          {label}
        </label>
        {maxChars && !hideLabel && (
          <span className={['field__count', 'num', count > maxChars && 'field__count--over'].filter(Boolean).join(' ')}>
            {count}/{maxChars}
          </span>
        )}
      </div>
      <input
        ref={ref}
        id={inputId}
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error && <FieldError id={`${inputId}-error`}>{error}</FieldError>}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="field__hint">
          {hint}
        </p>
      )}
    </div>
  );
});

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="field__error">
      <Icon name="alert" size={16} />
      <span>{children}</span>
    </p>
  );
}
