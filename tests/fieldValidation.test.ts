import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmailField } from '../src/routes/FieldTooltip';

test('validateEmailField accepts a well-formed address, ignoring surrounding whitespace', () => {
  assert.equal(validateEmailField('user@example.com'), null);
  assert.equal(validateEmailField('  user@example.com  '), null);
});

test('validateEmailField reports an empty or whitespace-only value as required', () => {
  assert.equal(validateEmailField(''), 'Email is required');
  assert.equal(validateEmailField('   '), 'Email is required');
});

test("validateEmailField asks for an '@' when it is missing", () => {
  assert.match(validateEmailField('userexample.com') ?? '', /'@'/);
});

test('validateEmailField rejects addresses with a missing local part, domain, or TLD', () => {
  for (const bad of ['@example.com', 'user@', 'user@example', 'us er@example.com']) {
    assert.equal(validateEmailField(bad), 'Please enter a valid email address.', bad);
  }
});
