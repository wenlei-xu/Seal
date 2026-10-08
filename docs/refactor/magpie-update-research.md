# Magpie 更新与频繁发布机制调研

调研时间：2026-10-08，公开 API 采样截至 04:50 UTC（北京时间 12:50）。本文只提供 Seal 的设计参考，不实施代码，不运行测试或构建，不读取凭据；通过 GitHub 公共 API 与固定 commit 的 raw 源码取证，没有全量 clone。

取证基线：

- `yetone/magpie` main：[`69b67727942b07358fb0c62e3cf3853ad769eee6`](https://github.com/yetone/magpie/commit/69b67727942b07358fb0c62e3cf3853ad769eee6)。
- `yetone/magpie-releases` main：[`9aa6a7e502c97f8e21e1df7b6880d6cbdc0c273e`](https://github.com/yetone/magpie-releases/commit/9aa6a7e502c97f8e21e1df7b6880d6cbdc0c273e)。
- 最新正式版 `v0.1.1110` 的源码 ref 解析为 [`e4c292f655f5263341b83be6642480c94b228932`](https://github.com/yetone/magpie/commit/e4c292f655f5263341b83be6642480c94b228932)。已逐文件比较 `internal/update/update.go`、`internal/update/blocked.go`、`internal/gui/update.go`、`internal/settings/settings.go`、源码仓库 release workflow、`site/worker.js`，其内容与上述 main 基线一致；这不是对发布二进制可重现构建的验证。

## 结论

**确认：Magpie 的频繁发布依靠 tag 触发自动构建、独立发布仓库、后台全量下载、重启或退出时安装，以及安装前再次发现最新版本。** 当前客户端更新协议和产物不是差分更新协议：macOS 下载整包 `.app.zip`，Windows/Linux 下载对应完整可执行文件。[版本与资源选择](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/update.go#L163-L178)、[打包目标](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/Makefile#L88-L119)、[发布触发](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/.github/workflows/release.yml#L7-L48)。

**推断：Seal 可以先借鉴发布自动化、下载与安装分离、忙碌时延迟重启、安装前追上最新版本；仅凭 Magpie 频繁发版，不能推导出 Seal 必须先做模块拆包或差分更新。** 这是设计取舍，不是对 Seal 当前实现的审计结论。

## 已确认：版本发现与信任来源

客户端默认 `GET https://usemagpie.ai/api/latest`；可通过 `MAGPIE_UPDATE_FEED` 覆盖，源码注明用于测试。客户端读取 `version`、Markdown `notes`、release 页面 `url`、按文件名索引的 `assets`，每个资源含 `url`、`size`、`sha256`；服务端还返回 `published`，客户端 Release 结构未使用这个字段。[客户端协议](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/update.go#L37-L102)、[服务端协议](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/site/worker.js#L1-L27)。

更新 feed 是站点 Worker 对 `yetone/magpie-releases` 的整理：正常路径读取 GitHub `releases/latest` 的版本、说明、发布时间和资源大小；**资源 SHA-256 来自同版本 release 附件 `SHA256SUMS`，不是 GitHub API 的 `digest` 字段**。最新结果缓存 300 秒；GitHub API 不可用时尝试 latest 页面重定向、校验和附件、release feed 与上次完整结果。[发现与降级](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/site/worker.js#L214-L298)、[校验和读取](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/site/worker.js#L466-L481)。

本次实测 feed 返回 `0.1.1110`，Windows x64 资源为完整 `magpie-windows-amd64.exe`，46,009,856 字节，SHA-256 为 `0db3d620949230d7e8fceee96c1a519ba85e06f14cd6fc8f5351ac0c1026ab45`；macOS arm64 更新 ZIP 为 17,265,796 字节。[动态 feed](https://usemagpie.ai/api/latest)、[该版本 release API](https://api.github.com/repos/yetone/magpie-releases/releases/tags/v0.1.1110)。动态接口后续会变化，上述为本次采样结果。

客户端拒绝缺少 SHA-256 的资源，下载时流式计算 SHA-256，哈希不一致就删除下载，不安装。下载镜像只改资源下载 URL，期望哈希仍取自官方 feed；镜像不会提供客户端接受的校验值。[下载校验](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/update.go#L588-L662)、[镜像边界](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/mirror.go#L14-L24)。

**SHA-256 是完整性校验，不是数字签名。** 在已检查的客户端协议、Worker 和发布 workflow 中，没有发现用嵌入公钥验证 feed/manifest 的步骤；其校验值信任官方 HTTPS feed，而 feed 的校验值来自发布仓库。macOS 的代码签名是另一层验证，见下文。不能把 Windows 的哈希校验写成“签名更新”。[Release/Asset 字段](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/update.go#L49-L62)、[发布校验和生成](https://github.com/yetone/magpie-releases/blob/9aa6a7e502c97f8e21e1df7b6880d6cbdc0c273e/.github/workflows/release.yml#L336-L340)。

## 已确认：检查、下载与安装时机

| 环节 | 当前行为 | 官方源码 |
| --- | --- | --- |
| 自动检查 | 应用启动等待 5 秒；循环每分钟读取设置并判断是否到期。默认每 6 小时检查，可选 30 分钟、1 小时、6 小时、24 小时 | [检查循环](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/gui/update.go#L93-L130)、[候选频率](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/settings/settings.go#L580-L584)、[默认值](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/settings/settings.go#L1022-L1027) |
| 设置关闭 | `NoAutoUpdate` 关闭自动发现，因而不自动下载；设置页手动 Check 或 `magpie update` 仍可检查。CLI 提供 `magpie update auto on/off/30m/1h/6h/24h` | [设置合同](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/settings/settings.go#L169-L187)、[CLI](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/update_cli.go#L18-L51) |
| 隐藏提示 | `NoUpdatePill`、单版本 `UpdateSkip` 只隐藏更新提示，仍可下载并在退出时安装；下一版本可重新出现 | [设置合同](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/settings/settings.go#L169-L174) |
| 发现新版 | 只有 release 版本自行更新；可替换的安装后台 Stage 到 `ready`，否则 `available` 引导 release 页面。下载超时 10 分钟、最多 3 次尝试 | [状态机](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/gui/update.go#L193-L261)、[重试](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/update.go#L588-L607) |
| 重启安装 | 主动请求重启时先重查 feed，若已有更新版本则下载它；说明弹窗中的已下载版本在 feed 超过 5 分钟未查时也重查 | [freshen/recheck](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/gui/update.go#L146-L177)、[安装入口](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/gui/update.go#L444-L492) |
| 忙碌时重启 | 默认等待 gateway 请求、工具等待都结束，并安静 10 秒；最多等 1 小时，超时保留已下载版本，可取消或立即重启。等待完成前重查最新版 | [忙碌等待](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/gui/update_wait.go#L9-L43)、[等待循环](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/gui/update_wait.go#L98-L150) |
| 退出安装 | 桌面 app 的 OnShutdown 调用 `install(false)`，安装成功后下次启动就是新版；退出时不弹管理员密码，需提权的位置留到主动重启时处理 | [关闭回调](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/gui/app.go#L336-L343)、[安装策略](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/gui/update.go#L264-L311) |

这些行为属于“先下载、稍后生效”。没有看到定时检查一发现新版就强制重启当前 app 的逻辑。[下载完成处理](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/gui/update.go#L258-L261)。

## 已确认：Windows 替换与恢复边界

当前实现**没有单独的 Windows 替换 helper 可执行文件**。运行中的 Magpie 先把下载存为 `exe.new`，通过 Windows 以 suspended/no-window 创建进程再立即终止，预查应用控制是否允许启动；然后把运行中的 exe 改名为 `.old`（必要时 `.old-2` 等），将 `.new` rename 到正式 exe。rename 失败恢复旧 exe；移走旧文件会短暂重试，以处理防病毒或同步软件的文件占用。[Stage 与替换](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/update.go#L347-L481)、[Windows 预启动](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/proc_windows.go#L54-L69)。

主动重启路径以 detached 新进程启动新版，传递 `MAGPIE_REPLACES` 和 `MAGPIE_STARTED` 标记文件。旧进程最多等待 20 秒；新版无法启动、过早退出或没有标记，就移除/移走新版并恢复 `.old`，旧进程继续运行。拒绝版本记入本机 `update-blocked.json`，自动检查不反复下载同一版本，手动检查可以重试。[启动确认与恢复](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/blocked.go#L70-L173)、[持久阻止记录](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/blocked.go#L176-L214)、[GUI 恢复](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/gui/update.go#L503-L542)。

**边界：启动标记不证明业务健康、数据库迁移或工作区成功恢复。** `AwaitPredecessor()` 一开始就写 `reportStarted()`，随后才等待旧进程退出释放端口。退出时安装仅做预启动与替换，没有同等的重启后 marker 确认；没有发现安装后的持久健康观察或迁移失败自动回退协议。Windows 没有自动提权安装路径，目录不能写时转手动下载。[标记时点](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/update.go#L566-L577)、[提权支持范围](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/admin.go#L23-L33)。

## 已确认与未核实：macOS 签名、公证

客户端下载更新 ZIP、解包 `.app`，执行 `codesign --verify --deep --strict`，比较新旧 app 的 `TeamIdentifier`。替换先移走旧 `.app`，第二次 rename 失败就恢复；成功后删旧包。重开由 shell 等当前 PID 退出后调用 `open`，没有 Windows 的启动标记回退链。[签名验证](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/update.go#L226-L278)、[替换与重开](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/update.go#L292-L326)。

发布 workflow 支持 Developer ID、hardened runtime、timestamp、DMG 公证，要求 notarytool 结果 Accepted，然后为 DMG 和 ZIP 内 app staple，并用 spctl assess；**这条链是条件执行**，缺签名证书时生成 ad-hoc 签名，不公证。Windows/Linux workflow 明确注明不签名。[条件签名与公证](https://github.com/yetone/magpie-releases/blob/9aa6a7e502c97f8e21e1df7b6880d6cbdc0c273e/.github/workflows/release.yml#L70-L170)、[平台声明](https://github.com/yetone/magpie-releases/blob/9aa6a7e502c97f8e21e1df7b6880d6cbdc0c273e/.github/workflows/release.yml#L8-L18)。

未核实：本次没有下载并检查 macOS 二进制、具体证书/Team ID、最新 release 的公证票据，也没有读取 Actions 机密或日志。不能仅凭仓库说明“Signed builds”保证每次正式包都已 Developer ID 签名公证。另一个源码边界是 `team()` 找不到标识时返回空字符串，而 `sameSigner()` 仅比较相等，并未要求非空；因此不能把它概括为无条件固定 Team ID 的强制白名单。[精确实现](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/internal/update/update.go#L257-L277)。

## 已确认：发版触发、流水线与实际频率

源码仓库 push `v*` tag（或手动输入已有 version）向独立 `yetone/magpie-releases` 发 `repository_dispatch: release`，携带 ref/version。签名 secrets 只在发布仓库。发布仓库也可手动输入 ref/version，设置只构建不发布。[源码触发 workflow](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/.github/workflows/release.yml#L1-L48)、[发布端输入](https://github.com/yetone/magpie-releases/blob/9aa6a7e502c97f8e21e1df7b6880d6cbdc0c273e/.github/workflows/release.yml#L23-L43)。

发布端并行构建 macOS 两架构、跨平台 CLI、Windows GUI 两架构、Linux GUI 两架构；Windows 和 Linux 在对应 runner 实际启动并检查 gateway，publish 依赖这些 jobs 成功。产物汇合后生成 `SHA256SUMS`、按前一 tag 的提交生成说明（可用模型生成，否则提交列表降级）、创建非 draft release，最后更新 Homebrew tap。[构建与启动检查](https://github.com/yetone/magpie-releases/blob/9aa6a7e502c97f8e21e1df7b6880d6cbdc0c273e/.github/workflows/release.yml#L185-L340)、[发布与 tap](https://github.com/yetone/magpie-releases/blob/9aa6a7e502c97f8e21e1df7b6880d6cbdc0c273e/.github/workflows/release.yml#L342-L478)。这些是流水线已有的检查，不是本次运行测试的结果。

本次公共 API 返回的最近 10 个正式 release（`prerelease=false`），时间均为 **UTC**，北京时间需加 8 小时：

| 版本 | published_at（UTC） |
| --- | --- |
| [v0.1.1110](https://github.com/yetone/magpie-releases/releases/tag/v0.1.1110) | 2026-10-08 04:31:18 |
| [v0.1.1109](https://github.com/yetone/magpie-releases/releases/tag/v0.1.1109) | 2026-10-08 02:29:39 |
| [v0.1.1108](https://github.com/yetone/magpie-releases/releases/tag/v0.1.1108) | 2026-10-08 00:11:32 |
| [v0.1.1107](https://github.com/yetone/magpie-releases/releases/tag/v0.1.1107) | 2026-10-07 22:55:47 |
| [v0.1.1106](https://github.com/yetone/magpie-releases/releases/tag/v0.1.1106) | 2026-10-07 18:51:41 |
| [v0.1.1105](https://github.com/yetone/magpie-releases/releases/tag/v0.1.1105) | 2026-10-07 17:49:34 |
| [v0.1.1104](https://github.com/yetone/magpie-releases/releases/tag/v0.1.1104) | 2026-10-07 14:37:08 |
| [v0.1.1103](https://github.com/yetone/magpie-releases/releases/tag/v0.1.1103) | 2026-10-07 10:56:01 |
| [v0.1.1102](https://github.com/yetone/magpie-releases/releases/tag/v0.1.1102) | 2026-10-07 09:52:16 |
| [v0.1.1101](https://github.com/yetone/magpie-releases/releases/tag/v0.1.1101) | 2026-10-07 09:14:48 |

10 次发布跨度 19 小时 16 分 30 秒；9 个间隔约 37.5–244.1 分钟。这证明这一短窗口发布频繁，不证明全年平均频率、固定发版时间表或每次提交自动发版。[公共 release API](https://api.github.com/repos/yetone/magpie-releases/releases?per_page=10)。已查 release workflow 没有 schedule 或每次 main push 发布触发；**谁/什么自动创建版本 tag 尚未核实**，不能将 tag 触发流水线描述成自动决定发版时机。[触发条件](https://github.com/yetone/magpie/blob/69b67727942b07358fb0c62e3cf3853ad769eee6/.github/workflows/release.yml#L7-L16)。

## 设计启示与待确认项

以下均为建议，不是 Magpie 已实现或 Seal 已完成的事实：

1. 先打通可靠的版本发布和分发：固定版本、按平台产物、完整包校验、发布门禁、可读说明、单一 feed。频繁发布不要求先投入差分更新。
2. 更新状态要分开表达发现、下载、已准备、等待空闲、安装失败；重启前重查最新版，减少用户一次重启仍落后多个版本。
3. Seal 的媒体生成、导出等长任务需要定义自己的“可重启”条件，不能直接复用 Magpie gateway 的 busy 定义；先保存工作区，再停止/续接任务。
4. 发布可信性需独立于下载完整性设计：保留/建立签名 manifest 验证，macOS 明确强制签名公证要求，Windows 明确代码签名策略；不把 SHA-256 当数字签名。
5. 回退验收要明确区分“能启动”“进程已写标记”“业务可用”“迁移成功”。Magpie 的 Windows 启动恢复值得参考，其 marker 不足以当 Seal 的业务健康证明。

未核实或未见证据：差分/delta 包、Range 断点续传（当前 fetch 整体重试，没有 Range 请求）、运行中模块热替换、灰度/分批发布协议、长期发布统计、最新 macOS 实物签名票据、发版 tag 的创建自动化。上述限定于本次检查的更新目录、GUI 更新路径、站点 Worker、Makefile、两仓库 release workflows 与最新 release 资产；不作全仓库或所有外部系统不存在这些能力的断言。
