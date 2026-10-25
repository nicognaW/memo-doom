# 原始资料、文献与来源审查

本项目没有依赖学术论文提出的算法成果；主要依据下列上游实现、数据与平台契约。下列链接是来源而非把第三方授权转成项目授权。

| 材料 | 固定版本/位置 | 用途与许可 |
| --- | --- | --- |
| [id Software DOOM](https://github.com/id-Software/DOOM) | 上游源代码沿革 | 引擎源头；保留原文件通知 |
| [doomgeneric](https://github.com/ozkl/doomgeneric/tree/e257a09527062bfb986b6e5e0780839b6cbd5b71) | e257a09527062bfb986b6e5e0780839b6cbd5b71 | 可移植引擎；GPL，完整源码位于 engine/vendor/doomgeneric |
| [Freedoom 0.11.3](https://github.com/freedoom/freedoom/releases/tag/v0.11.3) | Phase 1 完整数据 | BSD-3-Clause；保留 COPYING 和 CREDITS |
| [fflate](https://github.com/101arrowz/fflate/tree/v0.8.2) | 0.8.2 | 本地 DEFLATE 解压；MIT |
| [Emscripten / emsdk](https://github.com/emscripten-core/emsdk) | 3.1.74 | 双后端编译工具；外部安装 |
| [MemoMind 开发者平台](https://open-platform.memo-mind.com/) | Web SDK 0.1.0 / Bridge v2 | 外部平台依赖，适用独立条款 |
| [Playwright](https://github.com/microsoft/playwright/tree/v1.56.1) | 1.56.1 | 开发测试依赖，由 npm lock 固定，不随应用运行 |

## 引擎改动溯源

上游 git 工作树已移除 `.git` 后纳入完整源码。相对固定提交修改 `doomgeneric/doomgeneric.c`、`doomgeneric/d_loop.c`、`doomgeneric/i_system.c`；差异保留在 [doomgeneric-local-changes.patch](doomgeneric-local-changes.patch)。MemoMind 平台层单独位于 `engine/doomgeneric_memomind.c`，包括输入、画面及玩家 HUD 状态导出。不能把第三方原始文件当作本项目原创。

## 游戏数据完整性

固定官方归档 SHA-256：`28a5eafbb1285b78937bd408fcdd8f25f915432340eee79da692eae83bce5e8a`。

Phase 1 WAD SHA-256：`bc5739e88b20788845ce82ac0041effdecb4583ddbcdb05b9f899363eaa69892`。压缩流 SHA-256：`4d3ae3025e68b1375e98b84de40bc4fde0e9e4f97219a1b79fca1cbdbf775aa1`。

未删减关卡；压缩流来自该 ZIP 中的原始成员。`assets/freedoom.json` 和 `licenses/UPSTREAM.json` 保留机器可读来源。完整授权/署名见 `licenses/FREEDOOM-COPYING.txt`、`FREEDOOM-CREDITS.txt`。

## 平台材料边界

审查所用 SDK 根 LICENSE 指向 [MemoMind Open Platform Terms](https://open-platform.memo-mind.com/terms)，并未赋予仓库通用 MIT/GPL 许可。本次未能读取该在线条款正文，因此不推定平台组件的再分发权限。公开树不收录 Web SDK ESM、Web Bridge GMP/源代码、Studio、审核附件或含这些组件的安装包。

平台 API 的具体依据是外部 SDK 的 `PhoneSDK/docs/web-plugin/capability-contract.md`、`api-reference.md`、`lan-install.md` 及 bridge-contract 实现。文档没有把平台文档整篇复制到本仓库。公开二进制分发前应核实适用条款和配对包来源。此项不影响本地使用已取得的 SDK 进行测试。
