# Seal 仓库结构

仓库地址：[wenlei-xu/Seal](https://github.com/wenlei-xu/Seal)。当前默认分支从 Seal 源码快照建立独立提交历史，后续提交用于维护当前产品。源码来源和第三方许可仍由 `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES.md` 记录。

## 当前源码

| 目录 | 内容 |
| --- | --- |
| `web/` | React / TypeScript 界面，画布、剪辑外壳、助手及设置 |
| `backend/` | Go 服务、Wails 桌面程序、本地工程与任务持久化 |
| `agent-host/` | 官方 pi SDK 宿主、受控工具与内置技能 |
| `edit-host/` | HyperFrames Studio 接入、剪辑与渲染运行端 |
| `plugin-packages/` | 模型渠道和第三方协议描述 |
| `release/` | 固定版本的发行依赖清单 |
| `scripts/`、`tools/` | 当前构建、打包、维护与检查工具 |
| `assets/seal/` | Seal 图标和字标 |
| `fixtures/` | 开发与测试样例 |
| `docs/` | 使用、开发、架构及发布说明 |

## 文档与发布入口

- 使用：[快速开始](../QUICKSTART.md)。
- 开发：[桌面开发](desktop-local-development.md)。
- 发布：[桌面发布](desktop-release.md)，由 `.github/workflows/release-desktop.yml` 构建与打包。
- 更新记录：`SEAL_CHANGELOG.md`。`CHANGELOG.md` 仅为入口，不再维护第二份发布内容。
- 文档索引：[Seal 文档](index.md)。`docs/refactor/` 中带有上游版本号或旧提交号的内容属于历史设计背景，不代表当前发行验收。

## 已退出当前源码的内容

原项目宣传视频、README 按钮及截图、过时的内部计划、旧版发布验收回执和配套验收脚本已从当前源码树归档。本地整理前完整 Git 历史、原始文件及未提交改动存放在 Git 忽略的 `.local/repository-reset/`，不进入 GitHub、安装包或用户工作区。

仍用于创作灵感的图片迁移到 `web/public/inspiration-assets/`，保留对应素材的署名和许可。

## 保留历史名称的范围

环境变量、Go module、内部包名、插件后缀、数据库迁移和旧工作区识别可能继续使用 `BeefTV` 或 `infinite-canvas` 标识。这些属于技术兼容边界，不能用全局字符串替换清理。

`LICENSE`、`NOTICE`、第三方声明及测试中的原项目名称用于保留来源或验证兼容性。手动 CI 中固定的上游下载地址是旧工作区兼容测试输入，不是 Seal 产品下载入口。

`runtime-v1` 是现有媒体依赖 Release，产品草稿是此前源码构建的候选包。整理源码历史不会修改这些资产，也不会把旧包声明为当前源码的构建结果。
