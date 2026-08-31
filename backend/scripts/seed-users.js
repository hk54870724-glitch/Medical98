import bcrypt from 'bcrypt';
import { pool } from '../src/db/pool.js';

async function seedUsers() {
  const adminUsername = 'admin';
  const adminPlainPwd = 'admin123';

  const financeUsername = 'finance01';
  const financePlainPwd = 'finance123';

  //生成bcrypt哈希
  const adminHash = await bcrypt.hash(adminPlainPwd, 10);
  const financeHash = await bcrypt.hash(financePlainPwd, 10);

  console.log('admin hash:', adminHash);
  console.log('finance01 hash:', financeHash);

  const insertSql = `
INSERT INTO users(username, password_hash, role_code, enabled, must_change_password)
VALUES ($1,$2,$3,true,true)
ON CONFLICT(username) DO NOTHING;
  `;

  await pool.query(insertSql, [adminUsername, adminHash, 'ADMIN']);
  await pool.query(insertSql, [financeUsername, financeHash, 'FINANCE']);

  console.log('用户初始化完成');
  await pool.end();
}

seedUsers().catch(err=>{
  console.error(err);
  process.exit(1);
});
