import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_REQUIREMENTS_MESSAGE, validatePasswordPolicy } from '../src/lib/passwordPolicy';

test('accepts a password meeting every requirement', () => {
  assert.equal(validatePasswordPolicy('Passw0rd!'), null);
  assert.equal(validatePasswordPolicy('Aa1~aaaaaaaaaaaaaaaa'), null); // exactly 20
});

test('rejects passwords outside 8-20 characters', () => {
  assert.ok(validatePasswordPolicy('Pa1!aaa'));
  assert.ok(validatePasswordPolicy('Aa1!aaaaaaaaaaaaaaaaa')); // 21
});

test('rejects a password missing uppercase, lowercase, number, or special character with the full requirements list', () => {
  for (const weak of ['passw0rd!', 'PASSW0RD!', 'Password!', 'Passw0rdd']) {
    assert.equal(validatePasswordPolicy(weak), PASSWORD_REQUIREMENTS_MESSAGE);
  }
  assert.match(PASSWORD_REQUIREMENTS_MESSAGE, /uppercase[\s\S]*lowercase[\s\S]*number[\s\S]*special/);
});
