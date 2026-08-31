# Windows 内网部署说明

## 1. 推荐环境
- Windows Server / Windows 11 Pro
- Node.js LTS
- PostgreSQL 16+
- 内网固定 IP
- 浏览器：Edge / Chrome

## 2. 数据库
创建数据库和账号后设置 DATABASE_URL，例如：
`postgresql://reimbursement:<password>@127.0.0.1:5432/medical_reimbursement`

在 backend 目录执行：
`npm ci`
`copy .env.example .env`
按实际环境修改 `.env`
`npm run init`
`npm start`

## 3. 前端
在 frontend：
`npm ci`
`npm run build`
将 dist 部署到内网 Web Server，或由 Node/反向代理托管。
开发环境可执行 `npm run dev`。

## 4. 文件目录
建议：`D:\MedicalReimbursement`
并确保运行 Node 的 Windows 账户具有读写权限。

## 5. 首次上线
- 使用 seed 创建的默认账号仅用于初始化。
- 登录后立即修改密码。
- 修改 SESSION_SECRET、数据库密码。
- 关闭不必要的外部访问。
- 定期备份 PostgreSQL 与票据文件目录。
