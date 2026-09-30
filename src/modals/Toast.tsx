import { useEffect } from 'react';

const TOAST_DURATION_MS = 4000;

interface ToastProps {
  message: string;
  testId?: string;
  onDismiss: () => void;
}

// Transient, non-blocking confirmation pinned to the right edge of the
// screen. Dismisses itself after a few seconds, or on click.
export default function Toast({ message, testId, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className="toast toast--success" role="status" aria-live="polite" data-testid={testId} onClick={onDismiss}>
      <svg className="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
