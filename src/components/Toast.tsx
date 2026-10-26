import { CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';

interface ToastItem {
  id: number;
  message: string;
  tone: 'success' | 'info';
  action?: { label: string; onClick: () => void };
}

type ShowToast = (message: string, options?: { tone?: ToastItem['tone']; action?: ToastItem['action'] }) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const { t } = useStore();

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  const show = useCallback<ShowToast>(
    (message, options) => {
      const id = ++counter.current;
      setToasts((list) => [...list.slice(-2), { id, message, tone: options?.tone ?? 'success', action: options?.action }]);
      window.setTimeout(() => dismiss(id), options?.action ? 8000 : 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-charcoal px-4 py-3 text-sm text-white shadow-lg"
          >
            {toast.tone === 'success' ? (
              <CircleCheck size={18} className="shrink-0 text-peach" aria-hidden="true" />
            ) : (
              <Info size={18} className="shrink-0 text-sky" aria-hidden="true" />
            )}
            <span className="flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="rounded-lg bg-peach px-3 py-1 font-semibold text-ink hover:brightness-95"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label={t('common.close')}
              className="rounded-md p-1 text-white/80 hover:text-white"
              onClick={() => dismiss(toast.id)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
