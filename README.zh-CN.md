# DOOM Controller for MemoMind

[English](README.md)

在 MemoMind 眼镜上玩 DOOM。手机运行游戏并提供触控手柄，眼镜显示游戏画面。手机上的大字 **手机状态面板（Phone HUD）** 显示生命、护甲、弹药、武器和钥匙。

当前版本 **0.1.5**，内置完整 **Freedoom Phase 1 0.11.3**，不包含商业 DOOM / DOOM II 数据。这是社区项目，并非 MemoMind 或 id Software 官方产品。

<img src="docs/images/phone-hud.png" width="300" alt="手机手柄界面：顶部大字显示生命、护甲和弹药，下方是方向、开火和武器按钮">

*截图来自 Browser Studio 模拟器，不是透过实体眼镜拍摄的画面。*

## 在手机和眼镜上玩

需要安装 MemoMind App 的手机、兼容的 MemoMind 眼镜，以及 **GM Web Bridge** 眼镜插件。从本源码构建并安装，还需要向 [开发者平台](https://open-platform.memo-mind.com/) 获取 MemoMind SDK 和 Desktop Studio。

仓库包含游戏源码、已生成的游戏引擎和 Freedoom 数据。SDK、Studio、Web Bridge 需单独获取；这里暂不提供手机安装包或正在生效的安装二维码。

先按 [构建与预览](docs/BUILD.md) 准备手机安装包，再按 [安装说明](docs/INSTALL.md) 在 Studio 中生成包含手机和眼镜两端的双端安装包。只有手机安装包不能完成眼镜端安装。

游戏启动后点「菜单」，再用「确认」选择新游戏、章节和难度；方向按钮也用于菜单导航。

| 控件 | 操作 |
| --- | --- |
| 方向键 | 按住移动或转向，松开停止 |
| 开火 | 按住射击，松开停止 |
| 横移 | 点按开启，左右键改为横移；再次点按关闭 |
| 奔跑 | 点按开启或关闭 |
| 使用 | 开门或阵亡重开 |
| 武器按钮 | 选择已拥有的武器 |
| 暂停 | 暂停游戏，准备好后点继续 |

横移和奔跑不用一直按住第二个按钮。开火始终是按压式。页面失焦、隐藏或眼镜断连时，会释放输入并暂停，恢复后手动继续。

手机状态面板约每秒更新四次，读取真实游戏状态。默认「流畅」画质减少图像细节，保留完整视野；也可切换原生或全屏显示。

## 从源码开始

使用 **Node.js 20 或更高版本**，在仓库目录执行：

```sh
npm ci
npm test
npm run verify:assets
```

这些命令运行真实引擎测试并校验内置数据，不需要 SDK、眼镜、Python 或 C 编译器。

预览手机手柄需要外部 MemoMind SDK。PowerShell 示例：

```powershell
# 改成你自己的 SDK 根目录。
$env:MEMOMIND_SDK_ROOT = 'D:/development/plugin-open-platform'
npm run build
npm run preview
```

POSIX shell 使用 `export MEMOMIND_SDK_ROOT=/path/to/plugin-open-platform`。打开预览命令输出的本地地址即可。Browser Studio 预览不能代替眼镜实测。

浏览器测试、手机打包、资源下载及引擎重建见 [构建指南](docs/BUILD.md)。重新下载资源需要 Python 3，重建 C 引擎需要 Emscripten 3.1.74；普通测试和构建可使用仓库已包含的引擎及游戏数据。

## 当前限制

- 不提供音频、游戏进度存读档界面、PWAD/mod 或多人联机。
- 可导入合法取得的 IWAD，最大 32 MiB；保存的是文件引用，不是游戏进度。
- 眼镜刷新受连接、宿主和场景影响；应用统计的完成发送帧不等于物理面板刷新率。

已接受的游戏版本有用户真机反馈，公开源码构建经过本地引擎及浏览器验证。哪些已测、哪些仍需真机检查，见 [验证记录](docs/VALIDATION.md)。

## 更多资料

| 文档 | 内容 |
| --- | --- |
| [用户指南](docs/USER_GUIDE.md) | 操作、手机状态面板、资源与画质档位 |
| [架构](docs/ARCHITECTURE.md) | 手机、引擎与眼镜如何协作 |
| [来源与许可](docs/SOURCES.md) | 上游版本、资源哈希与平台依赖 |
| [项目术语](GLOSSARY.md)与[决策记录](docs/decisions/README.md) | 统一用词与设计选择的依据 |
| [更新记录](CHANGELOG.md) | 截至 0.1.5 的变更 |
| [参与贡献](CONTRIBUTING.md) | 修改验证和问题反馈 |

## 许可

应用与引擎采用 **GPL-2.0-or-later**，Freedoom 数据采用 **BSD-3-Clause**，fflate 采用 **MIT**。原始声明和组件边界见 [LICENSE](LICENSE) 与 [第三方说明](THIRD_PARTY_NOTICES.md)。

MemoMind 组件适用其独立条款，属于外部依赖，不纳入本项目的 GPL 授权。公开含这些组件的安装包前，需要核实其分发条款。DOOM 与 MemoMind 名称归各自权利人所有。
