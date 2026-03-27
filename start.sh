#!/usr/bin/env bash
# 一键启动：个人规划站本机服务
# 用法: ./start.sh   或   bash start.sh
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
PL="$ROOT/personal-planner"

die() { echo "错误: $*" >&2; exit 1; }

command -v node &>/dev/null || die "未找到 node，请安装 Node.js 22+"
[[ -f "$PL/dev-server.js" ]] || die "未找到 personal-planner/dev-server.js"

cd "$PL" || die "无法进入 personal-planner"

SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}

trap 'cleanup; exit 0' INT TERM
trap cleanup EXIT

node dev-server.js &
SERVER_PID=$!
sleep 2

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  本地:  http://127.0.0.1:8787/index.html"
echo "  按 Ctrl+C 停止网站"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

wait $SERVER_PID 2>/dev/null || true
cleanup
trap - EXIT INT TERM
exit 0
