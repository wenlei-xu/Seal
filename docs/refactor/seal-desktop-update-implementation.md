# Seal GitHub 更新接入记录

2026-10-08，用户指定 wenlei-xu/Seal 同时存放源码和更新包。Git origin 保留上游，seal 远端指向用户仓库；来源、许可证和历史不清除。

## 已实现

- 默认更新源切换到 Seal Releases 的 desktop-update.json，嵌入新的 Ed25519 公钥；私钥只在 .local/release-signing 和 Actions Secret 中。
- 首次尚无正式 Release 的 404 作为“尚未发布公开更新”显示，不产生更新失败提示。
- 默认后台下载，偏好本地持久化；更新日志窗口可以手动检查和设置自动下载，下载完成后由用户保存并重启。
- 安装前等待剪辑界面已发送的写请求，阻止有创作任务、Agent 会话、剪辑制作或导出时安装。
- 更新包要求 edit-host、HyperFrames、Hypit、Node、Chrome Headless、FFmpeg、FFprobe 和 Whisper Base；缺少必需文件时拒绝打包或安装。Windows 替换及还原包含 edit-host。
- Windows 正式构建已加入剪辑运行端，修正浏览器脚本误当作 Node 模块导入、原生插件打包误选 WSL，以及生成无用 Wails 绑定时启动用户工作区的问题。
- 发布工作流不依赖 R2，按匹配标签或手动输入版本构建、检查、签名并创建草稿；明确手动选择时才直接发布稳定更新。
- Windows 媒体依赖用固定 ZIP、大小和摘要作为 CI 输入，Hypit Skill 使用固定源码提交。客户端仍为完整包更新。

## 已完成的本地检查

- 前端 TypeScript 检查、正式前端与原生 Windows 构建通过。
- 更新模块和打包签名检查通过，包括空 feed、编辑运行端缺失拒绝、替换和还原编辑运行端。
- 19 个前端更新控制器检查通过，包括自动下载不触发安装、保存拒绝时阻止安装、旧轮询不覆盖新状态。
- 完整随包 Node、Skill、Hypit、Studio、浏览器和编解码器在空 PATH 下完成制作、加入轨道及 320×480、90 帧 MP4 导出。
- GitHub Actions 工作流通过 actionlint，固定媒体 ZIP 摘要核验和实际解压通过。
- 本地 Windows ZIP 644442116 字节（约 615 MiB），签名清单公钥验证通过；这是未提交工作版本构建的候选，不直接冒充 GitHub 上已提交源码的正式产物。

## 边界

当前只发行 Windows amd64，更新为全量下载。尚未加入跨整个产品的原子维护屏障、数据库级更新恢复以及启动后的剪辑健康回滚；现有失败还原针对程序替换或进程创建失败。GitHub Actions 的执行和草稿发布以仓库实际运行状态为准，不因本地检查通过而宣称线上更新已发布。

用户自己的工程、素材、渠道凭据、Skill 和启停设置不属于安装包。打包目录不包含数据库、.env 或签名私钥；GitHub 签名 secret 不进入客户端。

## GitHub 首次执行结果（2026-10-08）

- 源码已推送到 [wenlei-xu/Seal](https://github.com/wenlei-xu/Seal)，签名 Secret 已配置，runtime-v1 媒体依赖包已作为预发布依赖上传。
- [发布流程](https://github.com/wenlei-xu/Seal/actions/runs/37736887582) 的 Windows 构建、打包、更新器检查、输入范围检查、真实 Hypit 制作和 MP4 导出、签名及上传全部通过。
- [v1.7.7 草稿](https://github.com/wenlei-xu/Seal/releases/tag/untagged-a0f6ec0fad6fe1e089e1) 对应源码提交 ee548399f0a4b3562c9b359a1c5afae4093adec7，尚未作为公开稳定更新发布。草稿需要仓库授权才能访问。
- 云端 ZIP 为 644259145 字节，SHA-256 为 1dd9554ce5e94ebf8c7888b81f506b7737896cb301f94e4e792b22fdf43c2d49。从仓库下载的清单通过本地公钥校验，其摘要和大小与 GitHub 资产元数据一致。
- 首次执行修复了 Git 换行转换及被忽略的官方 Skill 夹带文件，保留完整原始字节及摘要校验；同时修复 Windows 短路径、长路径和大小写别名导致冻结素材误判的问题，继续拒绝工程外文件及改变的输入。
- 开发预览连接源码目录，关闭自动安装。先手动安装完整 Seal.exe 包，后续使用应用内更新。
