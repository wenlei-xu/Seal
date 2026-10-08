# 本地 Agent 创作扩充

本轮基础接入已实现，沿用官方 Pi SDK 0.87.1、既有工程归属、生成确认、任务与资产流程。权限体系扩展仍暂缓。本页区分实现、零模型证据与效果验收。

## 完整目标与当前进度

| 项目 | 当前实现 | 本轮证据 |
| --- | --- | --- |
| Video Use 内置技能 | 固定 `browser-use/video-use` 提交 `b877063835e6ea6e457124da7e28a0ae26691dc3`；31 个原始文件和 MIT 文件保持完整，产品入口替换外部安装与 ElevenLabs 执行要求 | 真实 Hub、启停、内置名称保护和旧快照通过；新运行包摘要及页面文件弹窗通过 |
| 本地 ASR | whisper.cpp CPU `1.9.2` 与多语言 Base；模型 147951465 字节，SHA-256 `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`；优先本地，已有 HTTP 服务仍可选择 | 真实语音由本地资产、任务 Worker 识别并持久保存，关库再开复用同一 Task；新分发在空 PATH 下完成同一流程；状态页面通过 |
| 统一生成渠道 | 同一助手提议图片、视频和配音，界面确认后使用已有渠道、任务、资产；独立剪辑不创建画布 | 图片与配音模拟渠道经真实准入/Worker 后再开库，丢失绑定响应仍复用原 Task，上游只提交一次；视频重开查询原上游 ID |
| Skill Creator 与风格沉淀 | 原 Codex 技能 9 个资源及 Apache-2.0 文件保存；用户技能创建、更新、格式验证、摘要保护；风格仅按明确要求保存为 Skill | 实际创建/更新、摘要冲突、跨用户拒绝、旧快照保留及下一轮生效通过；格式验证不声称为效果验证 |
| Skill 查找与下载 | 公开 GitHub 仓库搜索、指定子目录下载并保存真实 commit 和来源；无远程市场、脚本执行、依赖安装或自动升级 | 实际 GitHub 下载及包校验通过；子目录导入保留仓库 MIT 声明，跨用户读文件被拒绝 |
| 任务恢复 | 官方 SessionManager 保存步骤、任务/候选/文件摘要；提供继续和取消，实际状态独立查询；多步生成按 workflow/step 固定身份 | 官方 SDK 文件在没有完成条目时重新打开，步骤和原 Task ID 保留；活跃句柄不误报中断。跨轮次生成步骤使用同一操作身份，CAS 与回执冲突拒绝通过 |

## 现有变更位置

- `scripts/vendor-creator-skills.mjs`：两套内置技能资源复制与 SHA-256 清单验证；Agent 打包前验证。
- `agent-host/skills/video-use`、`skill-creator`：产品入口与未改写的原始分发。
- `backend/internal/transcription/local.go`：本地 CPU 识别、有限环境、实际句段与 token 时间戳。token 是近似模型对齐，不能声称为精确词级切点。
- `scripts/package-local-asr.mjs`：固定可分发运行包、CPU 动态库、模型、许可证及清单；编辑分发必须包含该运行包。
- `backend/internal/skills/hub_author.go`：作者格式检查、不可变安装、目标摘要保护、GitHub 来源与固定提交。
- `backend/internal/handler/assistant_creator.go`：受信任界面或有效当前工程回合；素材额外核对当前引用范围。
- `agent-host/creator-bridge.mjs`：同一 Pi 会话的 Skill 与 ASR 工具；不添加模型循环或脚本执行权限。
- `backend/internal/app/assistant_media.go`、`repository/assistant_media_proposal.go`：未计费生成提议、界面接受和原任务复用；本地结构 v17。
- `agent-host/workflow-journal.mjs`：官方会话步骤条目、修订号与回执；没有第二套聊天数据库。
- `web/src/pages/canvas/creator-media-tasks.tsx`、`creator-workflow.tsx`：任务进度、识别文本、取消与继续。
- `web/src/pages/settings/asr-settings-pane.tsx`：模型就绪、实际大小和精度说明。

## 本轮已获得的证据

两套原始技能资源分别为 31 和 9 个文件，逐文件摘要已校验。Skill Hub 物化、保留原文、启停与内置名称保护专项通过。
实际固定 whisper.cpp 和 142 MiB 模型已下载并核对 SHA-256；官方 JFK 样本离线识别成功，返回文本、句段和 token 时间戳。
Go 本地识别专项在真实运行包与样本条件下通过，无跳过；结果格式和原生工具不继承模型密钥也经过检查。

新的 Agent、编辑运行包从固定锁文件打包；编辑包包含 Base 模型与 CPU DLL。构建后的小范围宿主模块变动同步到验证包，并用自带 Node 重新加载核对。补齐了预览缺失的 85 个官方渠道插件包。
桌面预览已重新编译并打开；实际窗口标题为 BeefTV，存在有效窗口句柄且进程响应正常。保留原手动验收数据与模型配置。
新增 API 拒绝普通 loopback、错误工程、结束轮次和借用 UI/宿主的外部客户端；宿主无法代替界面确认付费生成。当前有效宿主和受信任 UI 可读 Hub。
前端类型检查与构建通过。浏览器联调使用真实桌面后端和新打包资源，确认技能列表、文件弹窗及 ASR 状态，无页面异常；Wails 启动绑定由测试夹具提供，不冒充真实桌面窗口验证。

没有跑全面验收或付费创作测试。真实中文识别效果、模型实际选择工具的质量、具体复刻成片质量留给手动验收，不能由零模型验证推断。当前本地 ASR 分发只准备 Windows x64。独立剪辑的生成方案首批使用文本输入和现有默认参数；不增加独立生成参数编辑器。

## 手动验收

在 Skill Hub 查看 Video Use 和 Skill Creator；在模型配置查看“语音识别”。引用音视频后要求助手“识别口播并保存剪辑步骤”，多步任务可从现有结果继续。生成图片、视频或配音时核对方案模型及文案，在“制作任务”确认。明确要求“把这次采纳的方法或风格保存成 Skill”后，在 Hub 查看助手沉淀的技能，下一轮生效。
