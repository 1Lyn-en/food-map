# 美食地图 UI 设计升级方案 · 晶璃·食境

> 版本：v3.0 · 晶透玻璃质感升级版
> 日期：2026-08-10
> 状态：设计方案待评审
> 灵感来源：Apple iOS 毛玻璃体系 + HarmonyOS 鸿蒙主题美学

---

## 一、设计定位与核心理念

### 1.1 产品本质再定义

美食地图不是一个工具型后台，而是一个**漂浮在城市上空的味觉晶璃馆**——每一条记录都是一块被精心封存的味觉琥珀，地图是城市的肌理，UI 是晶透的展柜。用户在这里收藏的不是数据，而是一段段可触摸的美食记忆。

### 1.2 设计方向：「晶璃·食境」

> **一组悬浮在暖色地图上的晶透玻璃容器，以苹果级的精致模糊为肌肤，以鸿蒙级的极简留白为骨架，以温润的食色为灵魂，让每一个界面元素都像一块被光线穿透的味觉晶璃。**

关键词：
- **晶透质感** — 不是廉价半透明，而是有厚度、有折射、有高光边缘的晶透玻璃
- **极简留白** — 鸿蒙式的呼吸间距，少即是多，让内容自己说话
- **食色温润** — 从真实食物中提取的低饱和暖色调，有食欲但不甜腻
- **光影精致** — 苹果级的细腻光影，每一道光都有方向和理由
- **系统级一致** — 统一的圆角语言、统一的间距节奏、统一的状态反馈

### 1.3 两大设计灵感的融合逻辑

| 维度 | Apple iOS 毛玻璃 | HarmonyOS 鸿蒙 | 融合后的「晶璃·食境」 |
|------|-----------------|---------------|---------------------|
| **玻璃质感** | 多层模糊 + 饱和度提升 + 高光边缘 | 轻量化半透 + 大圆角 | 晶透多层玻璃 + 连续大圆角 + 饱和度微提升 |
| **色彩** | 系统灰 + 品牌色点缀 | 低饱和 + 自然色系 | 低饱和暖灰 + 食色点缀，克制但有温度 |
| **布局** | 紧凑高效 + 卡片堆叠 | 大留白 + 呼吸间距 | 适度留白 + 晶璃卡片，精致但不空旷 |
| **圆角** | 连续圆角（Squircle） | 大圆角（28px+） | 24-32px 大圆角 + 连续圆角感 |
| **动效** | 物理感 + 弹性缓动 | 轻盈 + 自然过渡 | 克制的物理感动效，快出慢入 |
| **字体** | SF Pro 精准排版 | 鸿蒙黑体优雅 | 精准字号层级 + 优雅的字重选择 |

### 1.4 与现有版本的差异

| 维度 | 现有毛玻璃版 | 「晶璃·食境」升级目标 |
|------|-------------|---------------------|
| 玻璃质感 | 单层半透明白色 | 多层晶透玻璃，有高光边缘和饱和度提升 |
| 色彩 | 单一橙色强调 | 低饱和暖灰基底 + 食色点缀系统 |
| 光影 | 平面阴影 | 苹果级四光源系统 + 内高光 + 折射光 |
| 圆角 | 14-20px 普通圆角 | 24-32px 大圆角 + 连续圆角感 |
| 间距 | 紧凑布局 | 鸿蒙式呼吸间距，留白即设计 |
| 排版 | 系统默认字体 | 精准的字号层级 + 优雅字重 |
| 动效 | 基础过渡 | 物理感缓动 + 微交互细节 |
| 空间感 | 扁平层级 | 明确的 Z 轴深度 + 玻璃厚度感 |

---

## 二、色彩系统升级

### 2.1 设计思路

拒绝 AI 设计的三大俗套（暖奶油+衬线+赤陶 / 近黑+酸绿 / 大报风），从两个方向提取色彩：

**苹果系统的色彩哲学**：
- 低饱和度的系统灰阶，确保内容是主角
- 精准的品牌色点缀，不抢戏但有记忆点
- 暗色模式不是简单反色，而是深灰基底

**鸿蒙系统的色彩哲学**：
- 从自然中提取的低饱和色系
- 东方美学的留白与意境
- 色彩有温度但不浓烈

**美食主题的色彩提取**：
- 从焦糖、奶泡、抹茶、莓果等真实食物中提取
- 降低饱和度，增加灰度，让颜色「高级」起来
- 主色温润如玉，辅色点缀如星

### 2.2 主色板 — 「食色晶璃」体系

```css
/* === 晶璃灰系 — 基底色 ===
   灵感：苹果系统灰 + 鸿蒙自然灰
   特点：低饱和、有温度、不冰冷 */
--glass-gray-50: #F8F7F5      /* 最亮背景 — 奶油米白 */
--glass-gray-100: #F2F0ED     /* 卡片背景 — 浅暖灰 */
--glass-gray-200: #E8E5E0     /* 分隔/凹陷 — 中暖灰 */
--glass-gray-300: #D9D5CE     /* 边框 — 深暖灰 */
--glass-gray-400: #B8B3AA     /* 弱文本 — 暖灰褐 */
--glass-gray-500: #8A857C     /* 次级文本 — 中暖灰 */
--glass-gray-600: #5F5A52     /* 主文本 — 深暖灰 */
--glass-gray-700: #3D3A35     /* 标题文本 — 极深暖灰 */

/* === 食色系 — 强调色 ===
   灵感：真实食物提取 + 低饱和处理
   特点：有食欲但不甜腻，温润如玉 */

/* 主强调色 — 焦糖琥珀（从焦糖/蜂蜜中提取，降低饱和度） */
--amber-400: #D4A056          /* 焦糖金 — hover/高亮 */
--amber-500: #C08B40          /* 琥珀棕 — 主强调 */
--amber-600: #A67630          /* 深琥珀 — 按下/激活 */
--amber-300: #E5B978          /* 浅琥珀 — 玻璃高光 */
--amber-100: #F5E6CC          /* 极浅琥珀 — 背景点缀 */

/* 次强调色 — 抹茶绿（从抹茶/青葱中提取） */
--matcha-400: #7BA67A         /* 抹茶绿 — 次要强调 */
--matcha-500: #5E8A5D         /* 深抹茶 — 标签/状态 */
--matcha-100: #DDE8DC         /* 浅抹茶 — 背景点缀 */

/* 点缀色 — 莓果粉（从莓果/红酒中提取） */
--berry-400: #C47B8A          /* 莓果粉 — 收藏/喜爱 */
--berry-500: #A85D6D          /* 深莓果 — 按下 */
--berry-100: #F0DDE1          /* 浅莓果 — 背景点缀 */

/* 功能色 */
--success: #6B9E7A            /* 成功绿 — 抹茶调 */
--warning: #D4A056            /* 警告黄 — 琥珀调 */
--danger: #C46B6B             /* 危险红 — 莓果调 */
--info: #7B9BB4               /* 信息蓝 — 灰蓝调 */
```

### 2.3 玻璃色板（核心升级 — 苹果级晶透质感）

建立**五层晶璃体系**，每一层有不同的透明度、模糊度、饱和度和折射感：

```css
/* === 第一层：晶璃·极 — 主面板级
   最厚、最有体积感，像一块打磨过的水晶
   灵感：iOS 控制中心 / 通知中心 */
--glass-ultra-bg: rgba(248, 247, 245, 0.72)
--glass-ultra-blur: 30px saturate(160%) brightness(105%)
--glass-ultra-border: rgba(255, 255, 255, 0.6)
--glass-ultra-shadow:
  0 20px 60px rgba(60, 55, 45, 0.15),
  0 4px 16px rgba(60, 55, 45, 0.08),
  inset 0 1px 0 rgba(255, 255, 255, 0.75),
  inset 0 -1px 0 rgba(60, 55, 45, 0.05)

/* === 第二层：晶璃·厚 — 卡片/弹窗级
   中等厚度，像磨砂玻璃卡
   灵感：iOS 卡片 / 鸿蒙服务卡片 */
--glass-thick-bg: rgba(248, 247, 245, 0.6)
--glass-thick-blur: 22px saturate(145%) brightness(103%)
--glass-thick-border: rgba(255, 255, 255, 0.5)
--glass-thick-shadow:
  0 12px 40px rgba(60, 55, 45, 0.12),
  0 2px 8px rgba(60, 55, 45, 0.06),
  inset 0 1px 0 rgba(255, 255, 255, 0.65),
  inset 0 -1px 0 rgba(60, 55, 45, 0.04)

/* === 第三层：晶璃·薄 — 标签/按钮级
   轻薄透明，像糖霜玻璃纸
   灵感：iOS 标签栏 / 鸿蒙 Chip */
--glass-thin-bg: rgba(248, 247, 245, 0.45)
--glass-thin-blur: 14px saturate(130%)
--glass-thin-border: rgba(255, 255, 255, 0.4)
--glass-thin-shadow:
  0 4px 12px rgba(60, 55, 45, 0.08),
  inset 0 1px 0 rgba(255, 255, 255, 0.5)

/* === 第四层：晶璃·微 — 分割/状态级
   几乎透明，只有隐约存在感
   灵感：iOS 分隔线 / 鸿蒙分割 */
--glass-micro-bg: rgba(248, 247, 245, 0.28)
--glass-micro-blur: 8px saturate(115%)
--glass-micro-border: rgba(255, 255, 255, 0.3)

/* === 第五层：晶璃·隐 — 装饰/背景级
   完全融入背景，只有氛围感
   灵感：iOS 壁纸模糊层 */
--glass-hidden-bg: rgba(248, 247, 245, 0.15)
--glass-hidden-blur: 4px saturate(105%)
```

**苹果级玻璃的关键技术点**：
1. **饱和度提升**（saturate）：让模糊后的背景色彩更鲜活，这是 iOS 玻璃的灵魂
2. **亮度微调**（brightness）：轻微提亮，模拟光线穿透玻璃
3. **双层内阴影**：顶部内高光 + 底部内阴影，模拟玻璃厚度
4. **渐变边框**：上亮下暗，模拟光线折射
5. **多层外阴影**：主投影 + 次投影，模拟真实环境光

### 2.4 暗色模式色板 — 「深夜食肆」

暗色模式不是简单反色，而是**深夜小酒馆**的氛围——温暖的琥珀灯光，深色木质背景，玻璃酒杯折射着暖光。

```css
/* 暗色晶璃 — 深琥珀色半透明 */
--glass-ultra-bg-dark: rgba(32, 28, 24, 0.78)
--glass-thick-bg-dark: rgba(40, 35, 30, 0.68)
--glass-thin-bg-dark: rgba(48, 42, 36, 0.52)
--glass-micro-bg-dark: rgba(56, 50, 44, 0.35)

/* 暗色文本 — 奶油白，不是纯白 */
--text-dark-primary: #F0EBE2      /* 主文本 — 奶油白 */
--text-dark-secondary: #BFB6A8    /* 次级文本 — 暖灰 */
--text-dark-muted: #7D756A        /* 弱文本 — 深暖灰 */

/* 暗色强调色 — 更亮更饱和 */
--amber-dark: #E5B978             /* 亮琥珀 — 在深色下更醒目 */
--matcha-dark: #8FB88E            /* 亮抹茶 */
--berry-dark: #D4909E             /* 亮莓果 */

/* 暗色背景 — 深焙褐，不是纯黑 */
--bg-dark: #1A1612                /* 主背景 — 深焙褐 */
--bg-dark-elevated: #24201A       /* 提升背景 — 中深褐 */
```

---

## 三、排版系统升级

### 3.1 字体搭配 — 精准 + 优雅

| 用途 | 字体 | 特点 | 灵感来源 |
|------|------|------|---------|
| **标题/展示** | `PingFang SC` Semibold | 精准、现代、有力量感 | 苹果 SF Pro 的精准排版 |
| **正文/界面** | `PingFang SC` Regular | 清晰易读，保持现代感 | 鸿蒙黑体的优雅 |
| **数字/数据** | `SF Mono` / `JetBrains Mono` | 等宽数字，统计面板更精致 | 苹果系统的数字排版 |

> **为什么不用宋体了？** 苹果和鸿蒙的高级感来自「精准的无衬线排版」，而不是字体本身的装饰性。高级感 = 精准的字号层级 + 恰当的字重选择 + 充足的留白。宋体虽然有收藏感，但与晶透玻璃的现代感调性不完全匹配。

### 3.2 字号层级 — 苹果级精准

```css
--text-display: 26px / 1.35    /* 侧栏大标题、统计大数字 — Semibold */
--text-h1: 20px / 1.4          /* 面板标题 — Semibold */
--text-h2: 17px / 1.45         /* 卡片标题、弹窗标题 — Medium */
--text-h3: 15px / 1.5          /* 小节标题、菜名 — Medium */
--text-body: 14px / 1.6        /* 正文、店名 — Regular */
--text-caption: 12px / 1.5     /* 辅助信息、时间 — Regular */
--text-micro: 11px / 1.4       /* 标签、徽章 — Medium */
```

### 3.3 排版细节 — 鸿蒙式优雅

- **字重选择**：标题用 Medium (500) 或 Semibold (600)，**不用 Bold (700)**，保持温润感
- **字间距**：标题 -0.01em（收紧），正文 0，小字 +0.02em（松开）
- **行高**：正文 1.6 倍，标题 1.4 倍，确保呼吸感
- **对齐**：卡片信息左对齐，数字右对齐，标签居中
- **段落间距**：段间距 = 行高 × 0.75，鸿蒙式呼吸节奏

---

## 四、核心组件升级方案

### 4.1 地图背景层 — 「城市食境」

**现有问题**：地图是纯工具感，与 UI 面板脱节。

**升级方案**：

```css
.map-atmosphere {
  /* 暖色氛围渐变 — 让地图从冷蓝变暖调 */
  background:
    radial-gradient(ellipse at 25% 35%, rgba(212, 160, 86, 0.06) 0%, transparent 55%),
    radial-gradient(ellipse at 75% 65%, rgba(123, 166, 122, 0.04) 0%, transparent 50%),
    linear-gradient(180deg, rgba(248, 247, 245, 0.03) 0%, rgba(232, 229, 224, 0.06) 100%);

  mix-blend-mode: soft-light;
  pointer-events: none;
}

/* 地图 vignette — 边缘暗角，聚焦中心 */
.map-vignette {
  box-shadow: inset 0 0 150px rgba(60, 55, 45, 0.06);
  pointer-events: none;
}
```

**效果**：地图不再是冷冰冰的工具地图，而是像一张被晨光晒暖的城市地图，有温度、有氛围。

### 4.2 侧栏面板（晶璃·极）

**现有问题**：像普通白色抽屉，缺少体积感。

**升级方案**：

```css
.sidebar {
  /* 位置：不贴边，四周留空 — 鸿蒙式留白 */
  top: 16px;
  right: 16px;
  bottom: 16px;
  width: 360px;

  /* 晶璃·极效果 */
  background: var(--glass-ultra-bg);
  backdrop-filter: var(--glass-ultra-blur);
  -webkit-backdrop-filter: var(--glass-ultra-blur);

  /* 大圆角 — 鸿蒙式 */
  border-radius: 28px;

  /* 边框：上亮下暗，模拟玻璃折射 — 苹果级 */
  border: 1px solid var(--glass-ultra-border);
  border-top-color: rgba(255, 255, 255, 0.75);
  border-bottom-color: rgba(255, 255, 255, 0.35);
  border-left-color: rgba(255, 255, 255, 0.55);
  border-right-color: rgba(255, 255, 255, 0.4);

  /* 阴影：外阴影 + 内高光 — 苹果级四光源 */
  box-shadow:
    0 24px 64px rgba(60, 55, 45, 0.18),    /* 主投影 */
    0 6px 20px rgba(60, 55, 45, 0.1),       /* 次投影 */
    inset 0 1px 0 rgba(255, 255, 255, 0.8), /* 顶部内高光 */
    inset 0 -1px 0 rgba(60, 55, 45, 0.05),  /* 底部内阴影 */
    inset 1px 0 0 rgba(255, 255, 255, 0.3), /* 左侧内高光 */
    inset -1px 0 0 rgba(60, 55, 45, 0.03);  /* 右侧内阴影 */
}
```

**侧栏头部设计**：
- 标题使用 PingFang SC Semibold，20px
- 「新增记录」按钮使用琥珀金渐变，有内发光
- 顶部增加一条极细的琥珀金装饰线，像晶璃的折射光带
- 头部与列表之间用晶璃·微分隔线

**新增按钮设计**：
```css
.add-btn {
  background: linear-gradient(135deg, #D4A056 0%, #C08B40 100%);
  box-shadow:
    0 4px 16px rgba(192, 139, 64, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    inset 0 -1px 0 rgba(60, 55, 45, 0.15);
  color: #FFF8EE;
  border-radius: 14px;
  padding: 10px 20px;
  font-weight: 500;
  font-size: 14px;
  letter-spacing: 0.01em;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.add-btn:hover {
  transform: translateY(-2px);
  box-shadow:
    0 8px 24px rgba(192, 139, 64, 0.38),
    0 0 0 3px rgba(192, 139, 64, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.add-btn:active {
  transform: translateY(0);
  box-shadow:
    0 2px 8px rgba(192, 139, 64, 0.25),
    inset 0 1px 2px rgba(60, 55, 45, 0.1);
}
```

### 4.3 搜索工具栏（晶璃·厚）

**现有问题**：普通白底搜索框，缺少质感。

**升级方案**：

```css
.toolbar {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
}

.search-box {
  background: var(--glass-thick-bg);
  backdrop-filter: var(--glass-thick-blur);
  -webkit-backdrop-filter: var(--glass-thick-blur);
  border-radius: 999px;  /* 胶囊形 — 苹果/鸿蒙通用 */
  padding: 10px 20px;
  border: 1px solid var(--glass-thick-border);
  border-top-color: rgba(255, 255, 255, 0.6);
  border-bottom-color: rgba(255, 255, 255, 0.35);
  box-shadow: var(--glass-thick-shadow);
  width: 420px;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.search-box:focus-within {
  border-color: var(--amber-300);
  box-shadow:
    0 8px 32px rgba(192, 139, 64, 0.18),
    0 0 0 4px rgba(192, 139, 64, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  transform: translateX(-50%) scale(1.01);
}
```

**搜索历史下拉**：
- 晶璃·厚玻璃容器，圆角 24px
- 每一项 hover 时背景变亮，左侧出现琥珀色指示条
- 底部「清除历史」用弱文本样式
- 分隔线用晶璃·微

### 4.4 地图弹窗 InfoWindow（晶璃·极+）

**现有问题**：普通白色弹窗，像默认组件。

**升级方案**：「味觉晶璃卡」

```css
.info-card {
  background: var(--glass-ultra-bg);
  backdrop-filter: var(--glass-ultra-blur);
  -webkit-backdrop-filter: var(--glass-ultra-blur);
  border-radius: 24px;
  border: 1px solid var(--glass-ultra-border);
  border-top-color: rgba(255, 255, 255, 0.75);
  border-bottom-color: rgba(255, 255, 255, 0.35);
  box-shadow:
    0 28px 72px rgba(60, 55, 45, 0.22),
    0 8px 24px rgba(60, 55, 45, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  width: 280px;
  overflow: hidden;
}

/* 弹窗箭头 — 也要晶璃质感 */
.info-arrow {
  background: var(--glass-ultra-bg);
  backdrop-filter: var(--glass-ultra-blur);
  -webkit-backdrop-filter: var(--glass-ultra-blur);
  border-right: 1px solid var(--glass-ultra-border);
  border-bottom: 1px solid var(--glass-ultra-border);
  transform: rotate(45deg);
}
```

**弹窗内容结构**：
1. **顶部图片区** — 圆角 16px，有微妙的内阴影边框
2. **标题区** — 菜名用 Medium 字重 17px，店名用 Regular 14px
3. **信息区** — 评分、价格、标签用晶璃·薄胶囊样式
4. **操作区** — 编辑/删除按钮，删除按钮默认弱化

### 4.5 记录卡片（晶璃·厚）

**现有问题**：普通列表项，缺少收藏感。

**升级方案**：「味觉收藏卡」

```css
.entry-item {
  background: var(--glass-thick-bg);
  backdrop-filter: var(--glass-thick-blur);
  -webkit-backdrop-filter: var(--glass-thick-blur);
  border-radius: 20px;
  border: 1px solid var(--glass-thick-border);
  border-top-color: rgba(255, 255, 255, 0.55);
  border-bottom-color: rgba(255, 255, 255, 0.3);
  box-shadow: var(--glass-thick-shadow);
  padding: 12px;
  margin-bottom: 12px;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
}

.entry-item:hover {
  transform: translateY(-3px);
  border-color: var(--amber-300);
  border-top-color: rgba(229, 185, 120, 0.6);
  box-shadow:
    0 16px 40px rgba(60, 55, 45, 0.16),
    0 0 0 1px rgba(192, 139, 64, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
```

**卡片细节**：
- **缩略图**：圆角 14px，hover 时轻微 scale(1.02)，有微妙的光泽扫过效果
- **菜名**：Medium 字重，15px，深暖灰色
- **店名**：Regular，13px，中暖灰色
- **标签行**：标签用晶璃·薄胶囊样式，颜色来自标签本身但降低饱和度
- **时间**：12px，浅暖灰色，右对齐

**收藏标记**：
- 收藏的卡片左侧有一条 3px 宽的莓果色竖线
- 星星图标用莓果色填充，有微妙发光

### 4.6 筛选面板（晶璃·厚）

**升级方案**：
- 整体使用晶璃·厚背景
- 筛选分组之间用晶璃·微分隔线
- 标签 chip 选中态用琥珀金渐变，未选中用晶璃·薄
- 日期预设按钮用 segmented control 风格
- 底部操作区有顶部高光分隔

### 4.7 统计面板（晶璃·极）

**升级方案**：
- 大尺寸晶璃·极面板，圆角 28px
- 统计卡片用晶璃·厚，有内发光数字
- 图表颜色统一到琥珀/抹茶/莓果色系
- 柱状图用琥珀金渐变，折线用抹茶绿
- 饼图用暖色调色板（琥珀、抹茶、莓果、焦糖、深焙）

### 4.8 表单弹窗（晶璃·极）

**升级方案**：
- 晶璃·极背景，有体积感
- 输入框用晶璃·薄样式，focus 时琥珀金边框
- 图片上传区有虚线边框，hover 时变琥珀色
- 星级评分用琥珀金，有 hover 预亮效果
- 标签选择器用晶璃·薄 chip

---

## 五、光影与材质系统

### 5.1 微噪点纹理

所有晶璃层叠加极细微的噪点纹理，避免「塑料感」：

```css
.glass-noise {
  position: relative;
}

.glass-noise::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.025'/%3E%3C/svg%3E");
  pointer-events: none;
  opacity: 0.5;
  mix-blend-mode: overlay;
  border-radius: inherit;
}
```

### 5.2 四光源系统（苹果级）

建立**四光源系统**，模拟真实环境光：

1. **顶部主光** — 来自屏幕上方 45° 的柔和白光，产生顶部内高光
2. **环境漫反射** — 来自地图的暖色反光，产生底部暖色调
3. **边缘折射光** — 玻璃边缘的亮边，模拟光线穿过玻璃
4. **接触阴影** — 组件底部的软阴影，模拟悬浮感

```css
/* 标准晶璃光影公式 */
.glass-standard {
  box-shadow:
    0 12px 40px rgba(60, 55, 45, 0.15),    /* 主投影 */
    0 2px 8px rgba(60, 55, 45, 0.08),     /* 次投影 */
    inset 0 1px 0 rgba(255, 255, 255, 0.65),  /* 顶部内高光 */
    inset 0 -1px 0 rgba(60, 55, 45, 0.04),   /* 底部内阴影 */
    inset 1px 0 0 rgba(255, 255, 255, 0.25),  /* 左侧内高光 */
    inset -1px 0 0 rgba(60, 55, 45, 0.03);   /* 右侧内阴影 */
}
```

### 5.3 琥珀高光效果

关键交互元素使用琥珀金内发光：

```css
.amber-glow {
  box-shadow:
    0 0 24px rgba(192, 139, 64, 0.25),
    0 4px 16px rgba(192, 139, 64, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
```

### 5.4 连续圆角（Squircle）

苹果的圆角不是普通的圆角，而是「连续圆角」（Squircle），更自然、更有机。

```css
/* 使用 mask-image 模拟连续圆角 */
.squircle {
  -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 0%, #000 90%, transparent 100%);
  mask-image: radial-gradient(circle at 50% 50%, #000 0%, #000 90%, transparent 100%);
}
```

> **注**：由于浏览器限制，主要通过大圆角 + 柔和阴影来模拟连续圆角的感觉。

---

## 六、动效系统

### 6.1 动效原则

- **克制** — 不弹跳、不夸张、不炫技
- **物理感** — 模拟真实世界的惯性和缓动
- **功能性** — 每个动效都有明确的反馈目的
- **可关闭** — 尊重 `prefers-reduced-motion`

### 6.2 缓动曲线 — 苹果级物理感

```css
/* 标准缓动 — 快出慢入，自然减速（iOS 标准） */
--ease-standard: cubic-bezier(0.16, 1, 0.3, 1)

/* 进入缓动 — 从静止加速，然后自然减速 */
--ease-enter: cubic-bezier(0.22, 1, 0.36, 1)

/* 退出缓动 — 快速离开 */
--ease-exit: cubic-bezier(0.4, 0, 1, 1)

/* 弹性缓动 — 轻微弹性，用于重要交互 */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)
```

### 6.3 关键动效

| 动效 | 触发 | 效果 | 时长 | 缓动 |
|------|------|------|------|------|
| **面板进入** | 页面加载 | 右侧滑入 + 淡入 + 轻微缩放 | 550ms | ease-enter |
| **搜索栏进入** | 页面加载 | 顶部下落 + 淡入 | 450ms，延迟 100ms | ease-enter |
| **卡片 hover** | 鼠标悬停 | 上浮 3px + 阴影增强 + 边框高光 | 350ms | ease-standard |
| **按钮 press** | 点击 | 轻微下压 + 阴影收缩 | 150ms | ease-exit |
| **弹窗出现** | 打开弹窗 | 缩放 0.96→1 + 淡入 + 背景模糊渐显 | 400ms | ease-spring |
| **标签切换** | 切换 tab | 指示器滑动 + 内容淡入淡出 | 280ms | ease-standard |
| **列表加载** | 数据加载 | 卡片依次淡入上浮（stagger） | 每个 70ms 延迟 | ease-enter |

### 6.4 微交互细节

- **搜索聚焦**：输入框轻微放大 1.01 倍 + 琥珀色发光边框
- **卡片图片 hover**：图片 1.02 倍缩放 + 顶部扫过一道光泽
- **按钮 hover**：上浮 2px + 阴影增强 + 内高光变亮
- **星级评分**：hover 时星星依次亮起，有「扫过」感
- **marker hover**：轻微放大 1.15 倍 + 琥珀色光晕

---

## 七、空间层级系统

### 7.1 Z-Index 层级

```
z-index: 10   — 地图本身
z-index: 20   — 地图氛围 overlay
z-index: 30   — 地图 marker
z-index: 50   — 搜索工具栏（悬浮在最上）
z-index: 60   — 搜索历史下拉
z-index: 80   — 侧栏面板
z-index: 90   — 筛选面板
z-index: 100  — 地图 InfoWindow
z-index: 200  — 表单弹窗
z-index: 300  — 统计/数据面板
z-index: 500  — Toast 通知
z-index: 999  — 确认对话框
```

### 7.2 视觉深度对应

| 层级 | 玻璃强度 | 模糊度 | 饱和度 | 阴影强度 | 代表组件 |
|------|---------|--------|--------|---------|---------|
| 最底层 | 晶璃·隐 | 4px | 105% | 极弱 | 装饰、背景层 |
| 底层 | 晶璃·微 | 8px | 115% | 极弱 | 分割线、状态条 |
| 中层 | 晶璃·薄 | 14px | 130% | 弱 | 标签、徽章、小按钮 |
| 高层 | 晶璃·厚 | 22px | 145% | 中 | 卡片、搜索栏、筛选面板 |
| 最高层 | 晶璃·极 | 30px | 160% | 强 | 侧栏、大弹窗 |
| 最顶层 | 晶璃·极+ | 36px | 170% | 最强 | InfoWindow、模态框 |

---

## 八、暗色模式设计 — 「深夜食肆」

### 8.1 氛围定位

暗色模式不是「反色模式」，而是**深夜小酒馆**的氛围——温暖的琥珀灯光，深色木质背景，玻璃酒杯折射着暖光。

### 8.2 关键调整

- **背景**：深焙褐色 `#1A1612`，不是纯黑
- **玻璃**：深琥珀色半透明 `rgba(32, 28, 24, 0.78)`
- **文本**：奶油白 `#F0EBE2`，不是纯白
- **强调色**：更亮的琥珀金 `#E5B978`，在深色下更醒目
- **阴影**：更深更暖，`rgba(0, 0, 0, 0.4)`
- **地图**：暗色地图样式 + 暖色 overlay 更明显

### 8.3 暗色特有效果

- 玻璃边缘有更明显的琥珀色内发光
- 按钮有更强的发光效果（像霓虹灯）
- 文本对比度更高，确保可读性
- 晶璃质感在暗色下更突出

---

## 九、响应式设计

### 9.1 断点

```css
--bp-mobile: 768px    /* 手机 */
--bp-tablet: 1024px   /* 平板 */
--bp-desktop: 1440px  /* 桌面 */
```

### 9.2 移动端适配

- **侧栏**：改为底部半屏抽屉，从底部滑入
- **搜索栏**：宽度自适应，左右留边距
- **InfoWindow**：宽度限制在屏幕 85% 以内
- **按钮**：最小点击区域 44px × 44px
- **表单**：全屏或近全屏，底部固定操作栏

---

## 十、实现优先级

### P0：核心质感（必须完成）

1. 建立晶璃灰 + 食色色彩系统
2. 五层晶璃体系（极/厚/薄/微/隐）
3. 侧栏晶璃·极面板升级
4. 搜索栏胶囊晶璃·厚升级
5. 地图 InfoWindow 晶璃卡升级
6. 四光源光影系统
7. 饱和度提升 + 亮度微调的玻璃效果

### P1：细节打磨（建议完成）

1. 记录卡片收藏感升级
2. 地图暖色氛围 overlay + vignette
3. 筛选面板晶璃化
4. 微噪点纹理叠加
5. 精准字号层级 + 优雅字重
6. marker 样式精致化
7. 按钮状态完整设计（hover/active/focus/disabled）

### P2：体验增强（有余力再做）

1. 页面进入动画（stagger）
2. 卡片图片光泽扫过效果
3. 星级评分 hover 预亮
4. 空状态插画设计
5. 移动端底部抽屉体验
6. 统计面板图表配色统一
7. 表单晶璃质感升级
8. 连续圆角优化

---

## 十一、验收标准

### 视觉验收

1. 整体呈现「晶璃·食境」的高级感，不像普通工具后台
2. 玻璃有厚度和体积感，不是廉价的半透明
3. 色彩统一在晶璃灰 + 食色系中，和谐不杂乱
4. 光影有方向感和层次感，不是平面阴影
5. 排版精准优雅，有苹果/鸿蒙级的精致感
6. 暗色模式有深夜小酒馆的氛围
7. 圆角统一且足够大，有鸿蒙式的圆润感

### 交互验收

1. hover 反馈清晰但不过度
2. 动效自然流畅，有物理感
3. 减少动态效果模式下动画关闭
4. 所有可点击元素有明确的状态反馈
5. 按钮有完整的四态设计（默认/hover/active/disabled）

### 功能验收

1. 现有功能全部保留，不破坏业务逻辑
2. 地图加载、marker、InfoWindow 正常工作
3. 搜索、筛选、排序功能正常
4. 新增/编辑/删除流程完整
5. 暗色模式切换正常
6. 响应式布局不溢出

---

## 十二、设计风险与注意事项

### 12.1 性能风险

- **backdrop-filter 在低端设备可能卡顿** → 提供降级方案，检测性能后自动关闭模糊
- **多层阴影可能影响滚动性能** → 关键滚动区域使用 `will-change` 或减少阴影层数
- **噪点纹理可能增加 GPU 负担** → 使用 SVG 噪点而非图片，控制透明度

### 12.2 可读性风险

- **玻璃背景上的文本对比度** → 确保文本与背景的对比度 ≥ 4.5:1（WCAG AA）
- **暗色模式下的琥珀色可能太亮** → 调整暗色模式下的强调色亮度

### 12.3 兼容性风险

- **Safari 的 backdrop-filter 前缀** → 同时使用 `-webkit-backdrop-filter`
- **旧浏览器不支持 backdrop-filter** → 提供纯色降级方案

---

## 十三、与现有方案的对比

| 方面 | 原毛玻璃方案 | 琥珀食藏方案 | 晶璃·食境方案（本方案） |
|------|------------|------------|---------------------|
| **设计灵感** | 基础毛玻璃 | 琥珀/陶土/美食收藏 | Apple iOS + HarmonyOS + 美食 |
| **色彩基调** | 橙色 + 白色 | 琥珀金 + 陶土棕 + 奶油白 | 晶璃灰 + 食色点缀（琥珀/抹茶/莓果） |
| **玻璃层数** | 2-3 层 | 4 层 | 5 层（极/厚/薄/微/隐） |
| **玻璃质感** | 单层半透明 | 琥珀色玻璃 | 晶透玻璃 + 饱和度提升 + 亮度微调 |
| **光影系统** | 基础阴影 | 四光源（暖棕调） | 四光源（苹果级精准） |
| **圆角** | 14-20px | 20-28px | 24-32px 大圆角 |
| **排版** | 系统字体 | 思源宋体标题 | PingFang SC 精准层级 |
| **间距** | 紧凑 | 适中 | 鸿蒙式呼吸间距 |
| **动效** | 基础过渡 | 物理感缓动 | 苹果级物理感 + 弹性缓动 |
| **暗色** | 简单反色 | 深夜小酒馆 | 深夜食肆（更精致） |
| **高级感来源** | 毛玻璃本身 | 材质 + 色彩 | 精准 + 克制 + 质感 |

---

## 十四、设计理念总结

> **不是在 UI 上加一层毛玻璃，而是让整个界面成为一组**漂浮在城市地图上的晶璃容器**。**
>
> 每一块玻璃都有厚度、有折射、有高光边缘；
> 每一道光影都有方向、有层次、有理由；
> 每一处留白都在呼吸、在思考、在表达；
> 每一个细节都在讲述「这是你的味觉晶璃馆」的故事。
>
> **高级感 = 精准的克制 + 精致的细节 + 统一的语言**
> 就像苹果的设计哲学：Less, but better.
> 就像鸿蒙的设计哲学：极简，但是有温度。

---

*方案设计完成 · 待评审*
