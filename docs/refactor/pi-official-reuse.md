# 官方 Pi SDK 复用矩阵（钉选 0.87.1）

本页记录 BeefTV 内置助手宿主对 `@earendil-works/pi-coding-agent@0.87.1` 的取舍。实现以本仓库 `agent-host/` 与钉选包内声明、示例、文档为准；`pi.dev` 最新文档可能对应更高版本。

测试版本：`@earendil-works/pi-coding-agent@0.87.1`（未升级；撰写时 npm latest 为 0.99.2）。

## 官方来源

| 来源 | URL / 路径 |
| --- | --- |
| 公开 SDK 文档（可能新于钉选） | https://pi.dev/docs/latest/sdk |
| 公开事件流说明 | https://pi.dev/docs/latest/json |
| 公开设置参考 | https://pi.dev/docs/latest/settings |
| 仓库 | https://github.com/earendil-works/pi |
| 钉选 SDK 文档 | `node_modules/@earendil-works/pi-coding-agent/docs/sdk.md` |
| 钉选事件语义 | `node_modules/@earendil-works/pi-coding-agent/docs/json.md` |
| 钉选设置默认值 | `node_modules/@earendil-works/pi-coding-agent/docs/settings.md` |
| 全控装配示例 | `examples/sdk/12-full-control.ts` |
| 会话替换示例 | `examples/sdk/13-session-runtime.ts` |
| 设置示例 | `examples/sdk/10-settings.ts` |
| 会话持久化示例 | `examples/sdk/11-sessions.ts` |

## 复用矩阵

| 官方能力 | 决定 | 说明 |
| --- | --- | --- |
| `SessionManager` JSONL v3 | 采用 | 唯一 transcript。画布轮次写 `beeftv.canvas.turn` / `.started` custom entry，不另建聊天库。 |
| `createAgentSession` | 采用 | 每条画布会话的工厂：`noTools: "builtin"` + `customTools` + 全控 `resourceLoader`。 |
| `AgentSession.prompt` / `abort` / `subscribe` / `dispose` | 采用 | `prompt({ expandPromptTemplates: false, source: "rpc" })`。替换前 `await abort()` 再 `dispose()`，与 Runtime `teardownCurrent` 相同。 |
| `AgentSessionRuntime` | 不采用 | 官方 factory 面向 cwd 发现服务；`switchSession` 用 `SessionManager.open(path, undefined)`，会丢掉本宿主按画布编码的 `sessionDir`。画布级 `customTools` 仍要重绑。显式 dispose 更短且正确。 |
| `SettingsManager.inMemory` | 采用并显式钉值 | 压缩 `enabled/16384/20000`，重试 `3/2000/60000`，`provider.maxRetries=0`。不提高这些上限。`cacheWarming: "off"`，避免官方默认 streaming 额外打模型。 |
| 全控 `ResourceLoader` + `createExtensionRuntime` | 采用 | Skills 由 Go 按用户生成的不可变轮次快照提供；SDK `loadSkills` 显式读取可信入口，`includeDefaults: false`。prompts/themes/AGENTS 为空，不读 cwd 祖先。 |
| `noTools: "builtin"` + `customTools` | 采用 | 不暴露 read/bash/edit/write 等内置工具。 |
| `AgentSession.reload()` | 采用 | 仅在两轮对话之间刷新 Skill 清单；保留 SessionManager 与聊天历史。自定义 `read` 仅允许当前快照中的技能文件，不提供通用磁盘读取或 shell。 |
| `message_end` | 采用 | 本轮助手正文的权威来源。 |
| `agent_settled` | 采用 | 自动工作结束。宿主 `turn_end` 只在 prompt 返回且观察到 settled（或 prompt 抛错）后发出。 |
| `agent_end` | 不当前终态 | `willRetry` 时后面还有压缩恢复或重试。不映射成 `turn_end`。 |
| `compaction_*` / `auto_retry_*` | 转发 | 经现有 NDJSON 的 `lifecycle` 行到 React；面板只显示用户语。 |
| `tool_execution_start/update/end` | 转发并收敛 | NDJSON `tool` 行只包含调用 ID、工具名、阶段和结束时的 `isError`。不转发 args、partialResult、result。更新事件每次调用只保留首次；重复更新不制造百分比或额外渲染。 |
| `DefaultResourceLoader` | 不采用 | 会发现 AGENTS/skills/shell。 |
| 官方 TUI / RPC 实验服务器 | 不采用 | 产品 UI 是 React + Go 代理。 |
| `@earendil-works/pi-web-ui` | 不采用 | 钉选时代的包是过期 Lit + IndexedDB，且会在浏览器里跑 Agent。 |

## 宿主内部分工

### 助手流式界面与工具记录

- `createTurnObserver` 同时聚合工具状态，结算时将 `toolActivity` 写入原有 `beeftv.turn` 自定义记录及 `turn_end`；历史仍由官方 SessionManager 提供，Go 同源代理按行转发。未收到工具结束事件的调用记为 `interrupted`，不能当作成功。并行调用按调用 ID 独立更新，结束状态不因迟到事件退回执行中。
- 工具完成只表示本次接口调用返回；ASR、生成和导出的后台任务仍由原有任务界面显示真实结果。模型思考增量保持不转发，正文继续过滤思考标签。
- 画布与剪辑共用的 Sidebar 使用 `AIMessageMarkdown`（Streamdown）、专用代码块、WorkingDots 和 GenerationToolCard。流式正文以现有 50 ms 合并刷新，并用 deferred rendering 避免 Markdown 解析挤占输入交互；代码高亮在流式结束后进行。
- 历史区使用稳定回调和反馈对象；30 回合起使用现有 TanStack Virtual 动态高度列表，overscan 为 4。当前流式回合独立渲染。用户向上浏览后停止自动跟随，提供“回到最新消息”，展开内容和高度变化只在跟随状态下滚到底部。
- 零模型页面验收入口：`web/test/fixtures/assistant-streaming-server.ts`。它用生产 Sidebar、hook 和 NDJSON 解析器，模拟短对话、200 回合历史、工具开始/更新/失败及 Markdown 分片，按钮手动推进。使用 Bun 启动；不会调用真实模型，也不会写入产品工程。

2026-10-08 验证记录：前端专项 66 项、宿主事件与官方日志专项 5 项通过；`tsc --noEmit` 和 `build:desktop` 通过（构建仍有大 chunk 提示）。浏览器使用上述零模型页面验证工具开始、更新、成功与失败、表格/代码块、历史折叠、停止及明暗主题。200 回合在本次视口挂载 7–11 个历史行，向上浏览时工具事件到达前后 `scrollTop` 均为 13276.032，未被强制拉到底部。截图保存在本机忽略目录 `.local/cache/assistant-streaming/`。这些证据不代表付费模型、整机帧率或安装包验收；桌面安装包未重新打包。

另外运行的 `interrupted-host.test.mjs` 有两项失败：第一项仍预期历史没有 `workflows: []`，与现有历史投影不一致；第二项模拟 `/chat` 请求缺少当前必填的 `skillSnapshot`，无法进入工具执行而超时。上述断言与请求在本次改动前即如此，未修改这些旧 fixture，也没有恢复过时接口。

| 模块 | 责任 |
| --- | --- |
| `session-owner.mjs` | 官方会话创建、按画布预约队列、替换、abort+dispose、原子指针、prompt 结算。 |
| `operation-bridge.mjs` | 已鉴权 `/api/ops`、scope 注入、`customTools`。 |
| `server.mjs` | 本机 HTTP、鉴权、预算 fetch 包装、NDJSON、SIGTERM/SIGINT 释放会话。 |

## 会话所有权

- 预约按 `canvasId`：`ensureSession` / `replaceSession` / `acquireChatSession` 共享一条队列；不同画布并行。
- `acquireChatSession` 在同一把锁里 restore/create 并置 `busy`，然后才释放锁去跑 prompt。忙碌会话的 replace 在工厂之前拒绝（409 `session_busy`）。
- 候选先 `createAgentSession`，指针 `current.*.tmp` + `rename` 成功后才写入 Map；指针失败则 dispose 候选、保留旧活动会话。
- `ensureSession` 只把缺失指针（`ENOENT`）和 `session_not_found` 当成可回退：先 list 可恢复历史，再新建。EISDIR、损坏 JSON、SDK 装配失败原样抛出。
- `disposeOwnedSession` 用 `disposed` 标记，abort+dispose 只走一次。进程 `SIGTERM`/`SIGINT` 先把 store 标为关闭，排空该画布预约队列里已入队的 ensure/replace/chat 占位，再 `disposeAll`。关闭后新的预约直接失败。`SIGKILL` 仍无法拦截，中断回执语义不变。

## 仍由本产品持有

- 画布 scope、operationId、用户确认后的生成、单轮/总预算、中断回执、按画布身份。
- React 只消费 `/api/assistant/*` 流，不在浏览器建 Agent 或 SessionManager。

## 已验证（钉选 0.87.1）

- `session-owner.test.mjs`：真实 `createAgentSession` 创建 / 替换 / `abort`+`dispose`，以及 SessionManager JSONL 往返（不打模型）。并发 replace、指针 EISDIR 回滚、chat 占 busy、ensure 失败不吞。
- `session-settings.test.mjs`：真实 `SettingsManager.inMemory` 读出压缩/重试钉值与 `cacheWarming: "off"`。
- `session-lifecycle-host.test.mjs`：真实宿主 HTTP 新建/并发替换、忙碌 409、指针目录失败、SIGTERM 释放（本地替身模型）。
- `interrupted-host.test.mjs`：SIGKILL 后重启仍能读到 `turn_interrupted` 原话。
- `host-runtime-probe.test.mjs`：预算耗尽、素材参数、引用画布读取。
- React：`lifecycle` 与 `agent_end` 都不结算回合；压缩/重试文案不出现内部事件名。

## 限制

- 未接官方 web-ui / TUI / 实验服务器。
- 未升级 SDK。
- 压缩与自动重试依赖官方内部路径；测试覆盖事件映射与设置钉值，不打付费模型。
- 官方 `SessionManager` 在出现 assistant 消息前不落 jsonl。刚创建就被替换或释放的会话可能不会出现在 list 里；活动会话仍以内存 Map 与 `current.json` 为准。
- Go 运行时、操作层、数据库、生成链路不在本切片。
