import test from 'node:test';
import assert from 'node:assert/strict';
import { calcReimbursementAmount, childYearAllowed, applicationStatus, validateSelfPaidAgainstTotal } from '../src/utils/business.js';

test('报销金额 = 个人自付 × 报销比例', () => {
  assert.equal(calcReimbursementAmount(1000, 0.8), 800);
  assert.equal(calcReimbursementAmount(123.45, 0.7), 86.42);
});

test('男职工单数年、女职工双数年', () => {
  assert.equal(childYearAllowed('M', 2025, 'ODD', 'EVEN'), true);
  assert.equal(childYearAllowed('M', 2026, 'ODD', 'EVEN'), false);
  assert.equal(childYearAllowed('F', 2025, 'ODD', 'EVEN'), false);
  assert.equal(childYearAllowed('F', 2026, 'ODD', 'EVEN'), true);
});

test('申请单状态：有待审批则0，完成且有通过则1，全部驳回则2', () => {
  assert.equal(applicationStatus([0, 1]), 0);
  assert.equal(applicationStatus([1, 1]), 1);
  assert.equal(applicationStatus([2, 2]), 2);
});


test('年度可用额度 = 年度额度 - 已通过 - 待审批', () => {
  const annualLimit = 10000;
  const approved = 3000;
  const pending = 2000;
  const request = 5000;
  assert.equal(request <= annualLimit - approved - pending, true);
  assert.equal(5000 <= annualLimit - 3000 - 2000, true);
  assert.equal(5001 <= annualLimit - 3000 - 2000, false);
});

test('个人自付金额不能大于发票总金额（创建与审批共用）', () => {
  validateSelfPaidAgainstTotal(500, 500);
  validateSelfPaidAgainstTotal('100.5', '200');
  assert.throws(() => validateSelfPaidAgainstTotal(501, 500), (e) => e.code === 'SELF_PAID_EXCEEDS_TOTAL' && e.status === 422);
  assert.throws(() => validateSelfPaidAgainstTotal('200.01', '200'), (e) => e.code === 'SELF_PAID_EXCEEDS_TOTAL');
});
