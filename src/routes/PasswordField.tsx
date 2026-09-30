import { useState } from 'react';
import FieldTooltip from './FieldTooltip';

interface PasswordFieldProps {
  id: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  autoComplete: 'current-password' | 'new-password';
  errorMessage?: string | undefined;
  errorTestId?: string | undefined;
}

// Password input with an in-field eye toggle (click once to reveal, again to hide).
export default function PasswordField({ id, testId, value, onChange, disabled, autoComplete, errorMessage, errorTestId }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="login-field">
      {errorMessage && errorTestId && <FieldTooltip message={errorMessage} testId={errorTestId} />}
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        className="login-input login-input-password"
        data-testid={testId}
        placeholder="Password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
      />
      <label htmlFor={id} className="login-label">Password</label>
      {value.length > 0 && (
        <button
          type="button"
          className="login-eye-button"
          data-testid={`${testId}-toggle`}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <line x1="3" y1="3" x2="21" y2="21" />}
          </svg>
        </button>
      )}
    </div>
  );
}
