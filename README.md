# 个人工作台 · 学业管理与错题本

面向北京十一学校国际部 A Level 与 CNCC 课程的学业管理工具，支持错题录入、加权成绩、AI 识题、专项组卷和多设备同步。

**由 Gemini 与 ChatGPT 协作开发**：Gemini 完成早期功能搭建和多轮迭代；ChatGPT（Codex）继续进行安全加固、测试、文档维护与 iOS 客户端开发。产品需求、课程规则与使用反馈由项目作者提供。

## 支持的平台

- **网页端**：静态 HTML / CSS / JavaScript，可部署至 GitHub Pages，无需自建应用服务器。
- **iOS 端**：SwiftUI + WKWebView 的原生 App，共享网页业务代码，支持 iPhone 和 iPad（iOS / iPadOS 16.4 及以上）。网页资源随 App 打包，接入设备钥匙串、系统文件分享、原生打印和 PDF 导出。工程位于 [`ios/`](ios/)。

iOS App 与 Safari 各自拥有独立的本地数据，首次使用需通过 Supabase 同步或 JSON 备份导入。安装 App 不会自动读取 Safari 的错题或密钥。

## 当前功能

### 错题与题解

- 学科、单元和小考关联；支持按学科、单元、测验及关键词筛选。
- 预置 Mathematics（P1 / S1）、Physics、Economics，以及 CNCC 生物、化学、地理；支持自定义学科、单元与考核权重。
- 自由 Markdown、分小问大题和选择题；选择题支持动态选项、单选或多选。
- 支持仅有大题干的题目、小问分值、失分小问、问间过渡文字，以及真题题号（例如 `W24-52-3`）。
- Markdown 与 KaTeX 公式、代码高亮、截图粘贴和 Base64 图片。
- Mark Scheme 按 `Question / Answer / Marks / Guidance` 录入与展示，支持总分行、自由题解和跳过题解。
- 独立的思路备注，用于补充官方步骤省略的推导动机。
- 浏览时默认折叠题解，选择题隐藏正解和错选标记，展开后才显示；已移除掌握状态界面。

### 成绩与图表

- 每场记录属于独立学科，允许不同满分和多个考查单元。
- 支持 Raw Score、Curve 后百分制成绩，以及学校 Task Grade 换算；不计算 GPA 绩点。
- Attainment、Course Skills、Learning Behavior、Final 等日常记录按维度汇总，再按学科权重加权；数学支持 P1 / S1 联动。
- 学科汇总、成绩趋势、雷达图、单元错题分布、等级分布及考核项目对比。
- 成绩页面分区可折叠，学科与考核维度可筛选；趋势图默认不包含 Learning Behavior。
- 学情诊断与按薄弱单元组卷。

### AI 辅助录入

- 支持 Gemini 原生 API，以及 DeepSeek / OpenAI 兼容接口；模型和 HTTPS 接口地址可配置。
- 从题目与 Mark Scheme 图片识别题干、选项、公式、分小问、分值和四列题解。
- 题目与 Mark Scheme 可分次识别，避免重复处理题目；结果可以手动检查与修改。
- 支持相册、相机、剪贴板图片及 HEIC / HEIF 转换。
- 可辅助检索真题题号。是否实时联网、是否支持视觉，取决于所选服务商和模型；检索与生成结果需核实。
- AI 服务需要网络与用户自己的 API Key，费用和额度由服务商决定。

### 组卷与多端体验

- 按学科与多个单元选题，生成 A4 练习卷；默认隐藏考点简题和测验来源，题号不加 `CIE:` 前缀。
- 默认按小问数量留白：1–2 问 140px、3 问 240px、4 问 340px，更多小问继续增加；选择题不留白。
- 可在预览中逐题调整留白、切换三档印刷字号和单元标签，可在卷末附题解与备注。
- 深色、浅色及跟随系统外观，常驻顶部工具栏与阅读字号设置。
- iOS App 提供“系统打印”和“分享 PDF”，JSON 备份可通过分享面板存入“文件”。

## 数据与安全

- 错题、学科和成绩主要保存在本地 IndexedDB；支持 JSON 全量导出及覆盖导入。删除站点数据或卸载 App 可能丢失本地内容，建议定期备份。
- Supabase 邮箱账号支持多设备同步、单条变更与删除标记、全量上传及双向合并。覆盖云端通过数据库事务执行；从云端覆盖本地的三类记录使用同一个 IndexedDB 事务。
- 云端读取分页获取完整记录；发现读取不完整时停止本地覆盖。
- 浏览器中的 AI Key 存在当前浏览器；iOS 中存在设备钥匙串。Key 和自定义接口地址不进行云同步，也不包含在 JSON 备份中，每台设备需单独配置。
- 新版普通同步会清理云端 AI 配置中的旧明文密钥字段；旧客户端仍可能重新上传，历史日志或备份不会自动清除。
- Markdown 原始 HTML 受到限制；支持 PNG / JPEG / GIF / WebP 的 Base64 图片与 HTTP(S) 链接，并对动态文字和事件参数进行转义。
- 本地 Python 服务只监听 `127.0.0.1`，仅提供网页及应用资源，不提供 `.git` 或对话导出文件。
- 本地 Antigravity 对话和包含测试账号 UID 的 SQL 不提交至 Git。

Supabase 项目需启用 RLS，并以 `auth.uid() = user_id` 限制记录访问。新项目可参考 [`supabase/security.sql`](supabase/security.sql)，先建好 `notebook_items` 表，再应用策略和覆盖函数；已有项目应先检查策略，避免额外宽松策略绕过隔离。前端公开的 publishable key 不能代替服务端权限策略，不能将 `service_role` 或 secret key 填入前端。

## 运行网页端

```bash
python3 server.py
```

浏览器会打开本地地址，端口默认 8000，被占用时顺延。推荐通过 HTTP 或 HTTPS 使用；直接打开 `index.html` 时，存储、文件及联网行为可能因浏览器而异。

网页端依赖 CDN 加载 Tailwind、KaTeX、Chart.js、Prism、Supabase SDK 和 HEIC 转换库；本地数据可用不等于网页完整离线可用。iOS 资源包则固定并校验所需的网页依赖，内置公式字体与脚本；iOS 图片压缩和 HEIC 解码由 Apple ImageIO 完成。

## 编译 iOS App

需要 macOS、Xcode 与 iOS Simulator。首次准备资源时需要网络、Python 3 和系统 `curl`：

```bash
python3 scripts/build_ios_web.py
open ios/ErrorNotebook.xcodeproj
```

在 Xcode 中选择 `ErrorNotebook` scheme 和 iPhone / iPad 模拟器后运行。连接真机时，在 Signing & Capabilities 中选择自己的 Apple 开发团队，并使用唯一的 Bundle Identifier。真机安装与 TestFlight / App Store 分发需要相应签名配置，本仓库不包含证书或签名私钥。

网页代码变更后再次运行 `python3 scripts/build_ios_web.py`，再编译 iOS。资源清单与 SHA-256 位于 [`ios/web-dependencies.json`](ios/web-dependencies.json)；缓存和生成的 Web 目录不提交。只有有意升级依赖时才使用 `--update-lock` 并审查锁文件。

工程不依赖 CocoaPods、npm 或第三方原生框架。需要重新生成工程文件时运行 `python3 scripts/generate_ios_project.py`。

## 验证与限制

- JavaScript 安全冒烟测试覆盖密钥同步隔离、Markdown 和动态字段渲染、云端拉取。
- 网页曾在 375、390、768 和 1280px 宽度验证录题、选题、组卷和留白调整。
- Supabase 覆盖函数已在项目中部署；两个临时测试账号在事务内验证过 RLS 隔离、失败回滚和正常覆盖，测试数据已回滚。匿名调用函数被拒绝。该测试不等同于真实设备间的全部同步路径。
- iOS 已在 iPhone 17 Pro 与 iPad mini 模拟器通过集成测试，覆盖录题编辑、组卷、原生 HEIC 解码、PDF 正文与分享窗口、JSON 备份恢复、子框架原生桥接拒绝，以及重启后的数据库和钥匙串读取；真机 Release 目标已通过未签名构建。测试使用隔离的存储和测试钥匙串。相机拍摄、真实 AI 请求、AirPrint 打印机及真实账号同步仍需真机或账号验收。
- 安全检查和自动测试覆盖关键路径，不构成“无漏洞”保证。
