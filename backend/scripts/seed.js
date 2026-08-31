import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { pool, withTransaction } from '../src/db/pool.js';

function annualDateRange(year) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

await withTransaction(async (client) => {
  const adminHash = await bcrypt.hash(env.DEFAULT_ADMIN_PASSWORD, 12);
  const financeHash = await bcrypt.hash(env.DEFAULT_FINANCE_PASSWORD, 12);

  const admin = await client.query(
    `INSERT INTO users(username, password_hash, role_code, enabled, must_change_password)
     VALUES ($1,$2,'ADMIN',true,true)
     ON CONFLICT (username) DO UPDATE SET enabled = true
     RETURNING id`,
    [env.DEFAULT_ADMIN_USERNAME, adminHash]
  );

  await client.query(
    `INSERT INTO users(username, password_hash, role_code, enabled, must_change_password)
     VALUES ($1,$2,'FINANCE',true,true)
     ON CONFLICT (username) DO UPDATE SET enabled = true
     RETURNING id`,
    [env.DEFAULT_FINANCE_USERNAME, financeHash]
  );

  const year = new Date().getFullYear();
  const previousYear = year - 1;
  await client.query(`UPDATE reimbursement_years SET is_default = false WHERE is_default = true`);
  const previousRange = annualDateRange(previousYear);
  const previous = await client.query(
    `INSERT INTO reimbursement_years(year_no, annual_limit, invoice_start_date, invoice_end_date, allow_backfill, male_child_year_rule, female_child_year_rule, status, is_default, remark)
     VALUES ($1,10000,$2,$3,true,'ODD','EVEN','ACTIVE',false,'系统初始化上年度账套')
     ON CONFLICT(year_no) DO UPDATE SET status='ACTIVE', invoice_start_date=EXCLUDED.invoice_start_date, invoice_end_date=EXCLUDED.invoice_end_date
     RETURNING id`, [previousYear, previousRange.start, previousRange.end]
  );
  const range = annualDateRange(year);
  const yearResult = await client.query(
    `INSERT INTO reimbursement_years(year_no, annual_limit, invoice_start_date, invoice_end_date, allow_backfill, male_child_year_rule, female_child_year_rule, status, is_default, initialized_from_year_id, remark)
     VALUES ($1,10000,$2,$3,true,'ODD','EVEN','ACTIVE',true,$4,'系统初始化默认账套')
     ON CONFLICT(year_no) DO UPDATE SET annual_limit=EXCLUDED.annual_limit, invoice_start_date=EXCLUDED.invoice_start_date, invoice_end_date=EXCLUDED.invoice_end_date, status='ACTIVE', is_default=true, initialized_from_year_id=COALESCE(reimbursement_years.initialized_from_year_id,EXCLUDED.initialized_from_year_id)
     RETURNING id`, [year, range.start, range.end, previous.rows[0].id]
  );

  const categories = [
    ['EMPLOYEE', '职工医药费', 1],
    ['CHILD', '子女医药费', 2],
    ['RETIREE', '退休人员医药费', 3]
  ];
  for (const [code, name, sortNo] of categories) {
    await client.query(
      `INSERT INTO reimbursement_categories(code,name,sort_no)
       VALUES($1,$2,$3)
       ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, sort_no=EXCLUDED.sort_no, enabled=true`,
      [code, name, sortNo]
    );
  }

  const cat = await client.query(`SELECT id, code FROM reimbursement_categories WHERE code = ANY($1::varchar[])`, [[...categories.map(x => x[0])]]);
  const categoryId = Object.fromEntries(cat.rows.map(r => [r.code, r.id]));
  const types = [
    ['EMPLOYEE', 'OUTPATIENT', '门诊', 0.8, 1],
    ['EMPLOYEE', 'INPATIENT', '住院', 0.9, 2],
    ['CHILD', 'OUTPATIENT', '门诊', 0.7, 1],
    ['CHILD', 'INPATIENT', '住院', 0.8, 2],
    ['RETIREE', 'OUTPATIENT', '门诊', 0.85, 1],
    ['RETIREE', 'INPATIENT', '住院', 0.9, 2]
  ];
  for (const [categoryCode, code, name, rate, sortNo] of types) {
    await client.query(
      `INSERT INTO reimbursement_types(category_id,code,name,reimbursement_rate,sort_no)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(category_id,code) DO UPDATE SET name=EXCLUDED.name, reimbursement_rate=EXCLUDED.reimbursement_rate, sort_no=EXCLUDED.sort_no, enabled=true`,
      [categoryId[categoryCode], code, name, rate, sortNo]
    );
  }

  const parameters = [
    ['employee_name_visible', 'true', 'BOOLEAN', '申请端是否显示员工姓名框'],
    ['children_visible', 'true', 'BOOLEAN', '申请端是否显示登记子女'],
    ['invoice_url_proxy_enabled', 'true', 'BOOLEAN', '是否启用发票 URL 代理'],
    ['ocr_enabled', 'true', 'BOOLEAN', '是否启用 OCR 解析'],
    ['session_timeout_minutes', '120', 'NUMBER', 'Session 会话超时时间（分钟）']
  ];
  for (const item of parameters) {
    await client.query(
      `INSERT INTO system_parameters(param_key,param_value,param_type,description)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(param_key) DO NOTHING`,
      item
    );
  }
});

await pool.end();
console.log('Seed completed. Initial accounts are marked must_change_password=true.');
