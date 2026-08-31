$ErrorActionPreference = 'Stop'
Write-Host '=== 企业医药费报销系统：本地环境快速检查 ==='
node --version
npm --version
Write-Host '请确认 PostgreSQL 服务已启动，然后执行：'
Write-Host '  cd backend'
Write-Host '  copy .env.example .env'
Write-Host '  npm ci'
Write-Host '  npm run init'
Write-Host '  npm test'
Write-Host '  npm start'
Write-Host '再用浏览器访问前端开发地址并执行 deployment/manual-test-plan.md。'
