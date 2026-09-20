# Security Policy

## Supported version

当前仅维护默认分支上的最新版本。

## Reporting a vulnerability

请不要在公开 Issue 中披露可利用细节。请通过仓库维护者在 GitHub 个人资料中公开的私密联系方式报告，并提供：

- 受影响的版本或提交
- 复现步骤
- 影响范围
- 建议修复方向（如有）

维护者确认问题后会协调修复与披露时间。

## Deployment warning

本项目当前使用浏览器本地 UUID 标识用户，不提供密码、会话或强身份认证。房间码与请求中的 `user_id` 只适合本地或可信小范围共享，不应视为安全边界。

若部署到公网，至少应：

- 通过反向代理或独立身份服务增加认证与授权
- 启用 HTTPS
- 限制 `CORS_ORIGINS`
- 限制上传大小与请求速率
- 保护并定期备份 SQLite 与上传目录
- 不把真实 `.env`、数据库、图片或备份提交到 Git
