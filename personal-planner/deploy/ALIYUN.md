# 阿里云 + 本机个人规划站（公网访问）

网站跑在你**自己的电脑**上，阿里云只跑 **frp 服务端**，把公网端口转到你电脑的 `8787`。  
我无法替你执行 `ssh`，按下面顺序操作即可。

---

## 一、阿里云服务器（SSH `aliyun` 登录后）

### 1. 上传并执行安装脚本

**方式 A — 本机已有项目目录时**，把脚本拷到服务器：

```bash
# 在你 Mac 上（路径按你实际项目）
scp personal-planner/deploy/install-frps-aliyun.sh aliyun:/tmp/
```

SSH 上服务器：

```bash
ssh aliyun
sudo bash /tmp/install-frps-aliyun.sh
```

**方式 B — 一行下载**（若你把脚本放到了可访问的 URL，可改用 wget；否则用方式 A）。

### 2. 看 Token 和 frpc 配置片段

```bash
sudo cat /opt/frp/frpc-本机配置说明.txt
```

把里面的 **token**、**公网 IP**、**端口**记下来。

### 3. 阿里云安全组（必做，否则外网进不来）

控制台 → **云服务器 ECS** → 你的实例 → **安全组** → **配置规则** → **入方向**，添加：

| 端口 | 用途 |
|------|------|
| **TCP 7000** | frp 隧道（`frpc` 连服务器） |
| **TCP 18080** | 浏览器访问网站（若你改了 `REMOTE_WEB_PORT`，这里改成同一端口） |

来源：`0.0.0.0/0`（先打通；以后可把 7000 限制为你家宽带公网 IP，更安全）。

### 4. 确认 frps 在跑

```bash
sudo systemctl status frps
```

---

## 二、你自己的 Mac

### 1. 本机先跑网站

```bash
cd /path/to/personal-planner
npm start
```

保持终端不要关（或用 `tmux`/后台方式常驻）。

### 2. 安装 frpc（与服务器 frp 版本一致，建议 v0.67.0）

打开 [frp Releases](https://github.com/fatedier/frp/releases)，下载 **frp_*_darwin_amd64.tar.gz**（Intel）或 **darwin_arm64**（M 系列）。

解压后进入目录，把服务器上 `frpc-本机配置说明.txt` 里的 **frpc 配置**抄成 `frpc.toml`，或复制本仓库 `deploy/frpc.toml.example` 再改 `serverAddr`、`auth.token`、`remotePort`。

### 3. 启动 frpc

```bash
./frpc -c frpc.toml
```

日志里应出现代理成功类似信息。

### 4. 浏览器访问

```
http://你的阿里云公网IP:18080/index.html
```

（端口与 `remotePort`、安全组一致。）

---

## 三、常用命令

| 场景 | 命令 |
|------|------|
| 服务器上看 frps 日志 | `sudo journalctl -u frps -f` |
| 重启 frps | `sudo systemctl restart frps` |
| 改网站公网端口 | 重装脚本时设环境变量 `REMOTE_WEB_PORT=8080`；或改 frps + 安全组 + frpc 的 `remotePort` |

---

## 四、注意

- **电脑关机或休眠**：网站和隧道都会断，公网无法访问。
- **改 demo 密码**：公网务必改掉弱口令（见主 README 安全说明）。
- **Token 保密**：`auth.token` 等同隧道密码，不要提交到 Git。

更通用的 FRP 说明见上级 [README.md](../README.md)。
