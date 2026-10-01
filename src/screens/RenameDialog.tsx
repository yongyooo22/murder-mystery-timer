import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { InlineAlert } from '../components/InlineAlert';
import { Modal } from '../components/Modal';
import { TextField } from '../components/TextField';
import { useToast } from '../components/Toast';
import { ApiError, errorMessage } from '../data/api';
import { LIMITS, charLength } from '../data/limits';
import { renameScenario } from '../data/scenarioStore';
import type { Scenario } from '../data/types';

export function RenameDialog({ scenario, onClose }: { scenario: Scenario | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!scenario) return;
    setName(scenario.name);
    setFieldError(undefined);
    setSaveError(null);
    window.setTimeout(() => inputRef.current?.select(), 0);
  }, [scenario]);

  const submit = async () => {
    if (!scenario) return;
    const trimmed = name.trim();
    if (!trimmed) return setFieldError('시나리오 이름을 입력해주세요.');
    if (charLength(trimmed) > LIMITS.scenarioNameMax) {
      return setFieldError(`시나리오 이름은 ${LIMITS.scenarioNameMax}자 이내로 입력해주세요.`);
    }
    if (trimmed === scenario.name) return onClose();
    setSaving(true);
    setSaveError(null);
    try {
      await renameScenario(scenario.id, trimmed);
      toast.show({ message: '이름을 바꿨어요.' });
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fields?.name) setFieldError(error.fields.name);
      else setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={scenario !== null}
      onClose={onClose}
      title="이름 바꾸기"
      dismissible={!saving}
      initialFocusRef={inputRef}
      footer={
        <>
          <Button size="lg" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button variant="primary" size="lg" loading={saving} onClick={() => void submit()}>
            저장
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextField
          ref={inputRef}
          label="시나리오 이름"
          value={name}
          onChange={(value) => {
            setName(value);
            setFieldError(undefined);
          }}
          error={fieldError}
          maxChars={LIMITS.scenarioNameMax}
          enterKeyHint="done"
          autoComplete="off"
        />
      </form>
      {saveError && (
        <InlineAlert tone="error" className="dialog-error" title="이름을 바꾸지 못했어요">
          {saveError} 입력한 이름은 그대로 남아 있어요.
        </InlineAlert>
      )}
    </Modal>
  );
}
