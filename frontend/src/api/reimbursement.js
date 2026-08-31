import http from './http';
export const getContext = () => http.get('/reimbursements/context');
export const getQuota = (yearId) => http.get('/reimbursements/quota', { params: { yearId } });
export const createApplication = (data) => http.post('/reimbursements', data);
export const getMyApplications = (params) => http.get('/reimbursements/my', { params });
export const getApplication = (id) => http.get(`/reimbursements/${id}`);
export const getPendingApprovals = (params) => http.get('/reimbursements/approvals/pending', { params });
export const approveDetail = (data) => http.post('/reimbursements/approvals/approve', data);
export const rejectDetail = (data) => http.post('/reimbursements/approvals/reject', data);
export const batchApprove = (data) => http.post('/reimbursements/approvals/batch-approve', data);
export const batchReject = (data) => http.post('/reimbursements/approvals/batch-reject', data);
// ✅ 新增：获取员工端报销分类及类型的接口（具体路径请根据实际后端路由调整，如 Reimbursements/categories）
export const getCategories = () => http.get('/reimbursements/categories');
