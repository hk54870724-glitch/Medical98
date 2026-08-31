import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.string().min(1),
  PGSSL: z.enum(['true', 'false']).default('false'),
  PGPOOL_MAX: z.coerce.number().int().positive().max(100).default(10),
  SESSION_SECRET: z.string().min(32),
  SESSION_NAME: z.string().default('medical_reimbursement.sid'),
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(7200000),
  SESSION_SECURE: z.enum(['true', 'false']).default('false'),
  SESSION_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  FILE_STORAGE_ROOT: z.string().min(1),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(200).default(20),
  DEFAULT_ADMIN_USERNAME: z.string().default('admin'),
  DEFAULT_ADMIN_PASSWORD: z.string().min(8).default('admin123'),
  DEFAULT_FINANCE_USERNAME: z.string().default('finance01'),
  DEFAULT_FINANCE_PASSWORD: z.string().min(8).default('finance123')
});

export const env = envSchema.parse(process.env);
