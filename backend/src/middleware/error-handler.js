import { AppError } from '../utils/http.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError('NOT_FOUND', `接口不存在：${req.method} ${req.path}`, 404));
}

export function errorHandler(error, req, res, _next) {
  const requestId = req.requestId;
  const status = error instanceof AppError ? error.status : 500;
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
  const message = error instanceof AppError ? error.message : '系统处理失败';
  const data = error instanceof AppError ? error.data : null;

  console.error(JSON.stringify({
    requestId,
    method: req.method,
    path: req.path,
    status,
    code,
    error: error?.stack || String(error)
  }));

  res.status(status).json({ success: false, code, message, data, requestId });
}
