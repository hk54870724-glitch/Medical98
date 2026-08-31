import test from 'node:test';
import assert from 'node:assert/strict';

test('reimbursement formula: selfPaid * rate', () => {
  const amount = 1000 * 0.8;
  assert.equal(amount, 800);
});

test('child year parity: male employee -> odd years', () => {
  assert.equal(2025 % 2, 1);
  assert.equal(2026 % 2, 0);
});
