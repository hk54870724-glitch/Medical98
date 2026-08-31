import fs from 'node:fs/promises';
import path from 'node:path';
import { withTransaction, query } from '../db/pool.js';
import { hashPassword } from '../utils/password.js';
import { AppError } from '../utils/http.js';
import { parseCsv } from '../utils/csv.js';

// 员工 CSV 可能来自 Windows 导出（GBK）或 UTF-8。UTF-8 严格解码失败时回退 GBK，
// 避免中文乱码导致字段头（工号/姓名等）无法匹配。
export function decodeCsvBuffer(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.toString('utf8').replace(/^\uFEFF/, '');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('gbk').decode(buffer);
  }
}

export async function listYears() { return (await query(`SELECT * FROM reimbursement_years ORDER BY year_no DESC`)).rows; }
export async function initializeYear(user, {sourceYearId,targetYear}) {
  return withTransaction(async client=>{
    const existing=await client.query(`SELECT 1 FROM reimbursement_years WHERE year_no=$1`,[targetYear]);
    if(existing.rowCount) throw new AppError('YEAR_ALREADY_EXISTS','目标年度账套已存在',409);
    const src=(await client.query(`SELECT * FROM reimbursement_years WHERE id=$1`,[sourceYearId])).rows[0];
    if(!src) throw new AppError('YEAR_NOT_FOUND','来源账套不存在',404);
    const r=await client.query(`INSERT INTO reimbursement_years(year_no,annual_limit,invoice_start_date,invoice_end_date,allow_backfill,male_child_year_rule,female_child_year_rule,status,is_default,initialized_from_year_id,remark,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',false,$8,$9,$10) RETURNING *`,[targetYear,src.annual_limit,`${targetYear}-01-01`,`${targetYear}-12-31`,src.allow_backfill,src.male_child_year_rule,src.female_child_year_rule,src.id,`从${src.year_no}年度账套初始化`,user.id]);
    await client.query(`INSERT INTO operation_logs(user_id,module,action,target_type,target_id,detail_json) VALUES($1,'YEAR','INITIALIZE','YEAR',$2,$3::jsonb)`,[user.id,String(r.rows[0].id),JSON.stringify({sourceYearId,targetYear})]);
    return r.rows[0];
  });
}
export async function updateYear(user,id,payload){
  return withTransaction(async client=>{
    const current=(await client.query(`SELECT * FROM reimbursement_years WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!current) throw new AppError('YEAR_NOT_FOUND','账套不存在',404);
    const r=await client.query(`UPDATE reimbursement_years SET annual_limit=$1, invoice_start_date=$2, invoice_end_date=$3, allow_backfill=$4, male_child_year_rule=$5, female_child_year_rule=$6, remark=$7, updated_by=$8, updated_at=NOW() WHERE id=$9 RETURNING *`,[payload.annualLimit,payload.invoiceStartDate,payload.invoiceEndDate,payload.allowBackfill,payload.maleChildYearRule||current.male_child_year_rule,payload.femaleChildYearRule||current.female_child_year_rule,payload.remark||null,user.id,id]);
    await client.query(`INSERT INTO operation_logs(user_id,module,action,target_type,target_id,detail_json) VALUES($1,'YEAR','UPDATE','YEAR',$2,$3::jsonb)`,[user.id,String(id),JSON.stringify({before:current,after:r.rows[0]})]);
    return r.rows[0];
  });
}
export async function deleteYear(user,id){ return withTransaction(async client=>{
  const current=(await client.query(`SELECT * FROM reimbursement_years WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  if(!current) throw new AppError('YEAR_NOT_FOUND','账套不存在',404);
  const business=(await client.query(`SELECT
    (SELECT COUNT(*) FROM reimbursement_applications WHERE year_id=$1)::int AS applications,
    (SELECT COUNT(*) FROM employee_year_quota WHERE year_id=$1)::int AS quotas`,[id])).rows[0];
  if(Number(business.applications)>0) throw new AppError('YEAR_HAS_BUSINESS_DATA','该年度账套已存在报销业务数据，不能删除',409,business);
  if(current.is_default) throw new AppError('DEFAULT_YEAR_CANNOT_DELETE','当前默认账套不能删除，请先设置其他年度为默认',409);
  if(Number(business.quotas)>0) await client.query(`DELETE FROM employee_year_quota WHERE year_id=$1`,[id]);
  await client.query(`DELETE FROM reimbursement_years WHERE id=$1`,[id]);
  await client.query(`INSERT INTO operation_logs(user_id,module,action,target_type,target_id,detail_json) VALUES($1,'YEAR','DELETE','YEAR',$2,$3::jsonb)`,[user.id,String(id),JSON.stringify({yearNo:current.year_no})]);
  return {id,yearNo:current.year_no};
 }); }
export async function setYearStatus(user,id,status){ return withTransaction(async client=>{ if(status==='ACTIVE') await client.query(`UPDATE reimbursement_years SET is_default=false WHERE is_default=true`); const r=await client.query(`UPDATE reimbursement_years SET status=$1, is_default=$2, updated_by=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,[status,status==='ACTIVE',user.id,id]); if(!r.rowCount) throw new AppError('YEAR_NOT_FOUND','账套不存在',404); await client.query(`INSERT INTO operation_logs(user_id,module,action,target_type,target_id,detail_json) VALUES($1,'YEAR',$2,'YEAR',$3,$4::jsonb)`,[user.id,status==='ACTIVE'?'ACTIVATE':'CLOSE',String(id),JSON.stringify({status})]); return r.rows[0]; }); }
export async function listCategories(){ const r=await query(`SELECT c.*,COALESCE(json_agg(json_build_object('id',t.id,'code',t.code,'name',t.name,'reimbursementRate',t.reimbursement_rate) ORDER BY t.sort_no,t.id) FILTER(WHERE t.id IS NOT NULL),'[]') AS types FROM reimbursement_categories c LEFT JOIN reimbursement_types t ON t.category_id=c.id AND t.enabled=true WHERE c.enabled=true GROUP BY c.id ORDER BY c.sort_no,c.id`); return r.rows; }
export async function createCategory(user,p){ return withTransaction(async c=>{ const r=await c.query(`INSERT INTO reimbursement_categories(code,name,sort_no) VALUES($1,$2,$3) RETURNING *`,[p.code,p.name,p.sortNo||0]); await c.query(`INSERT INTO operation_logs(user_id,module,action,target_type,target_id,detail_json) VALUES($1,'RULE','CREATE','CATEGORY',$2,$3::jsonb)`,[user.id,String(r.rows[0].id),JSON.stringify(p)]); return r.rows[0];}); }
export async function updateCategory(user,id,p){ const r=await query(`UPDATE reimbursement_categories SET name=$1,sort_no=$2,enabled=$3,updated_at=NOW() WHERE id=$4 RETURNING *`,[p.name,p.sortNo||0,p.enabled!==false,id]); if(!r.rowCount) throw new AppError('CATEGORY_NOT_FOUND','分类不存在',404); return r.rows[0]; }
export async function deleteCategory(user,id){ const r=await query(`UPDATE reimbursement_categories SET enabled=false,updated_at=NOW() WHERE id=$1 RETURNING *`,[id]); if(!r.rowCount) throw new AppError('CATEGORY_NOT_FOUND','分类不存在',404); return r.rows[0]; }
export async function createType(user,p){
  if(!Number.isInteger(Number(p.categoryId)) || Number(p.categoryId)<=0) throw new AppError('CATEGORY_REQUIRED','请选择报销分类',422);
  if(!String(p.code||'').trim()) throw new AppError('TYPE_CODE_REQUIRED','报销类型编码不能为空',422);
  if(!String(p.name||'').trim()) throw new AppError('TYPE_NAME_REQUIRED','报销类型名称不能为空',422);
  const rate=Number(p.reimbursementRate); if(!Number.isFinite(rate)||rate<=0||rate>1) throw new AppError('TYPE_RATE_INVALID','报销比例必须大于0且不超过1，例如80%请填写0.8',422);
  try { const r=await query(`INSERT INTO reimbursement_types(category_id,code,name,reimbursement_rate,sort_no) VALUES($1,$2,$3,$4,$5) RETURNING *`,[Number(p.categoryId),String(p.code).trim(),String(p.name).trim(),rate,p.sortNo||0]); return r.rows[0]; } catch(e){ if(e?.code==='23505') throw new AppError('TYPE_CODE_DUPLICATE',`该分类下的报销类型编码“${String(p.code).trim()}”已存在，请更换编码`,409); throw e; } }
export async function updateType(user,id,p){ const r=await query(`UPDATE reimbursement_types SET name=$1,reimbursement_rate=$2,sort_no=$3,enabled=$4,updated_at=NOW() WHERE id=$5 RETURNING *`,[p.name,p.reimbursementRate,p.sortNo||0,p.enabled!==false,id]); if(!r.rowCount) throw new AppError('TYPE_NOT_FOUND','报销类型不存在',404); return r.rows[0]; }
export async function deleteType(user,id){ const r=await query(`UPDATE reimbursement_types SET enabled=false,updated_at=NOW() WHERE id=$1 RETURNING *`,[id]); if(!r.rowCount) throw new AppError('TYPE_NOT_FOUND','报销类型不存在',404); return r.rows[0]; }
export async function listEmployees({keyword,page=1,pageSize=20}){const params=[];const where=[];if(keyword){params.push(`%${keyword}%`);where.push(`(e.employee_no ILIKE $${params.length} OR e.name ILIKE $${params.length} OR COALESCE(e.department,'') ILIKE $${params.length})`);} const w=where.length?`WHERE ${where.join(' AND ')}`:''; const count=await query(`SELECT COUNT(*)::int total FROM employees e ${w}`,params); params.push(pageSize,(Number(page)-1)*pageSize); const r=await query(`SELECT e.* FROM employees e ${w} ORDER BY e.employee_no LIMIT $${params.length-1} OFFSET $${params.length}`,params);return {items:r.rows,page:Number(page),pageSize:Number(pageSize),total:count.rows[0].total,totalPages:Math.ceil(count.rows[0].total/pageSize)};}
export async function createEmployee(user,p){const r=await query(`INSERT INTO employees(employee_no,name,gender,department,hire_date,leave_date,employment_status,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[p.employeeNo,p.name,p.gender,p.department||null,p.hireDate,p.leaveDate||null,p.employmentStatus||'ACTIVE',p.enabled!==false]);return r.rows[0];}
export async function updateEmployee(user,id,p){const r=await query(`UPDATE employees SET employee_no=$1,name=$2,gender=$3,department=$4,hire_date=$5,leave_date=$6,employment_status=$7,enabled=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,[p.employeeNo,p.name,p.gender,p.department||null,p.hireDate,p.leaveDate||null,p.employmentStatus,p.enabled!==false,id]);if(!r.rowCount)throw new AppError('EMPLOYEE_NOT_FOUND','员工不存在',404);return r.rows[0];}
export async function deleteEmployee(user,id){const r=await query(`UPDATE employees SET enabled=false,employment_status=CASE WHEN employment_status='ACTIVE' THEN 'RESIGNED' ELSE employment_status END,updated_at=NOW() WHERE id=$1 RETURNING *`,[id]);if(!r.rowCount)throw new AppError('EMPLOYEE_NOT_FOUND','员工不存在',404);return r.rows[0];}
export async function listChildren(employeeId){return (await query(`SELECT * FROM employee_children WHERE employee_id=$1 AND enabled=true ORDER BY id`,[employeeId])).rows;}
export async function createChild(employeeId,p){return (await query(`INSERT INTO employee_children(employee_id,child_name,gender,birth_date,enabled) VALUES($1,$2,$3,$4,$5) RETURNING *`,[employeeId,p.childName,p.gender||null,p.birthDate||null,p.enabled!==false])).rows[0];}
export async function updateChild(id,p){const r=await query(`UPDATE employee_children SET child_name=$1,gender=$2,birth_date=$3,enabled=$4,updated_at=NOW() WHERE id=$5 RETURNING *`,[p.childName,p.gender||null,p.birthDate||null,p.enabled!==false,id]);if(!r.rowCount)throw new AppError('CHILD_NOT_FOUND','子女不存在',404);return r.rows[0];}
export async function deleteChild(id){const r=await query(`UPDATE employee_children SET enabled=false,updated_at=NOW() WHERE id=$1 RETURNING *`,[id]);if(!r.rowCount)throw new AppError('CHILD_NOT_FOUND','子女不存在',404);return r.rows[0];}
export async function listUsers(){return (await query(`SELECT id,username,role_code,employee_id,enabled,must_change_password,last_login_at FROM users ORDER BY username`)).rows;}
export async function createUser(user,p){
  const username=String(p.username||'').trim(); const password=String(p.password||''); const roleCode=String(p.roleCode||'').trim();
  if(!username) throw new AppError('USERNAME_REQUIRED','用户名不能为空',422);
  if(!/^[A-Za-z0-9_.-]{2,50}$/.test(username)) throw new AppError('USERNAME_INVALID','用户名只能包含字母、数字、下划线、点或短横线，长度2-50位',422);
  if(!['EMPLOYEE','HR','FINANCE','ADMIN'].includes(roleCode)) throw new AppError('ROLE_INVALID','请选择有效的用户角色',422);
  if(!password) throw new AppError('PASSWORD_REQUIRED','初始密码不能为空',422);
  if(password.length<8) throw new AppError('PASSWORD_TOO_SHORT','密码至少8位，且必须同时包含大写字母、小写字母和数字',422);
  if(Buffer.byteLength(password,'utf8')>72) throw new AppError('PASSWORD_TOO_LONG','密码不能超过72字节',422);
  if(!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/\d/.test(password)) throw new AppError('PASSWORD_COMPLEXITY','密码必须同时包含大写字母、小写字母和数字',422);
  const employeeId=p.employeeId==null||p.employeeId===''?null:Number(p.employeeId);
  if(roleCode==='EMPLOYEE'){ if(!Number.isInteger(employeeId)||employeeId<=0) throw new AppError('EMPLOYEE_BINDING_REQUIRED','员工角色必须绑定员工主数据，请选择对应员工',422); const er=await query(`SELECT 1 FROM employees WHERE id=$1 AND enabled=true`,[employeeId]); if(!er.rowCount) throw new AppError('EMPLOYEE_BINDING_INVALID','绑定的员工主数据不存在或已停用',422); }
  try { const r=await query(`INSERT INTO users(username,password_hash,role_code,employee_id,enabled,must_change_password) VALUES($1,$2,$3,$4,$5,true) RETURNING id,username,role_code,employee_id,enabled,must_change_password`,[username,await hashPassword(password),roleCode,employeeId,p.enabled!==false]);return r.rows[0]; } catch(e){ if(e?.code==='23505') throw new AppError('USERNAME_DUPLICATE',`用户名“${username}”已存在，请更换用户名`,409); throw e; } }
export async function updateUser(user,id,p){
  const roleCode=String(p.roleCode||'').trim(); const employeeId=p.employeeId==null||p.employeeId===''?null:Number(p.employeeId);
  if(!['EMPLOYEE','HR','FINANCE','ADMIN'].includes(roleCode)) throw new AppError('ROLE_INVALID','请选择有效的用户角色',422);
  if(roleCode==='EMPLOYEE'){ if(!Number.isInteger(employeeId)||employeeId<=0) throw new AppError('EMPLOYEE_BINDING_REQUIRED','员工角色必须绑定员工主数据，请选择对应员工',422); const er=await query(`SELECT 1 FROM employees WHERE id=$1 AND enabled=true`,[employeeId]); if(!er.rowCount) throw new AppError('EMPLOYEE_BINDING_INVALID','绑定的员工主数据不存在或已停用',422); }
  const r=await query(`UPDATE users SET role_code=$1,employee_id=$2,enabled=$3,updated_at=NOW() WHERE id=$4 RETURNING id,username,role_code,employee_id,enabled,must_change_password`,[roleCode,roleCode==='EMPLOYEE'?employeeId:null,p.enabled!==false,id]);if(!r.rowCount)throw new AppError('USER_NOT_FOUND','账号不存在',404);return r.rows[0];
}
export async function resetPassword(user,id,p){const password=String(p.password||''); if(password.length<8||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password)) throw new AppError('PASSWORD_COMPLEXITY','密码至少8位，且必须同时包含大写字母、小写字母和数字',422); if(Buffer.byteLength(password,'utf8')>72) throw new AppError('PASSWORD_TOO_LONG','密码不能超过72字节',422); const hash=await hashPassword(password);const r=await query(`UPDATE users SET password_hash=$1,must_change_password=true,updated_at=NOW() WHERE id=$2 RETURNING id,username,role_code`,[hash,id]);if(!r.rowCount)throw new AppError('USER_NOT_FOUND','账号不存在',404);return r.rows[0];}
export async function setUserEnabled(user,id,enabled){const r=await query(`UPDATE users SET enabled=$1,updated_at=NOW() WHERE id=$2 RETURNING id,username,role_code,enabled`,[enabled,id]);if(!r.rowCount)throw new AppError('USER_NOT_FOUND','账号不存在',404);return r.rows[0];}
export async function getParameters(){const r=await query(`SELECT param_key,param_value,param_type,description FROM system_parameters ORDER BY param_key`); return r.rows;}
export async function updateParameters(user,p){return withTransaction(async c=>{for(const [key,value] of Object.entries(p)){await c.query(`INSERT INTO system_parameters(param_key,param_value,param_type,description) VALUES($1,$2,'STRING','') ON CONFLICT(param_key) DO UPDATE SET param_value=EXCLUDED.param_value,updated_at=NOW()`,[key,String(value)]);} return (await c.query(`SELECT param_key,param_value,param_type,description FROM system_parameters ORDER BY param_key`)).rows;});}

export async function importEmployeesFromCsv(user,buffer){ const text=decodeCsvBuffer(buffer); const rows=parseCsv(text); if(!rows.length) throw new AppError('CSV_EMPTY','CSV文件为空',422); return withTransaction(async c=>{let inserted=0,updated=0;for(const row of rows){const p={employeeNo:String(row.employeeNo||row['工号']||'').trim(),name:String(row.name||row['姓名']||'').trim(),gender:String(row.gender||row['性别']||'').trim().toUpperCase()==='男'?'M':String(row.gender||row['性别']||'').trim().toUpperCase()==='女'?'F':String(row.gender||'').trim().toUpperCase(),department:String(row.department||row['部门']||'').trim()||null,hireDate:row.hireDate||row['入职日期'],leaveDate:row.leaveDate||row['离职日期']||null,employmentStatus:row.employmentStatus||row['状态']||'ACTIVE'};if(!p.employeeNo||!p.name||!['M','F'].includes(p.gender)||!p.hireDate) throw new AppError('CSV_INVALID_ROW','存在缺失工号、姓名、性别或入职日期的记录',422);const ex=await c.query(`SELECT id FROM employees WHERE employee_no=$1`,[p.employeeNo]);if(ex.rowCount){await c.query(`UPDATE employees SET name=$1,gender=$2,department=$3,hire_date=$4,leave_date=$5,employment_status=$6,enabled=true,updated_at=NOW() WHERE id=$7`,[p.name,p.gender,p.department,p.hireDate,p.leaveDate,p.employmentStatus,ex.rows[0].id]);updated++;}else{await c.query(`INSERT INTO employees(employee_no,name,gender,department,hire_date,leave_date,employment_status,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,true)`,[p.employeeNo,p.name,p.gender,p.department,p.hireDate,p.leaveDate,p.employmentStatus]);inserted++;}} return {total:rows.length,inserted,updated,failed:0}; }); }
