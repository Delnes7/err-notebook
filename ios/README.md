# iOS 客户端

主界面采用 SwiftUI：`TabView` 划分错题本、成绩、组卷、学科和设置，内部使用 `NavigationStack`、原生列表、表单、工具栏及系统弹窗。iOS 26 及以上由系统组件提供液态玻璃外观，旧系统使用对应的原生外观。

数据与业务层仍复用本地 JavaScript 引擎，通过后台 WebKit 服务访问 IndexedDB、Supabase、题目编译、AI 和试卷排版。Markdown / KaTeX 使用独立的富文本展示组件。稳定的 `notebook://localhost` 来源保留旧版 App 的本地数据；主界面不加载远程站点。当前版本是 SwiftUI 界面与共享业务引擎的组合。

## 源码组织

| 文件 | 职责 |
| --- | --- |
| `ErrorNotebookApp.swift` | App 入口；正常启动进入原生界面，Debug 参数可进入旧版兼容测试界面 |
| `NativeNotebookView.swift` | 五个功能入口、错题列表、详情和导航 |
| `NativeQuestionEditor.swift` | 原生录题、选择题、分小问、评分表格、AI 图片、相机和裁剪 |
| `NativeGradesSubjects.swift` | 成绩录入、趋势、权重、学科与单元管理 |
| `NativeGradeCharts.swift` | 考核对比、单元错题、等级分布和雷达图 |
| `NativePracticeSettings.swift` | 选题组卷、PDF、账号、备份和设置 |
| `NativeDocuments.swift` | Markdown 展示、PDF 预览和分享 |
| `NotebookStore.swift` | 页面状态、本地服务调用、PDF 生成 |
| `NotebookAppearance.swift` | 两套外观、主题颜色和设备偏好 |
| `native-engine.html` / `native-engine.js` | 本地业务服务与共享 JavaScript 之间的适配 |

## 开发与安装

1. 在仓库根目录运行 `python3 scripts/build_ios_web.py`。首次会下载版本固定的依赖，以后使用校验过的缓存。
2. 打开 `ios/ErrorNotebook.xcodeproj`，选择 `ErrorNotebook` scheme。
3. 选择 iPhone / iPad 模拟器后运行；真机需在 Signing & Capabilities 选择自己的 Team，必要时修改 Bundle Identifier。

生成的资源目录不提交至 Git。更新共享 `index.html`、`js/` 或 `css/` 后，先重新构建资源再运行 Xcode。禁止把个人备份、对话、密钥放进 App 资源目录。

面向 iOS / iPadOS 16.4 及以上；普通本地操作和公式图表可离线使用，AI 与 Supabase 仍需要网络。Apple 平台默认要求网络接口使用 HTTPS。

## 功能对应

| 功能 | iOS 实现 |
| --- | --- |
| 学科、单元、错题、选择题、分小问、题解、成绩 | SwiftUI 原生列表和表单；保留现有数据格式与计算规则 |
| 成绩图表 | Swift Charts 趋势、分布和对比；原生雷达图 |
| 图片与相机 | PhotosPicker、文件选择器、原生相机、裁剪与粘贴 |
| HEIC、方向与大图缩放 | ImageIO 缩略图解码和 JPEG 输出，避免解码原始大图后再缩小 |
| Markdown、公式、代码高亮 | 独立 WKWebView 展示已渲染内容，依赖与字体随 App 打包 |
| 云同步 | 同一个 Supabase 项目和事务函数，数据仍按账号隔离 |
| JSON 备份导入 | 系统文件选择器，确认后在一个本地事务中恢复记录与权重 |
| JSON 备份导出 | 原生分享面板，可保存到“文件”；单次 JSON 上限 128 MiB |
| A4 打印 | 分享生成的 PDF 后使用系统打印，保留共享打印 CSS |
| PDF 导出 | A4 UIPrintPageRenderer 生成多页 PDF，再通过系统面板分享 |
| AI Key | 本设备钥匙串，不进行钥匙串 iCloud 同步；JS 仅持有运行期副本 |
| 外部链接 | 使用系统打开 HTTP(S) / 邮件链接 |
| 外观、深浅色和字号 | “安静书房 / 极简工作台”，设备偏好与系统动态字体 |
| iPad 与横屏 | 系统自适应标签导航、安全区域和原生布局 |

App 与 Safari 不共享本地数据库。可在网页导出 JSON 后从 App 导入，或登录同一个 Supabase 账号同步。AI 密钥需在 App 内单独设置。邮箱注册的确认邮件使用 Supabase 项目配置的 Site URL，确认后回到 App 登录。

## 原生安全边界

- 只提供 bundle 中的 Web 目录；路径规范化后校验目录边界。
- 原生消息仅接受 `notebook://localhost` 的主框架，不接受子框架或外部页面。
- 分享只生成 App 自己的 JSON / PDF 临时文件；完成或取消后清理。
- 设备钥匙串与测试钥匙串使用不同服务名，测试不读取真实密钥。
- Debug 可检查 WebView；Release 不开放检查器，不接收测试动作，也不打包测试脚本和 HEIC 样本。
- 原生代码不记录密钥、试题或登录令牌。开源依赖许可可从 App 设置查看。

## 测试

网页安全回归：

```bash
python3 scripts/test_web.py
```

模拟器集成测试（将设备名称替换为本机可用设备）：

```bash
xcodebuild -project ios/ErrorNotebook.xcodeproj \
  -scheme ErrorNotebook \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  test
```

原生界面测试覆盖录题保存、成绩录入、外观切换与 PDF 分享；`testNativeServiceContract` 在独立测试数据中验证分小问、选择题、题解表格、分数、权重、备份恢复与 PDF 正文。旧版兼容测试继续检查共享引擎、HEIC、JSON 分享，以及独立持久存储重启读取。

测试使用独立的 WebKit 存储、设备偏好和测试钥匙串，不读取 App 正式存储中的个人数据。

这些测试不需要真实账号或 API Key。真机拍照、相册授权、剪贴板授权、AirPrint 打印机、真实 AI 服务和真实账号跨设备同步需在配置相应硬件或账号后单独验收。

2026-11-23 验证记录：

| 环境 | 结果 |
| --- | --- |
| iPhone 17 Pro / iOS 26.5 模拟器 | 全部 7 个集成测试通过：原生录题、成绩、外观、JSON / PDF 分享、分小问与选择题、备份恢复、共享引擎和重启持久化 |
| iPad mini / iPadOS 26.5 模拟器 | 4 个原生用例通过（分轮执行）：导航与外观、成绩录入、JSON 分享、录题与 PDF 分享、数据兼容与 PDF 正文 |
| 真机 Release 编译（不签名） | 通过；尚未实际安装至物理设备 |
| 共享网页安全回归 | 3 个测试套件通过 |
| 网页两套布局 | 1280 / 768 / 390 / 320px 的目录选题、搜索、练习选择和各主页面无横向溢出检查通过 |

## 发布

本工程可编译到模拟器，也可在关闭签名时编译真机 Release。安装真机、导出 IPA、TestFlight 和 App Store 分发需要项目作者的 Apple 签名配置。发布前应补齐自己的隐私政策 URL、App Store 元数据并复核 `PrivacyInfo.xcprivacy` 与实际使用的数据服务一致。
