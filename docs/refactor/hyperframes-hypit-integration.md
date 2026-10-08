# HyperFrames 与 Hypit 集成状态

## 文件导入与 Studio 中文界面

- 剪辑页工具栏新增“从文件导入”，支持图片、视频和音频，先通过现有资源上传与素材持久化通道保存到资产库，再依次加入轨道。操作身份在重试时保留；已加入的文件不再次追加，失败时展示实际错误。
- Studio 网关对钉选前端模块的界面文字表达式进行中文转换，覆盖常用按钮、菜单、属性、快捷键提示和导出设置。保留变量标识、协议值、文件名与工程内容；不对预览画面或用户编写的 HTML 做翻译。加入 `acorn@8.19.0` 解析界面模块，打包脚本包含中文转换模块。
- 本轮前端及桌面预览编译通过；实际 Studio 浏览器检查确认导出、播放、轨道工具和导出设置显示中文，没有页面脚本错误，并检查转换不改写工程文字及协议值。文件选择和加入轨道由用户手动验收，本轮未运行整套模型或渲染测试。
- 用户补充切割目前正常，本轮没有改动切割实现。
- 补齐 Studio 小按钮的悬停说明，包含播放、时间线工具、关键帧、属性、三维变换、调色及音频提示。动态 Tooltip 和原生 `title` 在展示时翻译，不修改其来源表或快捷键值；撤销提示同时翻译操作名称。小范围浏览器检查确认撤销、重做、关联选择、吸附、波纹编辑及全屏提示为中文且无页面脚本错误；四份上游界面模块转换后解析通过，工程文字、协议值与说明来源表保持原值，未运行整套测试。

当前产品边界：外层导航提供独立“剪辑编辑”，复用完整 HyperFrames Studio；每份剪辑工程独立保存，通过统一资产库导入素材。画布保留 BeefTV 原有基础剪辑，不打开 HyperFrames。剪辑助手继续使用同一个 pi 内核，按独立剪辑工程隔离会话与工具范围；Hypit 结果以可编辑场景进入工程。当前底座仍为 `hyperframes@0.8.130`。下文页面联调结果属于此前“画布入口”版本，不能视作本次独立工程与主题调整的验收。

## 本次手动验收调整

- 外层导航新增“剪辑编辑”；`/editing` 提供工程列表、新建和重命名，`/editing/:projectId` 打开独立工程。移除画布新增的 HyperFrames 按钮，画布原有基础轨道与视频节点编辑不改动。
- 本地 schema v15 新增 `editing_projects`，不创建隐藏 `canvas_projects`。Go 校验独立工程归属，实际视频源、撤销与导出仍由原编辑运行端持久化；`cut_` 编号隔离剪辑会话，助手回合保存归属元数据，原生时间线使用自己的版本与历史，不把元数据当成视频源快照。
- 编辑页使用当前工程名，返回独立工程列表；素材导入、Hypit 制作与导出入库继续共用资产库。生成新素材的入口去画布工程列表，不绑定某一画布。
- Studio 启动票据带产品明暗主题，页面启动前设置原生 `data-theme`/`color-scheme`，随后通过来源与窗口校验的消息同步产品颜色。背景、表面、文字、边框、轨道和主操作映射产品 token；产品导航统一控制主题，Studio 不独立切换。同步只作用于 Studio 界面，不给预览中的视频画面添加滤镜或主题颜色。
- 按用户要求，本次只做必要编译与预览更新，未运行新增整套浏览器、视频渲染或模型验收。此前测量与通过项作为历史证据保留。

## 已有实现与证据

| 能力 | 实现 | 本轮证据及边界 |
| --- | --- | --- |
| 剪辑入口、现成 Studio 前端 | React 编辑路由、Go 管理 Node 编辑运行端、独立本机 Studio 地址 | 生产 React 页面与实际桌面后端、Studio 联调通过；Wails 启动绑定由测试夹具提供，未验证原生窗口或完整安装包 |
| 连续项目 Agent | 复用现有 pi SessionManager 和 Assistant 面板，发送时固定编辑工作区 | 真实 pi 宿主通过本地模拟模型启动原生 Hypit，随后在同一会话的剪辑回合提交可编辑场景；只读模式不提供写工具 |
| 原生 Hypit 制作 | 官方 Skill 加载、受控作者文件、实际 CLI check/plan/build、独立执行进程 | 实际 0.2.17 分发的检查、计划、制作和 Build Result 读取通过；没有另建模型循环，也没有用模拟产物替代 Hypit |
| 参考输入 | 统一资产库资源复制、内容哈希、图片/视频抽帧 | 图片和视频返回实际 JPEG；参考数据不会写入操作日志，不接受 Agent 自报 URL 或主机路径 |
| 候选加入与替换 | 制作任务列表、追加到末尾、替换主轨道选中片段 | 替换保留原位置、轨道和可见长度；短候选拒绝。人工替换用原生普通撤销，Agent 提交用对应历史条目撤销 |
| 视觉场景导入 | `edit-host/hypit-scenes.mjs` 将编译文档转成原生子场景 | 使用实际 Hypit 编译器输出；没有把场景先压成 MP4 |
| 资源导入 | 显式资源到文件绑定、字节大小和 SHA-256 检查、本地资源闭包检查 | 缺失资源、候选资源被修改均被拒绝；拒绝后没有半个场景或多余撤销记录 |
| 原始制作输入保护 | 候选目录保存编译文档、资源绑定及音频轨道，工作工程使用独立副本 | 手动改标题后，候选中的原始标题仍保留；候选源记录也验证哈希 |
| 局部时钟 | 每个挂载实例具有独立 Hypit 全局状态、内部文字时间线和 seek 订阅；主时间线只驱动实例源时间 | 24 fps 场景导入 30 fps 工程，1.25 秒分割，后半段移到 2 秒；预览与成片在 2.5 秒均对应源第 42 帧；任意往返定位不串实例 |
| 字体与逐字动画 | 内部文本时间线跟随局部时钟，字体准备 Promise 加入 HF 渲染屏障 | 真实字体与逐字透明度动画，在分割、移动、重开后仍保持正确时刻 |
| 音频 | `edit-host/hypit-audio.mjs` 将另外交付的 Hypit AudioTrack 转为场景内原生音频元素 | 实际 MP4 含音轨；前段、后段有声音，中间移动产生的空档为静音 |
| 撤销与重开 | 复用 HF 持久历史；元素编号在输入写入时固定 | 手动标题修改、分割和移动后重开，撤销时长与移动仍保留手改标题；预览不会再产生编号修改的历史记录 |
| 受控提交 | 本机一次性入口票据、会话 Cookie、工程归属、版本 CAS、操作幂等、源文件事务日志 | 并发覆盖、重复提交、旧候选、失败写入和中断恢复的对应测试通过 |
| 冻结版本导出 | 从源检查点复制独立工程；每次导出在独立 Node 进程中运行上游渲染器 | 渲染开始后把当前工程缩短到 1 秒，输出仍为提交时的 113 帧；修复同进程关闭/重开 Studio 后浏览器池无法复用的问题 |

## 输入与执行合同

私有运行端的候选输入包含：

```ts
{
  baseRevision: number;
  logicalKey?: string;
  document: HypitHyperframesDocument;
  audioTracks?: HypitAudioTrack[];
  resources?: { resource: string; path: string }[];
  files?: { path: string; text?: string; base64?: string; sha256?: string }[];
}
```

`document` 来自 Hypit 的视觉编译器，其 HTML 保留 `hypit-resource://` 声明。资源在宿主导入时绑定本地文件。Hypit 的视觉编译文档不包含音频轨；调用方需要同时交付 `audioTracks` 或已制作好的 WAV 音轨，不能从视觉 HTML 推断声音。

音频路径目前覆盖非循环、有效源范围内、保留音高的恒速剪辑和不重叠的线性淡入淡出。循环、相位、复杂音频 presentation 等需要先交付 Hypit 制作的 WAV stem，未完成的映射会明确拒绝，不能静默丢掉声音。是否能够编辑更多音频结构，需要继续补充真实样例。

`scene.html` 是可修改的工作副本；候选 `source.json` 和候选资源保持原始制作输入。重复提交使用同一操作身份，不再次复制文件。工程已变化时保留候选并返回冲突，当前没有自动三方合并。

Studio 原有导出按钮仍调用原生接口，但经过宿主后先冻结版本，返回真实 job ID、输入版本和 export ID。进度、取消和下载继续使用 Studio 的协议；输入清单和渲染状态分别保存到编辑文档外的 `exports/<export-id>/`。渲染进程只收到系统运行环境和明确的媒体工具配置，不继承业务宿主令牌及模型凭据。

## 复现检查

在 `edit-host` 中设置实际 Hypit 源目录、可运行的 Chrome Headless Shell 和测试字体位置后运行：

```powershell
$env:BEEFTV_TEST_HYPIT_ROOT = '<Hypit source directory>'
$env:BEEFTV_HYPIT_ROOT = '<Hypit 0.2.17 distribution directory>'
$env:BEEFTV_TEST_CHROME = '<chrome-headless-shell executable>'
$env:BEEFTV_TEST_FONT = '<local Arial TTF file>'
$env:BEEFTV_TEST_RICH = '1'
$env:BEEFTV_TEST_RENDER = '1'
$env:BEEFTV_TEST_ARTIFACT_DIR = '<local validation artifact directory>'
node --test test/*.test.mjs
```

Agent 工具和完整会话检查在 `agent-host` 设置同一 `BEEFTV_HYPIT_ROOT` 后执行 `node --test edit-bridge.test.mjs hypit-bridge.test.mjs hypit-session.integration.test.mjs`。会话测试启动实际 pi 宿主、Hypit 和 Studio，模型及 Go 接口边界使用本机协议夹具，验证同一 session 的跨工作区调用；Go 的权限边界由独立专项验证。它不验证真实模型的参考理解或创作质量。真实视频、冻结输入清单和测量结果保存在本地验证目录，构建产物不提交到 Git。

视频测量结果：320×480，30 fps，113 帧。2.5 秒处绿色物体中心约为 `(155.52, 211.49)`，对应源第 42 帧；音频片段 RMS 约为 0.243 和 0.244，中间空档为 0。导出帧也已人工查看，确认手改标题、帧计数和逐字标题可见。

## 完整目标仍需完成

1. 用真实模型完成参考分析和完整复刻验收，并完善候选预览、对照与局部重做界面。官方 Skill、原生制作和候选加入/替换已接通，不代表已经达到 Hypit 完整作品的效果。
2. 对接 Hypit 生成类节点与 BeefTV 现有审批/任务渠道。当前使用本地执行端，图片、视频等新素材先走现有画布生成提议并入库，再作为 Hypit 输入；剪辑页提议按钮会明确导航“去画布生成”。不配置隐式 HypiHub 执行端。
3. 统一资产库导入与导出入库已接通，实际页面验收记录见下文；画布和剪辑共享资产，不互相传文件。完整原生桌面窗口验收另列第 7 项。
4. 将 HF 历史提交与宿主源事务的失败/崩溃边界一并验证；现有源文件恢复测试不能证明全部历史元数据也具有原子恢复能力。
5. 完成外部/生成场景的预览隔离。Studio 多处依赖同源 iframe DOM，当前项目级本机源隔离不能替代无业务权限的 preview origin 和跨源编辑桥。
6. 完成进行中任务自动恢复和发布包生命周期。制作取消已验证；重开将失去执行进程的任务标为 interrupted，保留冻结输入和结果，不声称自动续跑。已完成导出持久访问已验证。
7. 在真实 Windows Wails 包中验证入口、嵌入 Cookie/来源、连续 Agent、字体、媒体工具和运行依赖；开发环境测试不能证明发行包可用。
8. 用已有 Hypit 完整作品验证视频素材、跨镜头图形、语音/字幕和配乐，以及整套编辑、局部重做、重开、撤销和导出流程。本轮 3 秒回归样例只是关键底层验收，不能替代完整复刻验收。

目标仍然进行中。

## Agent 到 Hypit 的执行链路

官方 `loadSkillsFromDir` 从固定 Hypit 0.2.17 分发加载 Skill，复用现有 ResourceLoader 和 SessionManager。`hypit_*` 是这个 Agent 的工具，负责读官方参考、读写作者文件、导入已授权素材、查看参考帧、启动制作、查询或取消任务以及发布候选。画布回合首次使用时打开当前项目的制作工程；剪辑回合使用发送时冻结的工程身份。

作者项目保存在编辑数据目录的 `hypit/project/`，每次执行复制到 `hypit/jobs/<job-id>/project/`。写入要求旧内容哈希，操作回执先登记 pending 再写文件，重放可识别写入成功但回执尚未完成的情况；后来的人工作品不会被重放覆盖。运行只开放 check、plan、build 和显式 SVRun。作者组件放在 `packages/<folder>/`，冻结时复制为普通本地包；Agent 工具不能安装包、写凭据或 Runtime 配置。

执行端调用官方 CLI，等待实际 Build Work 和 Build Result 完成，再读取 Composition 与 Timeline、资源和音轨并调用实际 HyperFrames 编译器。只有已完成、哈希未变化的结果能够成为候选。制作过程中不修改主轨道；加入或替换才提交新的轨道版本。人工明确选择时可以在当前版本审阅后加入旧候选；Agent 不能自行绕过候选的原版本保护。

替换沿用目标主片段的开始时间、轨道、长度和挂载身份，工作内容换成新候选的独立副本。原场景和原候选仍保留。操作人的身份由 Go 根据真实界面/宿主凭据确定，调用方不能冒充人工写入。HF 普通撤销按人工历史回退，Agent 可先读 `edit_history`，再用 `edit_undo_entry` 撤销真实 Agent 记录；后续文件冲突时停止，不提供强制丢弃人工修改选项。主 HTML 使用监视目录外暂存、完整写入后原子替换，并对 Windows 短暂文件占用做有界重试。

素材输入单文件最多 512 MB，作者文本单文件最多 256 KB，候选交付资源目前单文件最多 32 MB。外部文件资源只可解析到本次冻结输入清单中的本地文件，并再次验证哈希；不从制作结果任意读取主机文件。运行进程不继承业务令牌或模型密钥，但作者组件仍是本机 Node 代码，环境变量过滤、路径检查和本地执行端不是操作系统沙箱。不能把这套机制宣称为可安全执行任意不可信代码。

开发环境可通过 `BEEFTV_HYPIT_ROOT` 指定固定分发，也可找到相邻 Hypit 检出目录。Agent 打包清单已包含新增桥接与分发发现模块。新增编辑运行端打包器已经独立验证 Windows 原生制作与导出；将它接入整套桌面发布流水线、验证完整 Wails 安装包仍待完成。

前一轮验证：编辑运行端 12 项全部通过，包含实际 Hypit check/plan/build、输入抽帧、取消、中断记录、候选加入/替换/撤销及真实浏览器渲染；Agent 专项 7 项全部通过，包含真实宿主跨工作区的同一会话；两组均无跳过。Go 的资产归属、编辑回合权限、真实私有媒体通道与重启后导出下载专项通过；前端 TypeScript 检查通过。当时未调用付费模型、未验收完整 Wails 安装包或实际页面按钮；后续页面验收见下文。

## 编辑运行端打包

`scripts/package-edit-host.mjs` 从编辑运行端锁文件在干净目录安装生产依赖，包含固定 `@hypit/hypit@0.2.17`。官方 npm 分发没有 Skill；打包器从上述固定 Git 提交的干净 `skills/hypit/` 复制原始 Skill。npm 包及许可文件保持原样，不复制开发仓库的 node_modules、凭据或运行数据。

打包时显式提供以下输入：

```powershell
$env:BEEFTV_NODE_RUNTIME = '<Node 24.15.0 runtime root, including LICENSE>'
$env:BEEFTV_HYPIT_ROOT = '<clean Hypit checkout at the pinned commit>'
$env:BEEFTV_EDIT_BROWSER_ROOT = '<Chrome Headless Shell 153.0.8010.36 directory>'
$env:BEEFTV_EDIT_FFMPEG_ROOT = '<portable FFmpeg root with bin/ and LICENSE>'
bun scripts/package-edit-host.mjs windows/amd64 --verify-inputs
bun scripts/package-edit-host.mjs windows/amd64 '<application resources directory>/edit-host'
```

实际产品同时需要相邻 `agent-host/`，其现有打包器包含共享的 Hypit 分发发现模块。编辑运行端包自带 Node、完整浏览器目录、FFmpeg/FFprobe 及 Windows DLL，记录版本与执行文件 SHA-256；启动时检查目标、版本和二进制哈希，并设置包内路径。Hypit 的本地 Provider 通过配置显式选择这些工具。Windows 原生 Worker 需要系统 PowerShell，宿主补入 Windows 系统目录；Studio 的编码器发现仍依赖 PATH，因此仅将包内编码器目录优先加入工具路径。

专项复现增加 `$env:BEEFTV_TEST_BUN = '<Bun executable>'`，运行 `node --test scripts/package-edit-host.test.mjs`。Windows 原生测试在带空格的独立目录启动包内 Node，清空 PATH、不提供开发 Hypit 地址、使用空用户目录，读取实际 Skill，导入图片和参考帧，运行真实 Hypit build，加入轨道并从实际 Studio 导出。输出经包内 FFprobe 验证为 320×480、30 fps、90 帧。开发工具路径只参与打包输入，不出现在被测运行环境。两项专项通过、无跳过；现有 Agent 打包专项三项也通过。运行环境的篡改与路径逃逸另有专项检查。

此验证不等同于完整 Wails 安装包或商业发行验收。macOS 路径已设计，要求编码器没有非系统动态库依赖，但没有在 macOS 执行验收；CI 的媒体运行包准备与完整发布入口仍待接通。许可与来源文件保留不表示自动取得 Hypit 商业再分发授权。

补齐打包依赖后的回归：编辑运行端 13 项、同一 Agent 会话专项 7 项、编辑打包 2 项、既有 Agent 打包 3 项全部通过，均无跳过。打包测试包含实际制作与 MP4 导出；运行依赖的篡改、路径逃逸和目标不符会在设置工具路径前拒绝。原有局部时钟、音轨、撤销、重开和导出视频再次验证通过。后续页面联调又扩展了跨站 iframe 检查，当前结果见下文。

## 统一资产库接入

剪辑页新增复用现有资产选择器的“资产库”入口，选择一个已保存的图片、视频或音频后追加到轨道末尾。Go 从所属资产记录解析本地资源，私有运行通道流式传入素材；编辑工作副本保留 `data-beeftv-asset-id`、`data-beeftv-resource-id` 与内容哈希，临时 URL 不进入工程。原生历史记录覆盖素材导入，重复操作不追加第二个片段。

新增“导出结果”列表，完成的 MP4 可通过现有资源上传、生成资产幂等和资产持久化流程保存到统一资产库；保存成功后才能显示已保存。新导出的文件保存在冻结导出目录，已完成的列表与下载不依赖 Studio 短期任务内存。画布可通过原有资产库入口使用这些视频，不新增剪辑向画布直接复制文件的通道。

本地结构 v14 保存剪辑资产来源引用，服务删除、数据库删除事务、资产更新和素材库替换均保护这些来源；引用包含撤销历史。响应不确定的导入保留引用以便重试，当前没有清理历史和释放引用的界面。进行中导出重启恢复、完整 Windows 包仍未验收；新按钮的实际浏览器联调已通过，见下文。

这次验证结果：

- 编辑运行端 8 项测试通过，无跳过；随后扩展的实际编译器/浏览器回归也通过：把已导出的带声 MP4 作为资产再次加入另一工程，在预览中定位到 2.5 秒并再次导出，仍有 113 帧及音轨。
- Go 专项通过：当前资产/画布归属校验、真实私有通道流式导入及幂等、跨工程拒绝、来源删除保护、更新/替换保护、结果不确定时保留来源、运行端重启后完成结果列表和下载。重启下载测试使用协议夹具，真实媒体可用性由上述 MP4 回归另行验证。
- 当时前端 TypeScript 检查通过，尚未点击验收资产选择与成片保存按钮；后续已完成下面的实际页面流程。
- 扩大到 `asset`、`repository`、`database` 全包检查时，数据库包通过，资产和仓储包存在 Windows 临时 SQLite 文件清理失败（文件仍被打开）。相关既有测试的文件数据库连接未在临时目录回收前全部关闭；没有将这些失败记作全套通过，也没有修改这些无关测试夹具。

## 实际产品页面联调

`web/scripts/edit-product-browser-e2e.mjs` 使用生产 React 构建、实际 Go 桌面 profile、SQLite 与实际 Studio，在 Chrome Headless Shell 中逐步点击页面。`backend/test-support/edit-browser/main.go` 是专用后端夹具：启动凭据仅通过私有就绪文件交给测试，测试结束关闭运行端并移除凭据文件。浏览器的原生 Wails `RuntimeConfig` 绑定由测试启动脚本提供，因此它证明页面与后端链路，不代替原生 WebView2 窗口验收。

七项检查全部通过：

1. 在 `wails.localhost` 页面点击原画布的“剪辑编辑”，跨站嵌入完整 Studio。
2. 在剪辑资产选择器选择后端保存的图片并加入轨道，确认工程版本增加。
3. 制作面板读取当前所属工程。
4. 使用实际 Hypit 制作 3 秒可编辑场景，通过面板追加到已有 5 秒图片片段之后。
5. 点击 Studio 原生 Export，将实际成片通过“保存到资产库”写入后端，并下载资源测量为 320×480、30 fps、240 帧。
6. 重开页面再保存同一导出，后端仍只有同一素材编号、同一资源编号。
7. 返回画布，通过原有“从素材库插入”选择成片并插入；再次读取后端画布，确认视频节点保留正确资产编号。

最终运行没有页面脚本错误。测试禁止浏览器访问非本机网络，未使用付费模型或外部媒体生成。制作作者文件由夹具提供，实际 Hypit CLI 及渲染器完成制作；这不是让真实模型理解参考视频的验收。此轮编辑运行端 14 项通过、无跳过，包含实际跨站 Cookie/来源拒绝与局部时钟、字体、音轨、撤销、重开及视频导出回归；更新后的干净编辑运行包 2 项也通过、无跳过。前端生产构建通过，存在已有的大 chunk 提示。

联调修复及边界：

- 桌面父页面与本机编辑端跨站时，使用 HttpOnly、Secure、SameSite=None、Partitioned 会话 Cookie；同主机使用 Strict。一次性票据绑定父页面来源，写入仍校验编辑端 Origin、归属和版本。Chrome 实际 iframe 写入通过，携带 Cookie 的父页面来源写入被拒绝；macOS WebKit 与原生 Windows 窗口尚未验收。
- 工程元数据读取等待已提交事务后，释放写锁再处理缩略图等工作；源文件和预览读取继续持有源检查锁，避免慢缩略图阻塞素材导入。
- 固定版本上游 SSE 在客户端断开后仍无限等待。`edit-host/patches/hyperframes@0.8.130.patch` 改为等待 abort 并释放订阅，已登记 Bun 锁文件并随干净打包复制，关闭测试不再残留上游定时器。
- 新工程从本地固定 GSAP 分发加载 MotionPathPlugin，消除该样例对 CDN 的依赖；没有迁移或覆盖已有工程源文件，其他作者场景的外部资源仍需单独核对。
- 成片保存改为等待 `persistWorkspaceAssetLink` 的实际后端写入回执。仅完成本地生成资产缓存不能显示成功；重复保存也重新确认后端持久化。按钮明确提供无障碍名称，避免退出加载动画的图标改变其操作名称。
- Studio 原生 render 文件名通过所属工程的持久 `job.json` 映射到冻结输出，拒绝路径与非完成结果，支持 GET/HEAD；不从任意主机路径读取。当前下载不支持 Range，长视频定位仍需后续验证。
- 原生 Studio 的下载链接由编辑 iframe 内的带凭证 fetch 读取，再以 Blob 下载；直接链接交给 Chromium 下载管理器会丢失 Partitioned 会话 Cookie 并返回 403。仅拦截当前工程的原生导出链接，不放宽服务端鉴权。顶部“导出结果”提供持久记录的“下载视频”，重开软件仍可取回已完成成片，无需重新渲染。
- 下载专项通过：跨站 iframe 内读取 200，原始直接下载取消；修复后浏览器下载完成，未授权直接请求仍为 403。用用户已有 MP4 的副本复验，下载字节与导出文件一致；不生成新视频、不调用付费模型。该检查运行于 Chromium 桌面 iframe 模拟，仍由用户确认实际 WebView2 下载体验。

复现页面检查：先构建 `web`，在 `backend` 将 `./test-support/edit-browser` 构建到 `.local/cache/edit-browser-tools/backend-fixture.exe`（相对仓库根），再设置以下环境运行脚本：

```powershell
$env:BEEFTV_HYPIT_ROOT = '<Hypit 0.2.17 distribution directory>'
$env:BEEFTV_TEST_NODE = '<Node 24.15.0 executable>'
$env:BEEFTV_TEST_CHROME = '<Chrome Headless Shell 153.0.8010.36 executable>'
$env:HYPERFRAMES_BROWSER_PATH = $env:BEEFTV_TEST_CHROME
$env:PRODUCER_HEADLESS_SHELL_PATH = $env:BEEFTV_TEST_CHROME
cd web
node scripts/edit-product-browser-e2e.mjs
```

本机 FFmpeg/FFprobe 可从工具路径发现；也可用 `PRODUCER_FFMPEG_PATH`、`PRODUCER_FFPROBE_PATH` 显式指定。截图、测量视频与结果清单保存在 `.local/cache/edit-product-browser/<run-id>/`，测试数据库保存在 `.local/project-workbench-debug/<run-id>/`。这轮旧 MinGW 开发工具链的夹具构建使用仅作用于该命令的 `GOEXPERIMENT=nodwarf5`；正式发布仍要求仓库已有的 DWARF 5 编译器检查，不能把此开发绕行记作发布验收。

当前可作为原型阶段的联调收尾。后续优先两项：原生桌面窗口走完整流程；真实模型与完整参考作品覆盖手改、局部重做、撤销和导出。预览隔离、完整发布流水线及许可授权仍按上面的未完成项保留，目标没有标记完成。

## 手动验收预览

按用户要求，本阶段停止扩展自动验收，交给用户实际体验。已生成 Windows 开发预览程序 `.local/cache/edit-browser-tools/BeefTV-preview.exe`，启动脚本为 `scripts/start-editing-preview.ps1`，使用独立数据目录 `.local/project-workbench-debug/edit-manual-preview`，包含前一轮验证的“剪辑流程验收”演示工程。这一程序使用真实 Wails 窗口与绑定，没有替换 `RuntimeConfig` 或开启远程调试；它尚未由用户完成手动验收。

预览依赖当前检出目录的编辑运行端、固定 Node/Hypit 与媒体工具，不是可发给其他电脑的安装包。前端构建产物已经复制到实际 Go embed 的 `backend/cmd/desktop/frontend/dist`；跳过前端准备的 Wails 构建不能仅凭 EXE 编译成功推断页面资源已经嵌入。此开发构建仍使用命令范围内的 `nodwarf5`，不替代正式工具链验收。

重新打开：在仓库根运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-editing-preview.ps1`。打开“剪辑流程验收”，点击“剪辑编辑”，体验轨道移动、裁剪、撤销、重开、导出入库及画布素材库插入。演示数据没有配置实际模型；验证对话制作前需要在产品设置中选择助手模型与渠道，不把预先制作的样例当作真实模型复刻效果。

## HyperFrames 官方技能与本地创作

CLI 仍固定 `0.8.130`；官方技能来自 npm 发布包 gitHead
`6791ea580c811fe3f1a532a2ced4bbed29008ee7`。`agent-host/skills/hyperframes`
提供产品入口、执行规则和完整的 21 套官方技能资源（927 个上游技能文件，另附 LICENSE、CREDITS）。
`upstream.json` 保存逐文件 SHA-256；`scripts/verify-hyperframes-skills.mjs`
校验版本、提交、全部资源和署名，Agent 打包前必须通过。资源保持上游相对路径，按需读取，不把全部文件装入模型上下文。
复现资源准备使用 `scripts/vendor-hyperframes-skills.mjs <exact-checkout>`；运行端不下载或更新技能。

Skill Hub 中显示“HyperFrames 视频创作”，默认启用，也可停用。复用已有用户状态、不可变版本和 Pi 同一会话的轮间 reload；用户导入包仍限制 512 个文件，完整内置 HyperFrames 包单独允许 1024 个，大小仍限制 20MB。SDK 仅发现产品顶层入口，内部官方 SKILL.md 是按需参考。

`agent-host/hyperframes-bridge.mjs` 注册上下文、候选、检查、截图、入轨、素材导入、冻结导出和状态工具。
每次执行检查冻结的剪辑工程、启用快照与技能版本，写操作采用会话内持久工具调用身份。
原有 `edit_*` 继续处理人工元素的文字、时间、样式与音频属性，`hypit_*` 保留完整制作链路。

`edit-host/hyperframes-scenes.mjs` 只在当前工程的候选目录生成 HTML/GSAP 子场景。
作者提交正文、CSS、定义 paused `tl` 的脚本及本地资产绑定；运行端生成 `<template>`、限定 CSS 作用域，并按当前挂载 ID 注册时间线。
禁止场景正文携带脚本、外部文档、事件处理器、联网资源；脚本遵循 DOM/GSAP 作者合同，不开放任意 shell 或依赖安装。
这是受控作者合同，不声称能隔离任意恶意 JavaScript；当前不接收并执行未知第三方 HTML 工程。

检查使用固定 Node 和官方 CLI 的绝对入口，参数由运行端生成、子进程不继承产品或模型密钥，输出和耗时受限。
检查工程将候选的相同文件复制到 `compositions/`，确保官方静态检查实际覆盖子场景，同时按原生挂载结构执行浏览器检查。
只跑 `lint`、浏览器被跳过、截图缺失、内容或检查摘要变化，都不能加入轨道。
当前 `check --snapshots` 同时检查运行、布局、动效和对比度；`snapshot` 返回实际 PNG 到 Pi。
不开放联网安装、自动升级、云发布、外部网站 capture、官方桌面跳转。
官方注册表的知识与包内示例保留，但不声称已离线分发其整个在线组件库；外部生成与素材仍走产品自己的工具。

入轨复用现有候选 promoter、原生历史窗口及来源检查。Agent 必须按候选起始版本提交，不能覆盖人工修改后的版本。
“制作任务”中的“动效候选”支持读取检查画面、重新检查、追加和替换选中片段；人工查看后可明确提交到当前版本。
导出复用现有 Studio 渲染接口、冻结来源快照和持久任务，结果继续进入“导出结果”及统一资产库。

最小必要验证：完整真实资源经过 Skill Hub 保存、物化与启停；官方 SDK 加载单一入口；
Agent 工具作用域、版本、图片响应、禁止候选重设版本和 HTTP 身份通过；Go 入口拒绝跨工程或非可信请求。
真实官方 CLI 检查覆盖主工程与子场景、截图已查看；原生标题动画与音频候选入轨后完成撤销、恢复、人工切割及冻结 MP4 导出，音轨存在，后续人工修改保留。
自动验证未调用付费模型，不能替代真实模型对用户需求的理解或复杂动效的审美验收。

分发核对：Windows Agent 与编辑运行包均从固定锁文件在干净暂存目录打包通过；
分发中的完整官方资源摘要与源码一致，新创作模块已包含在运行包内，编辑运行包包含固定 Node、CLI、浏览器及 FFmpeg/FFprobe。
手动验收预览已更新并启动，窗口正常响应。开发预览仍使用本机源码目录；这不等于已制作正式安装程序或通过跨平台发布验收。
验收入口：Skill Hub 查看并启用“HyperFrames 视频创作”；剪辑页助手描述标题动画需求，制作任务查看“动效候选”，导出结果取回成片。

### 固定版本的嵌套媒体时钟修复

实测 `0.8.130` 的媒体收集和运行时没有完整计入子场景挂载上的 `data-playback-start`。场景切割后，动画能接着播放，内部视频来源时间和音频音量／音效自动化却可能重新从开头计算。本地补丁将嵌套挂载窗口、来源裁剪与自动化偏移统一到原媒体时间；没有更换 CLI 版本。

`edit-host/hyperframes-media-clock.mjs` 提供修正算法；`scripts/patch-hyperframes-media-clock.mjs` 修改固定版本生成代码，`scripts/save-hyperframes-patch.mjs` 对照通过锁文件 SHA-512 校验的原始 npm 包生成 Bun 补丁。补丁包含七个分发文件，也保留已有 SSE 断开修复。三份核心运行时载体同步修改，并更新清单中的 SHA-256，未关闭运行时校验。编辑打包脚本显式包含媒体时钟模块，干净安装会应用锁定补丁。

完成后的证据：

- 实际官方 `check` 扫描主工程和子场景，运行浏览器并返回检查画面；`snapshot` 返回实际 PNG。
- 原生 GSAP 候选通过入轨、幂等重试、撤销和恢复；人工从中间切割后，预览中的音量曲线继续使用来源时钟。
- 实际冻结 MP4 导出保留音轨，测量证明淡入淡出和音效自动化连续；红色／蓝色视频验证第二段读取后半段来源画面。导出后继续人工修改不改变冻结输入，冲突撤销不会丢弃人工内容。
- 生产 React 页面接真实桌面 profile 的 Go 后端：Skill Hub 读取完整技能并完成启停，制作弹窗读取检查图并手动加入原生轨道。浏览器中没有页面脚本错误；Wails 绑定由私有测试引导提供，未把它写成原生窗口交互验收。
- 官方 SDK 单入口加载和同会话轮间 reload 通过；完整资源物化、启停、工具作用域、版本和图片响应、HTTP 归属边界通过。
- 最终 Windows 编辑运行包从干净目录和冻结锁文件生成，模块及七个上游补丁与当前源码一致。清空 PATH 后仍以包内 Node、CLI 和浏览器完成 `lint`、`check`、五帧截图；完整 Agent 运行包也包含相同技能资料和工具模块。
- 已正常关闭旧开发预览并重新启动，加载当前运行端和修复；窗口响应正常，保留原验收数据和模型设置。

本轮仅做上述范围的必要验证，没有调用付费模型，没有执行整个仓库测试，也没有制作正式安装程序。复杂嵌套、速度曲线及跨平台发布不由这个基础音视频用例证明。用户继续在现有预览中验收实际对话效果。
