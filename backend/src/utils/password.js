import bcrypt from 'bcryptjs';

export async function hashPassword(plainText) {
  if (typeof plainText !== 'string' || !plainText) throw new Error('Password is required');
  if (Buffer.byteLength(plainText, 'utf8') > 72) throw new Error('Password exceeds bcrypt 72-byte limit');
  return bcrypt.hash(plainText, 12);
}

export function verifyPassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}
