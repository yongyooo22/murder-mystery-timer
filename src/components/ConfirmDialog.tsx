import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { InlineAlert } from './InlineAlert';
import { Modal } from './Modal';

export interface DialogAction {
  label: string;
  variant?: ButtonVariant;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

interface ActionDialogProps {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  /** 왼쪽부터 순서대로 배치된다. 휴대폰에서 버튼이 많으면 세로로 쌓인다. */
  actions: DialogAction[];
  onClose: () => void;
  /** 확인이 필요한 오류(예: 저장 실패)를 대화상자 안에 계속 보여 준다. */
  error?: ReactNode;
  busy?: boolean;
  stacked?: boolean;
}

export function ActionDialog({ open, title, children, actions, onClose, error, busy, stacked }: ActionDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!busy}
      role="alertdialog"
      className={stacked ? 'modal--stacked-actions' : undefined}
      footer={actions.map((action) => (
        <Button
          key={action.label}
          variant={action.variant ?? 'secondary'}
          size="lg"
          onClick={action.onClick}
          loading={action.loading}
          disabled={action.disabled || (busy && !action.loading)}
          data-autofocus={action.autoFocus || undefined}
        >
          {action.label}
        </Button>
      ))}
    >
      {children}
      {error && (
        <InlineAlert tone="error" className="dialog-error">
          {error}
        </InlineAlert>
      )}
    </Modal>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: ReactNode;
}

/** 확인·취소 두 버튼 대화상자. 실수로 확인되지 않도록 처음에는 취소 버튼에 초점을 둔다. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = '취소',
  tone = 'default',
  onConfirm,
  onCancel,
  busy,
  error,
}: ConfirmDialogProps) {
  return (
    <ActionDialog
      open={open}
      title={title}
      onClose={onCancel}
      busy={busy}
      error={error}
      actions={[
        { label: cancelLabel, variant: 'secondary', onClick: onCancel, autoFocus: true },
        { label: confirmLabel, variant: tone === 'danger' ? 'danger' : 'primary', onClick: onConfirm, loading: busy },
      ]}
    >
      {children}
    </ActionDialog>
  );
}
