import type { KeyboardEvent } from 'react';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { TEMPLATES } from '../data/templates';
import { navigate } from '../lib/router';
import { durationText, sumDurationSec } from '../lib/time';
import './NewScenarioDialog.css';

interface Choice {
  key: string;
  name: string;
  meta: string;
  template?: string;
}

const CHOICES: Choice[] = [
  ...TEMPLATES.map((t) => ({
    key: t.key,
    name: t.name,
    meta: `${t.stages.length}단계 · ${durationText(sumDurationSec(t.stages))}`,
    template: t.key,
  })),
  { key: 'blank', name: '직접 구성', meta: '빈 시나리오에서 시작' },
];

/**
 * ‘새 시나리오’: 템플릿이나 빈 시나리오를 고르면 바로 편집 화면으로 간다.
 * 저장하기 전에는 목록에 추가되지 않는다(편집 화면의 저장 흐름 그대로).
 */
export function NewScenarioDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // 위·아래 화살표, Home·End로 선택지 사이를 옮겨 다닌다(Tab도 그대로 쓸 수 있다).
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.new-option'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const last = buttons.length - 1;
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? last : event.key === 'ArrowDown' ? index + 1 : index - 1;
    event.preventDefault();
    buttons[(next + buttons.length) % buttons.length]?.focus();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="새 시나리오"
      subtitle="템플릿을 고르거나 빈 시나리오에서 시작하세요. 저장하기 전에는 목록에 추가되지 않아요."
      showClose
      className="ui-gothic new-scenario"
    >
      <ul className="new-options" onKeyDown={onKeyDown}>
        {CHOICES.map((choice, index) => (
          <li key={choice.key}>
            <button
              type="button"
              className="new-option"
              data-autofocus={index === 0 || undefined}
              onClick={() => navigate({ name: 'new', template: choice.template })}
            >
              <span className="new-option__text">
                <span className="new-option__name">{choice.name}</span>
                <span className="new-option__meta">{choice.meta}</span>
              </span>
              <Icon name="chevron-right" size={20} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
