export async function getDefaultYear(client) {
  const r = await client.query(`SELECT * FROM reimbursement_years WHERE is_default = true AND status = 'ACTIVE' LIMIT 1`);
  return r.rows[0] ?? null;
}

export async function getYear(client, yearId) {
  const r = await client.query(`SELECT * FROM reimbursement_years WHERE id = $1`, [yearId]);
  return r.rows[0] ?? null;
}

export async function getEmployee(client, employeeId) {
  const r = await client.query(`SELECT * FROM employees WHERE id = $1`, [employeeId]);
  return r.rows[0] ?? null;
}

export async function getEmployeeByNo(client, employeeNo) {
  const r = await client.query(`SELECT * FROM employees WHERE employee_no = $1 AND enabled = true`, [employeeNo]);
  return r.rows[0] ?? null;
}

export async function getChildren(client, employeeId) {
  const r = await client.query(`SELECT * FROM employee_children WHERE employee_id = $1 AND enabled = true ORDER BY id`, [employeeId]);
  return r.rows;
}

export async function getChildByName(client, employeeId, name) {
  const r = await client.query(`SELECT * FROM employee_children WHERE employee_id = $1 AND child_name = $2 AND enabled = true LIMIT 2`, [employeeId, name]);
  if (r.rows.length > 1) return { duplicateName: true, child: null };
  return { duplicateName: false, child: r.rows[0] ?? null };
}

export async function getRateType(client, typeId) {
  const r = await client.query(`SELECT rt.*, rc.code AS category_code, rc.name AS category_name FROM reimbursement_types rt JOIN reimbursement_categories rc ON rc.id = rt.category_id WHERE rt.id = $1 AND rt.enabled = true AND rc.enabled = true`, [typeId]);
  return r.rows[0] ?? null;
}

export async function ensureQuotaRow(client, employeeId, yearId) {
  await client.query(`INSERT INTO employee_year_quota(employee_id, year_id) VALUES ($1,$2) ON CONFLICT(employee_id,year_id) DO NOTHING`, [employeeId, yearId]);
  const r = await client.query(`SELECT * FROM employee_year_quota WHERE employee_id = $1 AND year_id = $2 FOR UPDATE`, [employeeId, yearId]);
  return r.rows[0];
}

export async function getQuotaUsed(client, employeeId, yearId) {
  const r = await client.query(`
    SELECT
      COALESCE(SUM(CASE WHEN rd.status = 1 THEN rd.reimbursement_amount ELSE 0 END),0)::numeric(14,2) AS approved_amount,
      COALESCE(SUM(CASE WHEN rd.status = 0 THEN rd.reimbursement_amount ELSE 0 END),0)::numeric(14,2) AS pending_amount
    FROM reimbursement_details rd
    JOIN reimbursement_applications ra ON ra.id = rd.application_id
    WHERE ra.employee_id = $1 AND ra.year_id = $2
  `, [employeeId, yearId]);
  return {
    approvedAmount: Number(r.rows[0].approved_amount),
    pendingAmount: Number(r.rows[0].pending_amount)
  };
}

export async function getApplicationDetailsForUpdate(client, applicationId) {
  const r = await client.query(`SELECT * FROM reimbursement_details WHERE application_id = $1 ORDER BY id FOR UPDATE`, [applicationId]);
  return r.rows;
}

export async function refreshApplicationTotals(client, applicationId) {
  await client.query(`
    UPDATE reimbursement_applications ra SET
      total_invoice_amount = COALESCE((SELECT SUM(total_amount) FROM reimbursement_details WHERE application_id = ra.id AND status <> 2),0),
      total_self_paid = COALESCE((SELECT SUM(self_paid) FROM reimbursement_details WHERE application_id = ra.id AND status <> 2),0),
      total_reimburse_amount = COALESCE((SELECT SUM(reimbursement_amount) FROM reimbursement_details WHERE application_id = ra.id AND status <> 2),0),
      updated_at = NOW()
    WHERE ra.id = $1
  `, [applicationId]);
  await client.query(`
    UPDATE reimbursement_applications ra SET status = CASE
      WHEN EXISTS (SELECT 1 FROM reimbursement_details WHERE application_id = ra.id AND status = 0) THEN 0
      WHEN EXISTS (SELECT 1 FROM reimbursement_details WHERE application_id = ra.id AND status = 1) THEN 1
      ELSE 2 END,
      completed_at = CASE WHEN NOT EXISTS (SELECT 1 FROM reimbursement_details WHERE application_id = ra.id AND status = 0) THEN COALESCE(completed_at, NOW()) ELSE NULL END
    WHERE ra.id = $1
  `, [applicationId]);
}

export async function insertApplication(client, input) {
  const r = await client.query(`INSERT INTO reimbursement_applications(application_no, employee_id, year_id, apply_date, status, total_invoice_amount, total_self_paid, total_reimburse_amount, submitted_at) VALUES ($1,$2,$3,$4,0,$5,$6,$7,NOW()) RETURNING *`, [input.applicationNo, input.employeeId, input.yearId, input.applyDate, input.totalInvoiceAmount, input.totalSelfPaid, input.totalReimburseAmount]);
  return r.rows[0];
}

export async function insertDetail(client, detail) {
  const r = await client.query(`INSERT INTO reimbursement_details(application_id, beneficiary_type, beneficiary_employee_id, child_id, reimbursement_type_id, invoice_name, invoice_no, invoice_date, total_amount, self_paid, reimbursement_rate, reimbursement_amount, status, source_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13) RETURNING *`, [detail.applicationId, detail.beneficiaryType, detail.employeeId, detail.childId, detail.reimbursementTypeId, detail.invoiceName, detail.invoiceNo, detail.invoiceDate, detail.totalAmount, detail.selfPaid, detail.reimbursementRate, detail.reimbursementAmount, detail.sourceType ?? 'MANUAL']);
  return r.rows[0];
}

export async function registerInvoice(client, invoiceNo, detailId, applicationId) {
  await client.query(`INSERT INTO invoice_registry(invoice_no, detail_id, application_id) VALUES ($1,$2,$3)`, [invoiceNo, detailId, applicationId]);
}

export async function findPendingDetail(client, detailId) {
  const r = await client.query(`SELECT rd.*, ra.employee_id, ra.year_id, ra.application_no, e.name AS employee_name, e.gender AS employee_gender, e.department, e.hire_date, e.leave_date, e.employment_status, rt.category_id, rt.reimbursement_rate AS configured_rate, rc.code AS category_code, rc.name AS category_name FROM reimbursement_details rd JOIN reimbursement_applications ra ON ra.id = rd.application_id JOIN employees e ON e.id = ra.employee_id JOIN reimbursement_types rt ON rt.id = rd.reimbursement_type_id JOIN reimbursement_categories rc ON rc.id = rt.category_id WHERE rd.id = $1 FOR UPDATE`, [detailId]);
  return r.rows[0] ?? null;
}

export async function findInvoiceRegistry(client, invoiceNo) {
  const r = await client.query(`SELECT * FROM invoice_registry WHERE invoice_no = $1`, [invoiceNo]);
  return r.rows[0] ?? null;
}
