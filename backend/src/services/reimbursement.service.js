import { withTransaction } from '../db/pool.js';
import { AppError } from '../utils/http.js';
import { calcReimbursementAmount, childYearAllowed, isWithinDateRange, validateSelfPaidAgainstTotal } from '../utils/business.js';
import {
  getDefaultYear, getYear, getEmployee, getEmployeeByNo, getChildren, getChildByName, getRateType,
  ensureQuotaRow, getQuotaUsed, insertApplication, insertDetail, registerInvoice, refreshApplicationTotals,
  findPendingDetail
} from '../repositories/reimbursement.repository.js';

function assertYearApplicationAllowed(year, nowYear) {
  if (!year || year.status !== 'ACTIVE') throw new AppError('YEAR_APPLICATION_DISABLED', '该报销年度未启用或已关闭', 422);
  if (year.year_no !== nowYear && !year.allow_backfill) throw new AppError('YEAR_BACKFILL_DISABLED', '该报销年度当前不允许补登', 422);
}

// 数据库返回 snake_case，前端统一消费 camelCase
function mapYear(row) {
  return {
    id: row.id,
    yearNo: row.year_no,
    annualLimit: row.annual_limit === undefined ? undefined : Number(row.annual_limit),
    invoiceStartDate: row.invoice_start_date,
    invoiceEndDate: row.invoice_end_date,
    allowBackfill: row.allow_backfill,
    maleChildYearRule: row.male_child_year_rule,
    femaleChildYearRule: row.female_child_year_rule,
    status: row.status,
    isDefault: row.is_default,
    initializedFromYearId: row.initialized_from_year_id,
    remark: row.remark,
    updatedBy: row.updated_by
  };
}

function mapEmployee(row) {
  return {
    id: row.id,
    employeeNo: row.employee_no,
    name: row.name,
    gender: row.gender,
    department: row.department,
    hireDate: row.hire_date,
    leaveDate: row.leave_date,
    employmentStatus: row.employment_status,
    enabled: row.enabled
  };
}

function mapChild(row) {
  return { id: row.id, childName: row.child_name, gender: row.gender, birthDate: row.birth_date, enabled: row.enabled };
}

function mapPendingDetail(row) {
  return {
    detailId: row.detail_id,
    applicationId: row.application_id,
    applicationNo: row.application_no,
    yearNo: row.year_no,
    employeeNo: row.employee_no,
    employeeName: row.employee_name,
    department: row.department,
    beneficiaryType: row.beneficiary_type,
    categoryName: row.category_name,
    typeName: row.type_name,
    invoiceName: row.invoice_name,
    invoiceNo: row.invoice_no,
    invoiceDate: row.invoice_date,
    totalAmount: Number(row.total_amount),
    selfPaid: Number(row.self_paid),
    reimbursementRate: Number(row.reimbursement_rate),
    reimbursementAmount: Number(row.reimbursement_amount),
    status: row.status
  };
}

function assertInvoiceDate({ invoiceDate, year, employee }) {
  if (!isWithinDateRange(invoiceDate, year.invoice_start_date, year.invoice_end_date)) {
    throw new AppError('INVOICE_DATE_OUT_OF_RANGE', `发票日期必须在${year.invoice_start_date}至${year.invoice_end_date}范围内`, 422);
  }
  if (invoiceDate < employee.hire_date) throw new AppError('INVOICE_BEFORE_HIRE_DATE', '发票日期早于员工入职日期', 422);
  if (employee.leave_date && invoiceDate > employee.leave_date) throw new AppError('INVOICE_AFTER_LEAVE_DATE', '发票日期晚于员工离职日期', 422);
}

async function classify(client, employee, invoiceName, year) {
  if (employee.employment_status === 'RETIRED') return { beneficiaryType: 'RETIREE', childId: null };
  if (invoiceName === employee.name) return { beneficiaryType: 'EMPLOYEE', childId: null };
  const found = await getChildByName(client, employee.id, invoiceName);
  if (found.duplicateName) throw new AppError('CHILD_NAME_AMBIGUOUS', '员工名下存在同名子女，无法自动判定', 422);
  if (!found.child) throw new AppError('BENEFICIARY_NOT_MATCHED', '发票姓名既不是员工本人，也不是已登记子女', 422);
  if (!childYearAllowed(employee.gender, year.year_no, year.male_child_year_rule, year.female_child_year_rule)) {
    throw new AppError('CHILD_YEAR_NOT_ALLOWED', `${year.year_no}年度不符合该员工子女报销年度规则`, 422);
  }
  return { beneficiaryType: 'CHILD', childId: found.child.id };
}

export async function getContext(user) {
  return withTransaction(async client => {
    const defaultYear = await getDefaultYear(client);
    if (!defaultYear) throw new AppError('DEFAULT_YEAR_NOT_FOUND', '当前没有可用的默认报销年度账套', 500);
    const years = await client.query(`SELECT id, year_no, status, allow_backfill, is_default FROM reimbursement_years WHERE status='ACTIVE' ORDER BY year_no DESC`);
    const employee = user.employee_id ? await getEmployee(client, user.employee_id) : null;
    const setting = await client.query(`SELECT param_value FROM system_parameters WHERE param_key='children_visible' LIMIT 1`);
    const childrenVisible = String(setting.rows[0]?.param_value ?? 'true').toLowerCase() === 'true';
    const children = employee && childrenVisible ? (await getChildren(client, employee.id)).map(mapChild) : [];
    return { currentDate: new Date().toISOString().slice(0, 10), defaultYear: mapYear(defaultYear), availableYears: years.rows.map(mapYear), employee: employee ? mapEmployee(employee) : null, children };
  });
}

export async function getEmployeeLookup(employeeNo) {
  return withTransaction(async client => {
    const employee = await getEmployeeByNo(client, employeeNo);
    if (!employee) throw new AppError('EMPLOYEE_NOT_FOUND', '工号不存在', 404);
    const setting = await client.query(`SELECT param_value FROM system_parameters WHERE param_key='children_visible' LIMIT 1`);
    const visible = String(setting.rows[0]?.param_value ?? 'true').toLowerCase() === 'true';
    const children = visible ? await getChildren(client, employee.id) : [];
    return { employee, children };
  });
}

export async function getQuota(employeeId, yearId) {
  return withTransaction(async client => {
    const employee = await getEmployee(client, employeeId);
    if (!employee) throw new AppError('EMPLOYEE_NOT_FOUND', '员工不存在', 404);
    const year = await getYear(client, yearId);
    if (!year) throw new AppError('YEAR_NOT_FOUND', '报销年度不存在', 404);
    await ensureQuotaRow(client, employeeId, yearId);
    const used = await getQuotaUsed(client, employeeId, yearId);
    const available = Math.max(0, Number(year.annual_limit) - used.approvedAmount - used.pendingAmount);
    return { year: year.year_no, annualLimit: Number(year.annual_limit), approvedAmount: used.approvedAmount, pendingAmount: used.pendingAmount, availableAmount: Math.round(available * 100) / 100 };
  });
}

function generateApplicationNo() {
  const now = new Date();
  const s = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rnd = Math.floor(10000 + Math.random() * 90000);
  return `BX${s}${rnd}`;
}

export async function createApplication(user, payload) {
  if (!user.employee_id) throw new AppError('EMPLOYEE_ACCOUNT_REQUIRED', '当前账号未绑定员工主数据，无法申请', 403);
  return withTransaction(async client => {
    const employee = await getEmployee(client, user.employee_id);
    if (!employee || !employee.enabled) throw new AppError('EMPLOYEE_NOT_FOUND', '当前员工主数据不存在或已禁用', 403);
    const year = await getYear(client, payload.yearId);
    const nowYear = new Date().getFullYear();
    assertYearApplicationAllowed(year, nowYear);
    await ensureQuotaRow(client, employee.id, year.id);
    const used = await getQuotaUsed(client, employee.id, year.id);

    const seen = new Set();
    const prepared = [];
    let totalInvoiceAmount = 0;
    let totalSelfPaid = 0;
    let totalReimburseAmount = 0;

    for (const row of payload.details) {
      const normalizedInvoiceNo = row.invoiceNo?.trim();
  if (!normalizedInvoiceNo) throw new AppError('INVOICE_NO_REQUIRED', '发票号码不能为空', 422);
  
  if (seen.has(normalizedInvoiceNo)) throw new AppError('INVOICE_DUPLICATE_IN_APPLICATION', `申请内发票号码重复：${normalizedInvoiceNo}`, 409);
  seen.add(normalizedInvoiceNo);
  
  const existing = await client.query(`SELECT 1 FROM invoice_registry WHERE invoice_no = $1 LIMIT 1`, [normalizedInvoiceNo]);
  if (existing.rowCount) throw new AppError('INVOICE_ALREADY_REGISTERED', `发票号码已被注册：${normalizedInvoiceNo}`, 409);

  // 严格校验 reimbursementTypeId，防止 NaN
  const typeId = Number(row.reimbursementTypeId);
  if (Number.isNaN(typeId)) throw new AppError('REIMBURSEMENT_TYPE_INVALID', '报销类型ID无效', 422);

  const rt = await getRateType(client, typeId);
  if (!rt) throw new AppError('REIMBURSEMENT_TYPE_INVALID', `报销类型不存在或已停用：${row.reimbursementTypeId}`, 422);

  const beneficiary = await classify(client, employee, row.invoiceName, year);
  const categoryExpected = beneficiary.beneficiaryType === 'EMPLOYEE' ? 'EMPLOYEE' : beneficiary.beneficiaryType === 'CHILD' ? 'CHILD' : 'RETIREE';
  if (rt.category_code !== categoryExpected) throw new AppError('REIMBURSEMENT_CATEGORY_MISMATCH', `发票姓名对应的报销分类为${categoryExpected}，但选择的报销类型属于${rt.category_code}`, 422);
  
  assertInvoiceDate({ invoiceDate: row.invoiceDate, year, employee });

  const selfPaidNum = Number(row.selfPaid);
  const totalAmountNum = Number(row.totalAmount);
  if (Number.isNaN(selfPaidNum) || Number.isNaN(totalAmountNum)) {
    throw new AppError('AMOUNT_INVALID', '发票总金额或个人自付金额必须为有效数字', 422);
  }
  const reimbursementAmount = calcReimbursementAmount(row.selfPaid, rt.reimbursement_rate);
      prepared.push({ ...row, invoiceNo: normalizedInvoiceNo, beneficiaryType: beneficiary.beneficiaryType, childId: beneficiary.childId, reimbursementRate: Number(rt.reimbursement_rate), reimbursementAmount, sourceType: 'MANUAL' });
      totalInvoiceAmount += row.totalAmount;
      totalSelfPaid += row.selfPaid;
      totalReimburseAmount += reimbursementAmount;
    }

    const available = Number(year.annual_limit) - used.approvedAmount - used.pendingAmount;
    if (Math.round(totalReimburseAmount * 100) > Math.round(available * 100)) {
      throw new AppError('REIMBURSEMENT_QUOTA_EXCEEDED', `本次申请报销金额${totalReimburseAmount.toFixed(2)}超过当前年度可用额度${Math.max(available,0).toFixed(2)}`, 422, { annualLimit: Number(year.annual_limit), approvedAmount: used.approvedAmount, pendingAmount: used.pendingAmount, requestedAmount: totalReimburseAmount, availableAmount: Math.max(available, 0) });
    }

    const application = await insertApplication(client, {
      applicationNo: generateApplicationNo(), employeeId: employee.id, yearId: year.id, applyDate: payload.applyDate,
      totalInvoiceAmount, totalSelfPaid, totalReimburseAmount
    });

// 安全校验 application.id
    const appId = Number(application?.id);
    if (Number.isNaN(appId)) {
      throw new AppError('APPLICATION_CREATE_FAILED', '生成申请单ID失败', 500);
    }

    for (const row of prepared) {
      const detail = await insertDetail(client, { 
        applicationId: appId, 
        employeeId: employee.id, 
        ...row, 
        reimbursementTypeId: Number(row.reimbursementTypeId) 
      });

      // 提取并确保 detail.id 是有效数字
      const detailId = Number(detail?.id ?? detail); 
      if (Number.isNaN(detailId)) {
        throw new AppError('DETAIL_CREATE_FAILED', '生成明细单ID失败', 500);
      }

      try { 
        // 必须使用安全的 detailId 和 appId，杜绝 NaN 传入数据库！
        await registerInvoice(client, row.invoiceNo, detailId, appId); 
      }
      catch (e) { 
        if (e?.code === '23505') throw new AppError('INVOICE_ALREADY_REGISTERED', `发票号码已被注册：${row.invoiceNo}`, 409); 
        throw e; 
      }
    }
    await client.query(`INSERT INTO operation_logs(user_id,module,action,target_type,target_id,detail_json) VALUES ($1,'REIMBURSEMENT','CREATE','APPLICATION',$2,$3::jsonb)`, [user.id, String(application.id), JSON.stringify({ applicationNo: application.application_no, yearId: year.id, totalReimburseAmount })]);
    return { applicationNo: application.application_no, applicationId: application.id, year: year.year_no, totalReimburseAmount, status: application.status };
  });
}

export async function getMyApplications(user, { yearId, status, page=1, pageSize=20 }) {
  if (!user.employee_id) return { items: [], page, pageSize, total: 0, totalPages: 0, yearTotals: [] };
  return withTransaction(async client => {
    const conditions = ['ra.employee_id = $1'];
    const params = [user.employee_id];
    if (yearId !== undefined) { params.push(Number(yearId)); conditions.push(`ra.year_id = $${params.length}`); }
    if (status !== undefined) { params.push(Number(status)); conditions.push(`ra.status = $${params.length}`); }
    const where = conditions.join(' AND ');
    const count = await client.query(`SELECT COUNT(*)::int AS total FROM reimbursement_applications ra WHERE ${where}`, params);
    const offset = (Number(page)-1)*Number(pageSize);
    params.push(Number(pageSize), offset);
    const rows = await client.query(`
      SELECT ra.id, ra.application_no, ra.year_id, ra.apply_date, ra.status,
             ra.total_invoice_amount, ra.total_self_paid, ra.total_reimburse_amount,
             ry.year_no,
             (SELECT string_agg(rd.invoice_name, '、' ORDER BY rd.id)
              FROM reimbursement_details rd WHERE rd.application_id = ra.id AND rd.status <> 2) AS invoice_names
      FROM reimbursement_applications ra JOIN reimbursement_years ry ON ry.id=ra.year_id
      WHERE ${where} ORDER BY ra.id DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    // 按年度小计（全量，不受分页影响）
    const totals = await client.query(`
      SELECT ry.year_no, COUNT(*)::int AS count, COALESCE(SUM(ra.total_reimburse_amount),0)::numeric(14,2) AS amount
      FROM reimbursement_applications ra JOIN reimbursement_years ry ON ry.id=ra.year_id
      WHERE ra.employee_id = $1 GROUP BY ry.year_no ORDER BY ry.year_no`, [user.employee_id]);
    const items = rows.rows.map(r => ({
      id: r.id,
      applicationNo: r.application_no,
      yearId: r.year_id,
      yearNo: r.year_no,
      applyDate: r.apply_date,
      status: r.status,
      totalInvoiceAmount: Number(r.total_invoice_amount),
      totalSelfPaid: Number(r.total_self_paid),
      totalReimburseAmount: Number(r.total_reimburse_amount),
      invoiceNames: r.invoice_names ?? ''
    }));
    return { items, page: Number(page), pageSize: Number(pageSize), total: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / Number(pageSize)), yearTotals: totals.rows.map(r => ({ yearNo: r.year_no, count: r.count, amount: Number(r.amount) })) };
  });
}

export async function getApplication(user, applicationId) {
  return withTransaction(async client => {
    const r = await client.query(`SELECT ra.*, ry.year_no, e.employee_no, e.name AS employee_name, e.department FROM reimbursement_applications ra JOIN reimbursement_years ry ON ry.id=ra.year_id JOIN employees e ON e.id=ra.employee_id WHERE ra.id=$1`, [applicationId]);
    const app = r.rows[0];
    if (!app) throw new AppError('NOT_FOUND', '申请单不存在', 404);
    if (user.role_code === 'EMPLOYEE' && app.employee_id !== user.employee_id) throw new AppError('FORBIDDEN', '无权查看该申请单', 403);
    const d = await client.query(`SELECT rd.*, rc.code AS category_code, rc.name AS category_name, rt.code AS type_code, rt.name AS type_name FROM reimbursement_details rd JOIN reimbursement_types rt ON rt.id=rd.reimbursement_type_id JOIN reimbursement_categories rc ON rc.id=rt.category_id WHERE rd.application_id=$1 AND rd.status <> 2 ORDER BY rd.id`, [applicationId]);
    const rejected = await client.query(`SELECT rd.id, rd.invoice_name, rd.invoice_no, rd.invoice_date, rd.total_amount, rd.self_paid, rd.reimbursement_amount, rd.status FROM reimbursement_details rd WHERE rd.application_id=$1 AND rd.status=2 ORDER BY rd.id`, [applicationId]);
    return { application: app, details: d.rows, rejectedDetails: rejected.rows };
  });
}

async function validateEditedDetail(client, detail, changes) {
  const employee = await getEmployee(client, detail.employee_id);
  const year = await getYear(client, detail.year_id);
  const invoiceName = changes.invoiceName ?? detail.invoice_name;
  const invoiceDate = changes.invoiceDate ?? detail.invoice_date;
  const selfPaid = changes.selfPaid ?? Number(detail.self_paid);
  validateSelfPaidAgainstTotal(selfPaid, detail.total_amount);
  assertInvoiceDate({ invoiceDate, year, employee });
  const beneficiary = await classify(client, employee, invoiceName, year);
  const rt = await getRateType(client, detail.reimbursement_type_id);
  const categoryExpected = beneficiary.beneficiaryType === 'EMPLOYEE' ? 'EMPLOYEE' : beneficiary.beneficiaryType === 'CHILD' ? 'CHILD' : 'RETIREE';
  if (!rt || rt.category_code !== categoryExpected) throw new AppError('REIMBURSEMENT_CATEGORY_MISMATCH', '修改后的发票姓名与原报销类型不匹配，请调整报销类型后再处理', 422);
  const amount = calcReimbursementAmount(selfPaid, detail.reimbursement_rate);
  return { employee, year, invoiceName, invoiceDate, selfPaid, beneficiary, amount };
}

async function applyApproval(client, user, input, approved) {
  const detail = await findPendingDetail(client, input.detailId);
  if (!detail) throw new AppError('DETAIL_NOT_FOUND', '报销明细不存在', 404);
  if (Number(detail.status) !== 0) throw new AppError('DETAIL_ALREADY_PROCESSED', '该报销明细已处理', 409);
  const changes = approved ? input : {};
  const validated = approved ? await validateEditedDetail(client, detail, changes) : null;

  const quotaEmployeeId = detail.employee_id;
  await ensureQuotaRow(client, quotaEmployeeId, detail.year_id);
  const usedBefore = await getQuotaUsed(client, quotaEmployeeId, detail.year_id);
  const detailAmountBefore = Number(detail.reimbursement_amount);
  const delta = approved ? validated.amount - detailAmountBefore : -detailAmountBefore;
  const projectedApproved = usedBefore.approvedAmount + (approved ? validated.amount : 0);
  const projectedPending = usedBefore.pendingAmount - detailAmountBefore;
  const year = await getYear(client, detail.year_id);
  const projectedOccupied = projectedApproved + Math.max(projectedPending, 0);
  if (projectedOccupied > Number(year.annual_limit)) {
    throw new AppError('REIMBURSEMENT_QUOTA_EXCEEDED', '审批后的年度额度将超出账套额度，无法通过', 422);
  }

  if (approved) {
    await client.query(`UPDATE reimbursement_details SET invoice_name=$1, invoice_date=$2, self_paid=$3, reimbursement_amount=$4, status=1, updated_at=NOW() WHERE id=$5`, [validated.invoiceName, validated.invoiceDate, validated.selfPaid, validated.amount, detail.id]);
    await client.query(`INSERT INTO approval_records(detail_id,application_id,operator_user_id,action,before_data,after_data,remark) VALUES($1,$2,$3,'APPROVE',$4::jsonb,$5::jsonb,$6)`, [detail.id, detail.application_id, user.id, JSON.stringify({ invoiceName: detail.invoice_name, invoiceDate: detail.invoice_date, selfPaid: Number(detail.self_paid), reimbursementAmount: detailAmountBefore }), JSON.stringify({ invoiceName: validated.invoiceName, invoiceDate: validated.invoiceDate, selfPaid: validated.selfPaid, reimbursementAmount: validated.amount }), input.remark]);
  } else {
    await client.query(`UPDATE reimbursement_details SET status=2, updated_at=NOW() WHERE id=$1`, [detail.id]);
    await client.query(`DELETE FROM invoice_registry WHERE invoice_no=$1 AND detail_id=$2`, [detail.invoice_no, detail.id]);
    await client.query(`INSERT INTO approval_records(detail_id,application_id,operator_user_id,action,before_data,after_data,remark) VALUES($1,$2,$3,'REJECT',$4::jsonb,$5::jsonb,$6)`, [detail.id, detail.application_id, user.id, JSON.stringify({ status: 0, invoiceName: detail.invoice_name, invoiceDate: detail.invoice_date, selfPaid: Number(detail.self_paid), reimbursementAmount: detailAmountBefore }), JSON.stringify({ status: 2 }), input.remark]);
  }
  await refreshApplicationTotals(client, detail.application_id);
  await client.query(`INSERT INTO operation_logs(user_id,module,action,target_type,target_id,detail_json) VALUES ($1,'APPROVAL',$2,'DETAIL',$3,$4::jsonb)`, [user.id, approved ? 'APPROVE' : 'REJECT', String(detail.id), JSON.stringify({ applicationId: detail.application_id, delta })]);
}

export async function approveDetail(user, input) { return withTransaction(client => applyApproval(client, user, input, true)); }
export async function rejectDetail(user, input) { return withTransaction(client => applyApproval(client, user, input, false)); }

export async function batchApprove(user, items) {
  return withTransaction(async client => {
    const results = [];
    for (const item of items) {
      await client.query('SAVEPOINT approval_item');
      try { await applyApproval(client, user, { ...item, detailId: Number(item.detailId) }, true); await client.query('RELEASE SAVEPOINT approval_item'); results.push({ detailId: Number(item.detailId), success: true }); }
      catch (e) { await client.query('ROLLBACK TO SAVEPOINT approval_item'); await client.query('RELEASE SAVEPOINT approval_item'); results.push({ detailId: Number(item.detailId), success: false, code: e.code ?? 'INTERNAL_ERROR', message: e.message }); }
    }
    return results;
  });
}

export async function batchReject(user, items) {
  return withTransaction(async client => {
    const results = [];
    for (const item of items) {
      await client.query('SAVEPOINT approval_item');
      try { await applyApproval(client, user, { ...item, detailId: Number(item.detailId) }, false); await client.query('RELEASE SAVEPOINT approval_item'); results.push({ detailId: Number(item.detailId), success: true }); }
      catch (e) { await client.query('ROLLBACK TO SAVEPOINT approval_item'); await client.query('RELEASE SAVEPOINT approval_item'); results.push({ detailId: Number(item.detailId), success: false, code: e.code ?? 'INTERNAL_ERROR', message: e.message }); }
    }
    return results;
  });
}

export async function pendingApprovals({ yearId, employeeNo, department, applicationNo, page=1, pageSize=20 }) {
  return withTransaction(async client => {
    const conditions = ['rd.status=0']; const params=[];
    if (yearId !== undefined) { params.push(Number(yearId)); conditions.push(`ra.year_id=$${params.length}`); }
    if (employeeNo) { params.push(employeeNo.trim()); conditions.push(`e.employee_no=$${params.length}`); }
    if (department) { params.push(department.trim()); conditions.push(`e.department=$${params.length}`); }
    if (applicationNo) { params.push(applicationNo.trim()); conditions.push(`ra.application_no=$${params.length}`); }
    const where = conditions.join(' AND ');
    const count = await client.query(`SELECT COUNT(*)::int AS total FROM reimbursement_details rd JOIN reimbursement_applications ra ON ra.id=rd.application_id JOIN employees e ON e.id=ra.employee_id WHERE ${where}`, params);
    const offset=(Number(page)-1)*Number(pageSize); params.push(Number(pageSize),offset);
    const rows=await client.query(`SELECT rd.id AS detail_id, ra.id AS application_id, ra.application_no AS application_no, ry.year_no AS year_no, e.employee_no AS employee_no, e.name AS employee_name, e.department AS department, rd.beneficiary_type AS beneficiary_type, rc.name AS category_name, rt.name AS type_name, rd.invoice_name AS invoice_name, rd.invoice_no AS invoice_no, rd.invoice_date AS invoice_date, rd.total_amount AS total_amount, rd.self_paid AS self_paid, rd.reimbursement_rate AS reimbursement_rate, rd.reimbursement_amount AS reimbursement_amount, rd.status AS status FROM reimbursement_details rd JOIN reimbursement_applications ra ON ra.id=rd.application_id JOIN reimbursement_years ry ON ry.id=ra.year_id JOIN employees e ON e.id=ra.employee_id JOIN reimbursement_types rt ON rt.id=rd.reimbursement_type_id JOIN reimbursement_categories rc ON rc.id=rt.category_id WHERE ${where} ORDER BY rd.id DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    return { items: rows.rows.map(mapPendingDetail), page:Number(page), pageSize:Number(pageSize), total:count.rows[0].total, totalPages:Math.ceil(count.rows[0].total/Number(pageSize)) };
  });
}

export async function getCategories() {
  return withTransaction(async client => {
    const rows = await client.query(`
      SELECT rc.id AS category_id, rc.code AS category_code, rc.name AS category_name,
             rt.id AS type_id, rt.code AS type_code, rt.name AS type_name,
             rt.reimbursement_rate
      FROM reimbursement_categories rc
      JOIN reimbursement_types rt ON rt.category_id = rc.id
      WHERE rc.enabled = true AND rt.enabled = true
      ORDER BY rc.sort_no, rt.sort_no
    `);
    // 可按分类分组返回，也可直接返回扁平数组（前端已做 flatMap）
    // 根据 ApplyView.vue 中的处理，它期望的是 [{ id, name, types: [...] }]
    // 但实际前端用了 flatMap，它期望的是扁平数组？实际上它用了 r.data.flatMap(x=>x.types.map(...))
    // 建议按分类分组返回，便于前端复用
    const grouped = {};
    for (const row of rows.rows) {
      const key = row.category_id;
      if (!grouped[key]) {
        grouped[key] = {
          id: row.category_id,
          code: row.category_code,
          name: row.category_name,
          types: []
        };
      }
      grouped[key].types.push({
        id: row.type_id,
        code: row.type_code,
        name: row.type_name,
        reimbursementRate: Number(row.reimbursement_rate)
      });
    }
    return Object.values(grouped);
  });
}