# Seal 品牌资源

采用确认稿下方的白色趴卧海豹与小写 `seal` 字标。

- `mark-white.svg` / `wordmark-white.svg` / `lockup-white.svg`：深色界面使用，透明背景。
- `*-black.svg`：浅色界面的反色版本。
- `app-icon.png` / `app-icon.ico`：黑底白色海豹，桌面应用和快捷方式使用。
- PNG 是对应 SVG 的导出版本；SVG 字标已经转成轮廓，不依赖系统字体。

资源由 `scripts/export-seal-brand.mjs` 从确认稿下方轮廓导出。运行时传入确认稿路径，并通过 `SEAL_SHARP_MODULE` 指定可用的 Sharp 模块。
