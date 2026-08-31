import { AppError } from './http.js';

export function parseYmd(value, field = '日期') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError('INVALID_DATE', `${field}格式必须为YYYY-MM-DD`, 422);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new AppError('INVALID_DATE', `${field}不是有效日期`, 422);
  }
  return value;
}

export function money(value, field = '金额') {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new AppError('INVALID_AMOUNT', `${field}必须为不小于0的数字`, 422);
  return Math.round(n * 100) / 100;
}

export function calcReimbursementAmount(selfPaid, rate) {
  return Math.round(Number(selfPaid) * Number(rate) * 100) / 100;
}

export function isWithinDateRange(date, start, end) {
  const d = new Date(date);
  const s = new Date(start);
  const e = new Date(end);
  // 避免 Invalid Date 导致比较失败
  if (isNaN(d.getTime()) || isNaN(s.getTime()) || isNaN(e.getTime())) {
    throw new Error('Invalid date format');
  }
  return d >= s && d <= e;
}

export function childYearAllowed(employeeGender, yearNo, oddRule = 'ODD', evenRule = 'EVEN') {
  const isOdd = yearNo % 2 === 1;
  const rule = employeeGender === 'M' ? oddRule : evenRule;
  return rule === 'ODD' ? isOdd : !isOdd;
}

export function applicationStatus(detailStatuses) {
  if (detailStatuses.some(s => Number(s) === 0)) return 0;
  if (detailStatuses.some(s => Number(s) === 1)) return 1;
  return 2;
}

export function classifyBeneficiary({ employee, invoiceName, child }) {
  if (employee.employment_status === 'RETIRED') {
    return { beneficiaryType: 'RETIREE', childId: null };
  }
  if (invoiceName === employee.name) {
    return { beneficiaryType: 'EMPLOYEE', childId: null };
  }
  if (child) {
    return { beneficiaryType: 'CHILD', childId: child.id };
  }
  throw new AppError('BENEFICIARY_NOT_MATCHED', '发票姓名既不是员工本人，也不是已登记子女', 422);
}
