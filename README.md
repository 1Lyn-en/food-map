# 美食地图 Food Map

一个单用户、无账号体系的本地美食记录应用：上传食物照片，录入菜名 / 店名，通过高德地图搜索地址并选点，所有记录以 Marker 形式呈现在地图上。

- 前端：React 18 + Vite（`frontend/`，端口 5173）
- 后端：Express 4 + Node 24 内置 `node:sqlite`（`backend/`，端口 3001）

## 环境要求

- Node.js v24+（依赖 `node:sqlite`，建议 v24.18.0+）
- 高德地图 Web JS API Key（可选，配置后可显示地图）

## 快速开始

```bash
# 1. 安装依赖（后端 + 前端）
npm run install:all

# 2. 配置高德 Key（必须，否则地图无法加载）
copy frontend\.env.example frontend\.env
#   编辑 frontend\.env，将 VITE_AMAP_KEY 填入你的高德 Web(JS API) Key
#   如使用「安全密钥」校验，再填入 VITE_AMAP_SECURITY_CODE

# 3. 写入演示数据（可选，便于首次体验）
npm run seed

# 4. 一键启动前后端
npm run dev
```

启动后访问 http://localhost:5173 ，即可完成「新增 → 搜索落点 → 保存 → 地图查看 → 编辑 → 删除」全流程演示。

> 未配置 `VITE_AMAP_KEY` 时，页面会显示配置提示横幅，侧栏记录列表与接口仍可正常使用，但地图与选点功能不可用。

## 部署前：高德 Key 域名白名单（必须）

`VITE_AMAP_KEY` 与 `VITE_AMAP_SECURITY_CODE` 均绑定域名。部署到正式环境后，朋友访问的**域名（或 IP）必须加入白名单**，否则地图无法加载：

1. 打开高德开放平台控制台 → 应用管理 → 你的 Key
2. 「服务平台」选 **Web端(JS API)**
3. 「域名白名单」填入你实际的访问域名，如 `https://food.example.com`（**不要**只填 `localhost`）
4. 若启用了「安全密钥」校验，需在 Key 设置里配置对应服务；`frontend/.env` 中的 `VITE_AMAP_KEY` / `VITE_AMAP_SECURITY_CODE` 换成正式环境的 Key
5. 改完 `.env` 后必须重新 `npm run build`（Key 构建时注入，构建产物里不读取 `.env`）

> 同一 Key 可用于多个域名白名单。内网/IP 部署时浏览器定位需 HTTPS，见上文。

## 单进程生产启动（后端托管前端产物）

构建后由后端单进程对外提供页面 + API + 图片，无需 Vite dev server 与代理：

```bash
npm run build          # 产出 frontend/dist
NODE_ENV=production npm start   # 后端启动，默认 http://localhost:3001
```

## 目录结构

```
food-map/
├── backend/                # Express 4 + node:sqlite
│   ├── src/
│   │   ├── db.js           # node:sqlite 封装（all/get/run/tx）
│   │   ├── schema.sql      # food_entries 建表
│   │   ├── validators.js   # zod 校验
│   │   ├── server.js       # REST API + /uploads 静态服务
│   │   ├── seed.js         # 演示数据
│   │   └── png.js          # 生成占位 PNG（seed/测试用）
│   ├── test/api.test.js    # node --test 集成测试
│   ├── data/               # food-map.db（gitignore）
│   └── uploads/            # 上传图片（gitignore）
└── frontend/               # React 18 + Vite
    ├── src/main.jsx        # 地图 + 侧栏 + 表单
    └── src/styles.css
```

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm run install:all` | 安装后端与前端依赖 |
| `npm run dev` | 同时启动后端(3001)与前端(5173) |
| `npm test` | 运行后端集成测试 |
| `npm run seed` | 写入 2-3 条演示数据 |
| `npm run build` | 构建前端产物 |

## 环境变量

| 变量 | 说明 |
|---|---|
| `VITE_AMAP_KEY` | 高德 Web(JS API) Key，前端必填 |
| `VITE_AMAP_SECURITY_CODE` | 高德安全密钥（如启用） |
| `DB_PATH` | 后端数据库路径（默认 `backend/data/food-map.db`） |
| `UPLOADS_DIR` | 后端上传目录（默认 `backend/uploads/`） |
| `PORT` | 后端端口（默认 3001） |

## API 一览

- `GET    /api/entries`            记录列表（created_at 倒序）
- `POST   /api/entries`            multipart：字段 + 可选图片
- `PUT    /api/entries/:id`        更新（可替换图片）
- `DELETE /api/entries/:id`        删除记录及图片
- `GET    /uploads/<file>`         静态图片访问

字段：`dish_name`（必填）、`restaurant_name`（必填）、`longitude`/`latitude`（必填，GCJ-02）、`address_text`、`rating`（1-5 可选）、`notes`、`image`（jpg/jpeg/png/webp，≤5MB）。