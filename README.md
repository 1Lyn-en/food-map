# Food Map 美食地图

一个基于 React、Express 与 SQLite 的自托管美食记录应用。可通过地图保存餐厅位置、图片、评分和标签，并支持本地身份、房间共享、筛选统计、导入导出与 PWA 安装。

## 当前状态

项目已具备可运行的完整体验，适合本地使用、小范围可信用户共享和继续开发；当前身份机制是浏览器本地 UUID，不是生产级认证，因此不建议直接暴露到不可信公网。

- 后端集成测试：44 项
- 前端端到端测试：8 项
- 生产构建：Vite
- 运行时：Node.js 22.5+（推荐 Node.js 24 LTS，使用内置 `node:sqlite`）

详细评估见 [docs/project-status.md](docs/project-status.md)，历史需求与设计资料见 [docs/](docs/)。

## 功能概览

- 美食记录新增、编辑、软删除、恢复和永久删除
- 多图上传、压缩、缩略图、排序与封面设置
- 高德地图搜索、选点、逆地理编码、定位与 Marker 展示
- 标签、时间、评分、价格、用餐类型、收藏和图片筛选
- 统计面板、JSON/CSV 导出、JSON 导入、SQLite 备份下载
- 本地用户身份、房间码共享、成员列表和记录可见性
- 亮/暗主题、响应式布局、PWA 与基础离线应用壳

## 技术栈

- 前端：React 18、Vite 8、Recharts、Lucide React、Playwright
- 后端：Express 4、Node.js `node:sqlite`、Zod、Multer、Sharp
- 数据：SQLite；上传文件存放在本地目录

## 快速开始

### 1. 环境要求

- Node.js 22.5+（推荐使用 Node.js 24 LTS）
- npm 10+
- 高德地图 Web JS API Key（地图功能需要）

### 2. 安装依赖

```bash
npm run install:all
```

### 3. 配置环境变量

Windows PowerShell：

```powershell
Copy-Item frontend/.env.example frontend/.env
```

macOS / Linux：

```bash
cp frontend/.env.example frontend/.env
```

编辑 `frontend/.env`：

```dotenv
VITE_AMAP_KEY=your_amap_web_js_api_key
VITE_AMAP_SECURITY_CODE=your_amap_security_code
```

`frontend/.env` 已被 Git 忽略，请勿提交真实密钥。

### 4. 启动开发环境

```bash
npm run dev
```

访问 <http://localhost:5173>。未配置地图 Key 时，API 和侧栏仍可使用，但地图与选点不可用。

### 5. 可选：写入演示数据

```bash
npm run seed
```

## 验证

```bash
# 后端集成测试
npm test

# 前端生产构建
npm run build

# 首次运行 E2E 前安装浏览器
npm run e2e:install

# 前端端到端测试
npm run test:e2e

# 完整检查
npm run verify
```

## 生产运行

```bash
npm run build
npm start
```

后端默认监听 <http://localhost:3001>，并在 `frontend/dist` 存在时托管前端页面。

生产部署前至少需要：

1. 将正式域名加入高德 Key 的域名白名单，并重新构建前端。
2. 使用 HTTPS；浏览器定位功能在非 localhost 环境需要安全上下文。
3. 持久化挂载 `backend/data`、`backend/uploads` 与 `backend/backups`。
4. 设置 `CORS_ORIGINS`（多个来源用逗号分隔），或保持前后端同源。
5. 在反向代理层增加访问控制；当前本地 UUID 不能替代认证。

## 环境变量

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `VITE_AMAP_KEY` | 高德 Web JS API Key | 空 |
| `VITE_AMAP_SECURITY_CODE` | 高德安全密钥 | 空 |
| `PORT` | 后端监听端口 | `3001` |
| `DB_PATH` | SQLite 数据库路径 | `backend/data/food-map.db` |
| `UPLOADS_DIR` | 上传文件目录 | `backend/uploads` |
| `BACKUPS_DIR` | 备份目录 | `backend/backups` |
| `FRONTEND_DIST` | 前端构建产物目录 | `frontend/dist` |
| `CORS_ORIGINS` | 允许的跨域来源，逗号分隔 | `http://localhost:5173` |

## 项目结构

```text
food-map/
├─ .github/workflows/       # GitHub Actions
├─ docs/                    # PRD、路线、设计与验证记录
├─ backend/
│  ├─ scripts/              # 维护脚本
│  ├─ src/                  # API、数据库与校验
│  └─ test/                 # Node 集成测试
├─ frontend/
│  ├─ e2e/                  # Playwright 测试
│  ├─ public/               # PWA 静态资源
│  └─ src/                  # React 应用
├─ CONTRIBUTING.md
├─ SECURITY.md
└─ package.json             # 根级开发、构建与验证入口
```

运行时目录（数据库、上传、备份、构建和测试产物）不会提交到 Git。

## API 摘要

- `/api/entries`：记录 CRUD、筛选、分页、回收站、统计
- `/api/tags`：标签 CRUD
- `/api/users`：本地用户资料
- `/api/groups`：共享房间与成员
- `/api/export`、`/api/import`：数据导入导出
- `/api/backup/download`：SQLite 备份下载
- `/api/health`：健康检查

## 文档

- [项目完成度评估](docs/project-status.md)
- [产品需求](docs/product-requirements.md)
- [实现路线](docs/roadmap.md)
- [UI 设计方案](docs/ui-design.md)
- [验证记录](docs/verification.md)
- [贡献指南](CONTRIBUTING.md)
- [安全说明](SECURITY.md)

## License

本项目采用 [MIT License](LICENSE)。
