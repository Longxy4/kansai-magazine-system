# 関西通信发布系统

系统和刊物分为两个仓库：

| 仓库 | 用途 |
| --- | --- |
| [kansai-magazine-system](https://github.com/Longxy4/kansai-magazine-system) | 阅读器源码、PDF 转换工具、测试及共享发布流程 |
| [kansai-magazine](https://github.com/Longxy4/kansai-magazine) | 面向读者的杂志说明、每期 PDF、自动发布入口 |

读者网站继续使用原地址，每期阅读链接、二维码和带页码的链接保持有效。发布仓库通过 GitHub 的可复用工作流调用本系统，使用发布仓库自身的临时权限完成 Pages 部署，无需跨仓库密钥。

阅读链接： https://longxy4.github.io/kansai-magazine/?issue=2026-07

采用 [S-poony/Pages](https://github.com/S-poony/Pages) 的原有阅读界面和翻页引擎，无杂志首页。每期一个独立链接，电脑双页、手机竖屏单页。翻页、缩放、分享等操作在底部浮动栏：默认隐藏，鼠标移到页面底部时显示，移开后自动隐藏；手机点击底部唤出。页码显示当前页与总页数。支持 Ctrl＋鼠标滚轮、键盘 ＋／－ 及原有滑块缩放（1–3 倍）；分享窗口包含二维码和复制链接，复制后不弹成功提示。

左侧页面栏平时完全隐藏，没有文字或把手：电脑鼠标移到左侧边缘显示，移开后自动收起；手机点击左边缘中部展开，点击阅读区或关闭按钮收起。**ページ** 标签显示每页缩略图，点击即可跳转，当前阅读的页会高亮；**目次** 标签显示纯文字文章目录。缩略图复用 Pages 的原页面图片与跳转逻辑，目录链接不再弹出悬停预览图。

## 你以后每期只需要做三步

1. 打开 [issues 文件夹](https://github.com/Longxy4/kansai-magazine/tree/main/issues)，点击 **Add file → Upload files**。
2. 上传命名为 `YYYY-MM.pdf` 的 PDF，例如 `2027-01.pdf`，点击 **Commit changes** 保存到 `main`。
3. 打开 [Actions](https://github.com/Longxy4/kansai-magazine/actions)，等 **Publish magazine** 成功变绿。检查对应链接后分享：
   `https://longxy4.github.io/kansai-magazine/?issue=2027-01`

不需要安装软件、不需要手动转换图片、不需要更改代码。GitHub 会自动生成所有期号的阅读文件并发布，旧期链接继续有效。

同一期修订：在 `issues` 上传同名 PDF 覆盖即可，再等待发布成功。不要删除需要继续访问的旧期 PDF。

## PDF 格式

适用于本期的横向双页跨页排版：首张右半为封面、左半为封底；随后各张先左后右。15 张跨页生成 30 个阅读页面。未来如果改为竖向单页或印刷拼版格式，需要先修改转换规则。错误格式会让生成步骤报错，已发布的旧站点保留。

阅读器显示的是预先生成的图片，读者不必在手机上转换 PDF。原 PDF 中的超链接、书内跳转和二维码会自动转换成可点击区域，沿用 Pages 原有的链接处理与缩放功能。外部链接在新标签页打开。

侧栏的 **目次** 可跳到文章，也可以直接点击杂志目录页的标题。本期按目录印刷页码校正跨页的左右半页，补齐了原 PDF 未链接的 freebird 介绍，并合并跨行标题的重复链接；编辑后记准确跳到右页。阅读器页码包含封面，比内页印刷页码大 1。

本期保留 5 个社交账号链接、Back Number 页的全部 12 个往期封面链接，并自动识别了往期文件夹与读者问卷的 2 个二维码。未来发布仍只需上传 PDF，链接和二维码会随发布自动提取。原 PDF 的 **PDF** 按钮继续保留。

## 自动发布

- 发布仓库的 **Publish magazine** 工作流调用本系统的 `.github/workflows/publish.yml`，Pages 发布来源继续使用 **GitHub Actions**。
- 自动流程：Poppler 将 PDF 渲染为跨页 → pypdf/pdfplumber 提取链接和目录、ZXing-C++ 识别二维码 → 拆页并调整封面顺序及链接坐标 → Pages 生成静态 HTML 和分辨率不同的图片 → GitHub Pages 发布。
- 渲染和发布在发布仓库的 Actions 中执行：读取发布仓库的 PDF，临时获取本系统源码，生成后部署到发布仓库的 Pages。源码仅在任务运行时使用，发布仓库当前文件列表保持简洁。
- 页面运行时只请求此站点内的文件，无外部 CDN、统计或付费服务。GitHub 的免费额度与服务政策仍适用。
- 首次打开可能有缓存更新延迟。判断发布结果应检查公开阅读链接，不能只看绿色状态。

更新阅读器时在本系统仓库修改代码，等待 **Check magazine system** 成功，再到发布仓库的 **Publish magazine → Run workflow** 同步上线。编辑人员继续在发布仓库上传 PDF。系统仓库的检查只构建验证，不会发布另一个读者网站。

## 来源与修改

- Pages：`cb7c648b05298c6fdd70453244dbaf116880e4d1`，README 声明 MIT。
- PagesEngine：`6c585892900409b2f794afb34c9ad3dc4e6f715d`，MIT，许可证保存在 `vendor/pages/ENGINE-LICENSE`。
- 二维码：qrcode-generator 1.4.4，MIT。
- `vendor/pages/` 保留生成器、阅读样式及模块源码。引擎由该版本源码编译，JS 和 CSS 一同保存。
- 本项目适配：独立封面；横竖屏切换时更新引擎显示模式并保留当前页；初始页码；分享链接、二维码、原 PDF 入口；PDF 自动生成与部署；目录、原 PDF 超链接及二维码点击区域；接入 Pages 既有目录和链接菜单。

本地开发先安装 `scripts/requirements.txt` 中的 Python 依赖，将 `MAGAZINE_ISSUES_DIR` 环境变量设为发布仓库 `issues` 文件夹的绝对路径，再运行 `python scripts/render-issues.py` 和 `node scripts/build-site.mjs`。需要 Poppler 的 `pdftoppm` 和 Node.js。输出位于本系统的 `_site/`；Windows 可用 `PDFTOPPM` 环境变量指定 `pdftoppm.exe` 的绝对路径。`python -m unittest discover -s tests` 检查实际 PDF 的目录、链接和二维码，`node --test tests/reader-inputs.test.mjs` 检查浮动栏及缩放输入。
