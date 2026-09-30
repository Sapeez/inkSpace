interface FieldTooltipProps {
  message: string;
  testId: string;
}

// Replaces the browser's native validation bubble (which can't be styled):
// forms use `noValidate` and render this above the offending field instead.
export default function FieldTooltip({ message, testId }: FieldTooltipProps) {
  return (
    <span className="field-tooltip" role="alert" data-testid={testId}>
      {message}
    </span>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Messages mirror the browser's own wording for type="email" inputs.
export function validateEmailField(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length === 0) return 'Email is required';
  if (!trimmed.includes('@')) return `Please include an '@' in the email address.`;
  if (!EMAIL_PATTERN.test(trimmed)) return 'Please enter a valid email address.';
  return null;
}

export interface FieldError {
  field: 'email' | 'password';
  message: string;
}
