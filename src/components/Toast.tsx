import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import './Toast.css';

interface ToastOptions {
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  /** 잠깐 보였다 사라지는 안내. 확인이 꼭 필요한 오류에는 쓰지 않는다. */
  show: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const nextId = useRef(1);

  const dismiss = useCallback(() => setToast(null), []);

  const show = useCallback((options: ToastOptions) => {
    setToast({ ...options, id: nextId.current++ });
  }, []);

  useEffect(() => {
    if (!toast) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(dismiss, toast.action ? DURATION_MS * 1.5 : DURATION_MS);
    return () => window.clearTimeout(timer.current);
  }, [toast, dismiss]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast && (
          <div key={toast.id} className="toast">
            <Icon name="check" size={18} className="toast__icon" />
            <span className="toast__message">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss();
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
