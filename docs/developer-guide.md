# 技术维护说明

日常发刊请先阅读[管理人员发布手册](admin-guide.md)。本文面向修改源码或排查构建问题的人员。

## 项目结构

| 路径 | 作用 |
| --- | --- |
| `scripts/issue_catalog.py` | 期号识别、附刊编号、重复内容合并与入口兼容 |
| `scripts/render-issues.py`、`render_pdf.py` | 增量处理、单文件隔离及 PDF 图像生成 |
| `scripts/pdf_interactions.py`、`page_layout.py` | 目录、超链接、二维码、旋转与拆页坐标 |
| `scripts/publication_cache.py` | 渲染缓存与已发布文件校验恢复 |
| `scripts/build-site.mjs` | 生成阅读器、图片、原 PDF 和发布清单 |
| `scripts/reader-dock.css`、`reader-extras.js` | 控制栏和分享界面 |
| `scripts/publish-summary.py` | 发布结果及实际阅读链接 |
| `scripts/manage-publication.py` | 暂存 Release 上传、只保存验证通过的 PDF、更新读者链接 |
| `vendor/pages/`、`vendor/qrcode.js` | 当前使用的上游阅读器与二维码代码 |
| `tests/` | 系统回归检查；不进入读者站点 |
| `.github/workflows/` | 系统检查、集中上传与跨仓库发布 |

## 本地依赖与构建

需要 Python、Node.js 和 Poppler 的 `pdftoppm`。依赖版本以 `scripts/requirements.txt` 和工作流为准。在系统仓库目录中执行：

```powershell
python -m pip install -r scripts/requirements.txt
$env:MAGAZINE_ISSUES_DIR = '本机发布仓库的绝对路径/issues'
python scripts/render-issues.py
node scripts/build-site.mjs
```

将占位路径替换为实际位置。`pdftoppm` 不在 PATH 中时，可用 `PDFTOPPM` 环境变量指定其可执行文件绝对路径。

输出为 `.build/` 和 `_site/`，均已忽略，不提交到 Git。预览 `_site/` 时应通过本地 HTTP 服务打开，不直接双击 HTML。新增调试输出请使用临时目录，结束后清除；不要把示例 PDF、截图或本地依赖目录加入仓库。

## 检查与部署

```powershell
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

必要检查覆盖名称兼容、增量复用、单文件失败、旧版保留、链接、二维码、阅读器输入及跨仓库 PDF 暂存。测试输出与正式发布汇总隔离。修改后提交到系统仓库，等待 **Check magazine system** 成功，再从系统仓库手动运行 **Upload and publish magazines** 并勾选 publish。

发布产物只有阅读页、页面图片、原 PDF、二维码库、路由及 `publication.json`，不包含测试、源码目录或本地预览文件。公开仓库中的源码和历史记录本身仍可被访问。

## 缓存与兼容

- `.build/objects/` 以 PDF 内容和渲染器版本标识生成结果，校验完成后才安装缓存。
- Actions 缓存失效时，可从已发布网站的清单及文件校验恢复；`publication.json` 是正式运行数据，不是临时测试文件。
- 样式和阅读器代码变更复用页面图片；渲染算法和依赖变化会更新渲染版本。
- 保留既有期号、名称别名和跳转目录。修订或重命名的行为以发布清单为准，不手动清空清单来处理单文件故障。
- 2026 年特别号的固定入口为 `2026-01`，`2026-special` 是兼容入口；不可因整理文件而删除兼容跳转。
- 回退代码后，也需要重新运行系统仓库的集中发布工作流才能替换公开网站；同时核对 PDF 是否需要回退。

## 来源与权限

保留仍在使用的上游源码声明和许可证。系统默认临时令牌只读取系统仓库；写入读者仓库使用专用 Secret `PUBLICATION_TOKEN`，只授予读者仓库 Contents 读写权限。源码检出不持久化登录凭据；不要在源文件、文档、PDF 或日志里加入访问密钥。网站通过 `gh-pages` 分支发布，静态部署复用开源 `peaceiris/actions-gh-pages`；定稿和链接通过正常 Git 提交写入 main，不强制覆盖分支历史。

普通读者没有修改主分支和执行正式发布的权限。协作者的实际授权由仓库所有者管理，管理员应在 GitHub 中定期核对。请勿把“公开仓库”理解为“任何人均能修改”。
