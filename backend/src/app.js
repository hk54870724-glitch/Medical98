import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { pool } from './db/pool.js';
import { env } from './config/env.js';
import { requestContext } from './middleware/request-context.js';
import { loadCurrentUser } from './middleware/auth.js';
import { notFoundHandler, errorHandler } from './middleware/error-handler.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import reimbursementRoutes from './routes/reimbursement.routes.js';
import adminRoutes from './routes/admin.routes.js';
import parserRoutes from './routes/parser.routes.js';

const PgStore = pgSession(session);
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(requestContext);
app.use(morgan(':method :url :status :response-time ms requestId=:req[x-request-id]'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  name: env.SESSION_NAME,
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: env.SESSION_SECURE === 'true',
    sameSite: env.SESSION_SAME_SITE,
    maxAge: env.SESSION_MAX_AGE_MS
  }
}));

app.use(loadCurrentUser);

app.get('/api/v1', (_req, res) => {
  res.json({ success: true, code: 'OK', message: '企业医药费报销系统 API', data: { version: 'v1' } });
});
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/reimbursements', reimbursementRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/parser', parserRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
