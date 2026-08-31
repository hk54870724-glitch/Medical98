import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';
import { AppError, ok } from '../utils/http.js';
import { hashPassword } from '../utils/password.js';

export async function login(req, res) {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    throw new AppError('INVALID_CREDENTIALS', '用户名或密码不能为空', 422);
  }
  const result = await query(`SELECT id, username, password_hash, role_code, employee_id, enabled, must_change_password FROM users WHERE username = $1`, [username.trim()]);
  const user = result.rows[0];
  if (!user || !user.enabled || !(await bcrypt.compare(password, user.password_hash))) throw new AppError('INVALID_CREDENTIALS', '用户名或密码错误', 401);
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = user.id; req.session.roleCode = user.role_code; req.session.employeeId = user.employee_id;
  await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  return ok(res, { user: { id:user.id, username:user.username, role:user.role_code, employeeId:user.employee_id, enabled:user.enabled, mustChangePassword:user.must_change_password } }, '登录成功');
}

export async function logout(req, res) { await new Promise((resolve,reject)=>{ if(!req.session)return resolve(); req.session.destroy(err=>err?reject(err):resolve()); }); res.clearCookie(env.SESSION_NAME); return ok(res,null,'已退出登录'); }
export async function me(req,res){ return ok(res, req.currentUser ? {id:req.currentUser.id,username:req.currentUser.username,role:req.currentUser.role_code,employeeId:req.currentUser.employee_id,enabled:req.currentUser.enabled,mustChangePassword:req.currentUser.must_change_password} : null); }
export async function changePassword(req,res){
  const { currentPassword, newPassword }=req.body??{};
  if(!currentPassword||!newPassword) throw new AppError('PASSWORD_REQUIRED','请输入原密码和新密码',422);
  if(newPassword.length<8) throw new AppError('PASSWORD_TOO_WEAK','新密码至少8位',422);
  const r=await query(`SELECT password_hash FROM users WHERE id=$1`,[req.currentUser.id]); if(!r.rowCount) throw new AppError('USER_NOT_FOUND','账号不存在',404);
  if(!(await bcrypt.compare(currentPassword,r.rows[0].password_hash))) throw new AppError('CURRENT_PASSWORD_INVALID','原密码错误',422);
  await query(`UPDATE users SET password_hash=$1,must_change_password=false,updated_at=NOW() WHERE id=$2`,[await hashPassword(newPassword),req.currentUser.id]);
  return ok(res,null,'密码修改成功');
}
