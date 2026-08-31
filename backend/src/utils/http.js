export function ok(res, data = null, message = '操作成功', status = 200) {
  return res.status(status).json({ success: true, code: 'OK', message, data });
}

export function fail(res, code, message, status = 400, data = null) {
  return res.status(status).json({ success: false, code, message, data });
}

export class AppError extends Error {
  constructor(code, message, status = 400, data = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}
