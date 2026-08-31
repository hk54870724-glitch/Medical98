import { query } from '../db/pool.js';
import { AppError } from '../utils/http.js';

export async function loadCurrentUser(req, _res, next) {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      req.currentUser = null;
      return next();
    }
    const result = await query(
      `SELECT id, username, role_code, employee_id, enabled, must_change_password
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = result.rows[0];
    if (!user || !user.enabled) {
      req.session.destroy(() => {});
      req.currentUser = null;
      return next();
    }
    req.currentUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.currentUser) {
    return next(new AppError('AUTH_REQUIRED', '请先登录', 401));
  }
  next();
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.currentUser) return next(new AppError('AUTH_REQUIRED', '请先登录', 401));
    if (!roles.includes(req.currentUser.role_code)) {
      return next(new AppError('FORBIDDEN', '无权执行该操作', 403));
    }
    next();
  };
}
