import { AppError } from '../utils/http.js';
import { money, parseYmd } from '../utils/business.js';

export function validateCreatePayload(body) {
  if (!body || typeof body !== 'object') throw new AppError('INVALID_REQUEST', '请求数据无效', 422);
  const yearId = Number(body.yearId);
  if (!Number.isInteger(yearId) || yearId <= 0) throw new AppError('YEAR_REQUIRED', '必须指定报销年度账套', 422);
  const applyDate = parseYmd(body.applyDate, '报销日期');
  if (!Array.isArray(body.details) || body.details.length === 0) throw new AppError('APPLICATION_EMPTY', '至少需要一张有效发票明细', 422);
  const details = body.details.map((item, index) => {
    const row = item ?? {};
    if (!row.invoiceName || !String(row.invoiceName).trim()) throw new AppError('INVOICE_DATA_INVALID', `第${index + 1}行缺少发票姓名`, 422);
    if (!row.invoiceNo || !String(row.invoiceNo).trim()) throw new AppError('INVOICE_DATA_INVALID', `第${index + 1}行缺少发票号码`, 422);
    const totalAmount = money(row.totalAmount, `第${index + 1}行总金额`);
    const selfPaid = money(row.selfPaid, `第${index + 1}行个人自付`);
    if (totalAmount <= 0) throw new AppError('INVOICE_DATA_INVALID', `第${index + 1}行总金额必须大于0`, 422);
    if (selfPaid > totalAmount) throw new AppError('INVOICE_DATA_INVALID', `第${index + 1}行个人自付金额不能大于总金额`, 422);
    return {
      invoiceName: String(row.invoiceName).trim(),
      invoiceNo: String(row.invoiceNo).trim(),
      invoiceDate: parseYmd(row.invoiceDate, `第${index + 1}行发票日期`),
      totalAmount,
      selfPaid,
      reimbursementTypeId: Number(row.typeId)
    };
  });
  if (details.some(x => !Number.isInteger(x.reimbursementTypeId) || x.reimbursementTypeId <= 0)) {
    throw new AppError('REIMBURSEMENT_TYPE_INVALID', '存在无效报销类型', 422);
  }
  return { yearId, applyDate, details };
}

export function validateApprovalPayload(body) {
  if (!body || !Number.isInteger(Number(body.detailId)) || Number(body.detailId) <= 0) {
    throw new AppError('DETAIL_REQUIRED', '必须指定报销明细', 422);
  }
  if (body.invoiceName !== undefined && !String(body.invoiceName).trim()) {
    throw new AppError('INVOICE_DATA_INVALID', '发票姓名不能为空', 422);
  }
  if (body.invoiceDate !== undefined) parseYmd(body.invoiceDate, '发票日期');
  if (body.selfPaid !== undefined) money(body.selfPaid, '个人自付');
  return {
    detailId: Number(body.detailId),
    invoiceName: body.invoiceName === undefined ? undefined : String(body.invoiceName).trim(),
    invoiceDate: body.invoiceDate,
    selfPaid: body.selfPaid === undefined ? undefined : money(body.selfPaid, '个人自付'),
    remark: body.remark === undefined ? '' : String(body.remark).slice(0, 500)
  };
}
