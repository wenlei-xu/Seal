# 自媒体账号数据采集：四个项目与 API 路线

## 调研范围与证据

目标：读取本人抖音、小红书账号的作品与表现，优先使用 HTTP API，减少浏览器自动化。此记录依据仓库源码、依赖文件和平台官方文档；未安装这些项目，未连接真实账号，未验证当前平台接口成功率。

本次核对的 main 提交：

| 项目 | 提交 |
| --- | --- |
| 3441293738/creatorhub | c588dd58e67dc7feed01d175edfd295e59e8f647 |
| orangexie05/creator-platform-data | 27e21185d911812ffba987d69a35a26e83c38be4 |
| Xavier-168/data-scientist-community | d0631c1d845e0cb6ec21b498d77fab9e7b024e73 |
| caidabai123/douyin-creator-mcp | e5d59bd857f34cc9f698f9d86bda9d225fcae990 |

## 结论

四个项目均不是已核实的、完整的纯官方 API 采集方案。CreatorHub 是网页接口直连与浏览器混合方案；creator-platform-data 通过浏览器发起或捕获网页接口请求；数据科学家与 douyin-creator-mcp 主要读取浏览器页面。

API 应进一步区分为官方开放接口、平台网页内部接口、第三方托管数据接口。是否返回 JSON，与是否需要 Playwright、是否具备正式开放权限，是三个不同问题。

## 1. CreatorHub

### 技术栈

- Python 后端：FastAPI、Uvicorn、asyncio。
- 持久化：SQLModel / SQLAlchemy、SQLite。
- 前端：现有 HTML / JavaScript 页面，加 React 19 与 Radix 组件；esbuild 构建。不能笼统称为所有界面均由 React 实现。
- 网络采集：httpx、curl_cffi；小红书签名使用 xhshow，部分签名通过 PyExecJS / Node 执行。
- 浏览器：Patchright，或连接系统 Chrome 的 CDP；业务代码使用兼容 Playwright 的接口。

来源：[依赖](https://github.com/3441293738/creatorhub/blob/main/requirements.txt)、[前端依赖](https://github.com/3441293738/creatorhub/blob/main/package.json)、[SQLite 初始化](https://github.com/3441293738/creatorhub/blob/main/app/db.py)、[浏览器管理](https://github.com/3441293738/creatorhub/blob/main/app/browser/manager.py)。

### 数据读取

抖音 `DouyinClient` 携带账号 Cookie、构造网页请求签名，再以 curl_cffi 请求 `www.douyin.com` 的网页接口；不是 OAuth 开放平台客户端。小红书 `XhsApiClient` 携带登录 Cookie 与请求签名，直接请求网页接口。监控引擎存在选择 HTTP 直连或浏览器读取的分支，因此不能说它全部依赖页面点击，也不能说它完全不需要浏览器。

来源：[抖音客户端](https://github.com/3441293738/creatorhub/blob/main/app/platforms/douyin/client.py)、[小红书客户端](https://github.com/3441293738/creatorhub/blob/main/app/platforms/xhs/client.py)、[监控调用链](https://github.com/3441293738/creatorhub/blob/main/app/engine/monitor.py)。

创作者已发布笔记接口也有 HTTP 客户端方法，但产品中仍存在打开笔记管理页面并捕获响应的路径。现有代码不足以证明所有本人后台指标都能由直连模块完整读取。公开作品互动、本人已发布作品列表、完播与曝光等深度指标必须分别验证。

来源：[创作者 HTTP 客户端](https://github.com/3441293738/creatorhub/blob/main/app/platforms/xhs/creator_api.py)、[浏览器创作者列表](https://github.com/3441293738/creatorhub/blob/main/app/browser/xhs_fetcher.py)、[产品调用方](https://github.com/3441293738/creatorhub/blob/main/app/main.py)。

判断：四者中最接近用户希望的采集方式，可参考其采集模块与监控调度；不宜整套搬入 BeefTV，也不应把网页签名接口描述为稳定官方 API。

## 2. creator-platform-data

### 技术栈

Python、Playwright、命令行脚本及 Skill 入口；输出结构化 TSV，并提供多账号批量采集和字段归一化。依赖文件只声明 Playwright，不是包含完整 Web 服务和仪表盘的应用。

来源：[依赖](https://github.com/orangexie05/creator-platform-data/blob/main/requirements.txt)、[README](https://github.com/orangexie05/creator-platform-data)、[统一字段](https://github.com/orangexie05/creator-platform-data/blob/main/references/unified-schema.md)。

### 数据读取

抖音脚本通过 `page.evaluate` 在已登录页面中调用 `fetch`，并启动持久化浏览器上下文。小红书列表通过输入日期、点击下一页，再由 `page.expect_response` 获取页面请求的 JSON；详情部分存在浏览器内 fetch。

来源：[抖音采集器](https://github.com/orangexie05/creator-platform-data/blob/main/scripts/douyin/collect_snapshot.py)、[小红书采集器](https://github.com/orangexie05/creator-platform-data/blob/main/scripts/xiaohongshu/collect_xiaohongshu.py)。

判断：取得的是接口结构化数据，但取数链路仍依赖浏览器；不符合完全移除 Playwright 的目标。字段定义可作设计参考。

## 3. 数据科学家 Community

### 技术栈

- Python 负责服务编排、数据整理、导出与分析；使用 pandas、openpyxl。
- 实际抖音、小红书采集脚本为 Node.js / JavaScript，依赖 Playwright。
- 本地 JSON、Excel、SQLite；可选飞书同步。
- 基础仪表盘使用 HTML / JavaScript；可选桌面壳为 Rust / Tauri 2 + React 19 + TypeScript + Vite。
- 当前项目优先支持 macOS。

来源：[Python 依赖](https://github.com/Xavier-168/data-scientist-community/blob/main/requirements.txt)、[Node 依赖](https://github.com/Xavier-168/data-scientist-community/blob/main/package.json)、[桌面前端依赖](https://github.com/Xavier-168/data-scientist-community/blob/main/desktop/package.json)、[Tauri 配置](https://github.com/Xavier-168/data-scientist-community/blob/main/desktop/src-tauri/Cargo.toml)、[README](https://github.com/Xavier-168/data-scientist-community)。

### 数据读取

抖音与小红书采集器启动持久化 Chrome，通过页面定位器、滚动、点击、页面文本与导出流程取得数据。飞书同步使用 API，不代表抖音、小红书采集也通过开放 API。

来源：[抖音脚本](https://github.com/Xavier-168/data-scientist-community/blob/main/scripts/douyin_export.mjs)、[小红书脚本](https://github.com/Xavier-168/data-scientist-community/blob/main/scripts/xiaohongshu_export.mjs)。

判断：可以参考数据规范化与分析体验，采集路线不符合本次 API 优先约束。

## 4. douyin-creator-mcp

### 技术栈与读取方式

Python 3.11+、FastMCP、Playwright、SQLite，提供 CLI 与 MCP 工具；不包含独立的可视化分析前端。浏览器层启动专用持久化 Chrome，通过页面 DOM 提取列表、详情、流量指标；数据层保存快照，MCP 层供 Agent 查询、对比、复盘。当前范围为 Windows 本机、单用户、单抖音账号。

来源：[依赖](https://github.com/caidabai123/douyin-creator-mcp/blob/main/pyproject.toml)、[浏览器会话](https://github.com/caidabai123/douyin-creator-mcp/blob/main/src/douyin_creator_mcp/browser/session.py)、[指标提取](https://github.com/caidabai123/douyin-creator-mcp/blob/main/src/douyin_creator_mcp/browser/extractors.py)、[数据库](https://github.com/caidabai123/douyin-creator-mcp/blob/main/src/douyin_creator_mcp/storage/db.py)、[README](https://github.com/caidabai123/douyin-creator-mcp)。

判断：MCP 只是 Agent 的调用协议，底层采集仍是 Playwright。可参考快照、缺失字段、数据时间与证据设计。

## API 路线与能力边界

### 官方开放 API

抖音存在视频和数据开放能力，但需要应用权限与账号授权；不能假设个人注册应用即可获得全部经营指标。具体 scope 应在当前控制台核验。`data.external.item` 的基础数据文档明确：后续数据次日约十点刷新，只返回三十天内创建视频的数据。这不能满足分钟级完整经营数据监测。

来源：[权限说明](https://open.douyin.com/platform/resource/docs/accession-guide/type-and-permission)、[当前授权文档](https://partner.open-douyin.com/docs/resource/zh-CN/dop/develop/sdk/mobile-app/permission/overall-permission)、[基础数据时效](https://open.douyin.com/platform/resource/docs/openapi/data-open-service/video-data/get-basic-data/)。

小红书公开账号授权文档当前只将 `basic_info` 标为已开放；`read_notes`、`user_profile` 标为规划中。不能据此承诺普通创作者已能用 OAuth 读取全部笔记与曝光、完播等指标；这也不等同于证明不存在任何定向合作能力。

来源：[权限范围](https://openaccount.xiaohongshu.com/docs/scope)、[接入说明](https://openaccount.xiaohongshu.com/docs/quick-start)、[API 目录](https://openaccount.xiaohongshu.com/docs/api-reference)。进一步说明见 [官方 API 专项调研](creator-official-api-research.md)。

### 网页接口 HTTP 直连

可以减少滚动点击与 DOM 解析，但仍依赖本人有效登录态、网页请求协议与平台字段。去掉 Playwright 不会自动解决登录过期、签名变更、数据延迟与访问限制。CreatorHub 的相关模块属于这一类；不能等同于官方 OAuth 能力。

### 第三方托管 API

TikHub 提供 REST API 与公开 Python SDK，可让产品端只发 HTTP 请求。文档包含抖音、小红书作品接口，以及抖音 creator_v2 的作品列表、总览、观看趋势等接口；creator_v2 的多个方法要求传入 Cookie。公开作品字段与本人深度指标必须区分。SDK 公开源码不代表托管数据服务免费或可自行完整部署；该服务按 API 调用收费。

来源：[SDK](https://github.com/TikHub/TikHub-API-Python-SDK)、[具体方法与参数](https://github.com/TikHub/TikHub-API-Python-SDK/blob/main/docs/reference.md)、[收费调用说明](https://github.com/TikHub/tikhub-plugin/blob/main/README.md)。

未验证第三方服务响应、数据时效、费用与小红书本人深度指标覆盖，不作可用性承诺。

## 对 BeefTV 的建议

这是实现建议，尚未开发。

1. 保留现有 React 前端、Go 后端与 SQLite。新增账号数据提供方，由 Go 定时通过 HTTP 请求取数；无需为此引入完整 Python Web 应用或浏览器自动化服务。
2. 优先判断实际需要的字段：公开互动可先评估第三方 HTTP API；本人播放、曝光、完播、涨粉需要按平台逐项确认授权能力。
3. 每次保存账号、作品 ID、指标、平台统计区间、采集时间、来源与缺失状态；区分累计值、当日增量和百分比。平台未提供的字段不填零。
4. Agent 查询已有快照并生成复盘，刷新由明确工具或定时调度触发；不让每次对话都重新批量取数。
5. 两个平台不必承诺同等字段覆盖。公开指标与后台指标分别展示，成功同步时间也不能当作平台数据更新时间。

本次仅增加调研文档，没有修改产品代码或执行构建、测试。
