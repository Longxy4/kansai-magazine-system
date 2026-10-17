# 集中上传与发布

当前配置：上传和发布入口集中在系统仓库，读者仓库使用 gh-pages 根目录发布；读者仓库的旧自定义工作流已移除。下面的一次性步骤供重建或授权续期参考，日常操作直接看“以后上传一期或一批”。

## 切换后的分工

| 仓库 | 内容 |
| --- | --- |
| 系统仓库 | 上传入口（Releases）、发布按钮、转换代码、检查、发布记录和管理手册 |
| 读者仓库 main | 定稿 PDF、阅读链接、读者手册 |
| 读者仓库 gh-pages | 可直接上线的电子书、页面图片、PDF 和必要运行文件 |

读者仓库不再存放自定义上传或转换工作流。GitHub 托管平台为分支发布显示的 `pages-build-deployment` 是平台自身的部署记录。

## 一次性授权和切换

1. 在 GitHub 的 Settings → Developer settings → Personal access tokens → Fine-grained tokens 创建专用令牌。Resource owner 为 Longxy4，只选 `kansai-magazine`，Repository permissions 只需 **Contents: Read and write**（Metadata 会自动附带）。设置到期日并记录续期时间。
2. 在系统仓库 Settings → Secrets and variables → Actions → New repository secret 添加 `PUBLICATION_TOKEN`。值填入令牌，不要把令牌贴进聊天、源码或文档。
3. 在系统仓库 Actions → **Upload and publish magazines** → Run workflow，不填 release_tag、不勾选 publish，执行完整构建检查。
4. 检查成功后，再次运行并勾选 publish，生成读者仓库 `gh-pages` 分支。此时原网站的发布方式仍保留。
5. 在读者仓库 Settings → Pages，将 Source 改为 **Deploy from a branch**，分支选 **gh-pages**、目录选 **/ (root)**。这一步是仓库所有者的设置操作，不需要给发布令牌增加管理权限。
6. 等待 GitHub 部署成功，以未登录的浏览器打开原有每期链接、检查翻页、PDF 和分享。验证完成后，删除读者仓库 `.github/workflows/publish.yml`。旧入口删除前，新旧发布流程不要同时运行。

普通 Actions 默认令牌只能访问工作流所在的仓库，因此彻底分离需要这次跨仓库授权。令牌仅存放在系统仓库的加密 Secrets 内，不会进入读者网站。到期后更换同名 Secret 即可。

## 以后上传一期或一批

1. 打开系统仓库 **Releases → Draft a new release**。
2. 创建一个新的标签，例如 `upload-2026-11-01`；Target 选择 main。将定稿 PDF 拖入附件区域，等待所有上传完成，再点击 **Publish release**。
3. 系统自动运行 **Upload and publish magazines**。摘要逐份显示成功、复用、重复跳过或失败。重复 PDF 不再写入读者仓库；坏文件不会覆盖旧的合格 PDF；其他可处理文件继续发布。
4. 去读者仓库 README 复制本期固定阅读链接，并打开网站验证。

每个 PDF 仍需小于 100 MiB，因为定稿最终要通过 Git 保存到读者仓库。Release 附件的上传方式不会改变这个限制。系统仓库 Releases 的附件也会公开，请只上传可公开的定稿。

修复失败文件后，可新建另一个 Release 上传；如果后来才给旧 Release 补附件，需要到 Actions 手动运行，在 release_tag 填旧标签并勾选 publish。编辑旧 Release 或补附件本身不会再次触发 published 事件。

也可继续用本地 Git 把 PDF 提交到读者仓库 `issues`，之后到**系统仓库**手动运行发布（勾选 publish，release_tag 留空）。切换后读者仓库的 PDF 提交不再自动触发转换。

## 修订、撤下和故障

- 同名 PDF 替换内容后重新上传，保留期号和链接。改名规则、非标准命名和兼容入口沿用[管理手册](admin-guide.md)。
- 撤下时，在读者仓库 main 的 issues 删除该期的全部同内容副本，再从系统仓库手动发布；仅删除系统 Release 不会撤下读者仓库中已保存的定稿。
- `publish` 不勾选时只检查构建、生成可下载产物，不修改读者仓库和线上站点。
- Token 缺失、到期或写入失败会停止部署；先修复授权后重跑。主分支推送遇到并发修改会失败，不会强制覆盖别人的提交。
- 源 PDF 入库成功但电子书分支更新失败时，旧网站仍保留；重跑同一次 Release 或手动发布即可，重复内容会复用。
- 系统与读者仓库及 Release 附件目前都公开。读者仍可访问公开的历史记录；拆分管理入口不会自动隐藏系统源码，也不会擦除旧提交。
