#!/usr/bin/env bash
# 一键启动：个人规划站本机服务 + frp 隧道
# 用法: ./start.sh   或   bash start.sh
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
PL="$ROOT/personal-planner"

die() { echo "错误: $*" >&2; exit 1; }

command -v node &>/dev/null || die "未找到 node，请安装 Node.js 22+"
command -v frpc &>/dev/null || die "未找到 frpc（brew install frpc 或从 https://github.com/fatedier/frp/releases 下载）"
[[ -f "$PL/dev-server.js" ]] || die "未找到 personal-planner/dev-server.js"
[[ -f "$PL/frpc.toml" ]] || die "未找到 personal-planner/frpc.toml，请先按 deploy/ALIYUN.md 配置 frp"

cd "$PL" || die "无法进入 personal-planner"

SERVER_PID=""
FRPC_PID=""

cleanup() {
  if [[ -n "$FRPC_PID" ]] && kill -0 "$FRPC_PID" 2>/dev/null; then
    kill "$FRPC_PID" 2>/dev/null || true
  fi
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}

trap 'cleanup; exit 0' INT TERM
trap cleanup EXIT

node dev-server.js &
SERVER_PID=$!
sleep 2

frpc -c frpc.toml &
FRPC_PID=$!

ADDR=$(grep -E '^\s*serverAddr\s*=' frpc.toml 2>/dev/null | head -1 | sed -n 's/.*"\([^"]*\)".*/\1/p')
RPORT=$(grep -E '^\s*remotePort\s*=' frpc.toml 2>/dev/null | head -1 | sed -n 's/.*=\s*\([0-9]*\).*/\1/p')

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  本地:  http://127.0.0.1:8787/index.html"
if [[ -n "$ADDR" && -n "$RPORT" ]]; then
  echo "  公网:  http://${ADDR}:${RPORT}/index.html"
else
  echo "  公网:  见 frpc.toml 中 serverAddr + remotePort"
fi
echo "  按 Ctrl+C 停止网站与隧道"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

wait $FRPC_PID 2>/dev/null || true
cleanup
trap - EXIT INT TERM
exit 0
