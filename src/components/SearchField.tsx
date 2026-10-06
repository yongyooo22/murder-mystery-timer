import { useRef } from 'react';
import { IconButton } from './Button';
import { Icon } from './Icon';
import './SearchField.css';

interface SearchFieldProps {
  /** 화면 낭독기에 읽히는 입력칸 이름 */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/** 돋보기 아이콘이 있는 검색 입력칸. 입력하는 대로 걸러 보여 주는 용도라 제출 단계가 없다. */
export function SearchField({ label, value, onChange, placeholder, className }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div role="search" className={['search-field', className].filter(Boolean).join(' ')}>
      <Icon name="search" className="search-field__icon" />
      <input
        ref={inputRef}
        type="search"
        className="input search-field__input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          } else if (event.key === 'Enter') {
            // 휴대폰에서 ‘검색’ 키를 누르면 키보드를 내려 결과를 가리지 않게 한다.
            event.currentTarget.blur();
          }
        }}
      />
      {value && (
        <IconButton
          icon="close"
          label="검색어 지우기"
          size={18}
          className="search-field__clear"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
