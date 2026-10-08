# Seal

<p align="center"><img src="assets/seal/lockup-black.svg" width="380" alt="seal"></p>

Seal 是本地 AI 视频创作工作台，结合 AIGC 画布、独立剪辑工程和创作助手。

- 画布：生成、组织图片和视频素材。
- 剪辑：复用 HyperFrames Studio，支持轨道编辑、预览和导出。
- 创作助手：共享会话，调用已启用 Skill 与当前工程工具。
- Skill Hub：本地导入、查看、启停和删除技能。
- 模型配置：分别管理文字、图片、视频、语音和 ASR 渠道；本地 Whisper 可离线转写。

## 本地启动

桌面使用 React / TypeScript 前端与 Wails / Go 后端，工作区数据存储在本机。

```powershell
# Windows：准备好本地运行端后构建并打开桌面预览
.\scripts\build-editing-preview.ps1 -BuildWeb
.\scripts\start-editing-preview.ps1
```

macOS 构建入口为 `scripts/build-beeftv-release.sh`；正式 Windows 构建入口为 `scripts/build-beeftv-windows-release.ps1`。脚本的历史文件名保留，输出应用为 Seal。运行端准备见 [桌面开发](docs/desktop-local-development.md) 和 [发布说明](docs/desktop-release.md)。

开发 API 使用回环地址；通过 `CANVAS_BACKEND_DATA_DIR` 或 `CANVAS_DESKTOP_DATA_DIR` 显式指定开发工作区。不要把真实凭据或工作区数据库提交到版本库。

## 品牌与发行

[品牌资源](assets/seal/README.md) 使用白色趴卧海豹和小写 seal 字标。当前没有配置 Seal 官网、反馈地址或自动更新源，应用不会使用原产品的更新源升级。发布前需设置自己的签名密钥和更新地址。

新安装使用 Seal 数据目录；已存在的 BeefTV 数据目录继续读取，避免丢失工程和配置。内部环境变量、插件格式与部分协议标识保留兼容名称。

## 开源来源

本项目基于 [BeefTV](https://github.com/glanderness/BeefTV) 修改，后者包含 Infinite Canvas 的代码。原作者版权及 MIT 许可见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)，第三方组件见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。品牌替换不改变这些来源声明，各技能与运行端继续适用其各自许可证。
