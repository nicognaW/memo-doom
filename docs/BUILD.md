# 构建与测试

所有命令从本仓库根目录执行。目录可以任意放置，不依赖原 SDK 的 examples 层级。

## 资源与引擎

Node.js 20+，Python 3；编译 C 时使用 Emscripten 3.1.74（本地已核对版本）。已生成引擎纳入源码仓库，对应的完整 C 源码与平台层也一并保留。

```sh
npm ci
npm test
npm run verify:assets
python tools/fetch-assets.py
```

资源脚本从官方 Freedoom 发布获取固定 0.11.3 ZIP，验证归档 SHA-256，再保留原始 DEFLATE 数据。下载缓存位于 `.cache/`，不会进入 Git。0.11.3 是已验证版本，并非最新资源版本。

按 [emsdk 官方说明](https://github.com/emscripten-core/emsdk) 安装并激活 3.1.74，加载其环境后：

```sh
npm run build:engine
npm test
```

脚本读取激活环境的 `EMSDK`，也可设 `EMCC_PY` 为 `emcc.py` 的完整路径、`PYTHON` 为 Python 命令。自定义安装需要正确的 `EM_CONFIG`；两个后端由同一组 C 源码生成。

## 平台依赖

从 [MemoMind 开发者平台](https://open-platform.memo-mind.com/) 获取 Plugin Open Platform SDK，阅读其 LICENSE 和引用的条款。仓库不包含 SDK 运行时或 Studio。

PowerShell：

```powershell
$env:MEMOMIND_SDK_ROOT = 'D:/development/plugin-open-platform'
```

POSIX shell：

```sh
export MEMOMIND_SDK_ROOT=/path/to/plugin-open-platform
```

根路径必须包含 `PhoneSDK/tools/build-mmpkg.mjs`。构建调用 SDK 自带的 `bundlePhoneSdk()`，由外部 `packages/web-sdk` 和 `bridge-contract` 生成 ESM，不依赖 SDK 示例目录中的副本。本地验证基于 Web SDK 0.1.0 / Bridge v2。

```sh
npm run build
npm run preview
```

构建复制外部 SDK ESM 到忽略的 `dist/vendor/`。源码不含 SDK 文件；直接打开根目录 HTML 不能取代此构建流程。预览通过外部 Browser Studio 加载本仓库 `dist/`。

## 浏览器验证与打包

```sh
npx playwright install chromium
npm run test:browser
npm run package
```

可用 `CHROMIUM_EXECUTABLE` 指定本地 Chromium / Edge 完整路径。测试使用端口 4189，输出 `.artifacts/browser/`。需要浏览器和外部 SDK；CI 默认只做不依赖平台的真实引擎与资源测试。

手机包输出 `.artifacts/packages/doom-controller-0.1.5.mmpkg`。此包包含外部 SDK，属于本地构建产物，默认被 Git 忽略。它与原 Studio 接受包的逐字节一致性没有保证；游戏源代码及引擎基线保持 0.1.5。组合眼镜插件、安装二维码见 [INSTALL.md](INSTALL.md)。
