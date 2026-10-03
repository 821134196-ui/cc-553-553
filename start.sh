#!/usr/bin/env bash
# 一条命令启动：农膜回收称重与补贴资格系统
#   ./start.sh           首次运行自动安装依赖、建库、播种示例数据，然后启动前后端
#   ./start.sh --reset   删除数据库并重新播种（重量修正 / 重复交膜 / 额度顶满示例）
#   ./start.sh --build   以编译产物方式启动（后端 node dist，前端 vite preview）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

RESET=0; PROD=0
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=1 ;;
    --build) PROD=1 ;;
    *) echo "未知参数: $arg"; exit 1 ;;
  esac
done

echo "▶ 1/4 检查依赖…"
if [ ! -d node_modules ]; then
  npm install
fi

cd backend
echo "▶ 2/4 准备 SQLite 数据库（Prisma）…"
npx prisma generate
if [ "$RESET" = "1" ] || [ ! -f prisma/dev.db ]; then
  rm -f prisma/dev.db
  npx prisma db push --skip-generate
  npx tsx prisma/seed.ts
else
  npx prisma db push --skip-generate --accept-data-loss >/dev/null 2>&1 || true
fi
cd "$ROOT"

echo "▶ 3/4 编译…"
if [ "$PROD" = "1" ]; then
  npm run build -w backend
  npm run build -w frontend
fi

cleanup() {
  echo ""
  echo "■ 正在停止服务…"
  [ -n "${BACK_PID:-}" ] && kill "$BACK_PID" 2>/dev/null || true
  [ -n "${FRONT_PID:-}" ] && kill "$FRONT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "▶ 4/4 启动服务…"
if [ "$PROD" = "1" ]; then
  (cd backend && node dist/main.js) & BACK_PID=$!
  (cd frontend && npx vite preview --host 0.0.0.0 --port 5173) & FRONT_PID=$!
else
  (cd backend && npm run dev) & BACK_PID=$!
  (cd frontend && npm run dev) & FRONT_PID=$!
fi

sleep 4
cat <<'EOF'

╔══════════════════════════════════════════════════════════╗
║  🌱 农膜回收称重与补贴系统已启动                           ║
║  前端页面:  http://localhost:5173                         ║
║  后端 API:  http://localhost:3000/api                     ║
║                                                          ║
║  演示账号: admin/admin123        管理员                   ║
║            collector/collect123  收料员                   ║
║            reviewer/review123    审核人员                 ║
║            zhang/zhang123        种植户（张种植）          ║
║            wang/wang123          种植户（王种植）          ║
║                                                          ║
║  按 Ctrl+C 停止；重置示例数据: ./start.sh --reset         ║
╚══════════════════════════════════════════════════════════╝
EOF

wait -n "$BACK_PID" "$FRONT_PID"
