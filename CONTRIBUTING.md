# Contributing

感谢参与 Food Map。提交改动前，请先确认本地使用 Node.js 22.5+（推荐 Node.js 24 LTS）。

## 本地开发

```bash
npm run install:all
Copy-Item frontend/.env.example frontend/.env  # Windows PowerShell
npm run dev
```

地图相关功能需要在 `frontend/.env` 配置自己的高德 Web JS API Key。不要提交真实密钥、数据库、上传图片或备份文件。

## 提交前检查

```bash
npm test
npm run build
npm run test:e2e
```

首次运行 E2E 时先执行：

```bash
npm run e2e:install
```

## 代码与提交约定

- 保持前端组件、后端路由和数据库职责清晰，避免把无关改动混进同一提交。
- 新增或修复后端行为时，补充 `backend/test/` 集成测试。
- 修改关键 UI 流程时，补充 `frontend/e2e/` Playwright 测试。
- 提交信息建议使用 Conventional Commits，例如 `feat: add tag filter`、`fix: preserve image order`。
- 不提交 `.env`、`.idea`、`node_modules`、`dist`、测试报告和运行时数据。

## Pull Request 清单

- [ ] 说明改动目的、范围和手动验证方式
- [ ] `npm test` 通过
- [ ] `npm run build` 通过
- [ ] 涉及 UI 时，`npm run test:e2e` 通过
- [ ] 没有提交密钥、个人数据、数据库或上传文件
- [ ] README / docs 与行为变化保持一致
