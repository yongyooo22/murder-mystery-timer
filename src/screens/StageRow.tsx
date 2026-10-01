import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { AutoTextarea } from '../components/AutoTextarea';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { FieldError } from '../components/TextField';
import type { StageDraft, StageErrors } from '../data/draft';

interface StageRowProps {
  stage: StageDraft;
  index: number;
  total: number;
  errors: StageErrors;
  canDuplicate: boolean;
  dragging: boolean;
  style?: CSSProperties;
  rowRef: (el: HTMLElement | null) => void;
  handleProps: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  };
  onChange: (patch: Partial<StageDraft>) => void;
  onMove: (delta: -1 | 1, focus?: 'button' | 'handle') => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const digitsOnly = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

export function StageRow({
  stage,
  index,
  total,
  errors,
  canDuplicate,
  dragging,
  style,
  rowRef,
  handleProps,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: StageRowProps) {
  const n = index + 1;
  const minutesRef = useRef<HTMLInputElement>(null);
  const nameErrorId = `stage-${stage.key}-name-error`;
  const timeErrorId = `stage-${stage.key}-time-error`;

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      onMove(-1, 'handle');
    } else if (event.key === 'ArrowDown' && index < total - 1) {
      event.preventDefault();
      onMove(1, 'handle');
    }
  };

  const onTimeBlur = () => {
    // 초는 두 자리로 맞추고, 분만 적었으면 초를 00으로 채운다.
    const patch: Partial<StageDraft> = {};
    if (stage.seconds.length === 1) patch.seconds = stage.seconds.padStart(2, '0');
    if (stage.seconds === '' && stage.minutes !== '') patch.seconds = '00';
    if (stage.minutes === '' && stage.seconds !== '') patch.minutes = '0';
    if (Object.keys(patch).length) onChange(patch);
  };

  return (
    <li
      ref={rowRef}
      className={['stage-row', dragging && 'stage-row--dragging'].filter(Boolean).join(' ')}
      style={style}
      data-stage-key={stage.key}
    >
      <button
        type="button"
        className="stage-row__handle"
        aria-label={`${n}번 단계 순서 바꾸기. 끌어서 옮기거나 위·아래 화살표 키를 누르세요.`}
        title="끌어서 순서 바꾸기"
        onKeyDown={onHandleKeyDown}
        {...handleProps}
      >
        <Icon name="grip" size={22} />
      </button>
      <span className="stage-row__index num" aria-hidden="true">
        {n}
      </span>
      <AutoTextarea
        className="input stage-row__name"
        value={stage.name}
        placeholder="단계 이름"
        aria-label={`${n}번 단계 이름`}
        aria-invalid={errors.name ? true : undefined}
        aria-describedby={errors.name ? nameErrorId : undefined}
        data-field="name"
        enterKeyHint="next"
        autoComplete="off"
        onChange={(name) => onChange({ name })}
        onEnter={() => minutesRef.current?.focus()}
      />
      {errors.name && (
        <div className="stage-row__error stage-row__error--name">
          <FieldError id={nameErrorId}>{errors.name}</FieldError>
        </div>
      )}

      <div className="stage-row__time" role="group" aria-label={`${n}번 단계 시간`}>
        <label className="time-input">
          <input
            ref={minutesRef}
            className="input time-input__field num"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={stage.minutes}
            aria-label={`${n}번 단계 분`}
            aria-invalid={errors.time ? true : undefined}
            aria-describedby={errors.time ? timeErrorId : undefined}
            data-field="minutes"
            enterKeyHint="next"
            autoComplete="off"
            onChange={(event) => onChange({ minutes: digitsOnly(event.target.value, 3) })}
            onFocus={(event) => event.target.select()}
            onBlur={onTimeBlur}
          />
          <span className="time-input__unit" aria-hidden="true">
            분
          </span>
        </label>
        <label className="time-input">
          <input
            className="input time-input__field num"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={stage.seconds}
            aria-label={`${n}번 단계 초`}
            aria-invalid={errors.time ? true : undefined}
            aria-describedby={errors.time ? timeErrorId : undefined}
            data-field="seconds"
            enterKeyHint="done"
            autoComplete="off"
            onChange={(event) => onChange({ seconds: digitsOnly(event.target.value, 2) })}
            onFocus={(event) => event.target.select()}
            onBlur={onTimeBlur}
          />
          <span className="time-input__unit" aria-hidden="true">
            초
          </span>
        </label>
      </div>
      {errors.time && (
        <div className="stage-row__error stage-row__error--time">
          <FieldError id={timeErrorId}>{errors.time}</FieldError>
        </div>
      )}

      <div className="stage-row__tools">
        <Button
          size="sm"
          variant="ghost"
          icon="arrow-up"
          disabled={index === 0}
          aria-label={`${n}번 단계 위로 이동`}
          data-tool="up"
          onClick={() => onMove(-1)}
        >
          위로
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="arrow-down"
          disabled={index === total - 1}
          aria-label={`${n}번 단계 아래로 이동`}
          data-tool="down"
          onClick={() => onMove(1)}
        >
          아래로
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="copy"
          disabled={!canDuplicate}
          aria-label={`${n}번 단계 복제`}
          onClick={onDuplicate}
        >
          복제
        </Button>
        <span className="stage-row__spacer" />
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          className="stage-row__delete"
          aria-label={`${n}번 단계 삭제`}
          onClick={onDelete}
        >
          삭제
        </Button>
      </div>
    </li>
  );
}
