

# 美食地图 v1.0 + v2.0 实现方案（精简版）

> 基于 PRD v1.0 与现有代码差距分析，**删减复杂低价值功能**，合并相关小功能。
> v1 个人版 **11 个 Prompt**，v2 多人协作版 **5 个 Prompt**，共 **16 个**。

---

## 📊 现状与删减说明

### 已完成（无需再做）
后端 CRUD + 图片上传压缩 + 软删除 + 标签/统计/导入导出；前端地图 + Marker聚合 + 表单 + 筛选排序 + 统计面板。

### ✂️ 已删减的功能（及原因）

| 功能 | 原因 |
|------|------|
| ~~多人共享（房间码）~~ | 需新增3张表+7个API+大量前端，复杂度最高；个人美食地图v1.0非必需 |
| ~~IndexedDB离线支持~~ | 已有JSON导出备份，离线读写同步逻辑复杂，投入产出比低 |
| ~~热力图~~ | 个人数据量小（几十到几百条），聚合Marker已足够；HeatMap数据处理复杂 |
| ~~卫星地图样式~~ | 个人记录美食场景极少用卫星图，只保留标准/暗色 |
| ~~TypeScript迁移~~ | 纯工程化重构，不影响功能，JS完全够用 |
| ~~TailwindCSS迁移~~ | 现有CSS已可用，样式重构工作量大且无功能收益 |
| ~~批量打标签/导出~~ | 批量删除已覆盖主要场景，其他批量操作使用频率低 |
| ~~30天自动清理~~ | 回收站手动清空即可，定时任务增加复杂度 |
| ~~ZIP图片打包导出~~ | JSON导出已含图片URL，ZIP打包场景少 |
| ~~导入详细预览/覆盖模式~~ | 合并导入已够用，覆盖模式危险且使用极少 |

---

## 🚀 v1 个人版实现 Prompt（11个，按优先级）

---

### 阶段一：核心体验（4个，建议先做）

---

#### Prompt 1: 位置增强 — EXIF定位 + 浏览器定位 + 逆地理编码

```
## 目标
让用户上传照片或点一下按钮就能自动填充位置，不用手动搜地址。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- 表单组件：frontend/src/components/EntryForm.jsx
- 地图逻辑在 frontend/src/main.jsx，已加载高德JS API
- 当前：上传图片不读EXIF，没有"定位我"按钮，地图选点不自动填地址

## 需求
1. 上传图片后自动读EXIF中的GPS坐标（用 exif-js 或自己解析）
   - 检测到GPS时，在地址框下方显示一行小字："📷 照片含位置信息，[填充位置]"
   - 点"填充位置"自动设经纬度 + 调高德Geocoder拿地址文本
2. 地址搜索框旁边加一个"📍 定位我"按钮
   - 点了调 navigator.geolocation.getCurrentPosition
   - 成功后自动落点 + 逆地理编码填地址
   - 定位中按钮转圈，失败/拒绝时Toast提示
3. 地图上点击选点后，自动调Geocoder把坐标转成地址文本填到表单

## 技术约束
- 高德 Geocoder 插件：AMap.plugin('AMap.Geocoder', ...)
- 坐标统一GCJ-02，不用转换
- 没有GPS的图片不显示提示，静默跳过
- 保持现有UI风格，按钮用lucide图标

## 验收
- 传带GPS的照片出现"填充位置"链接，点了能自动填地址和坐标
- "定位我"按钮能拿到当前位置并填地址
- 地图点选后地址自动填上
- 不影响现有手动搜索地址功能
```

---

#### Prompt 2: 图片管理 — 拖拽排序 + 设为封面

```
## 目标
多图上传后可以拖拽排序，指定哪张作为封面。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- EntryForm.jsx 中图片预览是网格布局
- 后端 entry_images 表已有 sort_order 字段
- food_entries 表有 cover_image 字段

## 需求
1. 图片网格支持拖拽排序（用原生HTML5 Drag API，零依赖）
   - 拖拽时被拖的半透明，目标位置显示插入线
   - 支持新上传的和已有的图片混排
2. 每张图hover时右上角显示"★ 设封面"按钮
   - 当前封面图左上角显示"封面"角标（橙色小标签）
   - 封面自动排第一位
3. 保存时：
   - 按 sort_order 顺序提交图片
   - 封面图路径写入 cover_image 字段
4. 列表卡片和地图InfoWindow中显示封面图

## 技术约束
- 不引入dnd库，用原生dragstart/dragover/drop事件
- 移动端可以先不支持拖拽（保持点击删除即可）
- 后端PUT接口需要处理图片顺序（检查现有逻辑，不支持就补上）

## 验收
- 图片可以拖拽换顺序
- 可以设封面，封面有角标
- 保存后重新打开，顺序和封面正确
- 列表和地图信息窗显示封面图
```

---

#### Prompt 3: 筛选增强 — 时间范围 + 只看有图

```
## 目标
给筛选面板加上时间范围筛选和"只看有图"开关。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- Toolbar.jsx 中已有 FilterPanel 组件
- 后端 GET /api/entries 已支持 date_from / date_to 参数
- 现有筛选：标签、评分、价格、用餐类型、收藏

## 需求
1. 时间范围筛选（加在筛选面板最上面）
   - 快捷按钮：今天 / 本周 / 本月 / 今年
   - 下面一行两个日期选择器：开始日期 ~ 结束日期（input type=date）
   - 点快捷按钮自动设日期范围
   - 选中的快捷按钮高亮
2. "只看有图"复选框（加在"只看收藏"下面）
   - 后端确认支持 has_image 参数，不支持就加（WHERE EXISTS entry_images）
3. 筛选按钮角标数字更新（包含新筛选条件）
4. "清除全部筛选"能清掉新加的条件

## 技术约束
- 用原生 input type=date，不引入日期组件库
- 快捷按钮的日期计算注意时区（用本地时间）
- 筛选变更后自动 refresh()

## 验收
- 点"本周"只显示本周记录
- 自定义日期范围生效
- "只看有图"只显示带图片的记录
- 筛选计数正确，清除按钮有效
```

---

#### Prompt 4: 地图样式切换 — 标准/暗色

```
## 目标
工具栏加一个按钮切换标准地图和暗色地图。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- 地图初始化在 main.jsx
- Toolbar.jsx 有工具按钮组

## 需求
1. 工具栏加一个地图样式按钮（用 Map 或 Moon 图标）
   - 点击在"标准"和"暗色"之间切换
   - 标准：默认样式
   - 暗色：mapStyle: 'amap://styles/dark'
2. 用 map.setMapStyle() 切换，不重建地图实例
3. 选择存 localStorage，刷新后保持
4. 为后续暗色模式预留：检查 localStorage 里的 theme 设置，如果是 dark 就默认暗色地图

## 技术约束
- 用 AMap.Map 的 setMapStyle 方法
- 切换不影响Marker和InfoWindow
- 代码改动量小，只改Toolbar和main.jsx两处

## 验收
- 点按钮能切换标准/暗色地图
- 刷新后保持上次选择
- Marker和信息窗正常显示
```

---

### 阶段二：数据与操作（3个）

---

#### Prompt 5: 批量删除 + 回收站

```
## 目标
侧栏支持多选批量删除，删除的记录进回收站可恢复或清空。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- Sidebar.jsx 是记录列表
- 后端已有 batch-delete 和 restore 接口
- food_entries 有 deleted_at 字段
- 当前删除后只有5秒撤销，没有持久回收站

## 需求
1. 侧栏顶部加"多选"按钮
   - 进入多选模式：每条左边出现复选框，底部出现操作栏
   - 操作栏：已选N条 + [批量删除] + [取消]
   - 支持全选复选框
2. 批量删除：确认后调 batch-delete API，刷新列表和地图
3. 回收站入口：侧栏底部加"🗑️ 回收站（N）"
   - 点了打开回收站列表（模态框或切到回收站视图）
   - 每条显示：缩略图、菜名、店名、删除时间
   - 每条有[恢复]按钮，调restore接口
   - 底部有[清空回收站]按钮（二次确认）
4. 后端补充（如没有）：
   - GET /api/entries/trash — 回收站列表（deleted_at IS NOT NULL）
   - DELETE /api/entries/:id/permanent — 永久删除单条（同时删图片文件）
   - DELETE /api/entries/trash — 清空回收站

## 技术约束
- 回收站用模态框实现，不做新页面
- 永久删除必须二次确认
- 清空回收站时循环删除图片文件
- 不做30天自动清理，手动清空即可

## 验收
- 多选模式可以选多条并批量删除
- 删除的记录出现在回收站
- 可以恢复记录
- 可以永久删除单条和清空回收站
- 正常列表不显示已删除记录
```

---

#### Prompt 6: Recharts 图表升级（简化版）

```
## 目标
把统计面板的纯CSS条形图换成 Recharts 专业图表。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- StatsPanel.jsx 当前用CSS画条形图
- 后端 /api/entries/stats 已返回完整数据

## 需求
只做两个最有价值的图表，其他保持现状：
1. 月度趋势：用 ComposedChart
   - 柱状图显示每月记录数
   - 折线显示每月消费金额（右Y轴）
   - 最近12个月
   - 鼠标悬停显示Tooltip
2. 标签分布：用 PieChart
   - 饼图显示各标签占比
   - 图例显示标签名+数量
   - 颜色用标签自己的color
3. 概览卡片、评分分布、价格分布、用餐类型保持现有CSS条形图（够用）

## 技术约束
- npm install recharts
- 图表宽度响应式（用 ResponsiveContainer）
- 空数据显示"暂无数据"
- 配色和现有暖色调一致

## 验收
- 月度趋势图正确显示柱状+折线
- 标签饼图正确显示占比
- 悬停有Tooltip
- 其他统计项保持不变
```

---

#### Prompt 7: 快捷键 + 草稿自动保存（简化版）

```
## 目标
三个常用快捷键 + 表单文字草稿防丢失。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- main.jsx 有 openForm/closeForm
- EntryForm.jsx 是表单组件

## 需求
1. 快捷键（只做3个最常用的）：
   - Ctrl/Cmd + N：打开新建表单
   - Ctrl/Cmd + S：表单打开时保存（阻止浏览器默认保存）
   - Escape：关闭当前模态框/表单
   - 在input/textarea里打字时不触发
2. 草稿保存（只存文字，不存图片）：
   - 表单输入时防抖2秒存到 localStorage（key: food-map-draft）
   - 存的字段：dish_name, restaurant_name, address_text, meal_type, price_per_person, rating, notes, tag_ids, meal_date, longitude, latitude
   - 打开新建表单时检查有没有草稿，有就弹个小提示："有未完成的草稿，[恢复] [丢弃]"
   - 保存成功后清除草稿
   - 手动关表单时不提示（下次打开还能恢复）

## 技术约束
- 用原生 keydown 事件监听，不引库
- 草稿只存文字，图片不存（localStorage容量有限）
- 快捷键判断 e.target.tagName，在输入框里不触发

## 验收
- Ctrl+N打开表单，Ctrl+S保存，Esc关闭
- 输入内容后刷新页面，打开表单提示恢复草稿
- 保存成功后草稿清除
```

---

### 阶段三：体验打磨（4个）

---

#### Prompt 8: 搜索体验 — 历史记录 + 关键词高亮

```
## 目标
搜索框记住历史，搜索结果里关键词高亮。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- 搜索框在 Toolbar.jsx
- Sidebar.jsx 显示记录列表
- 搜索是回车触发，刷新列表

## 需求
1. 搜索历史：
   - 搜索后把关键词存 localStorage（最近5条，去重）
   - 搜索框聚焦且没输入内容时，下方显示历史记录下拉
   - 点历史词直接搜索
   - 每条右边有×删除单个，底部有"清除历史"
2. 关键词高亮：
   - 搜索结果列表中，菜名/店名/地址里匹配的词高亮
   - 高亮样式：橙色背景 + 深色字
   - 用正则替换，注意转义特殊字符
   - InfoWindow里也高亮（可选，简单做）

## 技术约束
- 历史存 localStorage，最多5条
- 高亮用 split + map 渲染，不用 dangerouslySetInnerHTML（防XSS）
- 不做实时搜索建议，保持回车搜索

## 验收
- 搜索过的词出现在历史下拉
- 点历史词能搜索
- 搜索结果中关键词高亮显示
- 可以删除历史记录
```

---

#### Prompt 9: 加载骨架屏 + 空状态优化

```
## 目标
加载时显示骨架屏不白屏，空状态有emoji图标和引导。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- Sidebar.jsx 列表，StatsPanel.jsx 统计
- 当前空状态只有文字，加载时没有骨架

## 需求
1. 列表骨架屏：
   - loading时显示3个灰色骨架卡片（左侧方块+右侧3行灰条）
   - 灰条有shimmer动画（CSS渐变background-position动画）
2. 统计面板骨架：
   - 6个概览卡片灰色方块
   - 图表区域灰色块
3. 空状态优化（用emoji+文字+按钮，不画插画）：
   - 无记录：🍜 "还没有美食记录" + [记录第一顿] 按钮
   - 筛选无结果：🔍 "没有找到符合条件的记录" + [清除筛选] 按钮
   - 搜索无结果：🤔 "未找到相关记录"
   - 回收站空：🗑️ "回收站是空的"

## 技术约束
- 骨架屏纯CSS实现，不引库
- 空状态用emoji，不用SVG图片
- 骨架动画用 prefers-reduced-motion 媒体查询禁用

## 验收
- 加载时显示骨架屏，数据到了平滑替换
- 各种空状态显示emoji+文字+按钮
- 按钮点击能触发对应操作
```

---

#### Prompt 10: 暗色模式（简化版）

```
## 目标
一键切换暗色主题，UI和地图一起变暗。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- 样式都在 frontend/src/styles.css
- Prompt 4 已实现地图暗色切换
- 用CSS变量实现主题切换

## 需求
1. 工具栏加暗色切换按钮（Sun/Moon图标）
   - 点击切换，给 <html> 或 <body> 加 data-theme="dark"
   - 选择存 localStorage
2. 在 styles.css 顶部定义CSS变量：
   :root { --bg: #fff; --text: #1F2937; --text-secondary: #6B7280; --border: #E5E7EB; --card-bg: #fff; ... }
   [data-theme="dark"] { --bg: #111827; --text: #F9FAFB; --text-secondary: #9CA3AF; --border: #374151; --card-bg: #1F2937; ... }
3. 把现有样式中的硬编码颜色替换为var(--xxx)
   - 重点改：body背景、卡片、文字、边框、输入框、按钮、模态框、侧栏、工具栏
   - 主色 #FF6B35 不变
4. 暗色模式时自动切换地图为暗色（和Prompt 4联动）

## 技术约束
- 用CSS变量，不用重新写一套暗色样式
- 过渡效果：body { transition: background 0.3s, color 0.3s; }
- 毛玻璃效果暗色下调低透明度
- 不用做"跟随系统"，手动切换即可

## 验收
- 点按钮切换亮/暗主题
- 所有主要UI元素在暗色下正常显示
- 暗色时地图也变暗
- 刷新后保持主题选择
```

---

---

#### Prompt 11: iOS 毛玻璃（Glassmorphism）UI 风格

```
## 目标
将整个应用的浮层UI改为类似 iOS / macOS 的毛玻璃效果（frosted glass），
让地图作为背景透出来，工具栏、侧栏、弹窗等浮在地图上方，呈现通透质感。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- 样式文件：frontend/src/styles.css
- 主要浮层组件：
  - 侧栏 .sidebar（左侧记录列表）
  - 工具栏 .toolbar（顶部搜索筛选）
  - 筛选面板 .filter-panel
  - 模态框 .modal / .modal-overlay
  - 统计面板 .stats-*
  - 数据管理面板
  - Toast 通知 .toast
  - 地图信息窗（高德 InfoWindow，自定义 innerHTML）
  - 底部操作栏（批量操作时出现）
- 当前这些元素大多是纯白背景 + 阴影，没有毛玻璃效果

## 核心效果（iOS 风格要点）
1. 背景模糊：backdrop-filter: blur(20px) saturate(180%);
2. 半透明底色：亮色模式 rgba(255,255,255,0.72)，暗色模式 rgba(28,28,30,0.72)
3. 高光边框：1px solid rgba(255,255,255,0.3)（亮色）/ rgba(255,255,255,0.1)（暗色）
4. 柔和投影：0 8px 32px rgba(0,0,0,0.08~0.12)，不要太重
5. 大圆角：卡片/面板 16px~20px，按钮 10px~12px，胶囊标签保持20px
6. 文字对比：毛玻璃上的文字颜色要足够深/浅，保证可读性
7. 过渡：hover/active 时背景透明度微调（如0.72→0.80），有微妙反馈

## 具体需求
1. 侧栏 .sidebar：
   - 毛玻璃背景，顶部和底部加渐隐遮罩（内容滚动到边缘自然淡出）
   - 列表卡片本身不做毛玻璃（避免嵌套模糊性能问题），用纯白/暗色卡片
   - 或者卡片也用极轻微的透明（rgba(255,255,255,0.5)），看效果定

2. 工具栏 .toolbar：
   - 毛玻璃背景，固定在顶部
   - 搜索框嵌入感：搜索框背景比工具栏更不透明一点（rgba(255,255,255,0.5)）
   - 按钮 hover 时背景微亮

3. 筛选面板 .filter-panel：
   - 毛玻璃背景，从工具栏下拉
   - 与工具栏无缝衔接（圆角只在底部）

4. 模态框 .modal：
   - 遮罩层不用毛玻璃，用半透明黑 rgba(0,0,0,0.3)
   - 弹窗本身毛玻璃背景
   - 弹窗内的输入框/按钮用实色或微透明

5. 地图信息窗（InfoWindow）：
   - 这是高德地图的自定义DOM，需要改 main.js 中 openInfo() 的 innerHTML
   - 信息窗卡片改成毛玻璃背景 + 大圆角 + 柔和阴影
   - 去掉高德默认的白色气泡样式
   - 箭头指向Marker（用CSS三角形或border实现）

6. Toast 通知：
   - 毛玻璃背景，底部居中
   - 成功/错误状态用主色/红色的淡背景

7. 暗色模式适配（和 Prompt 10 配合）：
   - 亮色：rgba(255,255,255,0.72) + blur(20px)
   - 暗色：rgba(28,28,30,0.78) + blur(20px)
   - 暗色下边框高光改为 rgba(255,255,255,0.08)

8. 兼容降级：
   - 不支持 backdrop-filter 的浏览器（很少了），降级为更不透明的实色背景
   - 用 @supports not (backdrop-filter: blur()) 写降级样式

## 技术约束
- 只用 CSS，不引任何UI库
- 不要在滚动列表的每个item上用backdrop-filter（性能差），只在固定浮层用
- 地图InfoWindow的毛玻璃：高德InfoWindow的content是DOM，可以直接加style
- 毛玻璃元素不要嵌套太深（嵌套backdrop-filter会叠加模糊，性能差且效果怪）
- 确保文字对比度达标，毛玻璃上不要用太浅的灰字
- 所有圆角、阴影统一用CSS变量，方便调整

## 验收
- 侧栏、工具栏、弹窗、Toast、信息窗都呈现毛玻璃效果
- 地图内容在浮层下方隐约可见，有通透感
- 暗色模式下毛玻璃效果正常
- 文字在毛玻璃上清晰可读
- 滚动、hover动画流畅，没有明显卡顿
- 不支持backdrop-filter的浏览器显示实色背景，不影响使用
```

---

---

### 阶段四：v2 多人协作（5个）

> 设计原则（来自 PRD 第17章）：**极简实现，不做账号密码、不做角色权限、不做邀请审核**。
> 用户设个昵称就能用，6位房间码和朋友共享，适合家人/朋友小范围使用。

---

#### Prompt v2-1: 用户标识 — 昵称 + 本地UUID + 颜色

```
## 目标
首次使用时让用户设个昵称，自动生成本地UUID和颜色，作为多人协作的身份标识。
不做注册/登录/密码，就是个本地身份。

## 项目背景
- 路径：C:\00_Workspace\projects\food-map
- 前端用 React + useReducer/Context（stores.js）
- 后端 Express + node:sqlite
- 当前没有用户概念，所有记录都是"匿名"的

## 需求
1. 首次打开应用时（localStorage 没有 userId），弹出一个简洁的设置框：
   - 标题："欢迎使用美食地图"
   - 输入框：请输入你的昵称（1-20字符）
   - 按钮："开始使用"
   - 可以选个颜色（12个色块，默认自动分配第一个）
   - 昵称必填，不填不让进
2. 前端逻辑：
   - 生成 UUID（crypto.randomUUID()）存 localStorage
   - 昵称和颜色也存 localStorage
   - 把用户信息放到全局状态（stores.js 加 user 状态）
3. 后端新增 users 表：
   ```sql
   CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,           -- UUID，前端生成
     nickname TEXT NOT NULL,
     color TEXT NOT NULL,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
4. 后端API：
   - POST /api/users — 创建或更新用户（首次调用创建，后续更新昵称/颜色）
   - GET /api/users/me?id=xxx — 根据ID获取用户信息（可选，用于校验）
5. 应用顶栏或侧栏底部显示当前用户：头像圆圈（颜色背景+昵称首字）+ 昵称，点击可修改昵称/颜色
6. 现有数据迁移：首次升级时，所有现有记录的 user_id 设为当前用户ID（如果有记录但没用户，先弹设置框）
## 技术约束

- UUID 用浏览器原生 crypto.randomUUID()，不引库
- 12种颜色：['#FF6B35','#FFB627','#22C55E','#3B82F6','#8B5CF6','#EC4899','#06B6D4','#F97316','#EF4444','#10B981','#6366F1','#EC4899']，去重选12个明显不同的
- 不做密码、不做邮箱、不做登录态，就是个本地身份标识
- 后端 users 表的 id 由前端生成传上来（分布式ID，不依赖自增）
- 设置昵称的弹窗不能跳过（必须有身份才能用多人功能），但单人使用时设完就和以前一样

## 验收

- 首次打开弹昵称设置框，设完才能进
- 刷新页面不需要重设（localStorage 持久化）
- 可以修改昵称和颜色
- 后端 users 表有记录
- 现有记录自动归属到当前用户
- 不加入房间时，使用体验和v1完全一样
```

- 
```

---

#### Prompt v2-2: 房间创建与加入
## 目标

实现房间（共享组）的创建和加入，6位房间码，朋友输个码就能一起用。

## 项目背景

- 路径：C:\00_Workspace\projects\food-map
- 上一步（v2-1）已实现用户标识
- 后端已有 db.js 封装

## 需求

1. 后端新增2张表：

   ```sql
   CREATE TABLE IF NOT EXISTS groups (
     id TEXT PRIMARY KEY,           -- 6位房间码（大写字母+数字）
     name TEXT NOT NULL,            -- 组名，如"成都美食小分队"
     creator_id TEXT NOT NULL,      -- 创建者UUID
     created_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   CREATE TABLE IF NOT EXISTS group_members (
     group_id TEXT NOT NULL,
     user_id TEXT NOT NULL,
     joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (group_id, user_id)
   );
   2. 后端API：

   - POST /api/groups — 创建房间，body: { name }，返回6位房间码
   - POST /api/groups/join — 加入房间，body: { code }，校验房间码存在则加入
   - POST /api/groups/:id/leave — 退出房间
   - GET /api/groups/:id/members — 获取成员列表
   - GET /api/groups — 获取我加入的所有房间
   - DELETE /api/groups/:id — 解散房间（仅创建者可操作，成员记录变私有）

3. 房间码生成：

   - 6位，大写字母+数字（去掉易混淆的 O/0、I/1）
   - 字符集：ABCDEFGHJKLMNPQRSTUVWXYZ23456789
   - 生成时检查不重复，重复则重试

4. 前端UI：

   - 顶栏或侧栏加"👥 共享"按钮
   - 点击打开共享面板（模态框）：
     - 上方："创建共享组"——输入组名→[创建]，创建后显示房间码（大字展示+复制按钮）
     - 下方："加入共享组"——输入6位房间码→[加入]
     - 已加入的房间列表：组名 + 房间码 + 成员数 + [进入] [退出]
   - 进入房间后，顶部显示当前房间名和房间码（可复制分享）

## 技术约束

- 房间码6位，字符集排除易混淆字符
- 创建房间时自动把创建者加入成员表
- 加入房间不需要审核，输对码就进
- 解散房间时，该组所有共享记录的 visibility 改为 private，group_id 置NULL
- 一个用户可以加入多个房间，但同一时间只有一个"当前房间"（存localStorage）
- 房间码不区分大小写（输入时自动转大写）

## 验收

- 输入组名可以创建房间，得到6位房间码
- 房间码可以复制
- 另一个浏览器（不同用户）输房间码可以加入
- 能看到已加入的房间列表
- 能退出房间
- 创建者能解散房间
```



```


```

---

#### Prompt v2-3: 记录可见性 — 私有 / 共享到组
## 目标

新建/编辑记录时可以选择"仅自己可见"或"共享到当前组"，共享记录组内人都能看到。

## 项目背景

- 路径：C:\00_Workspace\projects\food-map
- EntryForm.jsx 是新建/编辑表单
- 后端 server.js 处理记录CRUD
- v2-1 已有用户标识，v2-2 已有房间

## 需求

1. 数据库变更（用迁移方式，不删表重建）：

   ```sql
   ALTER TABLE food_entries ADD COLUMN user_id TEXT DEFAULT '';
   ALTER TABLE food_entries ADD COLUMN group_id TEXT DEFAULT NULL;
   ALTER TABLE food_entries ADD COLUMN visibility TEXT DEFAULT 'private';
   ```

   - 启动时检测列是否存在，不存在才加（和现有迁移逻辑一致）
   - 现有记录：user_id 设为当前设置的用户ID，visibility='private'

2. 表单新增可见性选择（EntryForm.jsx）：

   - 只有在"已进入某个房间"时才显示这个选项
   - 两个单选：🔒 仅自己可见（默认） / 👥 共享到「房间名」
   - 未进入房间时，记录默认私有，不显示选项

3. 后端创建/更新记录时：

   - 自动带上 user_id（从请求参数或当前用户传）
   - visibility='group' 时，group_id 设为当前房间ID
   - visibility='private' 时，group_id 置NULL

4. 后端列表API变更：

   - GET /api/entries 增加参数：view=mine/shared/all
     - mine：只看自己的（user_id = 我）
     - shared：看组内共享的（group_id = 当前房间 AND visibility='group'），包括自己和别人的
     - all：我的 + 当前组内共享的（默认）
   - 返回每条记录带上 user_id 和用户的 nickname、color（JOIN users 表）

5. 权限校验：

   - 更新/删除记录时，只有 user_id 是自己的才能改
   - 别人的记录返回 403

## 技术约束

- 用现有 db.js 的迁移模式（PRAGMA table_info 检查列存在性）
- user_id 由前端传（和房间码一样的极简模式，不做session/token）
- 后端不做复杂鉴权，只校验"这条记录的user_id是不是请求里传的userId"
- 共享记录的图片URL也能正常访问（/uploads 静态服务不变）

## 验收

- 进入房间后，新建表单出现可见性选项
- 选"共享"后保存，同房间其他人能看到这条记录
- 私有记录别人看不到
- 不能编辑/删除别人的记录
- 现有数据不受影响，全部默认私有

```
- 
```

---

#### Prompt v2-4: 共享记录地图展示 — 多色Marker + 视图切换
## 目标

地图上不同用户的记录用不同颜色Marker，能切换看"我的/全部/仅共享"，
信息窗显示是谁分享的。

## 项目背景

- 路径：C:\00_Workspace\projects\food-map
- 地图逻辑在 main.jsx（renderMarkers、openInfo 等）
- 侧栏在 Sidebar.jsx
- v2-3 已实现可见性，记录返回数据带 user_id / nickname / color

## 需求

1. Marker 颜色：
   - 自己的记录：用主色 #FF6B35（或当前标签色）
   - 别人的记录：用该用户的 color 字段作为Marker颜色
   - Marker 内容：自己的用🍴emoji，别人的用昵称首字（白色字在彩色圆上）
   - 或者：别人的Marker外圈用用户颜色，内圈emoji
2. 视图切换：
   - 顶部或工具栏加一个分段控件：我的 | 全部 | 共享
   - "我的"：只显示自己的记录（和v1一样）
   - "全部"：自己的 + 当前房间所有人共享的
   - "共享"：只显示别人共享的（学习参考用）
   - 切换后刷新列表和地图Marker
3. 信息窗（InfoWindow）：
   - 别人的记录：顶部显示"由 张三 分享"（小字号，带用户颜色圆点）
   - 别人的记录：不显示编辑/删除按钮（只读）
   - 自己的记录：和v1一样，显示编辑/删除
4. 侧栏列表：
   - 别人的记录卡片右上角显示用户颜色圆点 + 昵称
   - 别人的记录卡片不显示编辑/删除按钮（或禁用）
   - 卡片点击同样飞到地图对应点
5. 聚合（MarkerCluster）：
   - 聚合点颜色：如果聚合内有多个用户的点，用默认蓝色；全是自己的用主色
   - （简单做：聚合点统一样式，不区分用户）

## 技术约束

- 视图切换状态放到 stores.js（viewMode: 'mine'|'all'|'shared'）
- 切换视图时调 refresh()，后端根据 view 参数返回不同数据
- 别人的记录只读，前端隐藏操作按钮，后端也做403校验
- Marker 颜色用 AMap.CircleMarker 或自定义 HTML Marker content
- 未进入房间时，不显示视图切换（和v1完全一样）

## 验收

- 进入房间后能切换"我的/全部/共享"
- 别人的记录在地图上用对方颜色显示
- 信息窗显示"由XXX分享"，别人的记录没有编辑按钮
- 侧栏列表区分自己和别人的记录
- 未进入房间时和v1体验一致

```
- 
```

---

#### Prompt v2-5: 成员管理与房间体验完善
## 目标

完善房间体验：成员列表、房间码分享、退出/解散、顶部房间状态条。

## 项目背景

- 路径：C:\00_Workspace\projects\food-map
- v2-2 已实现房间创建/加入/退出API
- v2-3/v2-4 已实现共享记录和展示

## 需求

1. 共享面板完善（之前的"共享"按钮模态框）：
   - 当前房间详情：
     - 房间名（大字）
     - 房间码（大字等宽字体 + [复制]按钮 + [分享]按钮）
     - 成员列表：每个成员显示颜色圆点+昵称+加入时间，创建者显示"房主"标签
     - [退出房间]按钮（普通成员）/ [解散房间]按钮（房主，红色，二次确认）
   - 切换房间：如果加入了多个房间，可以切换当前房间
2. 顶部房间状态条：
   - 进入房间后，工具栏下方或顶部显示一条细条：
     - "👥 当前共享组：成都美食小分队（房间码：ABC123）"
     - 右侧 [成员] [退出] 按钮
   - 点击房间码可以复制
3. 复制房间码：
   - 点击复制按钮，复制到剪贴板
   - 复制成功Toast提示："房间码已复制，发给朋友吧！"
4. 退出/解散体验：
   - 退出房间：确认后切回"我的"视图，不显示共享记录
   - 解散房间（房主）：二次确认"解散后所有共享记录将变为私有，确定？"，确认后调API
   - 解散后所有成员自动退出该房间
5. 空状态引导：
   - 未进入房间时，侧栏顶部或空状态显示"邀请朋友一起记录美食 →"引导
   - 点了打开共享面板

## 技术约束

- 复制用 navigator.clipboard.writeText()，降级用 document.execCommand
- 房间码分享用 Web Share API（navigator.share），降级为复制
- 当前房间ID存 localStorage，刷新后自动进入上次的房间
- 解散房间是危险操作，必须二次确认
- 成员列表实时性要求不高，打开面板时拉一次即可

## 验收

- 能看到房间成员列表，房主有标识
- 房间码可以复制和分享
- 可以退出房间
- 房主可以解散房间
- 顶部显示当前房间状态
- 刷新后保持在当前房间

```
- 
```

---

## 📋 执行建议

### 推荐顺序
```
v1 个人版（11个）：
  第一批（核心体验）：
    Prompt 1（位置增强）→ Prompt 2（图片排序）→ Prompt 3（时间筛选）→ Prompt 4（地图暗色）
  第二批（数据操作）：
    Prompt 5（批量+回收站）→ Prompt 6（图表）→ Prompt 7（快捷键+草稿）
  第三批（体验打磨）：
    Prompt 8（搜索）→ Prompt 9（骨架+空状态）→ Prompt 10（暗色模式）→ Prompt 11（毛玻璃UI）

v2 多人协作版（5个，建议v1完成后再做）：
  Prompt v2-1（用户标识）→ v2-2（房间创建加入）→ v2-3（记录可见性）→ v2-4（多色Marker）→ v2-5（成员管理）

```

> 💡 Prompt 11（毛玻璃UI）建议在 Prompt 10（暗色模式）之后做，因为毛玻璃需要同时适配亮色和暗色两套透明度。
>
> 💡 v2 多人协作必须**按顺序**做（v2-1 → v2-5），因为有依赖关系：先有用户才能建房间，有房间才能共享记录，有共享记录才需要多色展示。

### 使用方法
1. 复制对应 Prompt 全文给 AI 编程助手
2. 每个 Prompt 做完先 `git add . && git commit -m "feat: xxx"`
3. 跑一下 `npm run dev` 验证没问题再做下一个
4. 遇到问题直接在对话里描述问题让 AI 修

### 总工作量估计
- v1 个人版：11个 Prompt，每个约 30分钟~2小时，共约 12~22 小时
- v2 多人版：5个 Prompt，每个约 1~3小时（涉及前后端+数据库），共约 8~15 小时
- 全部完成约 20~37 小时
- 每个 Prompt 都是独立的（v2 内部有依赖需按序），可以挑着做

---

*v1 生成时间：2026-08-03（08-04 更新：新增 Prompt 11 毛玻璃UI、v2 多人协作5个Prompt）*
*基于 PRD v1.0，v1 已删减多人共享/离线/热力图/工程化迁移等复杂功能，v2 按极简房间码模式补回多人协作*

## 记录问题（已解决）



```
1. 侧边栏的餐馆饭店，第一次点击定位饭店的速度较慢，同时第一次点击不会将饭店在地图上的带图像的坐标放置地图居中的位置，需要解决点击时的响应速度慢的问题以及第一次点击图标不居中的问题
改动（frontend/src/main.jsx）：
- 地图未就绪时点击：focusEntry 把目标 id 存入 pendingFocusRef，不再静默丢弃；地图加载完（amapReady）或 markers 重建后自动居中并弹出信息窗（新 effect 处理）。
- 点击居中改用手感更快的 map.setZoomAndCenter(15, [lng, lat], true)（true 跳过平滑动画），替换原来的 setCenter+setZoom。
- marker 尚未建好时也先入队，等 markers 渲染完再打开信息窗。
  这样第一次点击无论发生在地图加载前还是加载中，都会在地图就绪后立即把该饭店的图标放到地图中心并弹窗。
```
```

2. emoji图标过于塑料感，寻找替代图标，svg生成还是使用公用资源
3. 为什么我在终端启动后，使用共享功能时，点击创建房间号后网页变成空白状态，刷新网页后也没有反应，请先分析是什么原因再给出方案解决
4. 为什么再添加共享功能后，创建店铺时，搜索位置(地名）时出现了bug，当搜索地名选择地名后点击保存，无法保存显示必须要点击地图选点，但是点击地图选点功能之前就有bug，无法选点添加地址，要解决这两个bug

```

```
还缺的部署步骤（按必要性排序）

1. 让后端直接托管前端产物（当前缺口最大）
   现在生产没有入口：npm run build 产物是 frontend/dist/，但 server.js 只服务 /uploads 和 /api，不托管前端页面。需要在 Express 里加静态托管 dist/ + SPA fallback，这样一套 Node 进程对外，免去 Vite dev server 和代理。
2. 高德 Key 域名白名单（最容易翻车的硬性前提）
   你的 VITE_AMAP_KEY + securityJsCode 是绑定域名的。部署后朋友访问的域名/IP 必须加到高德控制台「Key 的域名白名单」，否则地图直接不加载。部署前先在 frontend/.env 换成正式环境 Key 并重新 build。
3. HTTPS（决定"定位我"能否用）
   浏览器 geolocation 只在 HTTPS（或 localhost）下可用。公网部署建议用 Caddy（自动 HTTPS 证书，配置最简）或 Nginx + certbot。如果只做内网/不定位，可跳过但共享体验会打折。
4. 部署载体与常驻进程

- 方案 A（最轻）：租一台轻量云服务器（阿里/腾讯轻量，1C2G 够），系统装 Node 24+，用 PM2 或 systemd 跑 npm start。
- 方案 B：Docker 一条命令搞定（node:24 镜像 + 挂载 data/uploads 卷）。
- 需要补：Dockerfile、PM2 ecosystem 或 systemd unit（目前一个都没有）。

5. 数据持久化与备份
   SQLite 数据库文件（backend/data/）+ 图片（backend/uploads/）必须落在持久卷上，且要写一个定时备份脚本（打包 DB + uploads，保留最近 N 份）。PRD 承诺"每日自动备份"但目前没有实现。
6. 安全收尾

- 无账号体系：知道 URL 的人都能进、能改昵称，朋友间可以接受，但至少建议外层加一层访问门槛（Nginx basic auth 或加个简单口令页）。
- 部署后把 CORS_ORIGINS 设为正式域名（若同源托管则无需 CORS）；确认 .env 不进 git、高德 Key 勿外泄。
  建议的下一步动作
  我可以直接帮你完成：① 后端托管 dist/ + 生产启动脚本；② Dockerfile + docker-compose（含数据卷）；③ 定时备份脚本；④ README 部署章节。是否需要我动手改？
```

