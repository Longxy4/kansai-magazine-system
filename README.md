# 関西通信发布系统

为 freebird 関西通信提供 PDF 转换、在线翻页阅读和 GitHub Pages 自动发布。

| 仓库 | 用途 |
| --- | --- |
| [kansai-magazine](https://github.com/Longxy4/kansai-magazine) | 定稿 PDF、读者手册、阅读链接及已生成电子书 |
| 本仓库 | 上传入口、发布流程、阅读器源码、转换工具、维护文档与自动检查 |

## 使用手册

- [管理人员发布手册](docs/admin-guide.md)：上传、命名、链接管理、修订、撤下、容量及故障处理。
- [读者阅读手册（中文）](https://github.com/Longxy4/kansai-magazine/blob/main/docs/reader-guide.zh-CN.md)。
- [ご利用ガイド（日本語）](https://github.com/Longxy4/kansai-magazine/blob/main/docs/reader-guide.md)。
- [技术维护说明](docs/developer-guide.md)：依赖、构建、检查和项目结构。

[打开在线杂志](https://longxy4.github.io/kansai-magazine/)

## 发布方式

上传和发布均在本仓库进行。打开 [Releases](https://github.com/Longxy4/kansai-magazine-system/releases) → Draft a new release，新建标签、选择 main、附上定稿 PDF，等待附件上传完成后 Publish release。系统自动运行 **Upload and publish magazines**，复用现有转换器和开源 `peaceiris/actions-gh-pages`，把验证通过的 PDF 和链接写入读者仓库 main，把电子书写入 gh-pages，再由 GitHub Pages 上线。

内容未变化时复用现有页面；重复文件不再入库，单份文件失败时跳过该份并优先保留旧版。也可继续通过本地 Git 更新读者仓库 issues，之后从本仓库 Actions 手动发布。读者仓库不再保存自定义上传或转换工作流。操作和授权维护见[集中上传与发布](docs/centralized-publication.md)。

阅读网站无需登录或安装应用。电脑双页、手机竖屏单页，支持目录、缩略图、1—3 倍缩放、分享二维码及原 PDF。每期独立链接，根地址打开最新一期。

## 开源来源

阅读器基于 [S-poony/Pages](https://github.com/S-poony/Pages) 与 [PagesEngine](https://github.com/S-poony/PagesEngine)，保留原翻页、导航和缩放模块；项目补充 PDF 预处理、浮动控制栏、分享及自动发布。

- Pages 源码版本：`cb7c648b05298c6fdd70453244dbaf116880e4d1`，上游声明 MIT。
- PagesEngine 版本：`6c585892900409b2f794afb34c9ad3dc4e6f715d`，许可证见 [ENGINE-LICENSE](vendor/pages/ENGINE-LICENSE)。
- qrcode-generator 1.4.4，许可证见 [QRCODE-LICENSE](vendor/QRCODE-LICENSE)。
- 导入方式和本地适配见 [vendor/pages/README.md](vendor/pages/README.md)。
