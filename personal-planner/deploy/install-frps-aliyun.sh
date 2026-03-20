#!/usr/bin/env bash
# 在阿里云 Linux 上执行（需 root 或 sudo）：安装 frps + systemd，生成 token。
# 用法: curl -fsSL ... | sudo bash
#   或: sudo bash install-frps-aliyun.sh
set -euo pipefail

FRP_VERSION="${FRP_VERSION:-0.67.0}"
INSTALL_DIR="${INSTALL_DIR:-/opt/frp}"
FRP_BIND_PORT="${FRP_BIND_PORT:-7000}"
# 公网访问网站用的端口（与 frpc 里 remotePort 一致）
REMOTE_WEB_PORT="${REMOTE_WEB_PORT:-18080}"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "请使用 root 执行: sudo bash $0"
  exit 1
fi

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  FRP_ARCH=amd64 ;;
  aarch64) FRP_ARCH=arm64 ;;
  armv7l)  FRP_ARCH=arm ;;
  *) echo "不支持的架构: $ARCH"; exit 1 ;;
esac

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

URL="https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_${FRP_ARCH}.tar.gz"
echo ">>> 下载 frp v${FRP_VERSION} ($FRP_ARCH) ..."
if command -v curl &>/dev/null; then
  curl -fsSL -o "$TMP/frp.tgz" "$URL"
elif command -v wget &>/dev/null; then
  wget -q -O "$TMP/frp.tgz" "$URL"
else
  echo "需要 curl 或 wget"; exit 1
fi

tar -xzf "$TMP/frp.tgz" -C "$TMP"
SRC=$(find "$TMP" -maxdepth 1 -type d -name "frp_*" | head -1)
mkdir -p "$INSTALL_DIR"
cp -f "$SRC/frps" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/frps"

if command -v openssl &>/dev/null; then
  TOKEN=$(openssl rand -hex 24)
elif command -v python3 &>/dev/null; then
  TOKEN=$(python3 -c "import secrets; print(secrets.token_hex(24))")
else
  TOKEN=$(head -c 24 /dev/urandom | base64 | tr -dc A-Za-z0-9 | head -c 48)
fi
PUBLIC_IP=$(curl -sS --connect-timeout 5 ifconfig.me 2>/dev/null || curl -sS --connect-timeout 5 icanhazip.com 2>/dev/null || echo "你的服务器公网IP")

cat > "$INSTALL_DIR/frps.toml" <<EOF
bindAddr = "0.0.0.0"
bindPort = ${FRP_BIND_PORT}
auth.method = "token"
auth.token = "${TOKEN}"
EOF
chmod 600 "$INSTALL_DIR/frps.toml"

cat > /etc/systemd/system/frps.service <<EOF
[Unit]
Description=frp server (for personal-planner tunnel)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/frps -c ${INSTALL_DIR}/frps.toml
Restart=on-failure
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable frps
systemctl restart frps

# 本机防火墙（有则放行）
if command -v firewall-cmd &>/dev/null && firewall-cmd --state &>/dev/null; then
  firewall-cmd --permanent --add-port="${FRP_BIND_PORT}/tcp" 2>/dev/null || true
  firewall-cmd --permanent --add-port="${REMOTE_WEB_PORT}/tcp" 2>/dev/null || true
  firewall-cmd --reload 2>/dev/null || true
  echo ">>> firewalld 已尝试放行 ${FRP_BIND_PORT}/tcp 与 ${REMOTE_WEB_PORT}/tcp"
elif command -v ufw &>/dev/null && ufw status | grep -q active; then
  ufw allow "${FRP_BIND_PORT}/tcp" comment frps 2>/dev/null || true
  ufw allow "${REMOTE_WEB_PORT}/tcp" comment planner-web 2>/dev/null || true
  echo ">>> ufw 已尝试放行（若未生效请检查规则）"
fi

HINT="${INSTALL_DIR}/frpc-本机配置说明.txt"
cat > "$HINT" <<EOF
========================================
阿里云 frps 已安装并启动
========================================
frp 版本: ${FRP_VERSION}
frps 监听端口: ${FRP_BIND_PORT} (frpc 连这个端口)
网站公网端口: ${REMOTE_WEB_PORT} (浏览器访问 http://${PUBLIC_IP}:${REMOTE_WEB_PORT}/ )

【务必在阿里云控制台 → 安全组 → 入方向】放行 TCP:
  - ${FRP_BIND_PORT}   (frp 隧道)
  - ${REMOTE_WEB_PORT} (网站)

Token（与 frpc 配置里 auth.token 必须一致，勿泄露）:
${TOKEN}

----------------------------------------
在你自己的电脑（Mac）上新建 frpc.toml:
----------------------------------------
serverAddr = "${PUBLIC_IP}"
serverPort = ${FRP_BIND_PORT}
auth.method = "token"
auth.token = "${TOKEN}"

[[proxies]]
name = "planner-web"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8787
remotePort = ${REMOTE_WEB_PORT}

然后本机先运行: cd personal-planner && npm start
再运行: ./frpc -c frpc.toml
浏览器打开: http://${PUBLIC_IP}:${REMOTE_WEB_PORT}/index.html
========================================
EOF
chmod 600 "$HINT"

echo ""
echo ">>> frps 已启动。请执行:"
echo "    cat $HINT"
echo ""
systemctl --no-pager status frps || true
