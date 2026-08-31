import { ok } from '../utils/http.js';
import { validateCreatePayload, validateApprovalPayload } from '../validators/reimbursement.validator.js';
import * as service from '../services/reimbursement.service.js';

export async function context(req,res){ return ok(res, await service.getContext(req.currentUser)); }
export async function lookupEmployee(req,res){ return ok(res, await service.getEmployeeLookup(String(req.query.employeeNo ?? ''))); }
export async function quota(req,res){ return ok(res, await service.getQuota(req.currentUser.employee_id, Number(req.query.yearId))); }
export async function create(req,res){ return ok(res, await service.createApplication(req.currentUser, validateCreatePayload(req.body)), '报销申请提交成功', 201); }
export async function myApplications(req,res){ return ok(res, await service.getMyApplications(req.currentUser, req.query)); }
export async function detail(req,res){ return ok(res, await service.getApplication(req.currentUser, Number(req.params.id))); }
export async function pending(req,res){ return ok(res, await service.pendingApprovals(req.query)); }
export async function approve(req,res){ return ok(res, await service.approveDetail(req.currentUser, validateApprovalPayload(req.body)), '审批通过'); }
export async function reject(req,res){ return ok(res, await service.rejectDetail(req.currentUser, validateApprovalPayload(req.body)), '已驳回'); }
export async function batchApprove(req,res){ return ok(res, await service.batchApprove(req.currentUser, req.body?.items ?? [])); }
export async function batchReject(req,res){ return ok(res, await service.batchReject(req.currentUser, req.body?.items ?? [])); }
export async function categories(req, res) {
  // 假设 service 中提供一个获取所有启用分类及类型的函数
  return ok(res, await service.getCategories());
}