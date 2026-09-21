# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)；当前仍处于 Beta 阶段。

## [0.9.0] - 2026-09-21

首个公开 Beta 版本。

### Added

- 地图化美食记录，支持餐厅位置、图片、评分、价格、标签、日期和备注。
- 搜索、组合筛选、排序、收藏、统计面板与亮/暗主题。
- 本地用户身份、房间码、成员列表和共享记录可见性。
- JSON 全量备份与恢复、CSV 导出、WAL 一致性 SQLite 快照。
- 响应式布局、PWA 应用壳和 Playwright 端到端测试。
- GitHub Actions、贡献指南、安全说明和可复现 README 展示截图。

### Data reliability

- `seed` 仅初始化空数据库，不覆盖或清空已有数据。
- JSON v1.1 恢复图片、标签关系、设置、用户、房间和成员，并在失败时回滚。
- 旧版备份缺少图片或身份元数据时安全降级并返回 warning。
- 永久删除在数据库与文件系统之间执行补偿，保护仍被其他记录引用的共享文件。
- 活动写事务期间拒绝 JSON 导出与 SQLite 快照，避免半完成备份。

### Verification

- 后端 55 项测试通过，其中包含 11 项数据可靠性回归。
- Playwright Chromium 8 项端到端测试通过。
- Vite 生产构建和隔离生产启动冒烟通过。
- 根、前端与后端依赖审计均为 0 个已知漏洞。

### Known limitations

- 浏览器本地 UUID 不是生产级身份认证，不建议直接暴露到不可信公网。
- 尚未提供自动备份调度、保留策略和定期恢复演练。
- 前端主包仍有大于 500 kB 的构建警告。

[0.9.0]: https://github.com/1Lyn-en/food-map/releases/tag/v0.9.0
