import { Router } from 'express';
import { query } from '../db/pool.js';
import { ok } from '../utils/http.js';

const router = Router();
router.get('/', async (_req, res) => {
  const result = await query('SELECT NOW() AS db_time');
  return ok(res, { service: 'enterprise-medical-reimbursement', status: 'UP', dbTime: result.rows[0].db_time });
});
export default router;
