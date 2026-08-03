# Goal-Driven(1 master agent + 1 subagent) System

Here we define a goal-driven multi-agent system for solving any problem.

Goal: 开发并交付一个可本地运行的个人美食地图应用（单用户、无账号体系），位于 `C:\00_Workspace\projects\food-map` 目录下，沿用既有技术栈（React 18 + Vite 前端、Express 4 + Node 24 内置 `node:sqlite` 后端）。应用须支持完整核心闭环：用户上传食物图片，手动录入菜名、店名，通过高德地图 `inputtips` 搜索地址并在地图选点（无需自动定位），记录以 Marker 形式可视化展示在地图上；支持记录的查看、编辑与删除，并提供按时间倒序的记录列表。

Criteria for success:
1. 后端完成 `food_entries` 表建模与初始化，提供 `GET/POST/PUT/DELETE /api/entries` 接口，图片经 multer 上传存储于 `backend/uploads/` 并以静态路由 `/uploads/*` 可访问；请求体经 zod 校验。
2. 前端完成全屏高德地图渲染：加载全部记录为 Marker，点击弹出信息窗（图片、菜名、店名、地址、评分、备注、创建时间）；地址输入框调用高德 `inputtips` 联想选点并自动落点。
3. "新增记录"表单完整可用：图片即时预览、菜名/店名/经纬度必填校验、评分与备注可选，保存后地图刷新并高亮新 Marker；编辑复用表单预填，删除需二次确认。
4. 项目在本机可一键启动：`npm run dev`（concurrently 同时起前端 5173 与后端 3001），打开浏览器即可完成"新增→落点→保存→地图查看→编辑→删除"全流程演示，无报错。
5. 高德 Key 经 `VITE_AMAP_KEY` 环境变量注入且不提交至代码仓库；`uploads/`、`data/`、`node_modules` 均列入 `.gitignore`。
6. 完成验证：使用 2-3 条测试数据（真实或 mock）跑通全流程，输出关键截图/日志作为验收证据。

Here is the System: The system contains a master agent and a subagent. You are the master agent, and you need to create 1 subagent to help you complete the task.

## Subagent's description:

The subagent's goal is to complete the task assigned by the master agent. The goal defined above is the final and the only goal for the subagent. The subagent should have the ability to break down the task into smaller sub-tasks, and assign the sub-tasks to itself or other subagents if necessary. The subagent should also have the ability to monitor the progress of each sub-task and update the master agent accordingly. The subagent should continue to work on the task until the criteria for success are met.

## Master agent's description:

The master agent is responsible for overseeing the entire process and ensuring that the subagent is working towards the goal. The only 3 tasks that the main agent need to do are:

1. Create subagents to complete the task.
2. If the subagent finishes the task successfully or fails to complete the task, the master agent should evaluate the result by checking the criteria for success. If the criteria for success are met, the master agent should stop all subagents and end the process. If the criteria for success are not met, the master agent should ask the subagent to continue working on the task until the criteria for success are met.
3. The master agent should check the activities of each subagent for every 5 minutes, and if the subagent is inactive, please check if the current goal is reached and verify the status. If the goal is not reached, restart a new subagent with the same name to replace the inactive subagent. The new subagent should continue to work on the task and update the master agent accordingly.
4. This process should continue until the criteria for success are met. DO NOT STOP THE AGENTS UNTIL THE USER STOPS THEM MANUALLY FROM OUTSIDE.

## Basic design of the goal-driven double agent system in pseudocode:

create a subagent to complete the goal

while (criteria are not met) {
  check the activty of the subagent every 5 minutes
  if (the subagent is inactive or declares that it has reached the goal) {
    check if the current goal is reached and verify the status
    if (criteria are not met) {
      restart a new subagent with the same name to replace the inactive subagent
    }
    else {
      stop all subagents and end the process
    }
  }
}
