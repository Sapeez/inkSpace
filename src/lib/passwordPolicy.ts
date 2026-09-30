export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 20;

export const PASSWORD_REQUIREMENTS_MESSAGE = [
  'Password must:',
  `• Be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`,
  '• Contain an uppercase letter',
  '• Contain a lowercase letter',
  '• Contain a number',
  '• Contain a special character',
].join('\n');

// Returns the full requirements list (for display in one message) when the
// password fails any rule, or null when it's acceptable. "Special" is any
// character that isn't a letter, digit, or whitespace.
export function validatePasswordPolicy(password: string): string | null {
  const valid =
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password);
  return valid ? null : PASSWORD_REQUIREMENTS_MESSAGE;
}
