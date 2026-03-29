# demo — 个人规划站（Personal Planner）

本仓库中的**个人规划网站**位于目录 [`personal-planner/`](personal-planner/)。

## 一键启动（本机网站 + FRP 隧道）
脚本会先启动 `personal-planner/dev-server.js`，再启动 `frpc`，并根据 `personal-planner/frpc.toml` 输出本机与公网访问地址。

- 需先准备：`personal-planner/frpc.toml`（配置好 `serverAddr` 与 `remotePort`，以及 `auth.token`）
- 需已安装 `frpc`（命令名为 `frpc`）与 Node.js（>= 22）

```bash
./start.sh
```

本机访问：`http://127.0.0.1:8787/index.html`

## 环境要求
服务端使用内置模块 `node:sqlite`，低版本无法运行（Node.js >= 22）。

安装后检查：

```bash
node -v   # 应显示 v22.x 或更高
```

若使用 nvm：

```bash
cd personal-planner
nvm install   # 会读取 .nvmrc
nvm use
```

---

## 本机启动（必须先能本机访问）
在 `personal-planner` 目录下执行：

```bash
npm start
# 或
node dev-server.js
```

默认：

- 地址：`http://127.0.0.1:8787`
- 主页：`http://127.0.0.1:8787/index.html`

### 环境变量
| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8787` | HTTP 端口 |
| `HOST` | `127.0.0.1` | 监听网卡。仅本机访问保持默认即可；若要让**同一局域网内其他设备直连**本机 IP，可设为 `0.0.0.0`。 |

示例：

```bash
PORT=8787 HOST=127.0.0.1 npm start
```

数据文件：`personal-planner` 目录下的 `planner-data.sqlite3`（及 `personal-planner/backups/db/` 备份）。请自行做好备份。

---

## 阿里云一键配置（推荐）
已写好 **在服务器上执行的安装脚本** 与图文步骤，见 **[personal-planner/deploy/ALIYUN.md](personal-planner/deploy/ALIYUN.md)**（含安全组端口、`scp` 上传脚本、`frpc` 本机配置）。

---

## 与 Linux 服务器 + FRP 对接（公网访问）
典型结构：

1. **你的 Mac/PC** 上长期运行：`node dev-server.js`（监听 `127.0.0.1:8787` 即可）。
2. **同一台 Mac/PC** 上运行 **frpc**，把本机 `8787` 映射到 VPS 上的某个端口（或 HTTP 域名）。
3. **Linux VPS** 上运行 **frps**，对外开放该端口；你在浏览器访问 `http://你的VPS_IP:远程端口` 或配置的域名。

前端已按「当前访问的域名/端口」请求 `/api/storage` 等接口，经 FRP 转发后**无需改代码**。

---

### 1. VPS 上：frps（服务端）
在 [frp 发布页](https://github.com/fatedier/frp/releases) 下载对应 Linux 架构的包，解压后编辑 `frps.toml`（新版推荐 TOML；若你仍用 `frps.ini` 亦可，语义类似）。

**示例 `frps.toml`：**

```toml
bindPort = 7000
# 与 frpc 一致的密钥，务必改成强随机字符串
auth.token = "请改成很长很随机的 token"

# 可选：管理面板（不需要可删掉）
webServer.addr = "0.0.0.0"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "请修改"
```

在 VPS 上放行：

- **7000**（或你设的 `bindPort`）：frpc 连入用。
- **远程 HTTP 端口**：见下文 frpc 里 `remotePort`（例如 18080）。
- 若开管理面板，再放行 **7500**。

启动（路径按你实际解压位置）：

```bash
./frps -c frps.toml
# 生产环境建议用 systemd 守护
```

---

### 2. 本机：frpc（客户端）
下载 Mac 对应架构的 frp，与 frps **版本尽量一致**。

**方式 A — TCP 转发（最简单，适合先打通）**

`frpc.toml` 示例：

```toml
serverAddr = "你的VPS公网IP或域名"
serverPort = 7000
auth.token = "与 frps 完全一致的 token"

[[proxies]]
name = "planner-tcp"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8787
remotePort = 18080
```

含义：访问 `http://VPS_IP:18080` 即转发到你本机 `8787`。

本机先启动站点：

```bash
cd personal-planner && npm start
```

再启动 frpc：

```bash
./frpc -c frpc.toml
```

浏览器打开：`http://<VPS_IP>:18080/index.html`（端口以你 `remotePort` 为准）。

**方式 B — HTTP 类型 + 子域名（需 frps 配 `vhostHTTPPort` 与域名解析）**

若你已把 `*.example.com` 指到 VPS，可在 frps 增加 `vhostHTTPPort = 80`（或 443 + HTTPS 需再配合 nginx/caddy），frpc 使用 `type = "http"`、`customDomains = ["planner.example.com"]`。具体见 [frp 文档](https://github.com/fatedier/frp#readme)。

---

### 3. 联调检查清单
| 步骤 | 检查 |
|------|------|
| 本机 | `curl -s http://127.0.0.1:8787/login.html` 返回 HTML（API 需登录后才返回 200） |
| frpc | 日志里代理状态为 **start proxy success** |
| VPS 防火墙 / 安全组 | 已放行 `remotePort`（如 18080）与 frp `bindPort`（如 7000） |
| 公网 | 用手机 4G 打开 `http://VPS:18080/index.html` 试 |

---

## 账号与认证
服务端采用**邀请制注册**，所有 API 需登录后才能访问。

### 首次使用（管理员）
1. 启动服务后，控制台会打印一个**管理员注册码**（同时保存在 `.planner-access-code` 文件中）。
2. 打开登录页 → 点「去注册」→ 填写账号、密码、注册码 → 完成。
3. 已有数据的老账号（如从旧版升级）注册时**不需要填注册码**，直接设密码即可。

### 日常登录
账号密码存在服务端数据库，**任何设备**打开登录页输入账号密码即可，无需额外操作。

### 邀请新用户
每人一码，用过即失效。在 `personal-planner` 目录下执行：

```bash
# 生成邀请码（备注可选，方便追踪）
node generate-invite.js "给小王"

# 或用 npm 快捷方式
npm run invite -- "给小李"
```

运行后会打印邀请码，并显示所有已生成的邀请码及使用状态。将邀请码发给对方，注册时填入即可。

### 数据隔离
- 支持**多个注册账号**，规划、生活、统计、复盘等数据按账号**分库存储**（键名形如 `planner_acc_<标识>_原键名`），互不可见。
- **体验账号** `demo` / `123456`：与正式账号隔离（浏览器标签内独立存储、约 30 分钟会话、不参与云同步等），与旧版单独的「演示」账号已合并；原预留名 `test` 已废弃。
- **从旧版升级**：若本地仍有未分账套的「全局」数据，仅**数据归属主账号**（记录在 `planner_legacy_storage_owner_v1`）在**首次登录**时会把旧数据迁入其命名空间；此后新注册的账号均为空白数据。
- 头像与昵称等仍使用全局 `planner_user_profile_v1` 对象内按账号分字段存储。

---

## 安全提醒（公网必看）
- 所有 `/api/*` 端点均需服务端 session 认证，未登录请求一律返回 `401`。
- 敏感文件（数据库、服务端代码、配置文件等）已在静态服务中屏蔽，公网无法下载。
- FRP 务必设置 **强 `auth.token`**，且 **不要将 frps 的 7000 暴露给不可信网络而不做 IP 白名单或防火墙限制**。
- 生产建议：若有域名可加 **HTTPS**（Caddy / Nginx 反代 + 证书），FRP 可只转本地 HTTP，由边缘做 TLS。
- 本服务会同步个人规划数据到 SQLite，**勿把数据库文件提交到公开仓库**。

---

## Windows 用户
仍可使用 `personal-planner/start-planner.bat`（会打开浏览器并执行 `node dev-server.js`）。若需改端口，可先 `set PORT=8787` 再运行 bat，或在 bat 里自行增加 `set HOST=...`。

---

## 常见问题
**Q: 公网能打开页面，但数据不同步？**  
**A:** 确认本机 `dev-server.js` 在运行；浏览器应用页与 API 须同一域名端口（本仓库已优先走当前页面同源 API）。可强制指定（一般不必）：

```html
<script>window.__PLANNER_SYNC_ENDPOINT__ = 'https://你的域名/api/storage';</script>
```

**Q: Node 版本不够？**  
**A:** 必须升级到 22+，或使用 nvm/fnm 安装。

**Q: 备份到本机文件夹在公网页点不了？**  
**A:** `/api/pick-folder` 等依赖本机桌面环境，仅适合在本机浏览器使用；公网访问以在线同步为主。
