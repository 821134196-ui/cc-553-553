#!/usr/bin/env bash
# 一条本地命令启动农膜回收称重与补贴系统：
#   安装依赖 → 生成 Prisma Client → 建库(SQLite) → 种子数据 → 并行启动 API(3000) 与 Web(5173)
set -euo pipefail
cd "$(dirname "$0")"

echo "🌱 农膜回收称重与补贴系统 —— 本地启动"

if [ ! -d node_modules ]; then
  echo "① 安装依赖…"
  npm install --no-audit --no-fund
fi

cd backend
echo "② 生成 Prisma Client 并创建 SQLite 数据库…"
npx prisma generate >/dev/null
npx prisma db push >/dev/null

echo "③ 写入演示种子数据（幂等，可重复执行）…"
npx cross-env DATABASE_URL=file:./dev.db tsx prisma/seed.ts
cd ..

echo "④ 启动后端 http://localhost:3000 与前端 http://localhost:5173 …"
echo "   演示账号：zhang/collector/reviewer/admin，密码统一 123456"
echo "   按 Ctrl+C 停止"
exec npx concurrently -k -n api,web -c blue,green \
  "npm run dev -w backend" \
  "npm run dev -w frontend"
