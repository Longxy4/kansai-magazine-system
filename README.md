# 関西通信发布系统

为 freebird 関西通信提供 PDF 转换、在线翻页阅读和 GitHub Pages 自动发布。

| 仓库 | 用途 |
| --- | --- |
| [kansai-magazine](https://github.com/Longxy4/kansai-magazine) | 定稿 PDF、读者手册、阅读链接及发布入口 |
| 本仓库 | 阅读器源码、转换工具、共享发布流程、维护文档与自动检查 |

## 使用手册

- [管理人员发布手册](docs/admin-guide.md)：上传、命名、链接管理、修订、撤下、容量及故障处理。
- [读者阅读手册（中文）](https://github.com/Longxy4/kansai-magazine/blob/main/docs/reader-guide.zh-CN.md)。
- [ご利用ガイド（日本語）](https://github.com/Longxy4/kansai-magazine/blob/main/docs/reader-guide.md)。
- [技术维护说明](docs/developer-guide.md)：依赖、构建、检查和项目结构。

[打开在线杂志](https://longxy4.github.io/kansai-magazine/)

## 发布方式

正在准备将上传、发布入口完全集中到本仓库：新流程为 **Upload and publish magazines**，通过系统仓库 Release 附件接收 PDF，复用现有转换器，并使用开源 `peaceiris/actions-gh-pages` 更新读者仓库。见[集中上传与发布：授权、切换与日常操作](docs/centralized-publication.md)。跨仓库授权和首次上线验证完成前，下面的原发布方式继续有效。

管理人员将 PDF 提交到发布仓库的 `issues` 文件夹后，发布仓库调用本系统的共享流程，转换新增或修改的文件，并部署到原有 Pages 网站。内容未变化时复用现有页面；重复内容合并，单份文件失败时跳过该份并优先保留旧版。

阅读网站无需登录或安装应用。电脑双页、手机竖屏单页，支持目录、缩略图、1—3 倍缩放、分享二维码及原 PDF。每期独立链接，根地址打开最新一期。

## 开源来源

阅读器基于 [S-poony/Pages](https://github.com/S-poony/Pages) 与 [PagesEngine](https://github.com/S-poony/PagesEngine)，保留原翻页、导航和缩放模块；项目补充 PDF 预处理、浮动控制栏、分享及自动发布。

- Pages 源码版本：`cb7c648b05298c6fdd70453244dbaf116880e4d1`，上游声明 MIT。
- PagesEngine 版本：`6c585892900409b2f794afb34c9ad3dc4e6f715d`，许可证见 [ENGINE-LICENSE](vendor/pages/ENGINE-LICENSE)。
- qrcode-generator 1.4.4，许可证见 [QRCODE-LICENSE](vendor/QRCODE-LICENSE)。
- 导入方式和本地适配见 [vendor/pages/README.md](vendor/pages/README.md)。
