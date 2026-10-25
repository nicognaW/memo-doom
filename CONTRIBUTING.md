# 贡献说明

修改前请阅读 README、docs/ARCHITECTURE.md 和相关源文件。避免把改动放进外部 SDK；引擎上游改动请保留来源和补丁说明。

提交前运行 `npm test`、`npm run verify:assets`、`npm run verify:public` 和 `git diff --check`。新增公开文件先加入 Git 暂存区，公开检查以 Git 跟踪的文件清单为边界；它检查工作副本内容而非暂存版本。涉及触控、HUD 或生命周期时，用外部 SDK 执行 build 与 test:browser，再记录真机观察；浏览器截图不代替眼镜实测。

开火必须保持按压式；横移和奔跑为点按开关。避免要求用户同时按住修饰按钮操作。应用版本更新的交付应直接包含可用安装二维码和对应版本信息。

请勿提交 SDK/Studio、凭证、用户 IWAD、安装二维码、局域网地址、加密审核附件或 node_modules。以最小可复现步骤报告问题，附版本、实际后端、画质与脱敏诊断；公开截图前去掉个人信息。
