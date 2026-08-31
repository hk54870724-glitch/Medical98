import { Router } from 'express';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import * as controller from '../controllers/reimbursement.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/context', controller.context);
router.get('/quota', controller.quota);
router.get('/my', requireRoles('EMPLOYEE','ADMIN'), controller.myApplications);
router.get('/approvals/pending', requireRoles('HR','FINANCE','ADMIN'), controller.pending);
router.post('/approvals/approve', requireRoles('HR','FINANCE','ADMIN'), controller.approve);
router.post('/approvals/reject', requireRoles('HR','FINANCE','ADMIN'), controller.reject);
router.post('/approvals/batch-approve', requireRoles('HR','FINANCE','ADMIN'), controller.batchApprove);
router.post('/approvals/batch-reject', requireRoles('HR','FINANCE','ADMIN'), controller.batchReject);
router.get('/categories', requireAuth, controller.categories);
// 原有 /:id 路由放在后面
router.get('/:id', requireRoles('EMPLOYEE','HR','FINANCE','ADMIN'), controller.detail);
router.post('/', requireRoles('EMPLOYEE','ADMIN'), controller.create);
export default router;
