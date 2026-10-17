# 関西通信 管理人员发布手册

适用对象：上传刊物、维护阅读链接和检查发布结果的人员。

一次性授权、发布方式及迁移状态见[集中上传与发布](centralized-publication.md)。

## 1. 两个仓库各放什么

| 位置 | 用途 | 日常操作 |
| --- | --- | --- |
| [读者仓库 kansai-magazine](https://github.com/Longxy4/kansai-magazine) | 每期 PDF、读者手册、期刊列表及电子书 | 复制阅读链接、查看定稿 |
| [系统仓库 kansai-magazine-system](https://github.com/Longxy4/kansai-magazine-system) | 上传入口、发布流程、阅读器、转换工具及自动检查 | 上传 PDF、发布、更新系统及排障 |

发布网站固定为 `https://longxy4.github.io/kansai-magazine/`。没有杂志首页：根地址打开最新一期，每期有独立链接。普通读者无需账号；上传、修改和手动发布需要仓库相应权限。

## 2. 发布前准备

- 确认 PDF 是可公开的定稿，照片、姓名、联系方式和外部链接均已审定。
- 检查页面顺序、目录、超链接和二维码。一本 PDF 统一使用单页排版或横向双页跨页排版。
- 横向跨页 PDF 的首张必须是“左半封底、右半封面”；系统按此顺序拆页。竖向单页按原顺序处理。
- 推荐在系统仓库 Release 附件上传 PDF。定稿最终通过 Git 入库，仍需小于 100 MiB；超过时先压缩。若直接使用读者仓库的网页文件上传，单文件限 25 MiB；较大文件使用本地 Git。不要使用 Git LFS 代替当前发布方式。
- GitHub Pages 已发布网站限 1 GB，包含各期原 PDF 和页面图片，不能单独调高。新增较大刊物前，检查上次发布包大小并预留容量。

## 3. 文件名与固定链接

| 文件名 | 系统处理 |
| --- | --- |
| `関西通信2027年1月号.pdf`、`2027-01.pdf` | 固定期号 `2027-01` |
| `2027年特別号.pdf`、`2027年特别号.pdf` | 固定期号 `2027-special` |
| `特別号.pdf`、`特别号.pdf` | 固定期号 `special`；多年份特别号应带年份 |
| 其他刊名，如“年份＋主题.pdf” | 自动分配 `extra-` 加 12 位短编号，阅读标题保留原刊名 |

以上为命名示例，上传成功后才产生对应链接。中文、日文的特别号名称、全角数字、空格和大小写 PDF 扩展名均可识别。常规期号的月份须为 1—12。

已有的 **2026 年特别号使用 `2026-01`**，7 月号使用 `2026-07`；原链接继续有效，勿手工改成另一套期号。其他期刊的实际固定入口以发布汇总为准。

## 4. 上传与发布

### 系统仓库上传（推荐）

1. 打开系统仓库 [Releases](https://github.com/Longxy4/kansai-magazine-system/releases)，选择 **Draft a new release**。
2. 创建新标签，如 `upload-2027-01-01`，Target 选择 `main`。单份 PDF 的 Release 标题填写原刊名（如 `関西通信2027年1月号`）；多个日文或非标准文件名的 PDF 请先放入一个 ZIP，以完整保留原文件名。将 PDF 或 ZIP 拖入附件区域，等待全部上传完成。
3. 点击 **Publish release**，系统自动开始 **Upload and publish magazines**。
4. 打开系统仓库 [Actions 发布入口](https://github.com/Longxy4/kansai-magazine-system/actions/workflows/manage-publication.yml)，查看本次结果。

重复内容不再入库；坏文件不会覆盖旧的合格 PDF。发布后才补附件或修改 Release 不会自动重跑，需要手动运行工作流，release_tag 填该标签并勾选 publish。Release 附件目前公开，请只上传可公开定稿。

GitHub 可能改写日文附件名，系统会优先使用附件标签或单 PDF 的 Release 标题恢复原名。批量直接上传多个 PDF 时，请使用 `2027-01.pdf`、`2027-special.pdf` 等 ASCII 文件名；要保留任意原名请用 ZIP。ZIP 内的每个 PDF 仍须小于 100 MiB。

### 本地 Git 上传

适用于已安装 Git、并已登录 GitHub 的管理人员。首次只需克隆一次：

```powershell
git clone https://github.com/Longxy4/kansai-magazine.git
cd kansai-magazine
```

以后在这份本地仓库中操作：

```powershell
git pull --ff-only
```

把要发布的 PDF 复制到本地 `issues` 文件夹，再运行：

```powershell
git add -- issues
git status --short
git commit -m "Publish magazine issue"
git push origin main
```

提交前检查 `git status`，确认只包含计划发布的文件及删除操作。如果提示没有修改，则没有新内容需要提交；不要反复上传未变化的文件。若推送因文件超过 100 MiB 失败，该批提交尚未上传成功，需要先压缩并重新整理本地提交。

推送完成后，在**系统仓库**手动运行 **Upload and publish magazines**，勾选 publish、release_tag 留空。读者仓库提交不再自动转换。

## 5. 判断是否真正发布成功

1. 等待系统仓库本次 **Upload and publish magazines** 成功（publish 已启用），以及读者仓库 GitHub 自动的 **pages build and deployment** 完成。只运行未勾选 publish 的构建检查不会上线。
2. 打开该次运行的 **Summary → 杂志发布结果**，逐项检查：

| 结果 | 含义 | 处理 |
| --- | --- | --- |
| 已转换 | 新增或修改的 PDF 转换成功 | 检查实际阅读链接 |
| 已复用 | 内容未变化，复用现有页面 | 无需重新处理 |
| 重复已跳过 | 相同内容已收录，名字和入口合并 | 无需重复上传 |
| 出错已跳过 | 文件、月份、冲突或转换异常 | 按原因修正这一份文件 |
| 保留旧版 | 更新失败，仍保留原来可读的版本 | 读者尚未看到这次修订；修正后再发 |
| 警告 | 部分恢复或处理步骤异常 | 阅读具体原因并检查相关期刊 |

3. 从表格 **阅读链接** 一栏打开实际页面。没有链接的新刊尚未成功发布。
4. 检查封面、总页数、最后一页、目录跳转、关键外链、二维码；分别用电脑和手机打开。修订稿应检查实际修改的页面。
5. 确认内容正确后，从阅读器 **共有** 复制固定链接或二维码对外分享。

系统流程绿色表示可用内容已写入发布分支，不表示每份文件都成功，也不代替 Pages 最终部署状态。单份 PDF 出错会跳过该份，其余继续发布。若整批没有可读内容，或部署平台失败，原站点保留。

## 6. 日常修订、改名与撤下

**修订同一期：**在新 Release 中上传同名修订 PDF，或用本地 Git 覆盖读者仓库同名文件后从系统仓库发布。固定链接不变。不要在同一期保留两份内容不同的版本；系统会优先保留正在使用的文件，跳过冲突文件。

**修改文件名：**只改名且内容相同，系统可识别并保留原入口。若名称与内容都要修改，请先只改名发布一次，再修改内容；更稳妥的办法是继续覆盖原同名文件。避免同时改名和改内容被当成新刊。

**撤下一期：**在读者仓库 main 的 `issues` 删除该期的全部同内容副本，提交后从系统仓库手动发布，再检查原入口。仅删除系统 Release 不会撤下已保存的定稿。若撤下后整站无刊物，流程会保留原站点而不发布空站，需要另行处理整站下线。

**公开范围：**两个仓库及已发布 PDF 均公开。读者可以保存、转发、查看源码和提交历史。删除当前文件不会删除 Git 历史；涉及不应公开的资料时，联系技术维护者处理历史记录及托管缓存，勿仅以“目录已消失”判断撤回完成。

**备份：**保留每期最终 PDF 的独立备份。Actions 缓存和部署记录用于加速、排障，不代替原稿备份。

## 7. 更新阅读器

1. 在系统仓库更新代码并提交到 `main`。
2. 等 **Check magazine system** 成功。
3. 在系统仓库打开 **Upload and publish magazines → Run workflow**，选择 `main`，勾选 publish、release_tag 留空并执行。
4. 按第 5 节检查实际阅读页面。系统仓库的检查不会自动替换读者网站。

页面样式修改会复用现有图片；转换算法或依赖变化可能重新转换 PDF。部署仍会打包完整站点。首次转换、缓存失效恢复、较大 PDF 均可能增加耗时。

## 8. 常见问题

| 问题 | 处理方式 |
| --- | --- |
| GitHub 上传或推送失败 | 检查账号权限、网络及单文件大小；尚未进入发布流程 |
| 某一份出错 | 查看 Summary 中该文件原因，只修正该份后重新提交 |
| 同一期内容冲突 | 确认正在使用的文件名，覆盖它；移除不再使用的重复版本 |
| 全部没有变化 | 正常情况；系统复用已有内容 |
| 部署失败但旧站点可用 | 查看失败步骤；平台故障可稍后重新运行，修正内容前不要删除旧刊 |
| 发布成功但仍是旧页面 | 先确认是否“保留旧版”，再刷新浏览器并检查相应修订页 |
| 新刊链接无效 | 从该次 Summary 复制实际阅读链接；确认新刊没有被跳过 |
| 新增刊物后超出容量 | 压缩定稿 PDF；确需迁移时另行规划托管和旧链接兼容，不可在设置中提高 Pages 的 1 GB 限额 |

[读者手册](https://github.com/Longxy4/kansai-magazine/blob/main/docs/reader-guide.zh-CN.md) · [技术维护说明](developer-guide.md)

## 官方限制说明

- [GitHub 文件上传限制](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)。
- [GitHub Pages 站点限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。
- [Git LFS 与 Pages 的限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage)。
