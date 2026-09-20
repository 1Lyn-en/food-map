# 验收证据 Evidence

> 历史验证快照（2026-08-02）。当前状态与最新可复现结果请以 [项目完成度评估](project-status.md) 和 CI 为准。

**项目**：个人美食地图 (Food Map)
**位置**：仓库根目录
**验证日期**：2026-08-02
**Node 版本**：v24.18.0

---

## 标准 1：后端 DB 建模 + REST API + multer + zod 校验

### DB 表 `food_entries`
- `backend/src/schema.sql`：建表 + 坐标索引 `idx_entries_coords`
- `backend/src/db.js`：`node:sqlite` 封装（all/get/run/tx），沿用 test_01_2 写法
- `backend/src/seed.js`：3 条演示数据（北京烤鸭、生煎包、手工酸奶）
- DB 验证：`node:sqlite` 直接查询确认 3 条记录存在

### API 端点
- `GET /api/entries` → 200，按 created_at DESC 排序
- `POST /api/entries` → 201，multipart 支持图片上传，zod 校验必填字段 / 坐标范围 / rating 范围
- `PUT /api/entries/:id` → 200，可替换图片并删除旧文件
- `DELETE /api/entries/:id` → 204，同时删除数据库行和图片文件
- `GET /uploads/*` → 200，静态图片服务（image/png）

### 测试
- `npm test` → **10/10 通过**：
  - empty list, create with image + file serving, create without image/rating
  - rejects invalid bodies (missing fields, bad coords, bad rating)
  - rejects unsupported file type
  - update + replace image deletes old file
  - update without new image keeps existing
  - list order correctness
  - delete removes row + image file
  - delete nonexistent returns 404

### CRUD 实时验证 (curl)
```
POST /api/entries       → 201 (重庆小面, with PNG image)
GET  /uploads/xxx.png   → 200 image/png
PUT  /api/entries/4     → 200 (更新成功)
DELETE /api/entries/4   → 204 (删除成功)
```

---

## 标准 2：前端 AMap 渲染 + Marker + inputtips

### 高德地图加载
- `frontend/src/main.jsx`：`loadAmap()` 动态注入 AMap JS API 2.0 脚本
- Key 通过 `import.meta.env.VITE_AMAP_KEY` 读取
- 安全密钥通过 `VITE_AMAP_SECURITY_CODE` 可选支持
- 未配置 Key 时：显示配置提示横幅，列表/接口仍正常

### Marker 可视化
- 加载全部 entries 为 AMap Marker
- 自定义 marker 内容（`food-marker` CSS）
- 新增记录后高亮新 Marker（3 秒橙色高亮动画）

### InfoWindow
- 点击 Marker → InfoWindow 弹出卡片：
  - 图片（或默认 emoji）
  - 菜名、店名
  - 地址、评分（★ 星级）、备注
  - 创建时间
  - 编辑 / 删除按钮

### inputtips 地址搜索
- 使用 `AMap.AutoComplete` 搜索联想
- 下拉候选列表，点击选中 → 自动落点 + 记录地址文本
- 通过 `AMap.PlaceSearch` 获取详情
- 也支持直接在地图上点击落点

---

## 标准 3：新增/编辑/删除表单完整闭环

### 新增记录
- 表单模态框（淡入动画）
- 图片上传：即时预览（object URL），替换图片，格式/大小校验
- 菜名 / 店名 / 经纬度：必填校验，保存前检查
- 地址搜索 + 地图选点（temp marker 拖动定位）
- 评分：1-5 星可选（点击切换 / 再次点击取消）
- 备注：多行文本可选
- 保存后：地图刷新，新 Marker 高亮 + 居中定位

### 编辑记录
- 复用同一表单，预填全部字段
- 保留原图片，支持替换
- 保存时 PUT 更新

### 删除记录
- 二次确认（`window.confirm`）
- 删除后地图刷新

---

## 标准 4：一键启动 `npm run dev`

```
$ npm run dev

[0] Food Map API listening on http://localhost:3001
[1] VITE v8.2.0  ready in 465 ms
[1]   Local:   http://localhost:5173/
```

- concurrently 同时启动后端 (:3001) 与前端 (:5173)
- 前端构建：`npm run build` → 1564 modules，849ms，产出 dist/

---

## 标准 5：环境变量 + .gitignore

- `frontend/.env.example`：`VITE_AMAP_KEY=your_amap_web_js_api_key`，含`VITE_AMAP_SECURITY_CODE`可选
- 前端 main.jsx 读取 `import.meta.env.VITE_AMAP_KEY`
- `.gitignore` 排除：
  - `node_modules/`
  - `dist/`
  - `.env` / `.env.local`
  - `backend/uploads/`
  - `backend/data/`
  - `*.log`

---

## 标准 6：测试数据全流程验证

### 3 条演示数据（seed）
| ID | 菜名 | 店名 | 坐标 | 评分 |
|----|------|------|------|------|
| 1 | 北京烤鸭 | 全聚德（王府井店） | 116.41, 39.91 | 5 |
| 2 | 生煎包 | 老盛昌汤包（南京东路店） | 121.48, 31.24 | 4 |
| 3 | 手工酸奶 | 三里屯太古里北区 | 116.46, 39.94 | 3 |

### 全流程验证
1. `npm run seed` → 3 条数据写入 + 占位 PNG 生成
2. 后端测试 `npm test` → 10/10 pass
3. 后端启动 → `GET /api/entries` 返回 3 条
4. CRUD 真实验证：POST(201) → GET /uploads(200) → PUT(200) → DELETE(204)
5. 前端构建 → 849ms 无报错
6. `npm run dev` → 后端 :3001 + 前端 :5173 同时启动

### 已知限制
- 需要在高德开放平台申请 Web(JS API) Key 才能看到地图和选点功能
- 未配置 Key 时：显示提示横幅，列表/API 仍可正常使用
- 桌面浏览器优先（Chrome/Edge 测试通过）
